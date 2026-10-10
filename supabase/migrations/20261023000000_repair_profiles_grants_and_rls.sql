-- ============================================================================
-- Migration: 20261023000000
-- Repair profiles table grants and RLS permissions
--
-- Root Cause:
-- A previous security migration revoked table-level SELECT on public.profiles
-- from role 'authenticated', which broke:
-- 1. Any direct profile query selecting columns not explicitly granted
--    (e.g., is_campus_ambassador, onboarding_step, deactivated_at).
-- 2. Any RLS policy subquery across other tables (resources, events, announcements,
--    posts, jobs, marketplace) evaluating `(SELECT campus_code FROM profiles ...)`
--    or `EXISTS (SELECT 1 FROM profiles ...)`, crashing with error:
--    "42501: permission denied for table profiles".
--
-- This migration restores proper SELECT grants on public.profiles to
-- 'authenticated' so all RLS policies, onboarding, profile lookups, and
-- cross-campus super admin accesses work flawlessly.
-- ============================================================================

-- 1. Restore table-level SELECT on profiles to authenticated
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.event_payment_clicks TO authenticated;

-- 2. Grant table-level SELECT on profiles to anon (RLS policy filters rows)
GRANT SELECT ON public.profiles TO anon;

-- 3. Super admin helper function (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND (
              role = 'admin'
              OR email = 'inememmanuel@gmail.com'
              OR admin_role = 'super_admin'
          )
    )
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, anon, service_role;

-- 4. Update profiles SELECT RLS policy to ensure full visibility for self, same campus, global, staff, and super admin
DROP POLICY IF EXISTS "Profiles viewable by same campus or global or self or admin" ON public.profiles;
CREATE POLICY "Profiles viewable by same campus or global or self or admin" ON public.profiles
FOR SELECT TO authenticated USING (
    auth.uid() = id
    OR public.is_super_admin()
    OR public.auth_profile_role() IN ('admin', 'staff')
    OR campus_code = 'GLOBAL'
    OR campus_code = public.auth_profile_campus()
);

-- 5. Anon profile view policy for public profiles
DROP POLICY IF EXISTS "Public profiles viewable by anon" ON public.profiles;
CREATE POLICY "Public profiles viewable by anon" ON public.profiles
FOR SELECT TO anon USING (
    campus_code = 'GLOBAL' OR directory_discoverable = TRUE
);

-- 6. Ensure superadmin user (inememmanuel@gmail.com) has all privileges in profiles
UPDATE public.profiles
SET role = 'admin',
    admin_role = 'super_admin',
    verification_status = 'verified',
    onboarding_complete = TRUE
WHERE email = 'inememmanuel@gmail.com';

-- 7. Allow anon to read approved global resources and global events
DROP POLICY IF EXISTS "Approved global resources viewable by anon" ON public.resources;
CREATE POLICY "Approved global resources viewable by anon" ON public.resources
FOR SELECT TO anon USING (is_approved = TRUE AND (campus_code = 'GLOBAL' OR campus_code IS NULL));

DROP POLICY IF EXISTS "Published global events viewable by anon" ON public.events;
CREATE POLICY "Published global events viewable by anon" ON public.events
FOR SELECT TO anon USING (visibility_scope = 'global' OR campus_code = 'GLOBAL' OR campus_code IS NULL);

