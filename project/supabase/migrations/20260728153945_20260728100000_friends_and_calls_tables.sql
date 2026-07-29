/*
# Friends + Calls + Student Search

## Purpose
Adds the three missing database objects that the Friends tab and voice/video
calling depend on. Without these, every friend request, every call insert,
and every student search silently failed because the targets didn't exist.

## New tables

1. `friends` — friend requests between two students.
   - `id` (uuid, PK)
   - `requester_id` (uuid, FK → profiles) — who sent the request
   - `recipient_id` (uuid, FK → profiles) — who receives it
   - `status` (text) — 'pending' | 'accepted' | 'declined'
   - `created_at`, `updated_at` (timestamptz)
   - A unique index on the unordered pair so the same two students can
     only have one row between them.

2. `calls` — a voice/video call between two users.
   - `id` (uuid, PK)
   - `caller_id` (uuid, FK → profiles)
   - `callee_id` (uuid, FK → profiles)
   - `call_type` (text) — 'friend' | 'interview' | etc.
   - `room_name` (text) — unique room id used for the signaling channel
   - `status` (text) — 'ringing' | 'accepted' | 'declined' | 'ended' | 'missed'
   - `created_at`, `updated_at` (timestamptz)

## New RPC

3. `search_students(q text)` — returns up to 20 student profiles whose
   full_name or email matches the query (case-insensitive ilike), excluding
   the caller. Runs as SECURITY DEFINER so it can read all student profiles
   without each user needing a blanket SELECT policy on the whole table.

## Security (RLS)

- `friends`: both participants can read; only the requester can insert;
  either participant can update the status; either side can delete.
- `calls`: both caller and callee can read; only the caller can insert;
  either participant can update; either can delete.
- Realtime publication is enabled for `friends`, `calls`, and
  `notifications` so the frontend gets live updates for incoming requests,
  incoming calls, and new notifications.

## Notes
1. A unique INDEX (not inline constraint) on LEAST/GREATEST of the pair
   enforces one row per two users — prevents duplicate requests.
2. `search_students` is SECURITY DEFINER + STABLE so it bypasses RLS for
   the profile lookup without exposing a public read policy on all profiles.
3. The `calls` status has no CHECK constraint so the app can add new
   statuses later without a migration.
*/

-- ---------- friends ----------
CREATE TABLE IF NOT EXISTS friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per unordered pair of users: prevents duplicate friend requests.
CREATE UNIQUE INDEX IF NOT EXISTS friends_unique_pair_idx
  ON friends (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id));

ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_friends" ON friends;
CREATE POLICY "select_own_friends"
  ON friends FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "insert_own_friend_request" ON friends;
CREATE POLICY "insert_own_friend_request"
  ON friends FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "update_own_friend_request" ON friends;
CREATE POLICY "update_own_friend_request"
  ON friends FOR UPDATE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = requester_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "delete_own_friend_request" ON friends;
CREATE POLICY "delete_own_friend_request"
  ON friends FOR DELETE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

CREATE INDEX IF NOT EXISTS idx_friends_requester ON friends(requester_id);
CREATE INDEX IF NOT EXISTS idx_friends_recipient ON friends(recipient_id);

-- ---------- calls ----------
CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  callee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  call_type text NOT NULL DEFAULT 'friend',
  room_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ringing',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_calls" ON calls;
CREATE POLICY "select_own_calls"
  ON calls FOR SELECT TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

DROP POLICY IF EXISTS "insert_own_calls" ON calls;
CREATE POLICY "insert_own_calls"
  ON calls FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = caller_id);

DROP POLICY IF EXISTS "update_own_calls" ON calls;
CREATE POLICY "update_own_calls"
  ON calls FOR UPDATE TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id)
  WITH CHECK (auth.uid() = caller_id OR auth.uid() = callee_id);

DROP POLICY IF EXISTS "delete_own_calls" ON calls;
CREATE POLICY "delete_own_calls"
  ON calls FOR DELETE TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE INDEX IF NOT EXISTS idx_calls_callee ON calls(callee_id, status);
CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls(caller_id);

-- ---------- search_students RPC ----------
CREATE OR REPLACE FUNCTION public.search_students(q text)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id, full_name, email, avatar_url
  FROM profiles
  WHERE role = 'student'
    AND (full_name ILIKE '%' || q || '%' OR email ILIKE '%' || q || '%')
    AND id <> auth.uid()
  ORDER BY full_name
  LIMIT 20;
$$;

-- Realtime row filters (e.g. recipient_id=eq.<uid>) only match when the
-- publication carries the full before-image of changed rows. The default
-- replica identity (PK only) drops non-PK columns from INSERT payloads, so
-- a filter on recipient_id never matches and incoming-request live updates
-- never fire. FULL restores those columns.
ALTER TABLE friends REPLICA IDENTITY FULL;
ALTER TABLE calls REPLICA IDENTITY FULL;

-- ---------- realtime: publish friends, calls, notifications ----------
DO $
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
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    END IF;
  END IF;
END $$;