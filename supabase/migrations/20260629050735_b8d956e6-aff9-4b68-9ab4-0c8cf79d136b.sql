
-- Restrict writes on walk-audio storage bucket; only service_role (server) may upload/modify/delete.
-- Public read is allowed since bucket is public and contains non-sensitive TTS audio.

CREATE POLICY "walk-audio public read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'walk-audio');

CREATE POLICY "walk-audio no client insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'walk-audio' AND false);

CREATE POLICY "walk-audio no client update"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'walk-audio' AND false)
WITH CHECK (bucket_id = 'walk-audio' AND false);

CREATE POLICY "walk-audio no client delete"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'walk-audio' AND false);
