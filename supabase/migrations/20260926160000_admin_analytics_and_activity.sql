-- ============================================================================
-- ADMIN ANALYTICS, ACTIVITY MONITORING & REAL USER TRACKING (2026)
-- Adds last_login_at, is_bot tracking on profiles, analytics_events table,
-- record_user_activity RPC, and get_admin_analytics_summary RPC.
-- Idempotent and safe to run multiple times.
-- ============================================================================

BEGIN;

-- 1. Profiles columns for login & bot tracking --------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark seeded bots as bots
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_prevent_profile_role_escalation') THEN
        ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation;
    END IF;

    UPDATE public.profiles
    SET is_bot = TRUE
    WHERE id::text LIKE '00000000-0000-4000-a000-%';

    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_prevent_profile_role_escalation') THEN
        ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation;
    END IF;
END $$;

-- 2. Analytics events table ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- 'page_view', 'feature_use', 'session_start'
    name TEXT NOT NULL,       -- e.g. '/feed', 'download_resource', 'vote_poll'
    campus_code TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_name ON public.analytics_events(event_type, name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_campus ON public.analytics_events(campus_code);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON public.analytics_events(user_id);

-- 3. RLS on analytics_events --------------------------------------------------
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert analytics events" ON public.analytics_events;
CREATE POLICY "Anyone can insert analytics events" ON public.analytics_events
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view analytics events" ON public.analytics_events;
CREATE POLICY "Admins can view analytics events" ON public.analytics_events
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 4. RPC: record_user_activity ------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_user_activity(
    p_event_type TEXT,
    p_name TEXT,
    p_campus_code TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID;
    v_campus TEXT;
BEGIN
    v_uid := auth.uid();
    IF p_campus_code IS NOT NULL AND p_campus_code <> '' THEN
        v_campus := p_campus_code;
    ELSIF v_uid IS NOT NULL THEN
        SELECT campus_code INTO v_campus FROM public.profiles WHERE id = v_uid;
    END IF;

    INSERT INTO public.analytics_events (user_id, event_type, name, campus_code, metadata, created_at)
    VALUES (v_uid, p_event_type, p_name, COALESCE(v_campus, 'GLOBAL'), COALESCE(p_metadata, '{}'::jsonb), NOW());

    IF v_uid IS NOT NULL THEN
        IF p_event_type = 'session_start' THEN
            UPDATE public.profiles
            SET last_active_at = NOW(),
                last_login_at = NOW()
            WHERE id = v_uid;
        ELSE
            UPDATE public.profiles
            SET last_active_at = NOW()
            WHERE id = v_uid;
        END IF;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_activity(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_user_activity(TEXT, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;

-- 5. RPC: get_admin_analytics_summary ----------------------------------------
DROP FUNCTION IF EXISTS public.get_admin_analytics_summary(INT);
DROP FUNCTION IF EXISTS public.get_admin_analytics_summary(INT, TEXT);

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
    SELECT role::text INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    v_since := NOW() - (p_days || ' days')::INTERVAL;

    -- User population & activity
    SELECT
        COUNT(*)::INT,
        COUNT(*) FILTER (WHERE NOT COALESCE(is_bot, false))::INT,
        COUNT(*) FILTER (WHERE COALESCE(is_bot, false))::INT,
        COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '15 minutes' AND NOT COALESCE(is_bot, false))::INT,
        COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '24 hours' AND NOT COALESCE(is_bot, false))::INT,
        COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '7 days' AND NOT COALESCE(is_bot, false))::INT,
        COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '30 days' AND NOT COALESCE(is_bot, false))::INT
    INTO
        v_total_users,
        v_real_users,
        v_bot_users,
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

    -- Most used features
    SELECT COALESCE(JSONB_AGG(sub), '[]'::jsonb) INTO v_features
    FROM (
        SELECT name, COUNT(*)::INT AS uses, COUNT(DISTINCT user_id)::INT AS unique_users
        FROM public.analytics_events
        WHERE event_type = 'feature_use'
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
            COUNT(*) FILTER (WHERE verification_status = 'verified')::INT AS verified_members,
            COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '7 days')::INT AS active_7d
        FROM public.profiles
        GROUP BY campus_code
        ORDER BY total_members DESC
    ) sub;

    RETURN JSONB_BUILD_OBJECT(
        'total_users', COALESCE(v_total_users, 0),
        'real_users', COALESCE(v_real_users, 0),
        'bot_users', COALESCE(v_bot_users, 0),
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

COMMIT;
