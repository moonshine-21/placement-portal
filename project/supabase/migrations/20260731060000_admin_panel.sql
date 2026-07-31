/*
  # Admin panel support

  1. Adds account-status columns to `profiles` (ban/suspend)
  2. Adds `admin_audit_log` table that records every admin action
  3. Adds an `is_admin()` helper (SECURITY DEFINER, so it can read `profiles`
     without recursing into the RLS policy that calls it)
  4. Adds admin-override RLS policies so an admin can manage rows that belong
     to other users (edit any profile, moderate jobs/companies/content),
     while every existing policy for normal users is left untouched.
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
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
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

CREATE POLICY "admin_select_audit_log" ON admin_audit_log
  FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "admin_insert_audit_log" ON admin_audit_log
  FOR INSERT TO authenticated WITH CHECK (is_admin() AND actor_id = auth.uid());

-- 4. Admin override policies ---------------------------------------------------

-- profiles: admin can update (edit/ban) and delete any profile
CREATE POLICY "admin_update_profiles" ON profiles
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "admin_delete_profiles" ON profiles
  FOR DELETE TO authenticated USING (is_admin());

-- companies
CREATE POLICY "admin_update_companies" ON companies
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "admin_delete_companies" ON companies
  FOR DELETE TO authenticated USING (is_admin());

-- company_profiles
CREATE POLICY "admin_update_company_profiles" ON company_profiles
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- jobs
CREATE POLICY "admin_update_jobs" ON jobs
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "admin_delete_jobs" ON jobs
  FOR DELETE TO authenticated USING (is_admin());

-- announcements
CREATE POLICY "admin_delete_announcements" ON announcements
  FOR DELETE TO authenticated USING (is_admin());

-- events
CREATE POLICY "admin_update_events" ON events
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "admin_delete_events" ON events
  FOR DELETE TO authenticated USING (is_admin());

-- forum posts / replies
CREATE POLICY "admin_delete_forum_posts" ON forum_posts
  FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "admin_delete_forum_replies" ON forum_replies
  FOR DELETE TO authenticated USING (is_admin());

-- student projects
CREATE POLICY "admin_delete_projects" ON student_projects
  FOR DELETE TO authenticated USING (is_admin());

-- company applications (admin can view/moderate everything)
CREATE POLICY "admin_select_company_applications" ON company_applications
  FOR SELECT TO authenticated USING (is_admin());

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON profiles (is_banned) WHERE is_banned = true;
