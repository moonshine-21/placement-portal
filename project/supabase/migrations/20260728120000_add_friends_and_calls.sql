/*
# Friends + Voice Calling — missing backend tables

## Problem
frontend/js/app.js already contains a full "Friends + Voice Calling" module
(search students, send/accept/decline friend requests, start/accept/decline
calls, WebRTC signaling). It reads/writes three things that were never
created in the database:
  - table `friends`
  - table `calls`
  - RPC `search_students(q text)`
Every call to `supabase.from("friends")`, `supabase.from("calls")` or
`supabase.rpc("search_students", ...)` was failing (relation/function does
not exist), which is why friend requests never appeared for the recipient
and why calls immediately errored out instead of connecting.

## New objects
1. `friends` — friend requests / accepted friendships between two profiles.
2. `calls` — call session records (ringing/accepted/declined/ended/missed)
   used both for the Friends "call" button and for the company "Call for
   Interview" button.
3. `search_students(q text)` — case-insensitive search over student profiles
   by name/email, used by the Friends tab search box.

## Security
- `friends`: a user can see/insert/update/delete rows where they are the
  requester or the recipient. You cannot friend-request yourself.
- `calls`: a user can see/insert/update rows where they are the caller or
  the callee.
- `search_students`: SECURITY DEFINER so it can look across all student
  profiles (RLS on `profiles` normally restricts each user to their own
  row), but it only ever returns non-sensitive columns and never includes
  the caller's own id.
*/

-- ---------- friends ----------
CREATE TABLE IF NOT EXISTS friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL DEFAULT auth.uid()
    CONSTRAINT friends_requester_id_fkey1 REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL
    CONSTRAINT friends_recipient_id_fkey1 REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friends_no_self_request CHECK (requester_id <> recipient_id),
  CONSTRAINT friends_unique_pair UNIQUE (requester_id, recipient_id)
);

ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_friends" ON friends;
CREATE POLICY "select_own_friends"
  ON friends FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "insert_own_friend_request" ON friends;
CREATE POLICY "insert_own_friend_request"
  ON friends FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id AND requester_id <> recipient_id);

-- Only the recipient can flip a pending request to accepted.
DROP POLICY IF EXISTS "update_own_friends" ON friends;
CREATE POLICY "update_own_friends"
  ON friends FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- Either side can remove the row (cancel an outgoing request, decline an
-- incoming one, or unfriend an accepted one).
DROP POLICY IF EXISTS "delete_own_friends" ON friends;
CREATE POLICY "delete_own_friends"
  ON friends FOR DELETE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

CREATE INDEX IF NOT EXISTS idx_friends_requester ON friends(requester_id);
CREATE INDEX IF NOT EXISTS idx_friends_recipient ON friends(recipient_id);

-- keep updated_at current on accept/decline
CREATE OR REPLACE FUNCTION set_friends_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_friends_updated_at ON friends;
CREATE TRIGGER trg_friends_updated_at
  BEFORE UPDATE ON friends
  FOR EACH ROW EXECUTE FUNCTION set_friends_updated_at();

-- ---------- calls ----------
CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  callee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  call_type text NOT NULL DEFAULT 'friend' CHECK (call_type IN ('friend', 'interview')),
  room_name text NOT NULL,
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'accepted', 'declined', 'ended', 'missed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calls_no_self_call CHECK (caller_id <> callee_id)
);

ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_calls" ON calls;
CREATE POLICY "select_own_calls"
  ON calls FOR SELECT TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

DROP POLICY IF EXISTS "insert_own_calls" ON calls;
CREATE POLICY "insert_own_calls"
  ON calls FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = caller_id AND caller_id <> callee_id);

-- Both sides need to update status: the callee accepts/declines, the caller
-- (or either side) ends/cancels.
DROP POLICY IF EXISTS "update_own_calls" ON calls;
CREATE POLICY "update_own_calls"
  ON calls FOR UPDATE TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id)
  WITH CHECK (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_calls_callee ON calls(callee_id);

DROP TRIGGER IF EXISTS trg_calls_updated_at ON calls;
CREATE TRIGGER trg_calls_updated_at
  BEFORE UPDATE ON calls
  FOR EACH ROW EXECUTE FUNCTION set_friends_updated_at();

-- ---------- search_students RPC ----------
-- SECURITY DEFINER: profiles' own RLS only lets a user see their own row,
-- so a plain SELECT from the client can never find other students. This
-- function runs with elevated privileges but only ever exposes non-sensitive
-- columns, only for role = 'student', and never the caller's own row.
CREATE OR REPLACE FUNCTION search_students(q text)
RETURNS TABLE (id uuid, full_name text, email text, avatar_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.id, p.full_name, p.email, p.avatar_url
  FROM profiles p
  WHERE p.role = 'student'
    AND p.id <> auth.uid()
    AND (p.full_name ILIKE '%' || q || '%' OR p.email ILIKE '%' || q || '%')
  ORDER BY p.full_name
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION search_students(text) TO authenticated;

-- ---------- realtime for friends + calls ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'friends'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE friends;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'calls'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE calls;
    END IF;
  END IF;
END $$;
