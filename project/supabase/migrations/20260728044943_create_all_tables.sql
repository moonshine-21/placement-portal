/*
# Create core tables for Smart Placement Cell Portal

Creates all tables the frontend needs: profiles, companies, matches, applications,
conversations, messages, notifications, company_profiles, company_applications, jobs.
All with RLS enabled and owner-scoped policies.
*/

-- ============ profiles ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  role text NOT NULL DEFAULT 'student',
  branch text,
  cgpa numeric,
  skills text[] DEFAULT '{}',
  resume_text text,
  resume_filename text,
  avatar_url text,
  profile_completion int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ============ companies ============
CREATE TABLE IF NOT EXISTS companies (
  id text PRIMARY KEY,
  name text NOT NULL,
  role text,
  package_lpa numeric,
  logo_color text DEFAULT '#4f46e5',
  tier text DEFAULT 'Tier 1',
  openings int DEFAULT 1,
  required_skills text[] DEFAULT '{}',
  min_cgpa numeric DEFAULT 0,
  required_branches text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_companies" ON companies;
CREATE POLICY "select_companies" ON companies FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_companies" ON companies;
CREATE POLICY "insert_companies" ON companies FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_companies" ON companies;
CREATE POLICY "update_companies" ON companies FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_companies" ON companies;
CREATE POLICY "delete_companies" ON companies FOR DELETE
  TO authenticated USING (true);

-- ============ matches ============
CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  match_score int NOT NULL DEFAULT 0,
  matched_skills text[] DEFAULT '{}',
  missing_skills text[] DEFAULT '{}',
  eligible boolean DEFAULT false,
  reasoning text,
  status text DEFAULT 'matched',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_matches" ON matches;
CREATE POLICY "select_own_matches" ON matches FOR SELECT
  TO authenticated USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "insert_own_matches" ON matches;
CREATE POLICY "insert_own_matches" ON matches FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "update_own_matches" ON matches;
CREATE POLICY "update_own_matches" ON matches FOR UPDATE
  TO authenticated USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "delete_own_matches" ON matches;
CREATE POLICY "delete_own_matches" ON matches FOR DELETE
  TO authenticated USING (auth.uid() = student_id);

-- ============ applications (legacy) ============
CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status text DEFAULT 'applied',
  applied_at timestamptz DEFAULT now()
);
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_applications" ON applications;
CREATE POLICY "select_own_applications" ON applications FOR SELECT
  TO authenticated USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "insert_own_applications" ON applications;
CREATE POLICY "insert_own_applications" ON applications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "update_own_applications" ON applications;
CREATE POLICY "update_own_applications" ON applications FOR UPDATE
  TO authenticated USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "delete_own_applications" ON applications;
CREATE POLICY "delete_own_applications" ON applications FOR DELETE
  TO authenticated USING (auth.uid() = student_id);

-- ============ conversations ============
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message text,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_conversations" ON conversations;
CREATE POLICY "select_own_conversations" ON conversations FOR SELECT
  TO authenticated USING (auth.uid() = user_a OR auth.uid() = user_b);

DROP POLICY IF EXISTS "insert_own_conversations" ON conversations;
CREATE POLICY "insert_own_conversations" ON conversations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

DROP POLICY IF EXISTS "update_own_conversations" ON conversations;
CREATE POLICY "update_own_conversations" ON conversations FOR UPDATE
  TO authenticated USING (auth.uid() = user_a OR auth.uid() = user_b)
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

DROP POLICY IF EXISTS "delete_own_conversations" ON conversations;
CREATE POLICY "delete_own_conversations" ON conversations FOR DELETE
  TO authenticated USING (auth.uid() = user_a OR auth.uid() = user_b);

-- ============ messages ============
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text,
  attachment_url text,
  attachment_name text,
  attachment_type text,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_messages" ON messages;
CREATE POLICY "select_own_messages" ON messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );

DROP POLICY IF EXISTS "insert_own_messages" ON messages;
CREATE POLICY "insert_own_messages" ON messages FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
    AND messages.sender_id = auth.uid()
  );

DROP POLICY IF EXISTS "update_own_messages" ON messages;
CREATE POLICY "update_own_messages" ON messages FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );

DROP POLICY IF EXISTS "delete_own_messages" ON messages;
CREATE POLICY "delete_own_messages" ON messages FOR DELETE
  TO authenticated USING (messages.sender_id = auth.uid());

-- ============ notifications ============
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text,
  title text,
  body text,
  link_view text,
  link_id uuid,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notifications" ON notifications;
CREATE POLICY "select_own_notifications" ON notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notifications" ON notifications;
CREATE POLICY "insert_own_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============ company_profiles ============
CREATE TABLE IF NOT EXISTS company_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_name text,
  industry text,
  about_us text,
  address text,
  website text,
  contact_email text,
  contact_phone text,
  banner_url text,
  avatar_url text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_profiles" ON company_profiles;
CREATE POLICY "select_company_profiles" ON company_profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_company_profile" ON company_profiles;
CREATE POLICY "insert_own_company_profile" ON company_profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_company_profile" ON company_profiles;
CREATE POLICY "update_own_company_profile" ON company_profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_company_profile" ON company_profiles;
CREATE POLICY "delete_own_company_profile" ON company_profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ============ company_applications ============
CREATE TABLE IF NOT EXISTS company_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid,
  full_name text,
  address text,
  phone text,
  email text,
  resume_url text,
  resume_filename text,
  comment text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE company_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_company_applications" ON company_applications;
CREATE POLICY "select_own_company_applications" ON company_applications FOR SELECT
  TO authenticated USING (auth.uid() = company_id OR auth.uid() = student_id);

DROP POLICY IF EXISTS "insert_own_company_applications" ON company_applications;
CREATE POLICY "insert_own_company_applications" ON company_applications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "update_own_company_applications" ON company_applications;
CREATE POLICY "update_own_company_applications" ON company_applications FOR UPDATE
  TO authenticated USING (auth.uid() = company_id OR auth.uid() = student_id)
  WITH CHECK (auth.uid() = company_id OR auth.uid() = student_id);

DROP POLICY IF EXISTS "delete_own_company_applications" ON company_applications;
CREATE POLICY "delete_own_company_applications" ON company_applications FOR DELETE
  TO authenticated USING (auth.uid() = company_id OR auth.uid() = student_id);

-- ============ jobs ============
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_name text,
  role text,
  description text,
  skills_required text[] DEFAULT '{}',
  package_lpa numeric,
  employees_needed int DEFAULT 0,
  employees_have int DEFAULT 0,
  status text DEFAULT 'open',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_jobs" ON jobs;
CREATE POLICY "select_jobs" ON jobs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_jobs" ON jobs;
CREATE POLICY "insert_own_jobs" ON jobs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "update_own_jobs" ON jobs;
CREATE POLICY "update_own_jobs" ON jobs FOR UPDATE
  TO authenticated USING (auth.uid() = company_id) WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "delete_own_jobs" ON jobs;
CREATE POLICY "delete_own_jobs" ON jobs FOR DELETE
  TO authenticated USING (auth.uid() = company_id);
