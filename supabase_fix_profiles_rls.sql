-- ============================================================================
-- LIORIS - FIX INFINITE RECURSION IN profiles RLS POLICIES
-- ============================================================================
-- Symptom:
--   42P17: infinite recursion detected in policy for relation "profiles"
--
-- Cause:
--   All three policies on `profiles` sub-queried `profiles` itself, e.g.
--     campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid())
--     EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
--   Evaluating the policy required reading profiles, which re-triggered the
--   policy, forever. Postgres aborts the statement, so EVERY read of profiles
--   failed - which is why the directory, connection suggestions, author names
--   and role resolution were all empty.
--
-- Fix:
--   Read the caller's own role/campus through SECURITY DEFINER functions.
--   Those run as the function owner and bypass RLS, so there is no recursion.
--
-- Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RLS-bypassing accessors for the caller's own profile.
--    STABLE so the planner evaluates them once per statement.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_profile_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT role::text FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.auth_profile_campus()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT campus_code FROM public.profiles WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.auth_profile_role()   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_profile_campus() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_profile_role()   TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.auth_profile_campus() TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 2. Rebuild the three recursive policies.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles viewable by same campus or global or self or admin" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins have full profile access" ON profiles;

CREATE POLICY "Profiles viewable by same campus or global or self or admin"
ON profiles FOR SELECT TO authenticated
USING (
    auth.uid() = id
    OR campus_code = 'GLOBAL'
    OR campus_code = public.auth_profile_campus()
    OR public.auth_profile_role() IN ('admin', 'staff')
);

-- The WITH CHECK no longer re-reads profiles. Escalation is still blocked -
-- authoritatively - by the SECURITY DEFINER trigger
-- prevent_profile_role_escalation(), which runs BEFORE UPDATE and reverts any
-- change a non-admin/non-staff caller makes to role, campus_code,
-- is_suspended, trust_score or verification_status.
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins have full profile access"
ON profiles FOR ALL TO authenticated
USING (public.auth_profile_role() = 'admin')
WITH CHECK (public.auth_profile_role() = 'admin');

NOTIFY pgrst, 'reload schema';
