/*
# Smart Placement Cell Portal — Core Schema

## Overview
Creates the full data model for an AI resume & eligibility platform:
students upload resumes, the system scores them against company requirements,
and admins view aggregate analytics.

## New Tables
1. `profiles` — extends auth.users with student/admin role, academic info, skills, resume text, profile completion %.
2. `companies` — recruiter catalog: role, package, required skills, min CGPA, eligible branches, openings.
3. `matches` — per-student × per-company match score, missing skills, eligibility flag, status.
4. `applications` — tracks which companies a student has applied to and the application status.

## Security (RLS)
- `profiles`: a user reads/updates only their own row. Admins (role = 'admin') can read all profiles.
- `companies`: shared reference data — all authenticated users can read; only admins can insert/update.
- `matches`: a student reads only their own matches; admins read all.
- `applications`: a student reads/inserts only their own; admins read all.
- Owner columns default to `auth.uid()` so inserts that omit the owner still pass the WITH CHECK policy.

## Notes
- `role` defaults to 'student'. Promote a user to admin by updating their row to role = 'admin'.
- `skills` and `missing_skills` are text arrays for simple keyword matching.
- `companies` is seeded with 7 sample recruiters so the dashboard is populated on first load.
*/

-- ---------- profiles ----------
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  cgpa numeric(3,2) NOT NULL DEFAULT 0.0,
  branch text NOT NULL DEFAULT '',
  skills text[] NOT NULL DEFAULT '{}',
  resume_text text NOT NULL DEFAULT '',
  resume_filename text NOT NULL DEFAULT '',
  profile_completion integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_or_admin_profiles" ON profiles;
CREATE POLICY "select_own_or_admin_profiles"
  ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

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
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "admin_update_companies" ON companies;
CREATE POLICY "admin_update_companies"
  ON companies FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

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
  USING (auth.uid() = student_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

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
  USING (auth.uid() = student_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "insert_own_applications" ON applications;
CREATE POLICY "insert_own_applications"
  ON applications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "delete_own_applications" ON applications;
CREATE POLICY "delete_own_applications"
  ON applications FOR DELETE TO authenticated
  USING (auth.uid() = student_id);

-- ---------- seed companies ----------
INSERT INTO companies (name, role, package_lpa, required_skills, min_cgpa, required_branches, openings, logo_color, tier)
VALUES
  ('Nimbus Labs', 'Frontend Engineer', 18.00, ARRAY['React','JavaScript','CSS','HTML','TypeScript'], 7.0, ARRAY['CSE','IT','ECE'], 6, '#4f46e5', 'Tier 1'),
  ('Quanta Cloud', 'Cloud Backend Engineer', 22.00, ARRAY['Python','AWS','Docker','PostgreSQL','REST'], 7.5, ARRAY['CSE','IT'], 9, '#06b6d4', 'Tier 1'),
  ('Vertex AI', 'ML Engineer', 26.00, ARRAY['Python','TensorFlow','Machine Learning','Statistics','NLP'], 8.0, ARRAY['CSE','IT','ECE','AI'], 4, '#10b981', 'Tier 1'),
  ('Lumen Pay', 'Payments SDE', 16.00, ARRAY['Java','Spring','SQL','Microservices','Kafka'], 7.0, ARRAY['CSE','IT'], 3, '#f59e0b', 'Tier 2'),
  ('Drift Studio', 'Product Designer', 14.00, ARRAY['Figma','UI/UX','Prototyping','Research','Design Systems'], 6.5, ARRAY['CSE','IT','Design'], 2, '#ec4899', 'Tier 2'),
  ('Forge Systems', 'DevOps Engineer', 19.00, ARRAY['Docker','Kubernetes','CI/CD','Linux','Terraform'], 7.0, ARRAY['CSE','IT','ECE'], 5, '#8b5cf6', 'Tier 2'),
  ('Cobalt HR', 'Data Analyst', 12.00, ARRAY['SQL','Python','Tableau','Excel','Statistics'], 6.5, ARRAY['CSE','IT','ECE','EEE'], 1, '#ef4444', 'Tier 3')
ON CONFLICT DO NOTHING;

-- ---------- indexes ----------
CREATE INDEX IF NOT EXISTS idx_matches_student ON matches(student_id);
CREATE INDEX IF NOT EXISTS idx_matches_company ON matches(company_id);
CREATE INDEX IF NOT EXISTS idx_applications_student ON applications(student_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
