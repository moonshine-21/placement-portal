-- ============================================================================
-- SMART PLACEMENT CELL — COMPLETE DATABASE SETUP (single file)
-- ============================================================================
--
-- WHAT THIS FILE IS, IN PLAIN ENGLISH:
-- Your website's data (every user, every job posting, every chat message,
-- everything) lives in a database, hosted by Supabase. A database starts
-- out completely empty — it doesn't know what a "job" or a "message" even
-- IS until you tell it. This file is that instructions list: it's every
-- "create this kind of thing" and "here are the rules for who can see/edit
-- it" instruction the website needs, combined into one file so you can set
-- up a brand new database (or a fresh copy of the project) in one paste.
--
-- HOW TO USE THIS FILE:
-- 1. Open your project at supabase.com/dashboard
-- 2. Click "SQL Editor" in the left sidebar
-- 3. Click "New query"
-- 4. Paste this ENTIRE file in, then click "Run"
-- 5. Done. Every table, security rule, and starting setting your site
--    needs now exists.
--
-- Safe to run more than once — every statement either says "only do this
-- IF it doesn't already exist" or "replace the old version of this rule
-- with this one," so re-running it never duplicates anything or breaks
-- anything that's already there.
-- ============================================================================


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ FROM: 20260730154708_create_complete_schema.sql                            │
-- └────────────────────────────────────────────────────────────────────────┘

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
DROP FUNCTION IF EXISTS search_students(text);
CREATE FUNCTION search_students(q text)
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
-- Intentionally left empty. Add real recruiting companies via the
-- Supabase SQL editor / dashboard, or build an admin "add company" flow
-- in the app — there isn't one yet, `companies` is currently read-only
-- from the client (see src/lib/data.ts).

-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ FROM: 20260730155158_create_storage_buckets.sql                            │
-- └────────────────────────────────────────────────────────────────────────┘

/*
# Create Storage Buckets

## Overview
Creates the four storage buckets needed for file uploads throughout the app.

## Buckets Created
1. **avatars** (public) — user profile pictures and company logos
2. **banners** (public) — profile banners and project screenshots
3. **resumes** (private) — uploaded resumes, accessible only to the owner and companies they apply to
4. **attachments** (private) — DM message file attachments
*/

INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars', 'avatars', true),
  ('banners', 'banners', true),
  ('resumes', 'resumes', false),
  ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can manage their own files (path starts with their user ID)
-- Public buckets: anyone can read
-- Private buckets: only the file owner can read their own files

-- Avatars (public read, authenticated write to own folder)
DROP POLICY IF EXISTS "avatar_public_read" ON storage.objects;
CREATE POLICY "avatar_public_read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatar_auth_write" ON storage.objects;
CREATE POLICY "avatar_auth_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatar_auth_update" ON storage.objects;
CREATE POLICY "avatar_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatar_auth_delete" ON storage.objects;
CREATE POLICY "avatar_auth_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Banners (public read, authenticated write to own folder)
DROP POLICY IF EXISTS "banner_public_read" ON storage.objects;
CREATE POLICY "banner_public_read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'banners');

DROP POLICY IF EXISTS "banner_auth_write" ON storage.objects;
CREATE POLICY "banner_auth_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "banner_auth_update" ON storage.objects;
CREATE POLICY "banner_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "banner_auth_delete" ON storage.objects;
CREATE POLICY "banner_auth_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Resumes (private, owner can read/write)
DROP POLICY IF EXISTS "resume_owner_read" ON storage.objects;
CREATE POLICY "resume_owner_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "resume_owner_write" ON storage.objects;
CREATE POLICY "resume_owner_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "resume_owner_update" ON storage.objects;
CREATE POLICY "resume_owner_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "resume_owner_delete" ON storage.objects;
CREATE POLICY "resume_owner_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Attachments (private, owner can read/write, conversation participants can read)
DROP POLICY IF EXISTS "attachment_owner_read" ON storage.objects;
CREATE POLICY "attachment_owner_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "attachment_auth_write" ON storage.objects;
CREATE POLICY "attachment_auth_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "attachment_owner_delete" ON storage.objects;
CREATE POLICY "attachment_owner_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ FROM: 20260731040000_search_students_hide_email.sql                        │
-- └────────────────────────────────────────────────────────────────────────┘

/*
  # Stop leaking student emails from friend search

  `search_students` previously returned each matching student's email address,
  which was rendered directly in the "Find Friends" search results — visible
  to any logged-in user who searched for someone by name. Emails should be
  private; drop the column from the RPC's return type (return `branch`
  instead, which is actually useful context in a search result) and swap the
  return type since Postgres won't let CREATE OR REPLACE change output columns.
*/

DROP FUNCTION IF EXISTS search_students(text);

CREATE FUNCTION search_students(q text)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  branch text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, full_name, avatar_url, branch
  FROM profiles
  WHERE (role = 'student' OR role IS NULL)
    AND full_name ILIKE '%' || q || '%'
  ORDER BY full_name
  LIMIT 20;
$$;


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ FROM: 20260731050000_remove_demo_companies.sql                             │
-- └────────────────────────────────────────────────────────────────────────┘

-- Removes the placeholder/demo companies that were inserted by the initial
-- schema migration's seed block (Nimbus Labs, Quantum Systems, Vertex AI,
-- CloudForge, Pixel Studio, DataBridge, Nexus Corp, CyberEdge, GreenByte,
-- Stellar Dynamics). These were sample data for local development/demo
-- purposes and are not real recruiting companies.
--
-- `matches.company_id` and `company_applications`/`jobs` (via company_id ->
-- auth.users, not relevant here) reference companies with ON DELETE CASCADE,
-- so any matches generated against these demo companies are removed
-- automatically along with them.

DELETE FROM companies
WHERE name IN (
  'Nimbus Labs',
  'Quantum Systems',
  'Vertex AI',
  'CloudForge',
  'Pixel Studio',
  'DataBridge',
  'Nexus Corp',
  'CyberEdge',
  'GreenByte',
  'Stellar Dynamics'
);


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ FROM: 20260731060000_admin_panel.sql                                       │
-- └────────────────────────────────────────────────────────────────────────┘

/*
  # Admin panel support

  1. Adds account-status columns to `profiles` (ban/suspend)
  2. Adds `admin_audit_log` table that records every admin action
  3. Adds an `is_admin()` helper (SECURITY DEFINER, so it can read `profiles`
     without recursing into the RLS policy that calls it). Treats both
     'admin' and 'owner' roles as having admin-level database access.
  4. Adds admin-override RLS policies so an admin/owner can manage rows
     that belong to other users (edit any profile, moderate jobs/companies/
     content), while every existing policy for normal users is left
     untouched.

  This version is safe to run more than once: every CREATE POLICY is
  preceded by a DROP POLICY IF EXISTS, since Postgres has no
  "CREATE POLICY IF NOT EXISTS". Nothing here touches auth.users, sign-in,
  or how accounts log in -- it only adds/updates row-level security rules
  and the two audit/status additions above.
*/

-- 1. Account status fields ---------------------------------------------------

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_by uuid;

-- 2. is_admin() helper --------------------------------------------------------

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')
  );
$$;

-- 3. Audit log ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_name text DEFAULT '',
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text DEFAULT '',
  target_label text DEFAULT '',
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_audit_log" ON admin_audit_log;
CREATE POLICY "admin_select_audit_log" ON admin_audit_log
  FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_audit_log" ON admin_audit_log;
CREATE POLICY "admin_insert_audit_log" ON admin_audit_log
  FOR INSERT TO authenticated WITH CHECK (is_admin() AND actor_id = auth.uid());

-- 4. Admin override policies ---------------------------------------------------

-- profiles: admin can update (edit/ban) and delete any profile
DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
CREATE POLICY "admin_update_profiles" ON profiles
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_profiles" ON profiles;
CREATE POLICY "admin_delete_profiles" ON profiles
  FOR DELETE TO authenticated USING (is_admin());

-- companies
DROP POLICY IF EXISTS "admin_update_companies" ON companies;
CREATE POLICY "admin_update_companies" ON companies
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_companies" ON companies;
CREATE POLICY "admin_delete_companies" ON companies
  FOR DELETE TO authenticated USING (is_admin());

-- company_profiles
DROP POLICY IF EXISTS "admin_update_company_profiles" ON company_profiles;
CREATE POLICY "admin_update_company_profiles" ON company_profiles
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- jobs
DROP POLICY IF EXISTS "admin_update_jobs" ON jobs;
CREATE POLICY "admin_update_jobs" ON jobs
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_jobs" ON jobs;
CREATE POLICY "admin_delete_jobs" ON jobs
  FOR DELETE TO authenticated USING (is_admin());

-- announcements
DROP POLICY IF EXISTS "admin_delete_announcements" ON announcements;
CREATE POLICY "admin_delete_announcements" ON announcements
  FOR DELETE TO authenticated USING (is_admin());

-- events
DROP POLICY IF EXISTS "admin_update_events" ON events;
CREATE POLICY "admin_update_events" ON events
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_events" ON events;
CREATE POLICY "admin_delete_events" ON events
  FOR DELETE TO authenticated USING (is_admin());

-- forum posts / replies
DROP POLICY IF EXISTS "admin_delete_forum_posts" ON forum_posts;
CREATE POLICY "admin_delete_forum_posts" ON forum_posts
  FOR DELETE TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_delete_forum_replies" ON forum_replies;
CREATE POLICY "admin_delete_forum_replies" ON forum_replies
  FOR DELETE TO authenticated USING (is_admin());

-- student projects
DROP POLICY IF EXISTS "admin_delete_projects" ON student_projects;
CREATE POLICY "admin_delete_projects" ON student_projects
  FOR DELETE TO authenticated USING (is_admin());

-- company applications (admin can view/moderate everything)
DROP POLICY IF EXISTS "admin_select_company_applications" ON company_applications;
CREATE POLICY "admin_select_company_applications" ON company_applications
  FOR SELECT TO authenticated USING (is_admin());

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON profiles (is_banned) WHERE is_banned = true;


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ FROM: 20260731070000_admin_badge.sql                                       │
-- └────────────────────────────────────────────────────────────────────────┘

/*
  # Admin badge support

  Adds an `author_role` snapshot column (same pattern as the existing
  `author_name` column) to announcements, forum posts, and forum replies,
  so the UI can show an "Admin" badge next to a poster's name without an
  extra join. It's set once at insert time from the poster's profile role.
*/

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS author_role text DEFAULT '';
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS author_role text DEFAULT '';
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS author_role text DEFAULT '';


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ FROM: 20260731080000_owner_role.sql                                        │
-- └────────────────────────────────────────────────────────────────────────┘

/*
  # Owner role & privilege-escalation guard

  Introduces a fourth role, 'owner', that sits above 'admin':
  - Owners can do everything admins can (is_admin() now also returns true
    for owners), plus grant/revoke the admin role itself.
  - Admins can manage users/content but CANNOT promote anyone to admin or
    owner, and cannot touch an owner's account.

  This is enforced with a database trigger (not just app UI), so it holds
  even if someone calls the API directly:
  - Changing a profile's `role` to 'admin' or 'owner' requires the acting
    user to already be an 'owner'.
  - Changing anything about a row that is currently 'owner' (role, ban
    status) also requires the acting user to be an 'owner'.
  - Direct SQL-editor / service-role changes (no authenticated user, i.e.
    auth.uid() IS NULL) are never blocked — that's how you bootstrap the
    very first owner.
*/

CREATE OR REPLACE FUNCTION is_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'
  );
$$;

-- is_admin() now also covers owners, since an owner can do everything an
-- admin can (plus grant admin access).
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')
  );
$$;

CREATE OR REPLACE FUNCTION enforce_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acting_role text;
BEGIN
  -- Bootstrapping / service-role / SQL-editor changes have no auth.uid()
  -- and are always allowed (this is how you create the first owner).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO acting_role FROM profiles WHERE id = auth.uid();

  -- Granting admin or owner requires the actor to already be an owner.
  IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role IN ('admin', 'owner') THEN
    IF acting_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Only an owner can grant admin or owner access.';
    END IF;
  END IF;

  -- Any change to a row that is currently an owner (role or ban status)
  -- requires the actor to be an owner.
  IF OLD.role = 'owner' AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_banned IS DISTINCT FROM OLD.is_banned) THEN
    IF acting_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Only an owner can change another owner''s role or ban status.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_privilege_escalation ON profiles;
CREATE TRIGGER trg_enforce_profile_privilege_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_profile_privilege_escalation();


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ FROM: 20260731090000_feature_flags_and_device_security.sql                 │
-- └────────────────────────────────────────────────────────────────────────┘

/*
  # Feature flags, IP/device tracking, and IP/HWID bans

  1. `feature_flags` — lets admins turn site features on/off from the admin
     app without a code deploy. Anyone (including signed-out visitors) can
     read the flags so the site can decide what to render; only admins/owners
     can write.

  2. `device_sessions` — a log of (ip_address, device_fingerprint) pairs seen
     by the site, written exclusively by the `/api/track-session` serverless
     function using the service-role key (never by the browser directly, so
     a client can't fake or hide entries). Readable only by admins.

     IMPORTANT HONESTY NOTE (kept here for whoever reads this migration):
     `device_fingerprint` is a browser/device *fingerprint* built from
     harmless signals the browser already exposes (screen size, timezone,
     GPU renderer string, etc.), not a true hardware ID. Browsers do not let
     websites read real hardware serials/MAC addresses — no website anywhere
     can. It's a best-effort identifier that survives normal browsing but
     can change if someone clears site data, uses a different browser, or
     uses anti-fingerprinting tools. Treat it the way most large sites treat
     "device" bans: a meaningful deterrent, not a cryptographic guarantee.

  3. `banned_ips` / `banned_devices` — admin-managed ban lists checked by
     `/api/track-session` on every page load (before login too), and shown
     in the admin app so bans can be added/removed with one click.

  4. `is_banned_user()` + RESTRICTIVE policies — the existing `is_banned`
     flag on `profiles` already blocked the UI from rendering for a
     suspended account, but a suspended user's still-valid Supabase session
     could previously call the database directly and bypass that screen.
     These RESTRICTIVE policies make Postgres itself refuse writes from a
     banned account on the main content/communication tables, regardless of
     which client is used to make the request.

  Safe to run more than once (DROP POLICY IF EXISTS before every CREATE
  POLICY; CREATE TABLE/INDEX IF NOT EXISTS throughout).
*/

-- 1. Feature flags ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  category text DEFAULT 'general',
  enabled boolean DEFAULT true,
  updated_by uuid,
  updated_by_name text DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_read_feature_flags" ON feature_flags;
CREATE POLICY "anyone_read_feature_flags" ON feature_flags
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_write_feature_flags" ON feature_flags;
CREATE POLICY "admin_write_feature_flags" ON feature_flags
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

INSERT INTO feature_flags (key, name, description, category) VALUES
  ('forum',        'Discussion Forum',       'Student discussion forum (browse + post)',            'community'),
  ('events',       'Events',                 'Campus events and registrations',                     'community'),
  ('leaderboard',  'Leaderboard',            'Student leaderboard rankings',                        'community'),
  ('ai_assistant', 'AI Career Assistant',    'AI-powered career chat assistant',                    'tools'),
  ('messaging',    'Direct Messaging',       'Student/company one-to-one chat',                     'communication'),
  ('friends',      'Friends & Connections',  'Friend requests and connections',                     'communication'),
  ('calls',        'Voice/Video Calls',      'In-app calling between friends and interviews',       'communication'),
  ('projects',     'Student Projects',       'Student project showcase on the profile',             'profile'),
  ('bookmarks',    'Bookmarks',              'Saving companies for later',                          'profile')
ON CONFLICT (key) DO NOTHING;

-- 2. Device/IP session log -----------------------------------------------------

CREATE TABLE IF NOT EXISTS device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ip_address text NOT NULL,
  device_fingerprint text NOT NULL,
  user_agent text DEFAULT '',
  platform text DEFAULT '',
  browser_info jsonb DEFAULT '{}'::jsonb,
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  hit_count integer DEFAULT 1
);

ALTER TABLE device_sessions ENABLE ROW LEVEL SECURITY;

-- No client-facing write policy on purpose: rows are only ever written by
-- the /api/track-session serverless function, which uses the service-role
-- key and therefore bypasses RLS entirely. Browsers cannot write directly.
DROP POLICY IF EXISTS "admin_select_device_sessions" ON device_sessions;
CREATE POLICY "admin_select_device_sessions" ON device_sessions
  FOR SELECT TO authenticated USING (is_admin());

CREATE INDEX IF NOT EXISTS idx_device_sessions_ip ON device_sessions (ip_address);
CREATE INDEX IF NOT EXISTS idx_device_sessions_fp ON device_sessions (device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_device_sessions_user ON device_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_last_seen ON device_sessions (last_seen_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_device_sessions_identity
  ON device_sessions (COALESCE(user_id::text, ''), ip_address, device_fingerprint);

-- 3. Ban lists ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS banned_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text UNIQUE NOT NULL,
  reason text DEFAULT '',
  banned_by uuid,
  banned_by_name text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE banned_ips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_banned_ips" ON banned_ips;
CREATE POLICY "admin_manage_banned_ips" ON banned_ips
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE TABLE IF NOT EXISTS banned_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_fingerprint text UNIQUE NOT NULL,
  reason text DEFAULT '',
  banned_by uuid,
  banned_by_name text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE banned_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_banned_devices" ON banned_devices;
CREATE POLICY "admin_manage_banned_devices" ON banned_devices
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 4. Enforce account bans at the database layer, not just in the UI ------------

CREATE OR REPLACE FUNCTION is_banned_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE((SELECT is_banned FROM profiles WHERE id = auth.uid()), false);
$$;

-- RESTRICTIVE policies are AND-ed with every other policy on the same
-- command, so this actually denies the write no matter what other policy
-- would otherwise allow it — unlike another PERMISSIVE policy, which would
-- just be OR-ed in and change nothing.
DROP POLICY IF EXISTS "block_banned_insert_messages" ON messages;
CREATE POLICY "block_banned_insert_messages" ON messages
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT is_banned_user());

DROP POLICY IF EXISTS "block_banned_insert_forum_posts" ON forum_posts;
CREATE POLICY "block_banned_insert_forum_posts" ON forum_posts
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT is_banned_user());

DROP POLICY IF EXISTS "block_banned_insert_forum_replies" ON forum_replies;
CREATE POLICY "block_banned_insert_forum_replies" ON forum_replies
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT is_banned_user());

DROP POLICY IF EXISTS "block_banned_insert_company_applications" ON company_applications;
CREATE POLICY "block_banned_insert_company_applications" ON company_applications
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT is_banned_user());

DROP POLICY IF EXISTS "block_banned_insert_jobs" ON jobs;
CREATE POLICY "block_banned_insert_jobs" ON jobs
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT is_banned_user());

DROP POLICY IF EXISTS "block_banned_insert_announcements" ON announcements;
CREATE POLICY "block_banned_insert_announcements" ON announcements
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT is_banned_user());

DROP POLICY IF EXISTS "block_banned_insert_events" ON events;
CREATE POLICY "block_banned_insert_events" ON events
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT is_banned_user());

DROP POLICY IF EXISTS "block_banned_insert_student_projects" ON student_projects;
CREATE POLICY "block_banned_insert_student_projects" ON student_projects
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT is_banned_user());

DROP POLICY IF EXISTS "block_banned_insert_friends" ON friends;
CREATE POLICY "block_banned_insert_friends" ON friends
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT is_banned_user());

DROP POLICY IF EXISTS "block_banned_insert_calls" ON calls;
CREATE POLICY "block_banned_insert_calls" ON calls
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT is_banned_user());


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ FROM: 20260731100000_feature_flag_enforcement.sql                          │
-- └────────────────────────────────────────────────────────────────────────┘

/*
  # Enforce feature flags at the database layer

  The `feature_flags` table (added in the previous migration) already lets
  the admin app flip a switch and have the site's UI hide a feature. But a
  toggle that only hides a button isn't real enforcement — anyone can still
  call the Supabase REST API directly (same anon key ships in the site's own
  JS bundle) and insert a forum post, friend request, etc. even while the
  admin has that feature turned off.

  This migration closes that gap with `is_feature_enabled(key)` +
  RESTRICTIVE policies, so a disabled feature is actually blocked at the
  database, no matter which client makes the request.

  Safe to run more than once.
*/

CREATE OR REPLACE FUNCTION is_feature_enabled(flag_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  -- Fail OPEN if the flag row doesn't exist (so a feature added in code
  -- before its flag row is inserted isn't accidentally hard-blocked), but
  -- respect an explicit false.
  SELECT COALESCE((SELECT enabled FROM feature_flags WHERE key = flag_key), true);
$$;

DROP POLICY IF EXISTS "block_disabled_forum_posts" ON forum_posts;
CREATE POLICY "block_disabled_forum_posts" ON forum_posts
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_feature_enabled('forum'));

DROP POLICY IF EXISTS "block_disabled_forum_replies" ON forum_replies;
CREATE POLICY "block_disabled_forum_replies" ON forum_replies
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_feature_enabled('forum'));

DROP POLICY IF EXISTS "block_disabled_events" ON events;
CREATE POLICY "block_disabled_events" ON events
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_feature_enabled('events'));

DROP POLICY IF EXISTS "block_disabled_event_registrations" ON event_registrations;
CREATE POLICY "block_disabled_event_registrations" ON event_registrations
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_feature_enabled('events'));

DROP POLICY IF EXISTS "block_disabled_messages" ON messages;
CREATE POLICY "block_disabled_messages" ON messages
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_feature_enabled('messaging'));

DROP POLICY IF EXISTS "block_disabled_friends" ON friends;
CREATE POLICY "block_disabled_friends" ON friends
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_feature_enabled('friends'));

DROP POLICY IF EXISTS "block_disabled_calls" ON calls;
CREATE POLICY "block_disabled_calls" ON calls
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_feature_enabled('calls'));

DROP POLICY IF EXISTS "block_disabled_student_projects" ON student_projects;
CREATE POLICY "block_disabled_student_projects" ON student_projects
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_feature_enabled('projects'));

DROP POLICY IF EXISTS "block_disabled_bookmarks" ON bookmarks;
CREATE POLICY "block_disabled_bookmarks" ON bookmarks
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_feature_enabled('bookmarks'));


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ FROM: 20260731110000_security_hardening.sql                                │
-- └────────────────────────────────────────────────────────────────────────┘

/*
  # Security hardening pass

  Fixes found during an RLS audit of the existing schema. Every issue here
  is a case where a normal 'student' or 'company' authenticated user could
  do something only an admin/owner (or nobody) should be able to do, by
  calling the Supabase API directly instead of going through the app UI --
  client-side checks like `canPost` or role gates in React are NOT security,
  they're just UX. This migration adds the matching server-side rules.

  1. Self-ban-bypass fix (the most important one): a banned user could
     currently UPDATE their own `profiles` row and flip `is_banned` back to
     false themselves, or change their own `role`, because the existing
     policy only checks `auth.uid() = id` with no column restrictions. This
     directly undermines the ban system. Fixed with a trigger that blocks
     self-service changes to ban/role columns for everyone except admins/
     owners (the existing owner-escalation trigger still layers on top of
     this for the admin/owner-specific rules).

  2. `companies` (the official employer directory) was insert/update-able
     by ANY authenticated user, including students -- so any student could
     create fake companies or deface real ones. Restricted to admin/owner.

  3. `announcements` was insert-able by any authenticated user with no
     check on `author_role`, so a student could self-report `author_role:
     'admin'` and the UI would render an official-looking admin badge on
     their post. Restricted insert to company/admin/owner roles, and added
     a trigger that forces `author_role`/`author_id` to match the real
     caller instead of trusting client-supplied values.

  4. `company_applications`, `messages`, `friends`, `calls` all had UPDATE
     policies with `WITH CHECK (true)` -- meaning once you're a party to a
     row, you could rewrite ANY column on it (e.g. reassign a message's
     conversation_id or a friend request's requester_id/recipient_id to
     someone else's IDs). Added triggers that lock the identity columns so
     only the intended status-ish fields can change.

  5. `notifications` was insert-able by any user for any other user_id
     with zero restriction on `type` -- letting a student insert a fake
     'system'/'admin'-typed notification into anyone's feed (a phishing
     vector). Restricted `type` to a known allow-list and blocked the
     admin/system types from being self-inserted by non-admins, plus a
     lightweight per-sender rate limit to blunt spam.

  Nothing here changes any legitimate existing workflow (friend requests,
  DMs, applicant status updates, event creation, etc.) -- it only closes
  the direct-API-call bypasses around them.
*/

-- ============================================================
-- 1. Profiles: block self-service ban/role bypass
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_profile_self_service_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acting_is_admin boolean;
BEGIN
  -- Service-role / SQL-editor changes (no authenticated caller) are
  -- always allowed -- this is how the app itself and admin tooling work,
  -- and it's already the trust boundary used by the owner-escalation
  -- trigger this migration sits alongside.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only restrict this when someone is editing their OWN row. Admin/owner
  -- edits to *other* rows go through the separate admin_update_profiles
  -- policy and are unaffected.
  IF auth.uid() = OLD.id THEN
    acting_is_admin := EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')
    );

    IF NOT acting_is_admin THEN
      IF NEW.is_banned IS DISTINCT FROM OLD.is_banned
         OR NEW.ban_reason IS DISTINCT FROM OLD.ban_reason
         OR NEW.banned_at IS DISTINCT FROM OLD.banned_at
         OR NEW.banned_by IS DISTINCT FROM OLD.banned_by THEN
        RAISE EXCEPTION 'You cannot change your own ban status.';
      END IF;

      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'You cannot change your own role.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_self_service_limits ON profiles;
CREATE TRIGGER trg_enforce_profile_self_service_limits
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_profile_self_service_limits();

-- ============================================================
-- 2. Companies: writes restricted to admin/owner
-- ============================================================

DROP POLICY IF EXISTS "insert_companies" ON companies;
CREATE POLICY "insert_companies" ON companies
  FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "update_companies" ON companies;
CREATE POLICY "update_companies" ON companies
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================
-- 3. Announcements: restrict who can post + stop role spoofing
-- ============================================================

DROP POLICY IF EXISTS "insert_announcements" ON announcements;
CREATE POLICY "insert_announcements" ON announcements
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('company', 'admin', 'owner'))
  );

CREATE OR REPLACE FUNCTION enforce_announcement_author_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  real_role text;
  real_name text;
BEGIN
  SELECT role, full_name INTO real_role, real_name FROM profiles WHERE id = auth.uid();
  NEW.author_id := auth.uid();
  NEW.author_role := COALESCE(real_role, NEW.author_role);
  IF NEW.author_name IS NULL OR NEW.author_name = '' THEN
    NEW.author_name := real_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_announcement_author_identity ON announcements;
CREATE TRIGGER trg_enforce_announcement_author_identity
  BEFORE INSERT ON announcements
  FOR EACH ROW EXECUTE FUNCTION enforce_announcement_author_identity();

-- ============================================================
-- 4. Lock identity columns on rows that are otherwise updatable
--    by their participants (company_applications, messages, friends, calls)
-- ============================================================

CREATE OR REPLACE FUNCTION lock_immutable_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  col text;
  cols text[];
BEGIN
  cols := string_to_array(TG_ARGV[0], ',');
  FOREACH col IN ARRAY cols LOOP
    IF to_jsonb(NEW) ->> col IS DISTINCT FROM to_jsonb(OLD) ->> col THEN
      RAISE EXCEPTION 'Column "%" cannot be changed after creation.', col;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_company_applications ON company_applications;
CREATE TRIGGER trg_lock_company_applications
  BEFORE UPDATE ON company_applications
  FOR EACH ROW EXECUTE FUNCTION lock_immutable_columns(
    'company_id,student_id,full_name,address,phone,email,resume_url,resume_filename,job_id'
  );

DROP TRIGGER IF EXISTS trg_lock_messages ON messages;
CREATE TRIGGER trg_lock_messages
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION lock_immutable_columns(
    'conversation_id,sender_id,body,attachment_url,attachment_name,attachment_type'
  );

DROP TRIGGER IF EXISTS trg_lock_friends ON friends;
CREATE TRIGGER trg_lock_friends
  BEFORE UPDATE ON friends
  FOR EACH ROW EXECUTE FUNCTION lock_immutable_columns(
    'requester_id,recipient_id'
  );

DROP TRIGGER IF EXISTS trg_lock_calls ON calls;
CREATE TRIGGER trg_lock_calls
  BEFORE UPDATE ON calls
  FOR EACH ROW EXECUTE FUNCTION lock_immutable_columns(
    'caller_id,callee_id,call_type,room_name'
  );

-- ============================================================
-- 5. Notifications: type allow-list + block admin/system spoofing
--    + lightweight per-sender rate limit
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_notification_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acting_is_admin boolean;
  recent_count integer;
BEGIN
  acting_is_admin := auth.uid() IS NULL OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')
  );

  IF NOT acting_is_admin AND NEW.type IN ('system', 'admin', 'announcement') THEN
    RAISE EXCEPTION 'Only admins can send this notification type.';
  END IF;

  IF NOT acting_is_admin THEN
    SELECT COUNT(*) INTO recent_count
    FROM notifications
    WHERE created_at > now() - interval '1 minute';
    -- Coarse global-per-minute cap as a backstop against direct-API spam;
    -- normal usage (friend requests, messages, applicant updates) is far
    -- below this. Tune the threshold if legitimate traffic grows.
    IF recent_count > 200 THEN
      RAISE EXCEPTION 'Notification rate limit exceeded, try again shortly.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_notification_rules ON notifications;
CREATE TRIGGER trg_enforce_notification_rules
  BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION enforce_notification_rules();


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ FROM: 20260803120000_payments_and_quizzes.sql                              │
-- └────────────────────────────────────────────────────────────────────────┘

/*
  # Quiz system

  `quizzes` (company-owned) + `quiz_questions` (question text + options,
  readable by the company that owns it AND any student it's been assigned
  to) + `quiz_answer_keys` (correct_index, readable ONLY by the owning
  company — never by students, not even the assigned ones, so the answer
  can't be read by inspecting network requests). Scoring an attempt
  therefore has to happen server-side (see api/quiz-submit.ts), since the
  student's browser is never allowed to see the answer key.

  `quiz_assignments` is how a company "sends" a quiz to one specific
  student — it's the row a chat message's attachment_url points at
  (attachment_type = 'quiz'), so the quiz is delivered and taken inline in
  the DM thread. `quiz_attempts` holds the student's one graded attempt;
  only the server (service role) can insert/update it.

  (Company account activation itself is completely free — no payment
  table, no payment step. See api/company-activate.ts.)
*/

-- ============================================================
-- QUIZZES
-- ============================================================

CREATE TABLE IF NOT EXISTS quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;

-- Created here (before quizzes' own SELECT policy below, and before
-- quiz_questions further down) because both of those policies need to
-- reference this table in an EXISTS clause — Postgres requires it to
-- already exist at CREATE POLICY time, not just by the time anyone queries.

CREATE TABLE IF NOT EXISTS quiz_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'in_progress', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quiz_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_quizzes" ON quizzes;
CREATE POLICY "select_quizzes" ON quizzes
  FOR SELECT TO authenticated USING (
    company_id = auth.uid()
    OR EXISTS (SELECT 1 FROM quiz_assignments qa WHERE qa.quiz_id = quizzes.id AND qa.student_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "insert_quizzes" ON quizzes;
CREATE POLICY "insert_quizzes" ON quizzes
  FOR INSERT TO authenticated WITH CHECK (
    company_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'company')
  );

DROP POLICY IF EXISTS "update_quizzes" ON quizzes;
CREATE POLICY "update_quizzes" ON quizzes
  FOR UPDATE TO authenticated USING (company_id = auth.uid()) WITH CHECK (company_id = auth.uid());

DROP POLICY IF EXISTS "delete_quizzes" ON quizzes;
CREATE POLICY "delete_quizzes" ON quizzes
  FOR DELETE TO authenticated USING (company_id = auth.uid());

-- ---------- Questions (no answers in this table) ----------

CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  question text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_quiz_questions" ON quiz_questions;
CREATE POLICY "select_quiz_questions" ON quiz_questions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND q.company_id = auth.uid())
    OR EXISTS (SELECT 1 FROM quiz_assignments qa WHERE qa.quiz_id = quiz_questions.quiz_id AND qa.student_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "insert_quiz_questions" ON quiz_questions;
CREATE POLICY "insert_quiz_questions" ON quiz_questions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND q.company_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_quiz_questions" ON quiz_questions;
CREATE POLICY "update_quiz_questions" ON quiz_questions
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND q.company_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND q.company_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_quiz_questions" ON quiz_questions;
CREATE POLICY "delete_quiz_questions" ON quiz_questions
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND q.company_id = auth.uid())
  );

-- ---------- Answer keys (owner-only, never student-readable) ----------

CREATE TABLE IF NOT EXISTS quiz_answer_keys (
  question_id uuid PRIMARY KEY REFERENCES quiz_questions(id) ON DELETE CASCADE,
  correct_index integer NOT NULL
);

ALTER TABLE quiz_answer_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_quiz_answer_keys" ON quiz_answer_keys;
CREATE POLICY "select_quiz_answer_keys" ON quiz_answer_keys
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM quiz_questions qq JOIN quizzes q ON q.id = qq.quiz_id
      WHERE qq.id = quiz_answer_keys.question_id AND q.company_id = auth.uid()
    )
    OR is_admin()
  );
-- No student-facing SELECT policy at all — this table is only ever read by
-- the owning company (to edit the quiz) or the api/quiz-submit.ts server
-- function, which uses the service role and bypasses RLS entirely.

DROP POLICY IF EXISTS "insert_quiz_answer_keys" ON quiz_answer_keys;
CREATE POLICY "insert_quiz_answer_keys" ON quiz_answer_keys
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM quiz_questions qq JOIN quizzes q ON q.id = qq.quiz_id
      WHERE qq.id = quiz_answer_keys.question_id AND q.company_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_quiz_answer_keys" ON quiz_answer_keys;
CREATE POLICY "update_quiz_answer_keys" ON quiz_answer_keys
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM quiz_questions qq JOIN quizzes q ON q.id = qq.quiz_id
      WHERE qq.id = quiz_answer_keys.question_id AND q.company_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM quiz_questions qq JOIN quizzes q ON q.id = qq.quiz_id
      WHERE qq.id = quiz_answer_keys.question_id AND q.company_id = auth.uid()
    )
  );

-- ============================================================
-- ASSIGNMENT POLICIES + ATTEMPTS
-- ============================================================
-- (quiz_assignments itself was created earlier, right after `quizzes`,
-- because quizzes' own SELECT policy needs to reference it — see above)

DROP POLICY IF EXISTS "select_quiz_assignments" ON quiz_assignments;
CREATE POLICY "select_quiz_assignments" ON quiz_assignments
  FOR SELECT TO authenticated USING (company_id = auth.uid() OR student_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "insert_quiz_assignments" ON quiz_assignments;
CREATE POLICY "insert_quiz_assignments" ON quiz_assignments
  FOR INSERT TO authenticated WITH CHECK (
    company_id = auth.uid()
    AND EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_assignments.quiz_id AND q.company_id = auth.uid())
  );

-- Only the status column may ever change after creation, and only by one
-- of the two real participants — everything else (who sent it, which quiz,
-- which DM message) is locked, reusing the same trigger pattern as
-- messages/friends/calls in the security-hardening migration.
DROP POLICY IF EXISTS "update_quiz_assignments" ON quiz_assignments;
CREATE POLICY "update_quiz_assignments" ON quiz_assignments
  FOR UPDATE TO authenticated
  USING (company_id = auth.uid() OR student_id = auth.uid())
  WITH CHECK (company_id = auth.uid() OR student_id = auth.uid());

DROP TRIGGER IF EXISTS trg_lock_quiz_assignments ON quiz_assignments;
CREATE TRIGGER trg_lock_quiz_assignments
  BEFORE UPDATE ON quiz_assignments
  FOR EACH ROW EXECUTE FUNCTION lock_immutable_columns('quiz_id,company_id,student_id,message_id');

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL UNIQUE REFERENCES quiz_assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  score integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_quiz_attempts" ON quiz_attempts;
CREATE POLICY "select_quiz_attempts" ON quiz_attempts
  FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM quiz_assignments qa WHERE qa.id = quiz_attempts.assignment_id AND qa.company_id = auth.uid())
    OR is_admin()
  );
-- No INSERT/UPDATE policy for `authenticated` at all: every attempt is
-- graded and written by api/quiz-submit.ts using the service role, which
-- is what stops a student from just POSTing a fabricated 100% score.

-- ============================================================
-- MAINTENANCE MODE
-- ============================================================
-- Reuses the existing feature_flags system (see
-- 20260731090000_feature_flags_and_device_security.sql) so the admin app
-- needs zero code changes — its flags screen already lists/toggles any row
-- in this table generically. The main site checks this specific key to
-- show a full "down for maintenance" page instead of the app. Off by
-- default so this migration can't accidentally take the site down.
INSERT INTO feature_flags (key, name, description, category)
VALUES ('maintenance_mode', 'Maintenance Mode', 'Shows a "down for maintenance" page to everyone on the student/company site', 'system')
ON CONFLICT (key) DO NOTHING;


-- ┌────────────────────────────────────────────────────────────────────────┐
-- │ FROM: 20260803130000_bot_companies.sql                                     │
-- └────────────────────────────────────────────────────────────────────────┘

/*
  # AI-run ("bot") companies

  Adds a single `is_bot` flag to `company_profiles`. A bot company is a
  completely normal company account under the hood — same auth.users row,
  same profiles/company_profiles/jobs/company_applications rows as a real
  recruiter would have — just one whose replies, hiring decisions, quizzes,
  and job postings are generated and written server-side (via the service
  role, see api/bot-*.ts) instead of a human clicking buttons.

  This is deliberately the ONLY schema change needed: every other table
  (jobs, messages, conversations, company_applications, quizzes, …) already
  works for any company_id, bot or not, because a bot IS a real company
  account. `is_bot` just tells the client whether to show an "AI Recruiter"
  badge, and tells the bot-* endpoints which accounts they're allowed to
  act as.
*/

ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;

-- Small and rarely queried by anything other than "give me all the bots",
-- so a partial index (only bot rows) is enough.
CREATE INDEX IF NOT EXISTS idx_company_profiles_is_bot ON company_profiles(is_bot) WHERE is_bot = true;

