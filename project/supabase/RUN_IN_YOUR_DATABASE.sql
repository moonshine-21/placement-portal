-- ============================================================================
-- PLACEMENT PORTAL — FULL DATABASE SETUP
-- ============================================================================
-- Run this ENTIRE script in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste everything → Run).
--
-- It is idempotent: safe to re-run. It creates every table, policy, function,
-- index, storage bucket, and realtime publication the app needs, including
-- the friends/calls feature and the password-reset flow.
--
-- IMPORTANT: after running this, also check the two dashboard settings
-- listed at the bottom of this file (email confirmation + reset redirects).
-- ============================================================================


-- ---------- helper functions (must exist before policies that use them) ----------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM profiles WHERE id = auth.uid()), false);
$$;


-- ---------- profiles ----------
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student','company','admin')),
  cgpa numeric(4,2) NOT NULL DEFAULT 0.0,
  branch text NOT NULL DEFAULT '',
  skills text[] NOT NULL DEFAULT '{}',
  resume_text text NOT NULL DEFAULT '',
  resume_filename text NOT NULL DEFAULT '',
  profile_completion integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  avatar_url text NOT NULL DEFAULT '',
  banner_url text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT ''
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_or_admin_profiles" ON profiles;
CREATE POLICY "select_own_or_admin_profiles"
  ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Allow reading another user's profile when you have a friend row or call
-- with them (so names/avatars resolve in the Friends tab and call screens).
DROP POLICY IF EXISTS "select_related_profiles" ON profiles;
CREATE POLICY "select_related_profiles"
  ON profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM friends f
      WHERE (f.requester_id = auth.uid() AND f.recipient_id = profiles.id)
         OR (f.recipient_id = auth.uid() AND f.requester_id = profiles.id)
    )
    OR EXISTS (
      SELECT 1 FROM calls c
      WHERE (c.caller_id = auth.uid() AND c.callee_id = profiles.id)
         OR (c.callee_id = auth.uid() AND c.caller_id = profiles.id)
    )
  );

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);


-- ---------- companies ----------
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL,
  package_lpa numeric(5,2) NOT NULL DEFAULT 0.0,
  required_skills text[] NOT NULL DEFAULT '{}',
  min_cgpa numeric(3,2) NOT NULL DEFAULT 6.0,
  required_branches text[] NOT NULL DEFAULT '{}',
  openings integer NOT NULL DEFAULT 1,
  logo_color text NOT NULL DEFAULT '#4f46e5',
  tier text NOT NULL DEFAULT 'Tier 1',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_companies" ON companies;
CREATE POLICY "read_companies"
  ON companies FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_companies" ON companies;
CREATE POLICY "admin_insert_companies"
  ON companies FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_companies" ON companies;
CREATE POLICY "admin_update_companies"
  ON companies FOR UPDATE TO authenticated
  USING (public.is_admin());


-- ---------- matches ----------
CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  match_score integer NOT NULL DEFAULT 0,
  missing_skills text[] NOT NULL DEFAULT '{}',
  matched_skills text[] NOT NULL DEFAULT '{}',
  eligible boolean NOT NULL DEFAULT false,
  reasoning text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'matched',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, company_id)
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_or_admin_matches" ON matches;
CREATE POLICY "select_own_or_admin_matches"
  ON matches FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR public.is_admin());

DROP POLICY IF EXISTS "insert_own_matches" ON matches;
CREATE POLICY "insert_own_matches"
  ON matches FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "update_own_matches" ON matches;
CREATE POLICY "update_own_matches"
  ON matches FOR UPDATE TO authenticated
  USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "delete_own_matches" ON matches;
CREATE POLICY "delete_own_matches"
  ON matches FOR DELETE TO authenticated
  USING (auth.uid() = student_id);

CREATE INDEX IF NOT EXISTS idx_matches_student ON matches(student_id);
CREATE INDEX IF NOT EXISTS idx_matches_company ON matches(company_id);


-- ---------- applications ----------
CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'applied',
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, company_id)
);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_or_admin_applications" ON applications;
CREATE POLICY "select_own_or_admin_applications"
  ON applications FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR public.is_admin());

DROP POLICY IF EXISTS "insert_own_applications" ON applications;
CREATE POLICY "insert_own_applications"
  ON applications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "update_own_applications" ON applications;
CREATE POLICY "update_own_applications"
  ON applications FOR UPDATE TO authenticated
  USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "delete_own_applications" ON applications;
CREATE POLICY "delete_own_applications"
  ON applications FOR DELETE TO authenticated
  USING (auth.uid() = student_id);

CREATE INDEX IF NOT EXISTS idx_applications_student ON applications(student_id);


-- ---------- company_profiles ----------
CREATE TABLE IF NOT EXISTS company_profiles (
  id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  org_name text NOT NULL DEFAULT '',
  industry text NOT NULL DEFAULT '',
  about_us text NOT NULL DEFAULT '',
  skills_required text[] NOT NULL DEFAULT '{}',
  employees_needed integer NOT NULL DEFAULT 0,
  employees_have integer NOT NULL DEFAULT 0,
  address text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  avatar_url text NOT NULL DEFAULT '',
  banner_url text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_company_profiles" ON company_profiles;
CREATE POLICY "read_company_profiles"
  ON company_profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_company_profile" ON company_profiles;
CREATE POLICY "insert_own_company_profile"
  ON company_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_company_profile" ON company_profiles;
CREATE POLICY "update_own_company_profile"
  ON company_profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);


-- ---------- company_applications ----------
CREATE TABLE IF NOT EXISTS company_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  resume_url text NOT NULL DEFAULT '',
  resume_filename text NOT NULL DEFAULT '',
  comment text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','pending','viewed','shortlisted','rejected','hired')),
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_company_applications" ON company_applications;
CREATE POLICY "select_own_company_applications"
  ON company_applications FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR auth.uid() = company_id);

DROP POLICY IF EXISTS "insert_own_company_applications" ON company_applications;
CREATE POLICY "insert_own_company_applications"
  ON company_applications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "update_company_applications" ON company_applications;
CREATE POLICY "update_company_applications"
  ON company_applications FOR UPDATE TO authenticated
  USING (auth.uid() = company_id) WITH CHECK (auth.uid() = company_id);

-- FK to company_profiles so student-side join resolves org name + avatar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_applications_company_profile_fk'
  ) THEN
    ALTER TABLE company_applications
      ADD CONSTRAINT company_applications_company_profile_fk
      FOREIGN KEY (company_id) REFERENCES company_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_company_applications_company ON company_applications(company_id);
CREATE INDEX IF NOT EXISTS idx_company_applications_student ON company_applications(student_id);


-- ---------- jobs ----------
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  skills_required text[] NOT NULL DEFAULT '{}',
  package_lpa numeric(5,2) NOT NULL DEFAULT 0.0,
  employees_needed integer NOT NULL DEFAULT 0,
  employees_have integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_jobs" ON jobs;
CREATE POLICY "read_jobs"
  ON jobs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_jobs" ON jobs;
CREATE POLICY "insert_own_jobs"
  ON jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "update_own_jobs" ON jobs;
CREATE POLICY "update_own_jobs"
  ON jobs FOR UPDATE TO authenticated
  USING (auth.uid() = company_id) WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "delete_own_jobs" ON jobs;
CREATE POLICY "delete_own_jobs"
  ON jobs FOR DELETE TO authenticated
  USING (auth.uid() = company_id);

CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id);


-- ---------- notifications ----------
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  link_view text NOT NULL DEFAULT '',
  link_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notifications" ON notifications;
CREATE POLICY "select_own_notifications"
  ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_notifications" ON notifications;
CREATE POLICY "insert_notifications"
  ON notifications FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications"
  ON notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications"
  ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);


-- ---------- conversations ----------
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_message text NOT NULL DEFAULT '',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_a, user_b)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_conversations" ON conversations;
CREATE POLICY "select_own_conversations"
  ON conversations FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

DROP POLICY IF EXISTS "insert_own_conversations" ON conversations;
CREATE POLICY "insert_own_conversations"
  ON conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

DROP POLICY IF EXISTS "update_own_conversations" ON conversations;
CREATE POLICY "update_own_conversations"
  ON conversations FOR UPDATE TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE INDEX IF NOT EXISTS idx_conversations_a ON conversations(user_a);
CREATE INDEX IF NOT EXISTS idx_conversations_b ON conversations(user_b);


-- ---------- messages ----------
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  attachment_url text NOT NULL DEFAULT '',
  attachment_name text NOT NULL DEFAULT '',
  attachment_type text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_conversation_messages" ON messages;
CREATE POLICY "select_conversation_messages"
  ON messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  ));

DROP POLICY IF EXISTS "insert_conversation_messages" ON messages;
CREATE POLICY "insert_conversation_messages"
  ON messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );

DROP POLICY IF EXISTS "update_conversation_messages" ON messages;
CREATE POLICY "update_conversation_messages"
  ON messages FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  ));

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);


-- ---------- friends ----------
CREATE TABLE IF NOT EXISTS friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Remove duplicate friend-request rows before creating the unique index.
-- Keeps the most recently created row for each pair and deletes the rest.
DELETE FROM friends
WHERE id NOT IN (
  SELECT DISTINCT ON (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id)) id
  FROM friends
  ORDER BY LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id), created_at DESC
);

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

-- FULL replica identity so realtime row filters (recipient_id=eq.<uid>)
-- match on INSERT payloads — without this incoming requests don't live-update.
ALTER TABLE friends REPLICA IDENTITY FULL;


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

ALTER TABLE calls REPLICA IDENTITY FULL;


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


-- ---------- realtime publication ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'jobs') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'company_applications') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE company_applications;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'friends') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE friends;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'calls') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE calls;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    END IF;
  END IF;
END $$;


-- ---------- storage buckets ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('avatars', 'avatars', true, 5242880),
  ('banners', 'banners', true, 8388608),
  ('resumes', 'resumes', false, 10485760),
  ('attachments', 'attachments', false, 15728640)
ON CONFLICT (id) DO NOTHING;

-- avatars (public read, owner write)
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "avatars_owner_write" ON storage.objects;
CREATE POLICY "avatars_owner_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- banners (public read, owner write)
DROP POLICY IF EXISTS "banners_public_read" ON storage.objects;
CREATE POLICY "banners_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'banners');
DROP POLICY IF EXISTS "banners_owner_write" ON storage.objects;
CREATE POLICY "banners_owner_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "banners_owner_update" ON storage.objects;
CREATE POLICY "banners_owner_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "banners_owner_delete" ON storage.objects;
CREATE POLICY "banners_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);

-- resumes (private; owner full, recipient company read)
DROP POLICY IF EXISTS "resumes_owner_all" ON storage.objects;
CREATE POLICY "resumes_owner_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "resumes_recipient_read" ON storage.objects;
CREATE POLICY "resumes_recipient_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'resumes' AND EXISTS (
      SELECT 1 FROM company_applications a
      WHERE a.company_id = auth.uid() AND a.resume_url LIKE '%' || storage.objects.name
    )
  );

-- attachments (private; owner full, conversation participant read)
DROP POLICY IF EXISTS "attachments_owner_all" ON storage.objects;
CREATE POLICY "attachments_owner_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "attachments_recipient_read" ON storage.objects;
CREATE POLICY "attachments_recipient_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments' AND EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE (c.user_a = auth.uid() OR c.user_b = auth.uid())
        AND m.attachment_url LIKE '%' || storage.objects.name
    )
  );


-- ---------- call signaling: authorize the Realtime broadcast/presence
-- channel that WebRTC offers/answers/ICE candidates travel over ----------
-- Without this, Supabase Realtime's default Authorization silently drops
-- every signaling message, which is why calls ring, get accepted, and then
-- sit on "Connecting…" forever with no audio/video.
DROP POLICY IF EXISTS "call_signaling_read" ON realtime.messages;
CREATE POLICY "call_signaling_read"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.messages.extension IN ('broadcast', 'presence')
    AND EXISTS (
      SELECT 1 FROM calls c
      WHERE realtime.topic() = 'call-' || c.id::text
        AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "call_signaling_write" ON realtime.messages;
CREATE POLICY "call_signaling_write"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    realtime.messages.extension IN ('broadcast', 'presence')
    AND EXISTS (
      SELECT 1 FROM calls c
      WHERE realtime.topic() = 'call-' || c.id::text
        AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
    )
  );


-- ============================================================================
-- DONE. Three more settings to check in your Supabase Dashboard:
-- ============================================================================
-- 1. TURN OFF email confirmation (this fixes the sign-up/sign-in error):
--    Dashboard → Authentication → Sign In / Providers → Email
--    → turn OFF "Confirm email" → Save.
--
-- 2. Add your site URL for password-reset redirects:
--    Dashboard → Authentication → URL Configuration
--    → Site URL: https://your-app-url  (e.g. http://localhost:5173 for dev)
--    → Redirect URLs: add http://localhost:5173/frontend/login.html
--                     and your production URL + /frontend/login.html
--    → Save.
--
-- 3. Calling feature: this script adds the RLS policies Realtime needs, but
--    if two people on different networks (not the same WiFi) still can't
--    connect after this fix, that's a separate, known limitation: this app
--    only lists STUN servers, no TURN server, so calls across strict
--    NATs/firewalls can still fail. Add a TURN provider (e.g. Twilio,
--    Cloudflare Calls, Xirsys) to the ICE_SERVERS array in
--    frontend/js/app.js if that happens.
-- ============================================================================
