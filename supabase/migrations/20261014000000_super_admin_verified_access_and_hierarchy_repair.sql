-- ============================================================================
-- LIORIS - SUPER ADMIN FULL VERIFIED ACCESS & HIERARCHY REPAIR
-- ============================================================================
-- 1. Adds `admin_role` column to `public.profiles` if missing.
-- 2. Restores Super Admin full verified status for inememmanuel@gmail.com
--    with role = 'admin', admin_role = 'super_admin', verification_status = 'verified'.
-- 3. Updates `public.is_profile_verified(p_user_id)` helper function so Super Admin,
--    admins, and inememmanuel@gmail.com are NEVER blocked by verification gates.
-- 4. Updates `prevent_profile_role_escalation()` trigger so Super Admin authority is
--    unrestricted, while maintaining security against unauthorized self-escalation.
-- 5. Updates `admin_get_user_profiles()` RPC to safely return `admin_role` and `is_campus_ambassador`.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. PROFILES: ADD admin_role COLUMN IF NOT EXISTS
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_role TEXT CHECK (admin_role IN ('super_admin', 'campus_admin'));

GRANT SELECT (admin_role) ON public.profiles TO authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- 2. RESTORE SUPER ADMIN IDENTITY FOR inememmanuel@gmail.com & GLOBAL ADMINS
-- ----------------------------------------------------------------------------
UPDATE public.profiles
SET
  role = 'admin',
  admin_role = 'super_admin',
  verification_status = 'verified',
  campus_code = 'GLOBAL',
  is_suspended = FALSE
WHERE LOWER(COALESCE(email, '')) = 'inememmanuel@gmail.com'
   OR id IN (SELECT id FROM auth.users WHERE LOWER(COALESCE(email, '')) = 'inememmanuel@gmail.com');

UPDATE public.profiles
SET admin_role = 'super_admin'
WHERE role = 'admin' AND (campus_code = 'GLOBAL' OR LOWER(COALESCE(email, '')) = 'inememmanuel@gmail.com');

UPDATE public.profiles
SET admin_role = 'campus_admin'
WHERE role = 'admin' AND admin_role IS NULL;

-- ----------------------------------------------------------------------------
-- 3. AUTHORITATIVE VERIFICATION HELPER (SUPER ADMIN FULL ACCESS GUARANTEED)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_profile_verified(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND (
        p.role::text IN ('admin', 'staff')
        OR COALESCE(p.admin_role::text, '') = 'super_admin'
        OR LOWER(COALESCE(p.email, '')) = 'inememmanuel@gmail.com'
        OR p.id IN (SELECT u.id FROM auth.users u WHERE LOWER(COALESCE(u.email, '')) = 'inememmanuel@gmail.com')
        OR p.verification_status::text = 'verified'
        OR (p.email ~* '\.edu\.ng$' AND p.verification_status::text <> 'rejected')
        OR COALESCE(p.is_bot, FALSE) = TRUE
      )
      AND COALESCE(p.is_suspended, FALSE) = FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.is_profile_verified(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_profile_verified(UUID) TO authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- 4. HARDEN prevent_profile_role_escalation TRIGGER FUNCTION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_role VARCHAR(50);
    v_caller_admin_role VARCHAR(50);
    v_caller_campus VARCHAR(50);
BEGIN
    SELECT role::text, admin_role, campus_code 
    INTO v_caller_role, v_caller_admin_role, v_caller_campus 
    FROM public.profiles WHERE id = auth.uid();

    -- Allow Super Admin full authority over all profiles
    IF v_caller_role = 'admin' AND (v_caller_admin_role = 'super_admin' OR v_caller_admin_role IS NULL) THEN
        RETURN NEW;
    END IF;

    -- Allow Campus Staff to update is_suspended and verification_status for users in their same campus or when staff has GLOBAL scope
    IF v_caller_role = 'staff' AND (v_caller_campus = OLD.campus_code OR v_caller_campus = 'GLOBAL' OR OLD.campus_code = 'GLOBAL') THEN
        NEW.role := OLD.role;
        NEW.admin_role := OLD.admin_role;
        NEW.campus_code := OLD.campus_code;
        NEW.is_campus_ambassador := OLD.is_campus_ambassador;
        RETURN NEW;
    END IF;

    -- For regular users / self updates: prevent mutating role, admin_role, verification, suspension, trust_score, campus_code, is_campus_ambassador
    IF (NEW.role IS DISTINCT FROM OLD.role)
       OR (NEW.admin_role IS DISTINCT FROM OLD.admin_role)
       OR (NEW.verification_status IS DISTINCT FROM OLD.verification_status)
       OR (NEW.is_suspended IS DISTINCT FROM OLD.is_suspended)
       OR (NEW.trust_score IS DISTINCT FROM OLD.trust_score)
       OR (NEW.campus_code IS DISTINCT FROM OLD.campus_code)
       OR (NEW.is_campus_ambassador IS DISTINCT FROM OLD.is_campus_ambassador) THEN
        NEW.role := OLD.role;
        NEW.admin_role := OLD.admin_role;
        NEW.verification_status := OLD.verification_status;
        NEW.is_suspended := OLD.is_suspended;
        NEW.trust_score := OLD.trust_score;
        NEW.campus_code := OLD.campus_code;
        NEW.is_campus_ambassador := OLD.is_campus_ambassador;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 5. UPDATE admin_get_user_profiles RPC
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_get_user_profiles(TEXT, INT);

CREATE OR REPLACE FUNCTION public.admin_get_user_profiles(
    p_campus_code TEXT DEFAULT NULL,
    p_limit INT DEFAULT 1000
)
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    username TEXT,
    email TEXT,
    role TEXT,
    campus_code TEXT,
    department TEXT,
    student_id_number TEXT,
    verification_status TEXT,
    trust_score NUMERIC,
    is_suspended BOOLEAN,
    last_active_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    is_bot BOOLEAN,
    avatar_url TEXT,
    created_at TIMESTAMPTZ,
    admin_role TEXT,
    is_campus_ambassador BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_admin_role TEXT;
    v_caller_campus TEXT;
    v_effective_campus TEXT;
BEGIN
    SELECT LOWER(COALESCE(p.role::text, '')), LOWER(COALESCE(p.admin_role::text, '')), p.campus_code
    INTO v_caller_role, v_caller_admin_role, v_caller_campus
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF v_caller_role NOT IN ('admin', 'staff') AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    -- Campus Admin is strictly locked to their own campus:
    IF v_caller_role = 'admin' AND v_caller_admin_role = 'campus_admin' AND v_caller_campus IS NOT NULL AND v_caller_campus <> 'GLOBAL' THEN
        v_effective_campus := v_caller_campus;
    ELSIF p_campus_code IS NOT NULL AND p_campus_code <> 'ALL' THEN
        v_effective_campus := p_campus_code;
    ELSE
        v_effective_campus := NULL;
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.full_name::TEXT,
        p.username::TEXT,
        COALESCE(u.email::TEXT, p.email::TEXT) AS email,
        p.role::TEXT,
        p.campus_code::TEXT,
        p.department::TEXT,
        p.student_id_number::TEXT,
        p.verification_status::TEXT,
        p.trust_score,
        COALESCE(p.is_suspended, FALSE) AS is_suspended,
        p.last_active_at,
        p.last_login_at,
        COALESCE(p.is_bot, FALSE) AS is_bot,
        p.avatar_url::TEXT,
        p.created_at,
        COALESCE(p.admin_role::TEXT, CASE WHEN p.role::TEXT = 'admin' THEN 'super_admin' ELSE NULL END) AS admin_role,
        COALESCE(p.is_campus_ambassador, FALSE) AS is_campus_ambassador
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE (v_effective_campus IS NULL OR p.campus_code = v_effective_campus)
    ORDER BY p.created_at DESC
    LIMIT LEAST(COALESCE(p_limit, 1000), 5000);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_profiles(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_profiles(TEXT, INT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
