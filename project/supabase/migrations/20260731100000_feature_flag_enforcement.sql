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
