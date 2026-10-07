-- Keep Campus Admin and staff directory search inside their assigned campus.
-- Super Admin remains the only interactive role with cross-campus visibility.
CREATE OR REPLACE FUNCTION public.admin_search_profiles(p_query TEXT, p_limit INT DEFAULT 5)
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    email TEXT,
    role TEXT,
    campus_code TEXT,
    verification_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_admin_role TEXT;
    v_caller_campus TEXT;
    v_query TEXT;
    v_cross_campus BOOLEAN := FALSE;
BEGIN
    IF auth.role() = 'service_role' THEN
        v_cross_campus := TRUE;
    ELSE
        SELECT
            LOWER(COALESCE(p.role::text, '')),
            LOWER(COALESCE(p.admin_role::text, '')),
            UPPER(NULLIF(TRIM(p.campus_code::text), ''))
        INTO v_caller_role, v_admin_role, v_caller_campus
        FROM public.profiles p
        WHERE p.id = auth.uid();

        IF v_caller_role NOT IN ('admin', 'staff') THEN
            RAISE EXCEPTION 'admin_required';
        END IF;

        v_cross_campus := v_caller_role = 'admin' AND v_admin_role = 'super_admin';

        IF NOT v_cross_campus AND v_caller_campus IS NULL THEN
            RAISE EXCEPTION 'campus_assignment_required';
        END IF;
    END IF;

    v_query := '%' || COALESCE(TRIM(p_query), '') || '%';

    RETURN QUERY
    SELECT
        p.id,
        p.full_name::TEXT,
        p.email::TEXT,
        p.role::TEXT,
        p.campus_code::TEXT,
        p.verification_status::TEXT
    FROM public.profiles p
    WHERE (p.full_name ILIKE v_query OR p.email ILIKE v_query)
      AND (v_cross_campus OR UPPER(COALESCE(p.campus_code::text, '')) = v_caller_campus)
    ORDER BY p.full_name NULLS LAST, p.email
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 50);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_profiles(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_search_profiles(TEXT, INT) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_search_profiles(TEXT, INT) IS
    'Searches profiles for admin tools. Super Admin can search every campus; Campus Admin and staff are restricted to their assigned campus.';

-- The original analytics RPC predates the admin hierarchy and accepts any
-- campus filter. Put a role-aware facade in front of it and remove direct
-- authenticated access to the unscoped implementation.
CREATE OR REPLACE FUNCTION public.get_scoped_admin_analytics_summary(
    p_days INT DEFAULT 30,
    p_campus_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_admin_role TEXT;
    v_caller_campus TEXT;
    v_effective_campus TEXT;
BEGIN
    IF auth.role() = 'service_role' THEN
        v_effective_campus := NULLIF(UPPER(TRIM(COALESCE(p_campus_code, ''))), 'ALL');
    ELSE
        SELECT
            LOWER(COALESCE(p.role::text, '')),
            LOWER(COALESCE(p.admin_role::text, '')),
            UPPER(NULLIF(TRIM(p.campus_code::text), ''))
        INTO v_caller_role, v_admin_role, v_caller_campus
        FROM public.profiles p
        WHERE p.id = auth.uid();

        IF v_caller_role NOT IN ('admin', 'staff') THEN
            RAISE EXCEPTION 'admin_required';
        END IF;

        IF v_caller_role = 'admin' AND v_admin_role = 'super_admin' THEN
            v_effective_campus := NULLIF(UPPER(TRIM(COALESCE(p_campus_code, ''))), 'ALL');
        ELSE
            IF v_caller_campus IS NULL THEN
                RAISE EXCEPTION 'campus_assignment_required';
            END IF;
            v_effective_campus := v_caller_campus;
        END IF;
    END IF;

    RETURN public.get_admin_analytics_summary(
        LEAST(GREATEST(COALESCE(p_days, 30), 1), 365),
        v_effective_campus
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_analytics_summary(INT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics_summary(INT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.get_scoped_admin_analytics_summary(INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_scoped_admin_analytics_summary(INT, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_scoped_admin_analytics_summary(INT, TEXT) IS
    'Returns platform analytics for Super Admin, or forcibly limits Campus Admin and staff to their assigned campus.';

NOTIFY pgrst, 'reload schema';
