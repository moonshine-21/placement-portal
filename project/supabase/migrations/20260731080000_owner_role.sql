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
