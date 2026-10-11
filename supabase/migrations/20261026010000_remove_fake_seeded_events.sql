-- ============================================================================
-- Migration: 20261026010000
-- Remove the 8 placeholder events seeded by 20261022000000 and ensure the
-- Super Admin can view every real event across all universities via RLS.
-- ============================================================================

-- 1. Remove ONLY the 8 fake seeded events from 20261022000000
DELETE FROM public.events
WHERE title IN (
    'UI Tech Summit 2026: AI & The Future of African Innovation',
    'UI Inter-Faculty Debate & Research Symposium',
    'UNILAG FinTech & Builders Hackathon 2026',
    'UNILAG Career Expo: Future of Work in Africa',
    'FUNAAB AgriTech & Bio-Innovation Showcase',
    'NOUN National Virtual Learning & Research Symposium',
    'All-Nigerian Universities Inter-Campus Coding Championship',
    'Nigerian Student Leadership & Civic Impact Conference'
);

-- 2. Ensure Super Admin helper function checks both profiles and JWT email
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT (
        LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'inememmanuel@gmail.com'
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND (
                  role = 'admin'
                  OR LOWER(COALESCE(email, '')) = 'inememmanuel@gmail.com'
                  OR admin_role = 'super_admin'
              )
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, anon, service_role;

-- 3. Ensure events SELECT policy grants Super Admin unconditional visibility
--    across every university and every status (approved, pending, etc.)
DROP POLICY IF EXISTS "Events viewable by campus or global" ON public.events;
CREATE POLICY "Events viewable by campus or global" ON public.events
FOR SELECT TO authenticated USING (
    public.is_super_admin()
    OR creator_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND (
              profiles.role = 'admin'
              OR (profiles.role = 'staff' AND profiles.campus_code = events.campus_code)
          )
    )
    OR visibility_scope = 'global'
    OR campus_code IS NULL
    OR campus_code = 'GLOBAL'
    OR campus_code = (SELECT campus_code FROM public.profiles WHERE id = auth.uid())
);
