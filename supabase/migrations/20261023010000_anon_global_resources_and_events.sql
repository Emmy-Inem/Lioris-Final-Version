-- ============================================================================
-- Migration: 20261023010000
-- Allow anon to read approved global resources and global events
-- ============================================================================

GRANT SELECT ON public.resources TO anon;
GRANT SELECT ON public.events TO anon;

DROP POLICY IF EXISTS "Approved global resources viewable by anon" ON public.resources;
CREATE POLICY "Approved global resources viewable by anon" ON public.resources
FOR SELECT TO anon USING (is_approved = TRUE AND (campus_code = 'GLOBAL' OR campus_code IS NULL));

DROP POLICY IF EXISTS "Published global events viewable by anon" ON public.events;
CREATE POLICY "Published global events viewable by anon" ON public.events
FOR SELECT TO anon USING (visibility_scope = 'global' OR campus_code = 'GLOBAL' OR campus_code IS NULL);
