-- ============================================================================
-- LIORIS - ADMIN USER DIAGNOSTICS RPC
-- ============================================================================
-- Found in a wider functionality audit:
--
--   user_mutes, job_alerts, and notification_preferences (added in
--   20261003020000_tier3_account_and_notifications.sql and
--   20261004000000_discovery_and_polish.sql) are all owner-only RLS - correct
--   for normal use, but it leaves admins/staff with no way to inspect a
--   user's state while handling a complaint ("I'm still getting content from
--   someone I muted", "I'm not getting my job alert notifications") without
--   going to the SQL editor directly.
--
--   admin_get_user_diagnostics(p_user_id) is a single SECURITY DEFINER read
--   that summarises all three for one target user:
--     - mutes: counts only (how many the user has muted, how many have muted
--       them) plus the 5 most recent each way for actionability - not a full
--       identity dump of a private, one-sided action against another party.
--     - job_alerts: shown in full (keywords/type/active/created/last
--       notified) - this is the user's own stated preference, not another
--       party's private action, so there is no reason to summarise it.
--     - notification_preferences: the 4 boolean flags, defaulting the same
--       way the client's own getMyNotificationPreferences() does when no row
--       exists yet (every category on).
--
--   Authorisation mirrors admin_get_user_profiles() exactly (admin or staff,
--   service_role passes through); staff are further scoped to their own
--   campus, matching the "role = 'staff' AND campus_code = ..." pattern used
--   by the posts/jobs staff-moderation policies elsewhere - a staff member
--   cannot run diagnostics on a user outside their own campus.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.user_mutes') IS NULL
     OR to_regclass('public.job_alerts') IS NULL
     OR to_regclass('public.notification_preferences') IS NULL THEN
    RAISE EXCEPTION 'Dependency missing: apply 20261003020000_tier3_account_and_notifications.sql and 20261004000000_discovery_and_polish.sql first.';
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.admin_get_user_diagnostics(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_campus TEXT;
    v_target_campus TEXT;
    v_muted_count INT := 0;
    v_muted_by_count INT := 0;
    v_recent_muted JSONB := '[]'::jsonb;
    v_recent_muted_by JSONB := '[]'::jsonb;
    v_alerts_total_count INT := 0;
    v_alerts_active_count INT := 0;
    v_alerts JSONB := '[]'::jsonb;
    v_prefs JSONB;
BEGIN
    SELECT LOWER(COALESCE(role::text, '')), campus_code
    INTO v_caller_role, v_caller_campus
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role NOT IN ('admin', 'staff') AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    SELECT campus_code INTO v_target_campus FROM public.profiles WHERE id = p_user_id;
    IF v_target_campus IS NULL THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;

    -- Staff can only run diagnostics on a user on their own campus; admins and
    -- service_role are not campus-scoped.
    IF v_caller_role = 'staff' AND auth.role() <> 'service_role' AND v_caller_campus IS DISTINCT FROM v_target_campus THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    -- Mutes: counts + a handful of recent rows each direction.
    SELECT COUNT(*)::INT INTO v_muted_count FROM public.user_mutes WHERE muter_id = p_user_id;
    SELECT COUNT(*)::INT INTO v_muted_by_count FROM public.user_mutes WHERE muted_id = p_user_id;

    SELECT COALESCE(JSONB_AGG(sub), '[]'::jsonb) INTO v_recent_muted
    FROM (
        SELECT m.muted_id AS user_id, p.full_name, m.created_at
        FROM public.user_mutes m
        JOIN public.profiles p ON p.id = m.muted_id
        WHERE m.muter_id = p_user_id
        ORDER BY m.created_at DESC
        LIMIT 5
    ) sub;

    SELECT COALESCE(JSONB_AGG(sub), '[]'::jsonb) INTO v_recent_muted_by
    FROM (
        SELECT m.muter_id AS user_id, p.full_name, m.created_at
        FROM public.user_mutes m
        JOIN public.profiles p ON p.id = m.muter_id
        WHERE m.muted_id = p_user_id
        ORDER BY m.created_at DESC
        LIMIT 5
    ) sub;

    -- Job alerts: the user's own stated preferences, shown in full.
    SELECT COUNT(*)::INT, COUNT(*) FILTER (WHERE is_active)::INT
    INTO v_alerts_total_count, v_alerts_active_count
    FROM public.job_alerts
    WHERE user_id = p_user_id;

    SELECT COALESCE(JSONB_AGG(sub), '[]'::jsonb) INTO v_alerts
    FROM (
        SELECT id, keywords, job_type, remote_only, campus_code, is_active, created_at, last_notified_at
        FROM public.job_alerts
        WHERE user_id = p_user_id
        ORDER BY created_at DESC
    ) sub;

    -- Notification preferences: no row yet means every category defaults on -
    -- mirrors the column defaults and src/api/notificationPreferences.ts's
    -- own client-side fallback.
    SELECT JSONB_BUILD_OBJECT(
        'has_custom_row', true,
        'push_enabled', push_enabled,
        'announcements_enabled', announcements_enabled,
        'events_enabled', events_enabled,
        'digest_enabled', digest_enabled,
        'updated_at', updated_at
    ) INTO v_prefs
    FROM public.notification_preferences
    WHERE user_id = p_user_id;

    IF v_prefs IS NULL THEN
        v_prefs := JSONB_BUILD_OBJECT(
            'has_custom_row', false,
            'push_enabled', true,
            'announcements_enabled', true,
            'events_enabled', true,
            'digest_enabled', true,
            'updated_at', NULL
        );
    END IF;

    RETURN JSONB_BUILD_OBJECT(
        'user_id', p_user_id,
        'mutes', JSONB_BUILD_OBJECT(
            'muted_count', v_muted_count,
            'muted_by_count', v_muted_by_count,
            'recent_muted', v_recent_muted,
            'recent_muted_by', v_recent_muted_by
        ),
        'job_alerts', JSONB_BUILD_OBJECT(
            'active_count', v_alerts_active_count,
            'total_count', v_alerts_total_count,
            'alerts', v_alerts
        ),
        'notification_preferences', v_prefs
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_diagnostics(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_diagnostics(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
