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
