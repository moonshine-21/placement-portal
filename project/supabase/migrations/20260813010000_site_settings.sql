-- Adds site-wide branding (name + logo), editable only by admin/owner
-- accounts from the admin app's new "Site Settings" page, and read by
-- everyone (including logged-out visitors on the landing page) via
-- src/lib/siteSettings.tsx on the main site.
--
-- This is a SINGLETON table — exactly one row, always id = 1 — rather
-- than one row per something, since there's only ever one site to brand.

CREATE TABLE IF NOT EXISTS site_settings (
  id integer PRIMARY KEY DEFAULT 1,
  site_name text NOT NULL DEFAULT 'SmartCell',
  logo_url text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT site_settings_singleton CHECK (id = 1)
);

-- Seed the one-and-only row if it doesn't already exist, so the app
-- always has something to read from the very first deploy onward.
INSERT INTO site_settings (id, site_name, logo_url)
VALUES (1, 'SmartCell', NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read it — including anonymous, logged-out visitors, since
-- the marketing landing page shows the site name/logo before anyone logs in.
DROP POLICY IF EXISTS "select_site_settings" ON site_settings;
CREATE POLICY "select_site_settings" ON site_settings FOR SELECT TO anon, authenticated USING (true);

-- Only admin/owner accounts can change it.
DROP POLICY IF EXISTS "update_site_settings" ON site_settings;
CREATE POLICY "update_site_settings" ON site_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')));

-- A dedicated bucket for the site logo (separate from the per-user
-- avatars/banners buckets, since this isn't owned by any one user).
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "branding_public_read" ON storage.objects;
CREATE POLICY "branding_public_read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "branding_admin_write" ON storage.objects;
CREATE POLICY "branding_admin_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')));

DROP POLICY IF EXISTS "branding_admin_update" ON storage.objects;
CREATE POLICY "branding_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')));

DROP POLICY IF EXISTS "branding_admin_delete" ON storage.objects;
CREATE POLICY "branding_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')));
