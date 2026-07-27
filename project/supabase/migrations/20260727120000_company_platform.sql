/*
# Company Platform — profiles, applications, notifications, messaging

## Bug fix
`profiles` had a SELECT policy that ran a subquery on `profiles` itself to
check `role = 'admin'`. Postgres RLS re-evaluates the policy for every row
touched by that inner subquery too, which recurses forever and Postgres
rejects with "infinite recursion detected in policy for relation profiles".
This is what broke "Save Profile" on the dashboard.

Fix: a `SECURITY DEFINER` helper function reads the role directly, bypassing
RLS for that one lookup, so the policy no longer references its own table
through RLS-checked SQL. Every policy that had this pattern is rewritten to
use the helper.

## New tables
- `company_profiles` — one row per company-role user: org name, about us
  (bio + required skills + employee tracker), contact info, avatar/banner.
- `company_applications` — a student's application to a specific company
  profile (name, address, resume file, comment).
- `notifications` — generic per-user notification feed (new applicant, new
  message, application status change).
- `conversations` / `messages` — direct messaging between a company and a
  student, with optional file attachments.

## Storage
- `avatars`, `banners` — public-read buckets for profile images.
- `resumes`, `attachments` — private buckets, readable only by the
  uploader and (for resumes) the company that the application was sent to.
*/

-- ---------- helper: bypasses RLS to avoid self-referential recursion ----------
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

-- ---------- re-point every policy that used a self-referential subquery ----------
DROP POLICY IF EXISTS "select_own_or_admin_profiles" ON profiles;
CREATE POLICY "select_own_or_admin_profiles"
  ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "admin_insert_companies" ON companies;
CREATE POLICY "admin_insert_companies"
  ON companies FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_companies" ON companies;
CREATE POLICY "admin_update_companies"
  ON companies FOR UPDATE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "select_own_or_admin_matches" ON matches;
CREATE POLICY "select_own_or_admin_matches"
  ON matches FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR public.is_admin());

DROP POLICY IF EXISTS "select_own_or_admin_applications" ON applications;
CREATE POLICY "select_own_or_admin_applications"
  ON applications FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR public.is_admin());

-- ---------- profiles: allow a 'company' role + optional avatar/banner ----------
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('student','company','admin'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banner_url text NOT NULL DEFAULT '';

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
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','viewed','shortlisted','rejected')),
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

-- Any signed-in user can create a notification *for someone else*
-- (e.g. a student applying notifies the company) — that's the point of
-- a notification. It carries no sensitive data beyond a title/body.
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

-- ---------- indexes ----------
CREATE INDEX IF NOT EXISTS idx_company_applications_company ON company_applications(company_id);
CREATE INDEX IF NOT EXISTS idx_company_applications_student ON company_applications(student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_conversations_a ON conversations(user_a);
CREATE INDEX IF NOT EXISTS idx_conversations_b ON conversations(user_b);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- ---------- realtime for live chat ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE messages;
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

-- Public-read buckets: anyone can view, only the owner (folder = their uid) can write.
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

-- Resumes: private. Uploader (student, folder = their uid) can read/write.
-- Any company that has received an application referencing that exact file
-- path can also read it, so the recruiter can open the resume.
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

-- Message attachments: only the two participants of the conversation the file was sent in.
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
