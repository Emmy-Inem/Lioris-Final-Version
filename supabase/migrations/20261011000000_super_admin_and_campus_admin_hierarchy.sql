-- ============================================================================
-- Super Admin & Campus Admin Hierarchy Migration
-- 
-- Enforces a two-tier administrative structure:
--   1. Super Admin: full global platform authority (campus_code = 'GLOBAL' or designated).
--      Only a Super Admin can promote/assign anyone to an admin role (Super Admin or Campus Admin).
--      Only a Super Admin can configure platform infrastructure (platform_settings, feature flags).
--   2. Campus Admin: campus-centric authority (scoped to their assigned university).
--      Strictly forbidden from making anyone an admin, modifying other admins,
--      or modifying users from outside their assigned campus.
-- ============================================================================

-- 1. Add admin_role column to public.profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS admin_role text CHECK (admin_role IN ('super_admin', 'campus_admin'));

GRANT SELECT (admin_role) ON public.profiles TO authenticated;

-- 2. Backfill existing admins
UPDATE public.profiles
SET admin_role = 'super_admin'
WHERE role = 'admin' AND (campus_code = 'GLOBAL' OR email IN ('inememmanuel@gmail.com'));

UPDATE public.profiles
SET admin_role = 'campus_admin'
WHERE role = 'admin' AND admin_role IS NULL;

-- 3. Update prevent_profile_role_escalation trigger function
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_caller_role text;
    v_caller_admin_role text;
    v_caller_campus text;
    v_self_submitting_for_review boolean;
BEGIN
    -- Nested, JWT-less server-side update (e.g. GoTrue email confirmation).
    IF auth.uid() IS NULL AND pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    SELECT role::text, admin_role, campus_code INTO v_caller_role, v_caller_admin_role, v_caller_campus
    FROM public.profiles WHERE id = auth.uid();

    -- Super Admin: Full global authority
    IF v_caller_role = 'admin' AND v_caller_admin_role = 'super_admin' THEN
        -- Keep admin_role clean when role changes
        IF NEW.role::text <> 'admin' THEN
            NEW.admin_role := NULL;
        ELSIF NEW.role::text = 'admin' AND NEW.admin_role IS NULL THEN
            NEW.admin_role := 'campus_admin';
        END IF;
        RETURN NEW;
    END IF;

    -- Campus Admin: Campus-centric authority with strict guards
    IF v_caller_role = 'admin' AND (v_caller_admin_role = 'campus_admin' OR v_caller_admin_role IS NULL) THEN
        -- Guard 1: ONLY a Super Admin can make anyone an admin
        IF (NEW.role::text = 'admin' AND OLD.role::text <> 'admin')
           OR (NEW.admin_role IS DISTINCT FROM OLD.admin_role) THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
        END IF;

        -- Guard 2: Campus Admin cannot modify any Admin account
        IF OLD.role::text = 'admin' THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_suspended := OLD.is_suspended;
            NEW.suspension_reason := OLD.suspension_reason;
            NEW.trust_score := OLD.trust_score;
            NEW.verification_status := OLD.verification_status;
            RETURN NEW;
        END IF;

        -- Guard 3: Campus Admin cannot modify users outside their campus
        IF v_caller_campus IS NOT NULL AND v_caller_campus <> 'GLOBAL' AND OLD.campus_code <> v_caller_campus THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_suspended := OLD.is_suspended;
            NEW.suspension_reason := OLD.suspension_reason;
            NEW.trust_score := OLD.trust_score;
            NEW.verification_status := OLD.verification_status;
            RETURN NEW;
        END IF;

        -- Guard 4: Campus Admin cannot reassign a user's campus
        IF NEW.campus_code IS DISTINCT FROM OLD.campus_code THEN
            NEW.campus_code := OLD.campus_code;
        END IF;

        -- Campus admin can update non-admin role (e.g. student <-> alumni <-> staff),
        -- and update verification_status, suspension, etc. for users on their own campus.
        RETURN NEW;
    END IF;

    -- Staff: can review student/alumni within their campus
    IF v_caller_role = 'staff'
       AND auth.uid() <> OLD.id
       AND OLD.role::text IN ('student', 'alumni')
       AND (v_caller_campus = OLD.campus_code OR v_caller_campus = 'GLOBAL' OR OLD.campus_code = 'GLOBAL') THEN
        NEW.role := OLD.role;
        NEW.admin_role := OLD.admin_role;
        NEW.campus_code := OLD.campus_code;
        NEW.trust_score := OLD.trust_score;
        RETURN NEW;
    END IF;

    -- Regular student / alumni self-updates
    v_self_submitting_for_review :=
        NEW.verification_status = 'pending'
        AND OLD.verification_status IN ('unverified', 'rejected');

    IF (NEW.role IS DISTINCT FROM OLD.role)
       OR (NEW.admin_role IS DISTINCT FROM OLD.admin_role)
       OR (NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NOT v_self_submitting_for_review)
       OR (NEW.is_suspended IS DISTINCT FROM OLD.is_suspended)
       OR (NEW.trust_score IS DISTINCT FROM OLD.trust_score)
       OR (NEW.campus_code IS DISTINCT FROM OLD.campus_code)
       OR (NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason) THEN
        NEW.role := OLD.role;
        NEW.admin_role := OLD.admin_role;
        IF NOT v_self_submitting_for_review THEN
            NEW.verification_status := OLD.verification_status;
        END IF;
        NEW.is_suspended := OLD.is_suspended;
        NEW.trust_score := OLD.trust_score;
        NEW.campus_code := OLD.campus_code;
        NEW.suspension_reason := OLD.suspension_reason;
    END IF;

    RETURN NEW;
END;
$function$;

-- 4. Update guard_last_active_admin to also protect the last Super Admin
CREATE OR REPLACE FUNCTION public.guard_last_active_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_others int;
  v_super_others int;
BEGIN
  IF OLD.role::text <> 'admin' OR COALESCE(OLD.is_suspended, false) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.role::text = 'admin' AND NOT COALESCE(NEW.is_suspended, false) THEN
      -- If demoting or changing super_admin status:
      IF OLD.admin_role = 'super_admin' AND (NEW.admin_role <> 'super_admin' OR COALESCE(NEW.is_suspended, false)) THEN
        PERFORM pg_advisory_xact_lock(hashtext('lioris.last_active_super_admin'));
        SELECT count(*) INTO v_super_others
          FROM public.profiles p
         WHERE p.id <> OLD.id AND p.role::text = 'admin' AND p.admin_role = 'super_admin' AND NOT COALESCE(p.is_suspended, false);
        IF v_super_others = 0 THEN
          RAISE EXCEPTION 'Refusing to remove, demote or suspend the last active Super Administrator.'
            USING ERRCODE = '42501';
        END IF;
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lioris.last_active_admin'));
  SELECT count(*) INTO v_others
    FROM public.profiles p
   WHERE p.id <> OLD.id AND p.role::text = 'admin' AND NOT COALESCE(p.is_suspended, false);

  IF v_others = 0 THEN
    RAISE EXCEPTION 'Refusing to remove, demote or suspend the last active administrator.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.admin_role = 'super_admin' THEN
    PERFORM pg_advisory_xact_lock(hashtext('lioris.last_active_super_admin'));
    SELECT count(*) INTO v_super_others
      FROM public.profiles p
     WHERE p.id <> OLD.id AND p.role::text = 'admin' AND p.admin_role = 'super_admin' AND NOT COALESCE(p.is_suspended, false);
    IF v_super_others = 0 THEN
      RAISE EXCEPTION 'Refusing to remove, demote or suspend the last active Super Administrator.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- 5. Helper accessors for hierarchy
CREATE OR REPLACE FUNCTION public.auth_is_super_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE((
    SELECT role = 'admin' AND admin_role = 'super_admin'
    FROM public.profiles
    WHERE id = auth.uid()
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.auth_profile_admin_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT admin_role FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.auth_is_super_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auth_profile_admin_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_profile_admin_role() TO authenticated, service_role;

-- 6. Lock down platform_settings RLS: Only Super Admins can write
DROP POLICY IF EXISTS "Admins can manage platform settings" ON public.platform_settings;
DROP POLICY IF EXISTS "Super admins can manage platform settings" ON public.platform_settings;

CREATE POLICY "Super admins can manage platform settings"
ON public.platform_settings
FOR ALL
TO authenticated
USING (public.auth_is_super_admin())
WITH CHECK (public.auth_is_super_admin() AND NOT public.is_secret_setting_key(key));

-- 6. Update admin_get_user_profiles to scope by campus for campus admins and return admin_role
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
    admin_role TEXT
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
        p.admin_role::TEXT
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE (v_effective_campus IS NULL OR p.campus_code = v_effective_campus)
    ORDER BY p.created_at DESC
    LIMIT LEAST(COALESCE(p_limit, 1000), 5000);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_profiles(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_profiles(TEXT, INT) TO authenticated, service_role;

