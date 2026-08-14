/*
  # Site settings (branding) — table + storage bucket

  This migration was missing entirely, even though both the main site's
  `src/lib/siteSettings.tsx` and the admin app's
  `src/views/SiteSettingsView.tsx` already depend on it. That's the actual
  cause of the "some error" you saw in the admin app: there was no
  `branding` storage bucket to upload a logo into, and no guarantee the
  `site_settings` table (or its RLS policies) existed with the right
  shape/permissions on every environment.

  1. `site_settings` — a single-row table (id = 1) holding the site's
     public name and logo URL. Anyone (including logged-out visitors) can
     read it, since it's shown on the public landing page; only an
     admin/owner can update it.
  2. `branding` storage bucket (public) — where the uploaded logo image
     files live. Public read (so the logo displays for everyone), but
     only admin/owner can upload/replace/delete files in it.

  Safe to run more than once: `CREATE TABLE IF NOT EXISTS`, `ON CONFLICT
  DO NOTHING`, and `DROP POLICY IF EXISTS` before every `CREATE POLICY`,
  matching the convention already used elsewhere in this project (see
  20260731060000_admin_panel.sql).
*/

-- 1. Table ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS site_settings (
  id integer PRIMARY KEY DEFAULT 1,
  site_name text NOT NULL DEFAULT 'SmartCell',
  logo_url text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid,
  CONSTRAINT site_settings_singleton CHECK (id = 1)
);

-- Seed the one row this table will ever have, if it isn't there yet.
INSERT INTO site_settings (id, site_name, logo_url)
VALUES (1, 'SmartCell', NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon/logged-out visitors on the public landing page)
-- can read the site's name/logo.
DROP POLICY IF EXISTS "site_settings_public_read" ON site_settings;
CREATE POLICY "site_settings_public_read" ON site_settings
  FOR SELECT TO anon, authenticated USING (true);

-- Only an admin/owner can change it. `is_admin()` already exists from
-- 20260731060000_admin_panel.sql and treats both 'admin' and 'owner'
-- roles as authorized.
DROP POLICY IF EXISTS "site_settings_admin_update" ON site_settings;
CREATE POLICY "site_settings_admin_update" ON site_settings
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 2. Storage bucket --------------------------------------------------------

INSERT INTO storage.buckets (id, name, public) VALUES
  ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "branding_public_read" ON storage.objects;
CREATE POLICY "branding_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "branding_admin_write" ON storage.objects;
CREATE POLICY "branding_admin_write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'branding' AND is_admin());

DROP POLICY IF EXISTS "branding_admin_update" ON storage.objects;
CREATE POLICY "branding_admin_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'branding' AND is_admin());

DROP POLICY IF EXISTS "branding_admin_delete" ON storage.objects;
CREATE POLICY "branding_admin_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'branding' AND is_admin());
