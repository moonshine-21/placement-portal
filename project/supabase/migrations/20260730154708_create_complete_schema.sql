/*
# Complete Database Schema for Smart Placement Cell Portal

## Overview
Creates the entire database schema for the AI-powered placement portal, including all original tables and new feature tables.

## Tables Created

### Core
1. **profiles** — user profiles (students and companies), linked to auth.users
2. **companies** — company listings with required skills, CGPA, branches
3. **matches** — AI match scores between students and companies
4. **applications** — student applications to companies

### Company Side
5. **company_profiles** — public company profile pages
6. **company_applications** — applications received by companies (with resume files)
7. **jobs** — job postings by companies

### Communication
8. **notifications** — in-app notification feed
9. **conversations** — DM conversation metadata
10. **messages** — individual DM messages with attachments
11. **friends** — friend connections between students
12. **calls** — WebRTC call records (incoming/outgoing/history)

### New Features
13. **events** — placement drives, workshops, guest lectures
14. **event_registrations** — student RSVPs to events
15. **announcements** — broadcast announcements
16. **student_projects** — portfolio projects with tech stack
17. **bookmarks** — saved companies
18. **forum_posts** — community discussion posts
19. **forum_replies** — replies to forum posts

## RPCs
- **search_students(q)** — fuzzy search students by name
- **get_leaderboard(limit_count)** — rank students by profile completion, skills, matches

## Security
All tables have RLS enabled. Most use authenticated-only access with ownership checks via auth.uid().
*/

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text DEFAULT '',
  role text DEFAULT 'student',
  cgpa numeric DEFAULT 0,
  branch text DEFAULT '',
  skills text[] DEFAULT '{}',
  resume_text text DEFAULT '',
  resume_filename text DEFAULT '',
  profile_completion integer DEFAULT 0,
  bio text DEFAULT '',
  avatar_url text DEFAULT '',
  banner_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_profiles" ON profiles;
CREATE POLICY "select_profiles" ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_profiles" ON profiles;
CREATE POLICY "insert_profiles" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_profiles" ON profiles;
CREATE POLICY "update_profiles" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================
-- COMPANIES (seed data for matching)
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text DEFAULT '',
  package_lpa numeric DEFAULT 0,
  required_skills text[] DEFAULT '{}',
  min_cgpa numeric DEFAULT 7.0,
  required_branches text[] DEFAULT '{}',
  openings integer DEFAULT 1,
  logo_color text DEFAULT '#38bdf8',
  tier text DEFAULT 'A',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_companies" ON companies;
CREATE POLICY "select_companies" ON companies FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_companies" ON companies;
CREATE POLICY "insert_companies" ON companies FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_companies" ON companies;
CREATE POLICY "update_companies" ON companies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- MATCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  match_score integer DEFAULT 0,
  matched_skills text[] DEFAULT '{}',
  missing_skills text[] DEFAULT '{}',
  eligible boolean DEFAULT true,
  reasoning text DEFAULT '',
  status text DEFAULT 'matched',
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, company_id)
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_matches" ON matches;
CREATE POLICY "select_matches" ON matches FOR SELECT TO authenticated USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "insert_matches" ON matches;
CREATE POLICY "insert_matches" ON matches FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "update_matches" ON matches;
CREATE POLICY "update_matches" ON matches FOR UPDATE TO authenticated USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "delete_matches" ON matches;
CREATE POLICY "delete_matches" ON matches FOR DELETE TO authenticated USING (auth.uid() = student_id);

-- ============================================================
-- APPLICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  status text DEFAULT 'applied',
  applied_at timestamptz DEFAULT now(),
  UNIQUE(student_id, company_id)
);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_applications" ON applications;
CREATE POLICY "select_applications" ON applications FOR SELECT TO authenticated USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "insert_applications" ON applications;
CREATE POLICY "insert_applications" ON applications FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "delete_applications" ON applications;
CREATE POLICY "delete_applications" ON applications FOR DELETE TO authenticated USING (auth.uid() = student_id);

-- ============================================================
-- COMPANY PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS company_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_name text DEFAULT '',
  industry text DEFAULT '',
  about_us text DEFAULT '',
  skills_required text[] DEFAULT '{}',
  employees_needed integer DEFAULT 0,
  employees_have integer DEFAULT 0,
  address text DEFAULT '',
  contact_email text DEFAULT '',
  contact_phone text DEFAULT '',
  website text DEFAULT '',
  avatar_url text DEFAULT '',
  banner_url text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_profiles" ON company_profiles;
CREATE POLICY "select_company_profiles" ON company_profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_company_profiles" ON company_profiles;
CREATE POLICY "insert_company_profiles" ON company_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_company_profiles" ON company_profiles;
CREATE POLICY "update_company_profiles" ON company_profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================
-- COMPANY APPLICATIONS (with resume files)
-- ============================================================
CREATE TABLE IF NOT EXISTS company_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text DEFAULT '',
  address text DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  resume_url text DEFAULT '',
  resume_filename text DEFAULT '',
  comment text DEFAULT '',
  status text DEFAULT 'pending',
  job_id uuid DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE company_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_applications" ON company_applications;
CREATE POLICY "select_company_applications" ON company_applications FOR SELECT TO authenticated USING (auth.uid() = company_id OR auth.uid() = student_id);

DROP POLICY IF EXISTS "insert_company_applications" ON company_applications;
CREATE POLICY "insert_company_applications" ON company_applications FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "update_company_applications" ON company_applications;
CREATE POLICY "update_company_applications" ON company_applications FOR UPDATE TO authenticated USING (auth.uid() = company_id) WITH CHECK (true);

-- ============================================================
-- JOBS
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  job_name text NOT NULL,
  role text DEFAULT '',
  description text DEFAULT '',
  skills_required text[] DEFAULT '{}',
  package_lpa numeric DEFAULT 0,
  employees_needed integer DEFAULT 0,
  employees_have integer DEFAULT 0,
  status text DEFAULT 'open',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_jobs" ON jobs;
CREATE POLICY "select_jobs" ON jobs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_jobs" ON jobs;
CREATE POLICY "insert_jobs" ON jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "update_jobs" ON jobs;
CREATE POLICY "update_jobs" ON jobs FOR UPDATE TO authenticated USING (auth.uid() = company_id) WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "delete_jobs" ON jobs;
CREATE POLICY "delete_jobs" ON jobs FOR DELETE TO authenticated USING (auth.uid() = company_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text DEFAULT 'info',
  title text DEFAULT '',
  body text DEFAULT '',
  link_view text DEFAULT '',
  link_id text DEFAULT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_notifications" ON notifications;
CREATE POLICY "select_notifications" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_notifications" ON notifications;
CREATE POLICY "insert_notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_notifications" ON notifications;
CREATE POLICY "update_notifications" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_notifications" ON notifications;
CREATE POLICY "delete_notifications" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- CONVERSATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message text DEFAULT '',
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_a, user_b),
  CHECK (user_a < user_b)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_conversations" ON conversations;
CREATE POLICY "select_conversations" ON conversations FOR SELECT TO authenticated USING (auth.uid() = user_a OR auth.uid() = user_b);

DROP POLICY IF EXISTS "insert_conversations" ON conversations;
CREATE POLICY "insert_conversations" ON conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

DROP POLICY IF EXISTS "update_conversations" ON conversations;
CREATE POLICY "update_conversations" ON conversations FOR UPDATE TO authenticated USING (auth.uid() = user_a OR auth.uid() = user_b) WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  body text DEFAULT '',
  attachment_url text DEFAULT '',
  attachment_name text DEFAULT '',
  attachment_type text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  read_at timestamptz DEFAULT NULL
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_messages" ON messages;
CREATE POLICY "select_messages" ON messages FOR SELECT TO authenticated USING (
  auth.uid() = sender_id OR EXISTS (
    SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  )
);

DROP POLICY IF EXISTS "insert_messages" ON messages;
CREATE POLICY "insert_messages" ON messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id AND EXISTS (
    SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  )
);

DROP POLICY IF EXISTS "update_messages" ON messages;
CREATE POLICY "update_messages" ON messages FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND (c.user_a = auth.uid() OR c.user_b = auth.uid()))
) WITH CHECK (true);

-- ============================================================
-- FRIENDS
-- ============================================================
CREATE TABLE IF NOT EXISTS friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(requester_id, recipient_id),
  CHECK (requester_id <> recipient_id)
);

ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_friends" ON friends;
CREATE POLICY "select_friends" ON friends FOR SELECT TO authenticated USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "insert_friends" ON friends;
CREATE POLICY "insert_friends" ON friends FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "update_friends" ON friends;
CREATE POLICY "update_friends" ON friends FOR UPDATE TO authenticated USING (auth.uid() = requester_id OR auth.uid() = recipient_id) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_friends" ON friends;
CREATE POLICY "delete_friends" ON friends FOR DELETE TO authenticated USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- ============================================================
-- CALLS
-- ============================================================
CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  callee_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  call_type text DEFAULT 'friend',
  room_name text DEFAULT '',
  status text DEFAULT 'ringing',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_calls" ON calls;
CREATE POLICY "select_calls" ON calls FOR SELECT TO authenticated USING (auth.uid() = caller_id OR auth.uid() = callee_id);

DROP POLICY IF EXISTS "insert_calls" ON calls;
CREATE POLICY "insert_calls" ON calls FOR INSERT TO authenticated WITH CHECK (auth.uid() = caller_id);

DROP POLICY IF EXISTS "update_calls" ON calls;
CREATE POLICY "update_calls" ON calls FOR UPDATE TO authenticated USING (auth.uid() = caller_id OR auth.uid() = callee_id) WITH CHECK (true);

-- ============================================================
-- EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  event_date timestamptz NOT NULL,
  event_type text DEFAULT 'other',
  location text DEFAULT '',
  organizer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organizer_name text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_events" ON events;
CREATE POLICY "select_events" ON events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_events" ON events;
CREATE POLICY "insert_events" ON events FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_events" ON events;
CREATE POLICY "update_events" ON events FOR UPDATE TO authenticated USING (auth.uid() = organizer_id) WITH CHECK (auth.uid() = organizer_id);

DROP POLICY IF EXISTS "delete_events" ON events;
CREATE POLICY "delete_events" ON events FOR DELETE TO authenticated USING (auth.uid() = organizer_id);

-- ============================================================
-- EVENT REGISTRATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  registered_at timestamptz DEFAULT now(),
  UNIQUE(event_id, student_id)
);

ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_registrations" ON event_registrations;
CREATE POLICY "select_registrations" ON event_registrations FOR SELECT TO authenticated USING (auth.uid() = student_id OR auth.uid() = (SELECT organizer_id FROM events WHERE events.id = event_registrations.event_id));

DROP POLICY IF EXISTS "insert_registrations" ON event_registrations;
CREATE POLICY "insert_registrations" ON event_registrations FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "delete_registrations" ON event_registrations;
CREATE POLICY "delete_registrations" ON event_registrations FOR DELETE TO authenticated USING (auth.uid() = student_id);

-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text DEFAULT '',
  priority text DEFAULT 'normal',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_announcements" ON announcements;
CREATE POLICY "select_announcements" ON announcements FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_announcements" ON announcements;
CREATE POLICY "insert_announcements" ON announcements FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delete_announcements" ON announcements;
CREATE POLICY "delete_announcements" ON announcements FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- ============================================================
-- STUDENT PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS student_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  tech_stack text[] DEFAULT '{}',
  project_url text DEFAULT '',
  image_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE student_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_projects" ON student_projects;
CREATE POLICY "select_projects" ON student_projects FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_projects" ON student_projects;
CREATE POLICY "insert_projects" ON student_projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "update_projects" ON student_projects;
CREATE POLICY "update_projects" ON student_projects FOR UPDATE TO authenticated USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "delete_projects" ON student_projects;
CREATE POLICY "delete_projects" ON student_projects FOR DELETE TO authenticated USING (auth.uid() = student_id);

-- ============================================================
-- BOOKMARKS
-- ============================================================
CREATE TABLE IF NOT EXISTS bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, company_id)
);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_bookmarks" ON bookmarks;
CREATE POLICY "select_bookmarks" ON bookmarks FOR SELECT TO authenticated USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "insert_bookmarks" ON bookmarks;
CREATE POLICY "insert_bookmarks" ON bookmarks FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "delete_bookmarks" ON bookmarks;
CREATE POLICY "delete_bookmarks" ON bookmarks FOR DELETE TO authenticated USING (auth.uid() = student_id);

-- ============================================================
-- FORUM POSTS
-- ============================================================
CREATE TABLE IF NOT EXISTS forum_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text DEFAULT '',
  title text NOT NULL,
  body text NOT NULL,
  category text DEFAULT 'general',
  views integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_forum_posts" ON forum_posts;
CREATE POLICY "select_forum_posts" ON forum_posts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_forum_posts" ON forum_posts;
CREATE POLICY "insert_forum_posts" ON forum_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "update_forum_posts" ON forum_posts;
CREATE POLICY "update_forum_posts" ON forum_posts FOR UPDATE TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "delete_forum_posts" ON forum_posts;
CREATE POLICY "delete_forum_posts" ON forum_posts FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- ============================================================
-- FORUM REPLIES
-- ============================================================
CREATE TABLE IF NOT EXISTS forum_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES forum_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text DEFAULT '',
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE forum_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_forum_replies" ON forum_replies;
CREATE POLICY "select_forum_replies" ON forum_replies FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_forum_replies" ON forum_replies;
CREATE POLICY "insert_forum_replies" ON forum_replies FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "delete_forum_replies" ON forum_replies;
CREATE POLICY "delete_forum_replies" ON forum_replies FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_matches_student ON matches(student_id);
CREATE INDEX IF NOT EXISTS idx_apps_student ON applications(student_id);
CREATE INDEX IF NOT EXISTS idx_coapps_company ON company_applications(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_users ON conversations(user_a, user_b);
CREATE INDEX IF NOT EXISTS idx_msgs_conv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_friends_recipient ON friends(recipient_id);
CREATE INDEX IF NOT EXISTS idx_calls_callee ON calls(callee_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_registrations_event ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_student ON student_projects(student_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_student ON bookmarks(student_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_created ON forum_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_replies_post ON forum_replies(post_id);

-- ============================================================
-- SEARCH STUDENTS RPC
-- ============================================================
CREATE OR REPLACE FUNCTION search_students(q text)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, full_name, email, avatar_url
  FROM profiles
  WHERE (role = 'student' OR role IS NULL)
    AND full_name ILIKE '%' || q || '%'
  ORDER BY full_name
  LIMIT 20;
$$;

-- ============================================================
-- LEADERBOARD RPC
-- ============================================================
CREATE OR REPLACE FUNCTION get_leaderboard(limit_count int DEFAULT 50)
RETURNS TABLE (
  student_id uuid,
  full_name text,
  avatar_url text,
  branch text,
  cgpa numeric,
  skills_count integer,
  profile_completion integer,
  high_matches integer,
  total_matches integer,
  rank integer
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH ranked AS (
    SELECT
      p.id AS student_id,
      p.full_name,
      p.avatar_url,
      p.branch,
      p.cgpa,
      COALESCE(array_length(p.skills, 1), 0) AS skills_count,
      p.profile_completion,
      COALESCE(
        (SELECT COUNT(*) FROM matches m WHERE m.student_id = p.id AND m.match_score >= 85),
        0
      ) AS high_matches,
      COALESCE(
        (SELECT COUNT(*) FROM matches m WHERE m.student_id = p.id),
        0
      ) AS total_matches,
      ROW_NUMBER() OVER (
        ORDER BY
          p.profile_completion DESC,
          COALESCE(array_length(p.skills, 1), 0) DESC,
          COALESCE((SELECT COUNT(*) FROM matches m WHERE m.student_id = p.id AND m.match_score >= 85), 0) DESC,
          p.cgpa DESC NULLS LAST
      ) AS rank
    FROM profiles p
    WHERE p.role = 'student' OR p.role IS NULL
  )
  SELECT * FROM ranked WHERE rank <= limit_count;
$$;

-- ============================================================
-- SEED COMPANIES
-- ============================================================
INSERT INTO companies (name, role, package_lpa, required_skills, min_cgpa, required_branches, openings, logo_color, tier) VALUES
('Nimbus Labs', 'Software Engineer', 12.0, ARRAY['JavaScript', 'React', 'Node.js', 'SQL'], 7.5, ARRAY['CSE', 'IT'], 5, '#38bdf8', 'A'),
('Quantum Systems', 'Data Analyst', 10.0, ARRAY['Python', 'SQL', 'Pandas', 'Statistics'], 7.0, ARRAY['CSE', 'IT', 'AI'], 3, '#6366f1', 'A'),
('Vertex AI', 'ML Engineer', 18.0, ARRAY['Python', 'Machine Learning', 'TensorFlow', 'Deep Learning'], 8.0, ARRAY['CSE', 'AI'], 2, '#22d3ee', 'S'),
('CloudForge', 'DevOps Engineer', 14.0, ARRAY['Docker', 'Kubernetes', 'AWS', 'CI/CD'], 7.0, ARRAY['CSE', 'IT'], 4, '#34d399', 'A'),
('Pixel Studio', 'Frontend Developer', 8.0, ARRAY['HTML', 'CSS', 'JavaScript', 'React'], 6.5, ARRAY['CSE', 'IT'], 6, '#fbbf24', 'B'),
('DataBridge', 'Backend Developer', 11.0, ARRAY['Java', 'Spring', 'SQL', 'REST API'], 7.0, ARRAY['CSE', 'IT'], 3, '#f97316', 'A'),
('Nexus Corp', 'Full Stack Developer', 15.0, ARRAY['JavaScript', 'React', 'Node.js', 'MongoDB', 'SQL'], 7.5, ARRAY['CSE', 'IT'], 4, '#ec4899', 'S'),
('CyberEdge', 'Security Analyst', 13.0, ARRAY['Networking', 'Linux', 'Python', 'Security'], 7.5, ARRAY['CSE', 'IT'], 2, '#a78bfa', 'A'),
('GreenByte', 'Software Engineer', 9.0, ARRAY['Python', 'Django', 'SQL', 'REST API'], 6.5, ARRAY['CSE', 'IT', 'ECE'], 5, '#10b981', 'B'),
('Stellar Dynamics', 'Data Scientist', 20.0, ARRAY['Python', 'Machine Learning', 'Statistics', 'NLP'], 8.5, ARRAY['CSE', 'AI'], 2, '#8b5cf6', 'S')
ON CONFLICT DO NOTHING;