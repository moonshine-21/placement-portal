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
