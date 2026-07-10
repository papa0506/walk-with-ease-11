
-- Prevent listing the walk-audio public bucket while preserving direct public object URL access.
DROP POLICY IF EXISTS "walk-audio public read" ON storage.objects;

-- Explicit deny-all RLS policies for server-only tables (accessed via service_role which bypasses RLS).
-- Makes the deny-all intent explicit for the Data API (anon/authenticated).

-- app_users
CREATE POLICY "app_users deny all client access"
ON public.app_users FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- walk_locations
CREATE POLICY "walk_locations deny all client access"
ON public.walk_locations FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);
