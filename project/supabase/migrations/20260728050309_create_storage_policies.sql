-- Storage policies for avatars, banners (public), resumes, attachments (private)

-- avatars: anyone can read, authenticated users can upload to their own folder
DROP POLICY IF EXISTS "avatars_read" ON storage.objects;
CREATE POLICY "avatars_read" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- banners: anyone can read, authenticated users can upload to their own folder
DROP POLICY IF EXISTS "banners_read" ON storage.objects;
CREATE POLICY "banners_read" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'banners');

DROP POLICY IF EXISTS "banners_insert_own" ON storage.objects;
CREATE POLICY "banners_insert_own" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "banners_update_own" ON storage.objects;
CREATE POLICY "banners_update_own" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);

-- resumes: only owner can read/write
DROP POLICY IF EXISTS "resumes_insert_own" ON storage.objects;
CREATE POLICY "resumes_insert_own" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "resumes_read_own" ON storage.objects;
CREATE POLICY "resumes_read_own" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "resumes_update_own" ON storage.objects;
CREATE POLICY "resumes_update_own" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- attachments: only owner can read/write
DROP POLICY IF EXISTS "attachments_insert_own" ON storage.objects;
CREATE POLICY "attachments_insert_own" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "attachments_read_own" ON storage.objects;
CREATE POLICY "attachments_read_own" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "attachments_update_own" ON storage.objects;
CREATE POLICY "attachments_update_own" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
