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