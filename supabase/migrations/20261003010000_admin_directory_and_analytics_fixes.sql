-- ============================================================================
-- LIORIS - ADMIN DIRECTORY PERMISSION FIX + ANALYTICS CLEANUP
-- ============================================================================
-- 1. User Directory bug: 20260929000000_close_open_security_findings.sql
--    (rightly) revoked table-level SELECT on public.profiles and replaced it
--    with a column-level grant that excludes email/student_id_number/
--    last_active_at/last_login_at/etc. app/(admin)/user-directory.tsx still
--    did `supabase.from('profiles').select('*')`, which touches those
--    excluded columns - so it failed with "permission denied for table
--    profiles" for EVERY signed-in user, including admins (a column-level
--    grant covering some but not all requested columns still refuses the
--    whole query). admin_get_user_profiles() already exists as the
--    SECURITY-DEFINER path around exactly this; it is widened here with the
--    columns the directory screen needs (student_id_number, department,
--    trust_score, is_suspended) and the client is switched to call it.
--
-- 2. get_admin_analytics_summary(): the periodic 5-minute liveness ping
--    ('heartbeat', src/hooks/useActivityTracker.ts) was counted inside
--    "Most Used Features", where it drowns out every real feature. It still
--    updates last_active_at exactly as before; it is just excluded from the
--    feature leaderboard. Also adds new_signups (growth in the selected
--    window) - a common admin metric that was entirely missing.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. admin_get_user_profiles: add the columns the User Directory needs.
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
        p.created_at
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE (p_campus_code IS NULL OR p_campus_code = 'ALL' OR p.campus_code = p_campus_code)
    ORDER BY p.created_at DESC
    LIMIT LEAST(COALESCE(p_limit, 1000), 5000);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_profiles(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_profiles(TEXT, INT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. get_admin_analytics_summary: drop heartbeat noise from the feature
--    leaderboard, add new_signups.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_analytics_summary(
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
    v_since TIMESTAMPTZ;
    v_total_users INT := 0;
    v_real_users INT := 0;
    v_bot_users INT := 0;
    v_new_signups INT := 0;
    v_active_15m INT := 0;
    v_active_24h INT := 0;
    v_active_7d INT := 0;
    v_active_30d INT := 0;
    v_total_posts INT := 0;
    v_total_comments INT := 0;
    v_total_resources INT := 0;
    v_total_events INT := 0;
    v_total_rsvps INT := 0;
    v_total_poll_votes INT := 0;
    v_pending_verifications INT := 0;
    v_pages JSONB := '[]'::jsonb;
    v_features JSONB := '[]'::jsonb;
    v_campuses JSONB := '[]'::jsonb;
BEGIN
    SELECT LOWER(COALESCE(role::text, '')) INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role NOT IN ('admin', 'staff') AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    v_since := NOW() - (p_days || ' days')::INTERVAL;

    -- User population & activity
    SELECT
        COUNT(*)::INT,
        COUNT(*) FILTER (WHERE NOT COALESCE(is_bot, false))::INT,
        COUNT(*) FILTER (WHERE COALESCE(is_bot, false))::INT,
        COUNT(*) FILTER (WHERE created_at >= v_since AND NOT COALESCE(is_bot, false))::INT,
        COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '15 minutes' AND NOT COALESCE(is_bot, false))::INT,
        COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '24 hours' AND NOT COALESCE(is_bot, false))::INT,
        COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '7 days' AND NOT COALESCE(is_bot, false))::INT,
        COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '30 days' AND NOT COALESCE(is_bot, false))::INT
    INTO
        v_total_users,
        v_real_users,
        v_bot_users,
        v_new_signups,
        v_active_15m,
        v_active_24h,
        v_active_7d,
        v_active_30d
    FROM public.profiles
    WHERE (p_campus_code IS NULL OR p_campus_code = 'ALL' OR campus_code = p_campus_code);

    -- Content & Campus Life Velocity
    SELECT COUNT(*)::INT INTO v_total_posts
    FROM public.posts
    WHERE created_at >= v_since
      AND (p_campus_code IS NULL OR p_campus_code = 'ALL' OR campus_code = p_campus_code);

    IF p_campus_code IS NOT NULL AND p_campus_code <> 'ALL' THEN
        SELECT COUNT(*)::INT INTO v_total_comments
        FROM public.post_comments c
        JOIN public.posts p ON p.id = c.post_id
        WHERE c.created_at >= v_since AND p.campus_code = p_campus_code;
    ELSE
        SELECT COUNT(*)::INT INTO v_total_comments
        FROM public.post_comments c
        WHERE c.created_at >= v_since;
    END IF;

    SELECT COUNT(*)::INT INTO v_total_resources
    FROM public.resources
    WHERE created_at >= v_since
      AND (p_campus_code IS NULL OR p_campus_code = 'ALL' OR campus_code = p_campus_code);

    SELECT COUNT(*)::INT INTO v_total_events
    FROM public.events
    WHERE created_at >= v_since
      AND (p_campus_code IS NULL OR p_campus_code = 'ALL' OR campus_code = p_campus_code);

    SELECT COUNT(*)::INT INTO v_total_rsvps
    FROM public.analytics_events
    WHERE event_type = 'feature_use' AND name = 'event_rsvp' AND created_at >= v_since
      AND (p_campus_code IS NULL OR p_campus_code = 'ALL' OR campus_code = p_campus_code);

    SELECT COUNT(*)::INT INTO v_total_poll_votes
    FROM public.analytics_events
    WHERE event_type = 'feature_use' AND name = 'vote_poll' AND created_at >= v_since
      AND (p_campus_code IS NULL OR p_campus_code = 'ALL' OR campus_code = p_campus_code);

    SELECT COUNT(*)::INT INTO v_pending_verifications
    FROM public.profiles
    WHERE verification_status = 'pending'
      AND (p_campus_code IS NULL OR p_campus_code = 'ALL' OR campus_code = p_campus_code);

    -- Most visited pages
    SELECT COALESCE(JSONB_AGG(sub), '[]'::jsonb) INTO v_pages
    FROM (
        SELECT name, COUNT(*)::INT AS visits, COUNT(DISTINCT user_id)::INT AS unique_visitors
        FROM public.analytics_events
        WHERE event_type = 'page_view'
          AND created_at >= v_since
          AND (p_campus_code IS NULL OR p_campus_code = 'ALL' OR campus_code = p_campus_code)
        GROUP BY name
        ORDER BY visits DESC
        LIMIT 15
    ) sub;

    -- Most used features - 'heartbeat' is a liveness ping, not something a user
    -- chose to do, so it is excluded here (it still updates last_active_at).
    SELECT COALESCE(JSONB_AGG(sub), '[]'::jsonb) INTO v_features
    FROM (
        SELECT name, COUNT(*)::INT AS uses, COUNT(DISTINCT user_id)::INT AS unique_users
        FROM public.analytics_events
        WHERE event_type = 'feature_use'
          AND name <> 'heartbeat'
          AND created_at >= v_since
          AND (p_campus_code IS NULL OR p_campus_code = 'ALL' OR campus_code = p_campus_code)
        GROUP BY name
        ORDER BY uses DESC
        LIMIT 15
    ) sub;

    -- Campus metrics breakdown
    SELECT COALESCE(JSONB_AGG(sub), '[]'::jsonb) INTO v_campuses
    FROM (
        SELECT
            COALESCE(campus_code, 'GLOBAL') AS campus_code,
            COUNT(*)::INT AS total_members,
            COUNT(*) FILTER (WHERE NOT COALESCE(is_bot, false))::INT AS real_members,
            COUNT(*) FILTER (WHERE verification_status = 'verified' AND NOT COALESCE(is_bot, false))::INT AS verified_members,
            COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '7 days' AND NOT COALESCE(is_bot, false))::INT AS active_7d
        FROM public.profiles
        GROUP BY campus_code
        ORDER BY total_members DESC
    ) sub;

    RETURN JSONB_BUILD_OBJECT(
        'total_users', COALESCE(v_total_users, 0),
        'real_users', COALESCE(v_real_users, 0),
        'bot_users', COALESCE(v_bot_users, 0),
        'new_signups', COALESCE(v_new_signups, 0),
        'active_15m', COALESCE(v_active_15m, 0),
        'active_24h', COALESCE(v_active_24h, 0),
        'active_7d', COALESCE(v_active_7d, 0),
        'active_30d', COALESCE(v_active_30d, 0),
        'total_posts', COALESCE(v_total_posts, 0),
        'total_comments', COALESCE(v_total_comments, 0),
        'total_resources', COALESCE(v_total_resources, 0),
        'total_events', COALESCE(v_total_events, 0),
        'total_rsvps', COALESCE(v_total_rsvps, 0),
        'total_poll_votes', COALESCE(v_total_poll_votes, 0),
        'pending_verifications', COALESCE(v_pending_verifications, 0),
        'most_visited_pages', v_pages,
        'most_used_features', v_features,
        'campus_metrics', v_campuses
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_analytics_summary(INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics_summary(INT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
