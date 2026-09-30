-- ADMIN USER PROFILES FETCH RPC (2026)
-- Allows admins and staff to read all profiles for analytics/reporting.
-- Uses SECURITY DEFINER to bypass RLS on the profiles table.

BEGIN;

-- 20261003010000_admin_directory_and_analytics_fixes.sql widened this
-- function's return columns; CREATE OR REPLACE cannot change a function's
-- return type, so this file - which must stay safe to re-run on its own -
-- drops it first. Re-running this file after the later migration is a no-op
-- on the signature (the later migration's own DROP + CREATE runs right
-- after in migration order and restores the wider shape).
DROP FUNCTION IF EXISTS public.admin_get_user_profiles(TEXT, INT);

CREATE OR REPLACE FUNCTION public.admin_get_user_profiles(
    p_campus_code TEXT DEFAULT NULL,
    p_limit INT DEFAULT 200
)
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    email TEXT,
    role TEXT,
    campus_code TEXT,
    verification_status TEXT,
    last_active_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    is_bot BOOLEAN,
    avatar_url TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT LOWER(COALESCE(p.role::text, '')) INTO v_caller_role
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF v_caller_role NOT IN ('admin', 'staff') AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.full_name::TEXT,
        COALESCE(u.email::TEXT, p.email::TEXT) AS email,
        p.role::TEXT,
        p.campus_code::TEXT,
        p.verification_status::TEXT,
        p.last_active_at,
        p.last_login_at,
        COALESCE(p.is_bot, FALSE) AS is_bot,
        p.avatar_url::TEXT,
        p.created_at
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE (p_campus_code IS NULL OR p_campus_code = 'ALL' OR p.campus_code = p_campus_code)
    ORDER BY p.created_at DESC
    LIMIT COALESCE(p_limit, 200);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_profiles(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_profiles(TEXT, INT) TO authenticated, service_role;

COMMIT;
