-- ============================================================================
-- LIORIS - ACCESS-CONTROL HARDENING (2026-11-06)
-- ============================================================================
-- Follows 20261105000000_profile_media_cross_campus_read.sql. It MUST run after every
-- migration up to and including 20261105: those files re-define several of the
-- functions / policies below (is_super_admin, is_profile_verified, the chat and
-- notification policies, admin_get_profile_contacts, resolve_takedown_request, ...),
-- and this file holds the final definitions. Everything is idempotent and guarded
-- (to_regclass / to_regprocedure / DO blocks) so a database that lacks some of the
-- objects still applies it.
--
-- WHAT THIS FIXES
--   1  anon could execute SECURITY DEFINER admin RPCs (the "NOT IN ('admin','staff')" guard is NULL for
--      anon, so it never raised). Guards fixed + schema-wide EXECUTE sweep (anon allow-list below).
--   2  Campus admins read/deleted private DMs: chat / notification / connection / block / mentorship
--      policies keyed on role='admin'. Only Super Admin keeps an override; a campus admin deletes chat
--      content only through admin_delete_chat_message when everyone involved is on their campus.
--   3  Definer RPCs that ignored campus scope now go through can_admin_campus(<campus of the row>).
--   4  Resume leak: job_applications.resume_url must live in the applicant's own folder; initial
--      status/review fields are forced; closed/expired jobs refuse applications.
--   5  Campus-wall bypass on INSERT (permissive policies ORed with the checked ones); campus_code /
--      visibility_scope are immutable for non-Super-Admins; scope_privileged_update WITH CHECK fixed.
--   6  Forged counters (likes, comments, downloads, upvotes, applications).
--   7  Notification spam / spoofing (sender forced, types + recipients + URLs constrained, rate limit).
--   8  Forced chat membership.
--   9  Anonymous listing of the avatars bucket.
--   10 Root-email Super Admin bootstrap now requires a CONFIRMED e-mail.
--   11 Takedown abuse (any account could hide any resource instantly).
--   12 Probe helpers (users_have_block, dm_channel_has_block, campus_of, is_profile_verified).
--   13 pg_temp last in search_path for SECURITY DEFINER functions.
--   14 role_permissions no longer readable by anon.
--   15 Verification evidence cannot be altered after the decision.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Dependency missing: apply the base schema and earlier migrations first.';
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 0. Optional-MFA hook must exist before auth_is_super_admin() refers to it
-- ----------------------------------------------------------------------------
DO $mfa$
BEGIN
  IF to_regprocedure('public.admin_aal2_ok()') IS NULL THEN
    EXECUTE $f$
      CREATE FUNCTION public.admin_aal2_ok() RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
      AS 'SELECT true'
    $f$;
  END IF;
END
$mfa$;

-- ----------------------------------------------------------------------------
-- 10. auth_is_super_admin(): the root-e-mail bootstrap needs a CONFIRMED e-mail
-- ----------------------------------------------------------------------------
-- Before: the root e-mail alone (profile e-mail or JWT claim) was enough, i.e. whoever registered that
-- address before the owner did, with e-mail confirmation off or bypassed, became Super Admin. Now the
-- bootstrap arm reads auth.users and requires email_confirmed_at. Rows with admin_role = 'super_admin'
-- behave exactly as before. admin_aal2_ok() (optional MFA switch) is kept.
CREATE OR REPLACE FUNCTION public.auth_is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (
    COALESCE((
      SELECT (p.role::text = 'admin' AND p.admin_role = 'super_admin')
      FROM public.profiles p
      WHERE p.id = auth.uid()
    ), false)
    OR EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND u.email_confirmed_at IS NOT NULL
        AND LOWER(COALESCE(u.email, '')) = 'inememmanuel@gmail.com'
    )
  ) AND public.admin_aal2_ok();
$$;

-- ----------------------------------------------------------------------------
-- 12. Probe helpers: bind to the caller so they cannot be used to look arbitrary users up
-- ----------------------------------------------------------------------------
-- "Internal" = no JWT at all (SQL editor, migrations) or the service role. PostgREST always sets claims,
-- so a signed-out caller is role 'anon' and an unrelated signed-in caller is not internal.
CREATE OR REPLACE FUNCTION public.users_have_block(p_user_a uuid, p_user_b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN auth.uid() IS NOT NULL AND auth.uid() NOT IN (COALESCE(p_user_a, auth.uid()), COALESCE(p_user_b, auth.uid()))
             THEN false
           WHEN auth.uid() IS NULL AND COALESCE(auth.role(), '') = 'anon' THEN false
           ELSE EXISTS (
             SELECT 1 FROM public.user_blocks
             WHERE (blocker_id = p_user_a AND blocked_id = p_user_b)
                OR (blocker_id = p_user_b AND blocked_id = p_user_a))
         END;
$$;

CREATE OR REPLACE FUNCTION public.dm_channel_has_block(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (
           (auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'anon')
           OR EXISTS (SELECT 1 FROM public.chat_channel_members me WHERE me.channel_id = p_channel_id AND me.user_id = auth.uid())
         )
     AND EXISTS (
    SELECT 1
      FROM public.chat_channel_members a
      JOIN public.chat_channel_members b
        ON a.channel_id = b.channel_id
       AND a.user_id   <> b.user_id
      JOIN public.user_blocks ub
        ON (ub.blocker_id = a.user_id AND ub.blocked_id = b.user_id)
        OR (ub.blocker_id = b.user_id AND ub.blocked_id = a.user_id)
     WHERE a.channel_id = p_channel_id
  );
$$;

CREATE OR REPLACE FUNCTION public.dm_channel_has_block(p_channel_id uuid, p_sender_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (p_sender_id IS NOT DISTINCT FROM auth.uid() OR (auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'anon'))
     AND EXISTS (
        SELECT 1
        FROM public.chat_channels cc
        JOIN public.chat_channel_members other
          ON other.channel_id = cc.id AND other.user_id <> p_sender_id
        WHERE cc.id = p_channel_id
          AND cc.is_direct_message = true
          AND public.users_have_block(p_sender_id, other.user_id)
    );
$$;

-- campus_of(): a signed-in member only learns the campus of people they can already see (self, GLOBAL members,
-- members of their own campus). Everyone else resolves to NULL, which can_admin_campus() treats as "no authority".
CREATE OR REPLACE FUNCTION public.campus_of(p_user uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campus text;
  v_uid    uuid := auth.uid();
BEGIN
  SELECT p.campus_code INTO v_campus FROM public.profiles p WHERE p.id = p_user;
  IF v_campus IS NULL THEN RETURN NULL; END IF;
  IF v_uid IS NULL THEN
    IF COALESCE(auth.role(), '') = 'anon' THEN RETURN NULL; END IF;
    RETURN v_campus;                                   -- service role / SQL editor / migrations
  END IF;
  IF p_user = v_uid OR auth.role() = 'service_role' OR v_campus = 'GLOBAL' OR public.auth_is_super_admin() THEN RETURN v_campus; END IF;
  IF v_campus = (SELECT p2.campus_code FROM public.profiles p2 WHERE p2.id = v_uid) THEN RETURN v_campus; END IF;
  RETURN NULL;
END;
$$;

-- is_profile_verified(): the answer is only available for yourself (RLS policies and RPCs always pass
-- auth.uid()) or to internal callers; signed-out callers and other members get "false", not an oracle.
CREATE OR REPLACE FUNCTION public.is_profile_verified(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (
           p_user_id IS NOT DISTINCT FROM auth.uid()
           OR (auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'anon')
         )
     AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND (
        p.role::text IN ('admin', 'staff')
        OR p.admin_role::text = 'super_admin'
        OR LOWER(COALESCE(p.email, '')) = 'inememmanuel@gmail.com'
        OR p.verification_status::text = 'verified'
        OR COALESCE(p.is_bot, FALSE) = TRUE
      )
      AND COALESCE(p.is_suspended, FALSE) = FALSE
  );
$$;

-- ----------------------------------------------------------------------------
-- 1 + 3. Admin RPCs: fix the NULL guard (anon) and route every check through can_admin_campus()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_profile_contacts(p_user_ids uuid[])
RETURNS TABLE (id uuid, full_name text, email text, role text, campus_code text, student_id_number text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_role    text;
BEGIN
  IF NOT v_service THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'admin_required'; END IF;
    SELECT LOWER(COALESCE(p.role::text, '')) INTO v_role FROM public.profiles p WHERE p.id = auth.uid();
    IF COALESCE(v_role, '') NOT IN ('admin', 'staff') THEN RAISE EXCEPTION 'admin_required'; END IF;
  END IF;
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.id, p.full_name::text, p.email::text, p.role::text, p.campus_code::text, p.student_id_number::text
  FROM public.profiles p
  WHERE p.id = ANY (p_user_ids[1:200])
    AND (v_service OR public.auth_is_super_admin() OR public.can_admin_campus(p.campus_code));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_search_profiles(p_query text, p_limit integer DEFAULT 5)
RETURNS TABLE (id uuid, full_name text, email text, role text, campus_code text, verification_status text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_role    text;
  v_super   boolean := false;
  v_campus  text;
  v_query   text;
BEGIN
  IF NOT v_service THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'admin_required'; END IF;
    SELECT LOWER(COALESCE(p.role::text, '')), UPPER(NULLIF(TRIM(p.campus_code::text), ''))
      INTO v_role, v_campus FROM public.profiles p WHERE p.id = auth.uid();
    IF COALESCE(v_role, '') NOT IN ('admin', 'staff') THEN RAISE EXCEPTION 'admin_required'; END IF;
    v_super := public.auth_is_super_admin();
    IF NOT v_super AND (v_campus IS NULL OR v_campus = 'GLOBAL') THEN RAISE EXCEPTION 'campus_assignment_required'; END IF;
  ELSE
    v_super := true;
  END IF;

  v_query := '%' || replace(replace(replace(COALESCE(TRIM(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
  SELECT p.id, p.full_name::text, p.email::text, p.role::text, p.campus_code::text, p.verification_status::text
  FROM public.profiles p
  WHERE (p.full_name ILIKE v_query OR p.email ILIKE v_query)
    AND (v_super OR UPPER(COALESCE(p.campus_code::text, '')) = v_campus)
  ORDER BY p.full_name NULLS LAST, p.email
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 50);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_analytics_summary(p_days integer DEFAULT 30, p_campus_code text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_role text;
  v_caller_campus text;
  v_campus text;                       -- NULL = every campus
  v_since TIMESTAMPTZ;
  v_total_users INT := 0; v_real_users INT := 0; v_bot_users INT := 0; v_new_signups INT := 0;
  v_active_15m INT := 0; v_active_24h INT := 0; v_active_7d INT := 0; v_active_30d INT := 0;
  v_total_posts INT := 0; v_total_comments INT := 0; v_total_resources INT := 0; v_total_events INT := 0;
  v_total_rsvps INT := 0; v_total_poll_votes INT := 0; v_pending_verifications INT := 0;
  v_pages JSONB := '[]'::jsonb; v_features JSONB := '[]'::jsonb; v_campuses JSONB := '[]'::jsonb;
BEGIN
  IF v_service OR (auth.uid() IS NOT NULL AND public.auth_is_super_admin()) THEN
    v_campus := CASE WHEN p_campus_code IS NULL OR BTRIM(p_campus_code) = '' OR UPPER(BTRIM(p_campus_code)) = 'ALL'
                     THEN NULL ELSE BTRIM(p_campus_code) END;
  ELSE
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'admin_required'; END IF;
    SELECT LOWER(COALESCE(p.role::text, '')), NULLIF(TRIM(p.campus_code::text), '')
      INTO v_role, v_caller_campus FROM public.profiles p WHERE p.id = auth.uid();
    IF COALESCE(v_role, '') NOT IN ('admin', 'staff') THEN RAISE EXCEPTION 'admin_required'; END IF;
    IF v_caller_campus IS NULL OR v_caller_campus = 'GLOBAL' THEN RAISE EXCEPTION 'campus_assignment_required'; END IF;
    v_campus := v_caller_campus;       -- scoped callers are pinned to their own campus whatever they ask for
  END IF;

  v_since := NOW() - (LEAST(GREATEST(COALESCE(p_days, 30), 1), 365) || ' days')::INTERVAL;

  SELECT COUNT(*)::INT,
         COUNT(*) FILTER (WHERE NOT COALESCE(is_bot, false))::INT,
         COUNT(*) FILTER (WHERE COALESCE(is_bot, false))::INT,
         COUNT(*) FILTER (WHERE created_at >= v_since AND NOT COALESCE(is_bot, false))::INT,
         COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '15 minutes' AND NOT COALESCE(is_bot, false))::INT,
         COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '24 hours' AND NOT COALESCE(is_bot, false))::INT,
         COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '7 days' AND NOT COALESCE(is_bot, false))::INT,
         COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '30 days' AND NOT COALESCE(is_bot, false))::INT
    INTO v_total_users, v_real_users, v_bot_users, v_new_signups, v_active_15m, v_active_24h, v_active_7d, v_active_30d
  FROM public.profiles
  WHERE (v_campus IS NULL OR campus_code = v_campus);

  SELECT COUNT(*)::INT INTO v_total_posts FROM public.posts
  WHERE created_at >= v_since AND (v_campus IS NULL OR campus_code = v_campus);

  IF v_campus IS NOT NULL THEN
    SELECT COUNT(*)::INT INTO v_total_comments
    FROM public.post_comments c JOIN public.posts p ON p.id = c.post_id
    WHERE c.created_at >= v_since AND p.campus_code = v_campus;
  ELSE
    SELECT COUNT(*)::INT INTO v_total_comments FROM public.post_comments c WHERE c.created_at >= v_since;
  END IF;

  SELECT COUNT(*)::INT INTO v_total_resources FROM public.resources
  WHERE created_at >= v_since AND (v_campus IS NULL OR campus_code = v_campus);

  SELECT COUNT(*)::INT INTO v_total_events FROM public.events
  WHERE created_at >= v_since AND (v_campus IS NULL OR campus_code = v_campus);

  SELECT COUNT(*)::INT INTO v_total_rsvps FROM public.analytics_events
  WHERE event_type = 'feature_use' AND name = 'event_rsvp' AND created_at >= v_since
    AND (v_campus IS NULL OR campus_code = v_campus);

  SELECT COUNT(*)::INT INTO v_total_poll_votes FROM public.analytics_events
  WHERE event_type = 'feature_use' AND name = 'vote_poll' AND created_at >= v_since
    AND (v_campus IS NULL OR campus_code = v_campus);

  SELECT COUNT(*)::INT INTO v_pending_verifications FROM public.profiles
  WHERE verification_status = 'pending' AND (v_campus IS NULL OR campus_code = v_campus);

  SELECT COALESCE(JSONB_AGG(sub), '[]'::jsonb) INTO v_pages FROM (
    SELECT name, COUNT(*)::INT AS visits, COUNT(DISTINCT user_id)::INT AS unique_visitors
    FROM public.analytics_events
    WHERE event_type = 'page_view' AND created_at >= v_since AND (v_campus IS NULL OR campus_code = v_campus)
    GROUP BY name ORDER BY visits DESC LIMIT 15
  ) sub;

  SELECT COALESCE(JSONB_AGG(sub), '[]'::jsonb) INTO v_features FROM (
    SELECT name, COUNT(*)::INT AS uses, COUNT(DISTINCT user_id)::INT AS unique_users
    FROM public.analytics_events
    WHERE event_type = 'feature_use' AND name <> 'heartbeat' AND created_at >= v_since
      AND (v_campus IS NULL OR campus_code = v_campus)
    GROUP BY name ORDER BY uses DESC LIMIT 15
  ) sub;

  -- Campus breakdown: honours the requested / pinned campus (it used to list every campus to every caller).
  SELECT COALESCE(JSONB_AGG(sub), '[]'::jsonb) INTO v_campuses FROM (
    SELECT COALESCE(campus_code, 'GLOBAL') AS campus_code,
           COUNT(*)::INT AS total_members,
           COUNT(*) FILTER (WHERE NOT COALESCE(is_bot, false))::INT AS real_members,
           COUNT(*) FILTER (WHERE verification_status = 'verified' AND NOT COALESCE(is_bot, false))::INT AS verified_members,
           COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '7 days' AND NOT COALESCE(is_bot, false))::INT AS active_7d
    FROM public.profiles
    WHERE (v_campus IS NULL OR campus_code = v_campus)
    GROUP BY campus_code ORDER BY total_members DESC
  ) sub;

  RETURN JSONB_BUILD_OBJECT(
    'total_users', COALESCE(v_total_users, 0), 'real_users', COALESCE(v_real_users, 0),
    'bot_users', COALESCE(v_bot_users, 0), 'new_signups', COALESCE(v_new_signups, 0),
    'active_15m', COALESCE(v_active_15m, 0), 'active_24h', COALESCE(v_active_24h, 0),
    'active_7d', COALESCE(v_active_7d, 0), 'active_30d', COALESCE(v_active_30d, 0),
    'total_posts', COALESCE(v_total_posts, 0), 'total_comments', COALESCE(v_total_comments, 0),
    'total_resources', COALESCE(v_total_resources, 0), 'total_events', COALESCE(v_total_events, 0),
    'total_rsvps', COALESCE(v_total_rsvps, 0), 'total_poll_votes', COALESCE(v_total_poll_votes, 0),
    'pending_verifications', COALESCE(v_pending_verifications, 0),
    'most_visited_pages', v_pages, 'most_used_features', v_features, 'campus_metrics', v_campuses
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_scoped_admin_analytics_summary(p_days integer DEFAULT 30, p_campus_code text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_role    text;
  v_campus  text;
BEGIN
  IF NOT v_service THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'admin_required'; END IF;
    SELECT LOWER(COALESCE(p.role::text, '')), UPPER(NULLIF(TRIM(p.campus_code::text), ''))
      INTO v_role, v_campus FROM public.profiles p WHERE p.id = auth.uid();
    IF COALESCE(v_role, '') NOT IN ('admin', 'staff') THEN RAISE EXCEPTION 'admin_required'; END IF;
    IF NOT public.auth_is_super_admin() AND (v_campus IS NULL OR v_campus = 'GLOBAL') THEN
      RAISE EXCEPTION 'campus_assignment_required';
    END IF;
  END IF;
  -- get_admin_analytics_summary() pins non-super callers to their own campus itself.
  RETURN public.get_admin_analytics_summary(
    LEAST(GREATEST(COALESCE(p_days, 30), 1), 365),
    CASE WHEN v_service OR public.auth_is_super_admin() THEN NULLIF(UPPER(TRIM(COALESCE(p_campus_code, ''))), 'ALL') ELSE v_campus END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_user_diagnostics(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_service BOOLEAN := COALESCE(auth.role(), '') = 'service_role';
  v_caller_role TEXT;
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
  IF NOT v_service THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'admin_required'; END IF;
    SELECT LOWER(COALESCE(role::text, '')) INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF COALESCE(v_caller_role, '') NOT IN ('admin', 'staff') THEN RAISE EXCEPTION 'admin_required'; END IF;
  END IF;

  SELECT campus_code INTO v_target_campus FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;

  IF NOT v_service AND NOT public.auth_is_super_admin() AND NOT public.can_admin_campus(v_target_campus) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  SELECT COUNT(*)::INT INTO v_muted_count FROM public.user_mutes WHERE muter_id = p_user_id;
  SELECT COUNT(*)::INT INTO v_muted_by_count FROM public.user_mutes WHERE muted_id = p_user_id;

  SELECT COALESCE(JSONB_AGG(sub), '[]'::jsonb) INTO v_recent_muted FROM (
    SELECT m.muted_id AS user_id, p.full_name, m.created_at
    FROM public.user_mutes m JOIN public.profiles p ON p.id = m.muted_id
    WHERE m.muter_id = p_user_id ORDER BY m.created_at DESC LIMIT 5
  ) sub;

  SELECT COALESCE(JSONB_AGG(sub), '[]'::jsonb) INTO v_recent_muted_by FROM (
    SELECT m.muter_id AS user_id, p.full_name, m.created_at
    FROM public.user_mutes m JOIN public.profiles p ON p.id = m.muter_id
    WHERE m.muted_id = p_user_id ORDER BY m.created_at DESC LIMIT 5
  ) sub;

  SELECT COUNT(*)::INT, COUNT(*) FILTER (WHERE is_active)::INT
    INTO v_alerts_total_count, v_alerts_active_count
  FROM public.job_alerts WHERE user_id = p_user_id;

  SELECT COALESCE(JSONB_AGG(sub), '[]'::jsonb) INTO v_alerts FROM (
    SELECT id, keywords, job_type, remote_only, campus_code, is_active, created_at, last_notified_at
    FROM public.job_alerts WHERE user_id = p_user_id ORDER BY created_at DESC
  ) sub;

  SELECT JSONB_BUILD_OBJECT(
    'has_custom_row', true, 'push_enabled', push_enabled, 'announcements_enabled', announcements_enabled,
    'events_enabled', events_enabled, 'digest_enabled', digest_enabled, 'updated_at', updated_at
  ) INTO v_prefs FROM public.notification_preferences WHERE user_id = p_user_id;

  IF v_prefs IS NULL THEN
    v_prefs := JSONB_BUILD_OBJECT('has_custom_row', false, 'push_enabled', true, 'announcements_enabled', true,
                                  'events_enabled', true, 'digest_enabled', true, 'updated_at', NULL);
  END IF;

  RETURN JSONB_BUILD_OBJECT(
    'user_id', p_user_id,
    'mutes', JSONB_BUILD_OBJECT('muted_count', v_muted_count, 'muted_by_count', v_muted_by_count,
                                'recent_muted', v_recent_muted, 'recent_muted_by', v_recent_muted_by),
    'job_alerts', JSONB_BUILD_OBJECT('total_count', v_alerts_total_count, 'active_count', v_alerts_active_count, 'alerts', v_alerts),
    'notification_preferences', v_prefs
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_campus_overview()
RETURNS TABLE (
  code text, name text, short_name text, location text, primary_color text, website_url text,
  email_domains text[], is_active boolean, created_at timestamptz,
  member_count integer, verified_count integer, portal_link_count integer, active_portal_link_count integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_service boolean := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  IF NOT v_service AND (auth.uid() IS NULL OR COALESCE(public.auth_profile_role(), '') <> 'admin') THEN
    RAISE EXCEPTION 'not_allowed: administrators only';
  END IF;
  RETURN QUERY
  SELECT c.code, c.name, c.short_name, c.location, c.primary_color, c.website_url,
         c.email_domains, c.is_active, c.created_at,
         (SELECT count(*)::integer FROM public.profiles p WHERE p.campus_code = c.code),
         (SELECT count(*)::integer FROM public.profiles p WHERE p.campus_code = c.code AND p.verification_status::text = 'verified'),
         (SELECT count(*)::integer FROM public.portal_links l WHERE l.campus_code = c.code),
         (SELECT count(*)::integer FROM public.portal_links l WHERE l.campus_code = c.code AND l.is_active)
  FROM public.campuses c
  WHERE v_service OR public.auth_is_super_admin() OR public.can_admin_campus(c.code)
  ORDER BY (c.code = 'GLOBAL') DESC, c.name;
END
$$;

CREATE OR REPLACE FUNCTION public.get_giving_campaign_click_count(p_campaign uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_allowed: sign in first.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.giving_campaigns c
    WHERE c.id = p_campaign
      AND (c.creator_id = auth.uid() OR public.can_admin_campus(c.campus_code))   -- GLOBAL / NULL campus = Super Admin only
  ) THEN
    RAISE EXCEPTION 'not_allowed: Only the campaign owner or an admin of its campus can see its click count.';
  END IF;
  SELECT count(*) INTO v_count FROM public.giving_campaign_clicks WHERE campaign_id = p_campaign;
  RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_report_count_for_author(
  p_item_type moderation_item_type, p_item_id uuid, p_exclude_report_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_caller_role TEXT;
  v_author UUID;
  v_count INTEGER;
BEGIN
  IF NOT v_service THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'admin_required'; END IF;
    SELECT LOWER(COALESCE(role::text, '')) INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF COALESCE(v_caller_role, '') NOT IN ('admin', 'staff') THEN RAISE EXCEPTION 'admin_required'; END IF;
  END IF;

  v_author := public.resolve_moderation_item_author(p_item_type, p_item_id);
  IF v_author IS NULL THEN RETURN 0; END IF;

  -- Only for authors the caller administers (GLOBAL / unknown campus = Super Admin only).
  IF NOT v_service AND NOT public.auth_is_super_admin()
     AND NOT public.can_admin_campus((SELECT p.campus_code FROM public.profiles p WHERE p.id = v_author)) THEN
    RETURN 0;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.moderation_queue mq
  WHERE (p_exclude_report_id IS NULL OR mq.id <> p_exclude_report_id)
    AND public.resolve_moderation_item_author(mq.item_type, mq.item_id) = v_author;
  RETURN COALESCE(v_count, 0);
END;
$$;

-- event_can_manage(): creator, or an admin/staff member of the EVENT's campus, or a Super Admin.
-- (It used to be "any admin, anywhere"; the same helper gates event_roster, checkin_event_attendee,
--  confirm_event_purchase, event_referral_report, get_event_payment_info and the payment-details policy.)
CREATE OR REPLACE FUNCTION public.event_can_manage(p_event uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_creator uuid;
  v_campus  text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF COALESCE((SELECT p.is_suspended FROM public.profiles p WHERE p.id = auth.uid()), false) THEN RETURN false; END IF;
  SELECT e.creator_id, e.campus_code INTO v_creator, v_campus FROM public.events e WHERE e.id = p_event;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN v_creator = auth.uid() OR public.can_admin_campus(v_campus);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_moderate_pod(p_group uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF COALESCE(public.pod_role(p_group) IN ('owner', 'moderator'), false) THEN RETURN true; END IF;
  RETURN public.can_admin_campus((SELECT g.campus_code FROM public.study_groups g WHERE g.id = p_group));
END;
$$;

CREATE OR REPLACE FUNCTION public.is_mentorship_participant(p_mentorship uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student uuid;
  v_mentor  uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT m.student_id, m.mentor_id INTO v_student, v_mentor FROM public.mentorships m WHERE m.id = p_mentorship;
  IF NOT FOUND THEN RETURN false; END IF;
  IF auth.uid() IN (v_student, v_mentor) THEN RETURN true; END IF;
  -- the mentee is the protected party: only their campus' admin (or a Super Admin) may look in
  RETURN public.can_admin_campus((SELECT p.campus_code FROM public.profiles p WHERE p.id = v_student));
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_mentorships(p_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid, student_id uuid, mentor_id uuid, status text, track text, level text, pitch text, goals text, cadence text,
  plan_outline text, document_url text, document_name text, decline_reason text, end_reason text,
  started_at timestamptz, ended_at timestamptz, last_activity_at timestamptz, created_at timestamptz,
  student_name text, student_avatar text, student_department text, mentor_name text, mentor_avatar text, mentor_headline text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.student_id, m.mentor_id, m.status, m.track, m.level, m.pitch, m.goals, m.cadence, m.plan_outline,
         m.document_url, m.document_name, m.decline_reason, m.end_reason, m.started_at, m.ended_at,
         m.last_activity_at, m.created_at,
         sp.full_name, sp.avatar_url, sp.department,
         mp.full_name, mp.avatar_url, mpr.headline
  FROM public.mentorships m
  LEFT JOIN public.profiles sp ON sp.id = m.student_id
  LEFT JOIN public.profiles mp ON mp.id = m.mentor_id
  LEFT JOIN public.mentor_profiles mpr ON mpr.user_id = m.mentor_id
  WHERE auth.uid() IS NOT NULL
    AND (m.student_id = auth.uid() OR m.mentor_id = auth.uid()
         OR (p_id IS NOT NULL AND public.can_admin_campus(sp.campus_code)))
    AND (p_id IS NULL OR m.id = p_id)
  ORDER BY m.last_activity_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.end_mentorship(p_id uuid, p_action text, p_reason text DEFAULT NULL)
RETURNS public.mentorships
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.mentorships;
  v_me  public.profiles%ROWTYPE;
  v_other uuid;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_action NOT IN ('withdraw', 'end', 'complete') THEN RAISE EXCEPTION 'invalid_input: unknown action'; END IF;
  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN RAISE EXCEPTION 'invalid_input: reason too long (500 characters max)'; END IF;

  SELECT * INTO v_row FROM public.mentorships WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  -- The mentee's campus decides (same rule as the mentorship RLS scope); NULL / GLOBAL campus = Super Admin only.
  v_is_admin := public.auth_is_super_admin()
                OR public.can_admin_campus((SELECT p.campus_code FROM public.profiles p WHERE p.id = v_row.student_id));

  IF v_uid NOT IN (v_row.student_id, v_row.mentor_id) AND NOT (v_is_admin AND p_action <> 'withdraw') THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  v_other := CASE WHEN v_uid = v_row.student_id THEN v_row.mentor_id ELSE v_row.student_id END;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;

  IF p_action = 'withdraw' THEN
    IF v_uid <> v_row.student_id THEN RAISE EXCEPTION 'not_allowed: only the student can withdraw a request'; END IF;
    IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'wrong_state: only a pending request can be withdrawn'; END IF;
    UPDATE public.mentorships SET status = 'withdrawn', ended_at = now(), ended_by = v_uid, last_activity_at = now(), updated_at = now()
     WHERE id = p_id RETURNING * INTO v_row;
    PERFORM public.mentorship_notify(v_other, v_uid, 'Mentorship request withdrawn',
      format('%s withdrew their mentorship request.', COALESCE(v_me.full_name, 'The student')), '/mentorship/' || p_id::text);
  ELSE
    IF v_row.status <> 'active' THEN RAISE EXCEPTION 'wrong_state: this mentorship is not active'; END IF;
    UPDATE public.mentorships
       SET status = CASE WHEN p_action = 'complete' THEN 'completed' ELSE 'ended' END,
           end_reason = v_reason, ended_at = now(), ended_by = v_uid, last_activity_at = now(), updated_at = now()
     WHERE id = p_id RETURNING * INTO v_row;
    UPDATE public.mentorship_sessions SET status = 'cancelled', updated_at = now()
     WHERE mentorship_id = p_id AND status IN ('proposed', 'confirmed');

    IF v_uid IN (v_row.student_id, v_row.mentor_id) THEN
      PERFORM public.mentorship_notify(v_other, v_uid,
        CASE WHEN p_action = 'complete' THEN 'Mentorship completed' ELSE 'Mentorship ended' END,
        CASE WHEN p_action = 'complete' THEN format('%s marked your mentorship as complete.', COALESCE(v_me.full_name, 'The other person'))
             ELSE format('%s ended your mentorship.', COALESCE(v_me.full_name, 'The other person')) END,
        '/mentorship/' || p_id::text);
    ELSE
      PERFORM public.mentorship_notify(v_row.student_id, v_uid, 'Mentorship ended by campus staff',
        format('Campus staff ended this mentorship.%s', CASE WHEN v_reason IS NOT NULL THEN ' Reason: ' || v_reason ELSE '' END),
        '/mentorship/' || p_id::text);
      PERFORM public.mentorship_notify(v_row.mentor_id, v_uid, 'Mentorship ended by campus staff',
        format('Campus staff ended this mentorship.%s', CASE WHEN v_reason IS NOT NULL THEN ' Reason: ' || v_reason ELSE '' END),
        '/mentorship/' || p_id::text);
    END IF;
  END IF;

  RETURN v_row;
END
$$;

CREATE OR REPLACE FUNCTION public.assign_forum_community_moderator(p_community_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_created_by uuid;
  v_campus text;
  v_target_campus text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Only the community owner or an administrator can add moderators'; END IF;
  SELECT fc.created_by, fc.campus_code INTO v_created_by, v_campus FROM public.forum_communities fc WHERE fc.id = p_community_id;
  IF NOT FOUND OR NOT (v_created_by = auth.uid() OR public.can_admin_campus(v_campus)) THEN
    RAISE EXCEPTION 'Only the community owner or an administrator can add moderators';
  END IF;

  SELECT p.campus_code INTO v_target_campus FROM public.profiles p WHERE p.id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'The selected user no longer exists'; END IF;
  -- a campus space is moderated by that campus' members (GLOBAL spaces by anyone)
  IF v_campus IS NOT NULL AND v_campus <> 'GLOBAL' AND v_target_campus IS DISTINCT FROM v_campus AND v_target_campus IS DISTINCT FROM 'GLOBAL'
     AND NOT public.auth_is_super_admin() THEN
    RAISE EXCEPTION 'Moderators of a campus space must belong to that campus';
  END IF;

  INSERT INTO public.forum_community_moderators (community_id, user_id, added_by)
  VALUES (p_community_id, p_user_id, auth.uid())
  ON CONFLICT (community_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.unassign_forum_community_moderator(p_community_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_created_by uuid;
  v_campus text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Only the community owner or an administrator can remove moderators'; END IF;
  SELECT fc.created_by, fc.campus_code INTO v_created_by, v_campus FROM public.forum_communities fc WHERE fc.id = p_community_id;
  IF NOT FOUND OR NOT (v_created_by = auth.uid() OR public.can_admin_campus(v_campus)) THEN
    RAISE EXCEPTION 'Only the community owner or an administrator can remove moderators';
  END IF;
  DELETE FROM public.forum_community_moderators WHERE community_id = p_community_id AND user_id = p_user_id;
END;
$$;

-- suspend_user_account(): authority comes from can_admin_campus(<target campus>) only. A campus-less / GLOBAL
-- staff member or an admin without a real campus has NO authority (it used to be "GLOBAL staff may moderate
-- everyone" and "NULL = NULL" for admins).
CREATE OR REPLACE FUNCTION public.suspend_user_account(p_target_user_id uuid, p_reason text DEFAULT 'Moderation policy violation')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_caller_admin_role text;
  v_caller_email text;
  v_caller_suspended boolean;
  v_target_role text;
  v_target_admin_role text;
  v_target_campus text;
  v_target_email text;
  v_target_suspended boolean;
  v_reason text;
  v_other_admins int;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000'; END IF;
  IF p_target_user_id IS NULL THEN RAISE EXCEPTION 'Target user is required.'; END IF;
  IF v_caller = p_target_user_id THEN RAISE EXCEPTION 'You cannot suspend your own account.' USING ERRCODE = '42501'; END IF;

  SELECT role::text, admin_role, LOWER(COALESCE(email, '')), COALESCE(is_suspended, false)
    INTO v_caller_role, v_caller_admin_role, v_caller_email, v_caller_suspended
    FROM public.profiles WHERE id = v_caller;

  IF v_caller_role IS NULL OR v_caller_suspended THEN
    RAISE EXCEPTION 'Insufficient permissions to suspend user accounts.' USING ERRCODE = '42501';
  END IF;

  SELECT role::text, admin_role, campus_code, LOWER(COALESCE(email, '')), COALESCE(is_suspended, false)
    INTO v_target_role, v_target_admin_role, v_target_campus, v_target_email, v_target_suspended
    FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target user not found.'; END IF;

  IF v_target_email = 'inememmanuel@gmail.com' THEN
    RAISE EXCEPTION 'The primary root administrator cannot be suspended.' USING ERRCODE = '42501';
  END IF;

  IF public.auth_is_super_admin() THEN
    IF v_target_role = 'admin' AND NOT v_target_suspended THEN
      PERFORM pg_advisory_xact_lock(hashtext('lioris.last_active_admin'));
      SELECT count(*) INTO v_other_admins
        FROM public.profiles p
       WHERE p.id <> p_target_user_id AND p.role::text = 'admin' AND NOT COALESCE(p.is_suspended, false);
      IF v_other_admins = 0 THEN
        RAISE EXCEPTION 'Cannot suspend the last active administrator.' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF v_caller_role = 'admin' THEN
    IF v_target_role = 'admin' OR v_target_admin_role = 'super_admin' THEN
      RAISE EXCEPTION 'Campus Admins cannot suspend administrator accounts.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.can_admin_campus(v_target_campus) THEN
      RAISE EXCEPTION 'Campus Admins cannot moderate users outside their registered campus node.' USING ERRCODE = '42501';
    END IF;
  ELSIF v_caller_role = 'staff' THEN
    IF v_target_role NOT IN ('student', 'alumni') THEN
      RAISE EXCEPTION 'Staff cannot suspend admin or staff accounts.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.can_admin_campus(v_target_campus) THEN
      RAISE EXCEPTION 'Staff cannot moderate users outside their registered campus node.' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Insufficient permissions to suspend user accounts.' USING ERRCODE = '42501';
  END IF;

  IF v_target_suspended THEN
    RETURN jsonb_build_object('success', true, 'message', 'User account is already suspended.');
  END IF;

  v_reason := left(COALESCE(NULLIF(btrim(p_reason), ''), 'Moderation policy violation'), 500);

  PERFORM set_config('lioris.audit_skip', 'is_suspended', true);
  UPDATE public.profiles SET is_suspended = true, suspension_reason = v_reason WHERE id = p_target_user_id;
  PERFORM set_config('lioris.audit_skip', '', true);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_caller, 'user_suspended', 'user', p_target_user_id,
          jsonb_build_object('summary', 'Account suspended via suspend_user_account()', 'reason', v_reason,
                             'actorRole', v_caller_role, 'targetRole', v_target_role,
                             'targetCampus', v_target_campus, 'source', 'suspend_user_account'));

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE WHEN public.auth_is_super_admin() THEN 'User account permanently suspended by Super Admin.'
                    WHEN v_caller_role = 'admin' THEN 'User account permanently suspended by Campus Admin.'
                    ELSE 'User account suspended by Campus Staff.' END);
END;
$$;

-- admin_delete_chat_message(): Super Admin anywhere; a Campus Admin / staff member ONLY when the sender and
-- every member of the channel belong to their campus (a cross-campus DM is never reachable this way).
CREATE OR REPLACE FUNCTION public.admin_delete_chat_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender uuid;
  v_channel uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF COALESCE(public.auth_profile_role(), '') NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'not_allowed: moderator-only action';
  END IF;

  SELECT sender_id, channel_id INTO v_sender, v_channel FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: message does not exist'; END IF;

  IF NOT public.auth_is_super_admin() THEN
    IF NOT public.can_admin_campus((SELECT p.campus_code FROM public.profiles p WHERE p.id = v_sender))
       OR EXISTS (
         SELECT 1 FROM public.chat_channel_members m
         LEFT JOIN public.profiles p ON p.id = m.user_id
         WHERE m.channel_id = v_channel AND NOT public.can_admin_campus(p.campus_code)
       ) THEN
      RAISE EXCEPTION 'not_allowed: this conversation includes members outside your campus';
    END IF;
  END IF;

  DELETE FROM public.chat_messages WHERE id = p_message_id;
END
$$;

-- ----------------------------------------------------------------------------
-- 11. Takedown abuse
-- ----------------------------------------------------------------------------
-- Any signed-in account could hide any resource instantly by filing an "owner_removal" claim. Now:
--   * the filer must be verified and onboarded;
--   * only the UPLOADER's own removal request takes effect on the spot; everyone else's claim is queued as
--     'pending' for a reviewer and does not change what other people can see;
--   * at most one instant hide per resource per day and 50 instant hides per day platform-wide;
--   * only the admins responsible for the resource's campus (and Super Admins) are alerted.
CREATE OR REPLACE FUNCTION public.submit_takedown_request(
  p_resource_id uuid, p_claim_type text, p_claimant_name text, p_claimant_email text,
  p_claimant_role text, p_details text, p_good_faith boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_res         public.resources%ROWTYPE;
  v_name        text := btrim(coalesce(p_claimant_name, ''));
  v_email       text := btrim(coalesce(p_claimant_email, ''));
  v_details     text := btrim(coalesce(p_details, ''));
  v_rights_claim boolean := p_claim_type IN ('owner_removal', 'agent_removal');
  v_hide        boolean := false;
  v_id          uuid;
  v_admin       uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to submit a request.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_profile_verified(v_uid)
     OR NOT COALESCE((SELECT p.onboarding_complete FROM public.profiles p WHERE p.id = v_uid), false) THEN
    RAISE EXCEPTION 'Verify your account and finish onboarding before filing a takedown request.' USING ERRCODE = '42501';
  END IF;
  IF p_claim_type NOT IN ('owner_removal', 'agent_removal', 'third_party_copyright', 'inappropriate', 'inaccurate') THEN
    RAISE EXCEPTION 'Unknown request type.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Please enter your full name.' USING ERRCODE = '22023';
  END IF;
  IF v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_email) > 254 THEN
    RAISE EXCEPTION 'Please enter a valid contact email address.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_details) < 10 OR char_length(v_details) > 2000 THEN
    RAISE EXCEPTION 'Please describe your request in 10 to 2000 characters.' USING ERRCODE = '22023';
  END IF;
  IF p_claim_type IN ('owner_removal', 'agent_removal', 'third_party_copyright') AND p_good_faith IS NOT TRUE THEN
    RAISE EXCEPTION 'You must confirm the statement before submitting a copyright request.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_res FROM public.resources WHERE id = p_resource_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That resource no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  IF (SELECT count(*) FROM public.resource_takedown_requests
        WHERE reporter_id = v_uid AND created_at > now() - interval '24 hours') >= 10 THEN
    RAISE EXCEPTION 'You have sent too many requests today. Please try again tomorrow.' USING ERRCODE = '54000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.resource_takedown_requests
              WHERE reporter_id = v_uid AND resource_id = p_resource_id AND status = 'pending') THEN
    RAISE EXCEPTION 'You already have a request open for this resource.' USING ERRCODE = '23505';
  END IF;

  -- Instant effect only for the uploader withdrawing their own file, inside the daily caps.
  v_hide := v_rights_claim AND p_good_faith IS TRUE AND v_res.uploader_id IS NOT DISTINCT FROM v_uid
            AND (SELECT count(*) FROM public.resource_takedown_requests
                  WHERE resource_id = v_res.id AND auto_hidden AND created_at > now() - interval '24 hours') < 1
            AND (SELECT count(*) FROM public.resource_takedown_requests
                  WHERE auto_hidden AND created_at > now() - interval '24 hours') < 50;

  INSERT INTO public.resource_takedown_requests
    (resource_id, resource_title, resource_course, resource_uploader, resource_file_url, reporter_id,
     claim_type, claimant_name, claimant_email, claimant_role, details, good_faith, auto_hidden)
  VALUES
    (v_res.id, v_res.title, v_res.course_code, v_res.uploader_id, v_res.file_url, v_uid,
     p_claim_type, v_name, v_email, nullif(btrim(coalesce(p_claimant_role, '')), ''), v_details,
     coalesce(p_good_faith, false), v_hide)
  RETURNING id INTO v_id;

  IF v_hide THEN
    PERFORM set_config('lioris.takedown_action', 'on', true);
    UPDATE public.resources SET is_approved = false, takedown_status = 'disabled' WHERE id = v_res.id;
    PERFORM set_config('lioris.takedown_action', 'off', true);
  END IF;

  FOR v_admin IN
    SELECT p.id FROM public.profiles p
    WHERE p.role = 'admin' AND coalesce(p.is_suspended, false) = false
      AND (p.admin_role = 'super_admin' OR (p.campus_code IS NOT NULL AND p.campus_code = v_res.campus_code))
  LOOP
    INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
    VALUES (v_admin, v_uid,
            CASE WHEN v_hide THEN 'Copyright takedown: resource hidden' ELSE 'New resource report' END,
            '"' || left(v_res.title, 120) || '" - ' || replace(p_claim_type, '_', ' ') || '. Review it in Takedown Requests.',
            'system', '/notifications', false);
  END LOOP;

  RETURN jsonb_build_object('id', v_id, 'auto_hidden', v_hide);
END
$$;

-- record_user_activity(): analytics must not trust a caller-supplied campus (it let anybody pour rows into any
-- campus' dashboard) and is no longer reachable signed-out.
CREATE OR REPLACE FUNCTION public.record_user_activity(
  p_event_type text, p_name text, p_campus_code text DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_campus TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT campus_code INTO v_campus FROM public.profiles WHERE id = v_uid;
  IF p_campus_code IS NOT NULL AND p_campus_code <> '' AND public.auth_is_super_admin()
     AND EXISTS (SELECT 1 FROM public.campuses c WHERE c.code = p_campus_code) THEN
    v_campus := p_campus_code;
  END IF;

  INSERT INTO public.analytics_events (user_id, event_type, name, campus_code, metadata, created_at)
  VALUES (v_uid, left(COALESCE(p_event_type, 'event'), 40), left(COALESCE(p_name, ''), 200), COALESCE(v_campus, 'GLOBAL'),
          CASE WHEN pg_column_size(COALESCE(p_metadata, '{}'::jsonb)) > 4000 THEN '{}'::jsonb ELSE COALESCE(p_metadata, '{}'::jsonb) END,
          NOW());

  IF p_event_type = 'session_start' THEN
    UPDATE public.profiles SET last_active_at = NOW(), last_login_at = NOW() WHERE id = v_uid;
  ELSE
    UPDATE public.profiles SET last_active_at = NOW() WHERE id = v_uid;
  END IF;
END;
$$;

-- open_giving_page(): needs a signed-in member, and the campaign must be visible to them.
CREATE OR REPLACE FUNCTION public.open_giving_page(p_campaign uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_available: Sign in to open a giving page.'; END IF;
  IF NOT public.donations_enabled() THEN
    RAISE EXCEPTION 'donations_disabled: Giving is not open yet.';
  END IF;
  SELECT * INTO v_campaign FROM public.giving_campaigns WHERE id = p_campaign;
  IF v_campaign IS NULL OR v_campaign.review_status <> 'approved' OR v_campaign.is_closed
     OR NOT (v_campaign.campus_code IS NULL OR v_campaign.campus_code = 'GLOBAL'
             OR v_campaign.campus_code = public.auth_campus_access()
             OR public.can_admin_campus(v_campaign.campus_code)) THEN
    RAISE EXCEPTION 'not_available: This campaign is not currently accepting gifts.';
  END IF;

  INSERT INTO public.giving_campaign_clicks (campaign_id, user_id) VALUES (p_campaign, auth.uid());
  RETURN v_campaign.giving_url;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Counters: forged likes / comments / downloads / upvotes / applications
-- ----------------------------------------------------------------------------
-- The legitimate writers are SECURITY DEFINER triggers / RPCs (they run as the table owner, or nested inside
-- another trigger). A direct client write (role authenticated / anon) is reset to 0 on INSERT and to the old
-- value on UPDATE unless the caller is the service role or a Super Admin.
CREATE OR REPLACE FUNCTION public.guard_counter_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  c text;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;                       -- nested: a counter-maintenance trigger
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF; -- definer RPC / owner / service connection
  IF auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;
  IF public.auth_is_super_admin() THEN RETURN NEW; END IF;

  FOREACH c IN ARRAY TG_ARGV LOOP
    IF TG_OP = 'INSERT' THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object(c, 0));
    ELSE
      NEW := jsonb_populate_record(NEW, jsonb_build_object(c, to_jsonb(OLD) -> c));
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DO $cnt$
BEGIN
  IF to_regclass('public.posts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_guard_counters ON public.posts;
    CREATE TRIGGER trg_guard_counters BEFORE INSERT OR UPDATE ON public.posts
      FOR EACH ROW EXECUTE FUNCTION public.guard_counter_columns('likes_count', 'comments_count');
  END IF;
  IF to_regclass('public.resources') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_guard_counters ON public.resources;
    CREATE TRIGGER trg_guard_counters BEFORE INSERT OR UPDATE ON public.resources
      FOR EACH ROW EXECUTE FUNCTION public.guard_counter_columns('downloads_count', 'upvotes_count');
  END IF;
  IF to_regclass('public.jobs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_guard_counters ON public.jobs;
    CREATE TRIGGER trg_guard_counters BEFORE INSERT OR UPDATE ON public.jobs
      FOR EACH ROW EXECUTE FUNCTION public.guard_counter_columns('applications_count');
  END IF;
END
$cnt$;

-- ----------------------------------------------------------------------------
-- 5. Campus / visibility immutability + the campus-wall INSERT bypass
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_campus_scope_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;   -- definer RPC / owner / service connection
  IF auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;
  IF public.auth_is_super_admin() THEN RETURN NEW; END IF;

  NEW := jsonb_populate_record(NEW, jsonb_build_object('campus_code', to_jsonb(OLD) -> 'campus_code'));
  IF TG_TABLE_NAME IN ('posts', 'events')
     AND COALESCE(public.auth_profile_role(), '') NOT IN ('admin', 'staff') THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('visibility_scope', to_jsonb(OLD) -> 'visibility_scope'));
  END IF;
  RETURN NEW;
END;
$$;

DO $imm$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['posts', 'events', 'marketplace_listings', 'study_groups', 'announcements', 'jobs', 'giving_campaigns'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_guard_campus_scope ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_guard_campus_scope BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_campus_scope_columns()', t);
  END LOOP;
END
$imm$;

-- Permissive INSERT policies are ORed, so a policy without a campus check made the checked one pointless.
DO $ins$
BEGIN
  IF to_regclass('public.posts') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Verified users can create posts" ON public.posts;
    CREATE POLICY "Verified users can create posts" ON public.posts
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = author_id
        AND public.is_profile_verified(auth.uid())
        AND (
          visibility_scope = 'global'
          OR campus_code IS NULL OR campus_code = 'GLOBAL'
          OR campus_code = public.auth_campus_access()
          OR public.auth_profile_role() IN ('admin', 'staff')
        )
      );
  END IF;

  IF to_regclass('public.marketplace_listings') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Students, staff and admin can create marketplace listings" ON public.marketplace_listings;
    CREATE POLICY "Students, staff and admin can create marketplace listings" ON public.marketplace_listings
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = seller_id
        AND NOT COALESCE((SELECT p.is_suspended FROM public.profiles p WHERE p.id = auth.uid()), false)
        AND (
          public.auth_profile_role() IN ('admin', 'staff')
          OR (public.auth_profile_role() = 'student'
              AND (campus_code IS NULL OR campus_code = 'GLOBAL' OR campus_code = public.auth_profile_campus()))
        )
      );
    DROP POLICY IF EXISTS "Verified students, staff and admin can create marketplace listings" ON public.marketplace_listings;
    CREATE POLICY "Verified students, staff and admin can create marketplace listings" ON public.marketplace_listings
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = seller_id
        AND public.is_profile_verified(auth.uid())
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('student', 'staff', 'admin'))
        AND (
          campus_code IS NULL OR campus_code = 'GLOBAL'
          OR campus_code = public.auth_campus_access()
          OR public.auth_profile_role() IN ('admin', 'staff')
        )
      );
  END IF;

  IF to_regclass('public.study_groups') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Verified users can create study groups" ON public.study_groups;
    CREATE POLICY "Verified users can create study groups" ON public.study_groups
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = creator_id
        AND public.is_profile_verified(auth.uid())
        AND (
          campus_code IS NULL OR campus_code = 'GLOBAL'
          OR campus_code = public.auth_campus_access()
          OR public.auth_profile_role() IN ('admin', 'staff')
        )
      );
  END IF;

  IF to_regclass('public.events') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Verified users can create events" ON public.events;
    CREATE POLICY "Verified users can create events" ON public.events
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = creator_id
        AND status = 'pending_approval'
        AND public.is_profile_verified(auth.uid())
        AND (
          campus_code IS NULL OR campus_code = 'GLOBAL'
          OR campus_code = public.auth_campus_access()
          OR public.auth_profile_role() IN ('admin', 'staff')
        )
      );
  END IF;

  IF to_regclass('public.jobs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Alumni, staff and admin can create jobs" ON public.jobs;
    CREATE POLICY "Alumni, staff and admin can create jobs" ON public.jobs
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = poster_id
        AND public.is_profile_verified(auth.uid())
        AND public.has_role_permission('can_post_jobs')
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('alumni', 'staff', 'admin'))
        AND (
          campus_code IS NULL OR campus_code::text = 'GLOBAL'
          OR campus_code::text = public.auth_campus_access()
          OR public.auth_profile_role() IN ('admin', 'staff')
        )
      );
  END IF;

  IF to_regclass('public.giving_campaigns') IS NOT NULL THEN
    DROP POLICY IF EXISTS "A member proposes a giving campaign, held for review" ON public.giving_campaigns;
    CREATE POLICY "A member proposes a giving campaign, held for review" ON public.giving_campaigns
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = creator_id
        AND public.is_profile_verified(auth.uid())
        AND (
          campus_code IS NULL OR campus_code = 'GLOBAL'
          OR campus_code = public.auth_campus_access()
          OR public.auth_profile_role() IN ('admin', 'staff')
        )
      );
  END IF;
END
$ins$;

-- 20261029 regression: the restrictive UPDATE policy's WITH CHECK accepted "owner = me OR campus = mine", so a
-- scoped admin could move one of their OWN rows to another campus. The new row must now sit on the admin's own
-- campus (USING keeps the owner clause so they can still open and edit their own rows).
DO $upd$
DECLARE
  t text;
  v_owner text;
  v_cols text[];
  c text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'analytics_events', 'announcements', 'events', 'forum_communities', 'giving_campaigns', 'jobs',
    'marketplace_listings', 'portal_links', 'posts', 'study_groups'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    SELECT array_agg(column_name::text) INTO v_cols FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t;
    IF NOT ('campus_code' = ANY (v_cols)) THEN CONTINUE; END IF;
    v_owner := 'NULL::uuid';
    FOREACH c IN ARRAY ARRAY['author_id', 'creator_id', 'seller_id', 'poster_id', 'uploader_id', 'user_id'] LOOP
      IF c = ANY (v_cols) THEN v_owner := quote_ident(c); EXIT; END IF;
    END LOOP;

    EXECUTE format('DROP POLICY IF EXISTS scope_privileged_update ON public.%I', t);
    EXECUTE format($f$CREATE POLICY scope_privileged_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
      USING ((SELECT NOT public.is_scoped_privileged()) OR COALESCE(%s = auth.uid(), false) OR campus_code = (SELECT public.auth_profile_campus()))
      WITH CHECK ((SELECT NOT public.is_scoped_privileged()) OR campus_code = (SELECT public.auth_profile_campus()))$f$,
      t, v_owner);
  END LOOP;
END
$upd$;

-- ----------------------------------------------------------------------------
-- 2. Chat, notifications, connections, blocks, mentorships: only a Super Admin keeps the override
-- ----------------------------------------------------------------------------
DO $drop$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('chat_messages',        'Chat messages viewable only by channel members'),
      ('chat_messages',        'Senders and admins can delete messages'),
      ('chat_messages',        'Senders and channel members can update message status'),
      ('chat_channels',        'Admins can manage chat channels'),
      ('chat_channels',        'Users can view channels they belong to'),
      ('chat_channel_members', 'Admins can remove members from chat channels'),
      ('chat_channel_members', 'Channel members viewable by channel participants'),
      ('chat_channel_members', 'Members or admins can add members to channels'),
      ('chat_channel_members', 'chat_channel_members_insert'),
      ('notifications',        'Users can delete own notifications'),
      ('notifications',        'Users can update own notification read state'),
      ('notifications',        'Users can view own notifications'),
      ('notifications',        'notifications_insert_authenticated'),
      ('notifications',        'notifications_insert_checked'),
      ('connections',          'Connections viewable by participants or admin'),
      ('connections',          'Participants can delete connections'),
      ('connections',          'Recipient can respond to connection requests'),
      ('user_blocks',          'Admins have full access to user blocks'),
      ('mentorships',          'Admins manage mentorships'),
      ('mentorships',          'Mentorships viewable by student, mentor, or admin'),
      ('mentorship_feedback',  'mentorship_feedback_select')
    ) AS x(t, pol)
  LOOP
    IF to_regclass('public.' || r.t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.pol, r.t);
    END IF;
  END LOOP;
END
$drop$;

DO $chat$
BEGIN
  IF to_regclass('public.chat_messages') IS NOT NULL THEN
    CREATE POLICY "Chat messages viewable only by channel members" ON public.chat_messages
      FOR SELECT TO authenticated USING (public.is_channel_member(channel_id) OR public.auth_is_super_admin());
    CREATE POLICY "Senders and admins can delete messages" ON public.chat_messages
      FOR DELETE TO authenticated USING (auth.uid() = sender_id OR public.auth_is_super_admin());
    CREATE POLICY "Senders and channel members can update message status" ON public.chat_messages
      FOR UPDATE TO authenticated USING (auth.uid() = sender_id OR public.is_channel_member(channel_id) OR public.auth_is_super_admin());
  END IF;
  IF to_regclass('public.chat_channels') IS NOT NULL THEN
    CREATE POLICY "Admins can manage chat channels" ON public.chat_channels
      FOR ALL TO authenticated USING (public.auth_is_super_admin()) WITH CHECK (public.auth_is_super_admin());
    CREATE POLICY "Users can view channels they belong to" ON public.chat_channels
      FOR SELECT TO authenticated USING (public.is_channel_member(id) OR public.auth_is_super_admin());
  END IF;
  IF to_regclass('public.chat_channel_members') IS NOT NULL THEN
    CREATE POLICY "Admins can remove members from chat channels" ON public.chat_channel_members
      FOR DELETE TO authenticated USING (public.auth_is_super_admin());
    CREATE POLICY "Channel members viewable by channel participants" ON public.chat_channel_members
      FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR public.is_channel_member(channel_id) OR public.auth_is_super_admin());
  END IF;
END
$chat$;

-- 8. Forced group membership. ONE insert policy (20261101 and 20261102 each left one, ORed together, and the
--    later one let anybody add themselves to ANY channel by id). Rules, evaluated by a definer helper so the
--    channel row is visible even to a non-member:
--      * nobody can add a user who blocked them / whom they blocked;
--      * you may re-assert your own membership (the client upserts it before sending);
--      * only the channel's CREATOR adds other people; a direct message never holds more than two people;
--        in a group channel the added member must share the creator's campus (or either side is GLOBAL);
--      * self-service joining is limited to system (creator-less) group channels on your own campus / GLOBAL;
--      * Super Admin: unrestricted. A Campus Admin has NO way into a conversation they are not part of.
CREATE OR REPLACE FUNCTION public.can_add_channel_member(p_channel uuid, p_user uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_campus text;
  v_target_campus text;
  c record;
  v_members int;
BEGIN
  IF v_actor IS NULL OR p_user IS NULL THEN RETURN false; END IF;
  SELECT p.campus_code INTO v_actor_campus FROM public.profiles p WHERE p.id = v_actor AND NOT COALESCE(p.is_suspended, false);
  IF NOT FOUND THEN RETURN false; END IF;
  IF public.auth_is_super_admin() THEN RETURN true; END IF;

  SELECT ch.id, ch.created_by, COALESCE(ch.is_direct_message, false) AS is_dm, ch.campus_code INTO c
    FROM public.chat_channels ch WHERE ch.id = p_channel;
  IF NOT FOUND THEN RETURN false; END IF;

  IF p_user <> v_actor AND public.users_have_block(v_actor, p_user) THEN RETURN false; END IF;

  IF p_user = v_actor THEN
    IF EXISTS (SELECT 1 FROM public.chat_channel_members m WHERE m.channel_id = p_channel AND m.user_id = v_actor) THEN RETURN true; END IF;
    IF c.created_by = v_actor THEN RETURN true; END IF;
    RETURN NOT c.is_dm AND c.created_by IS NULL
           AND (c.campus_code IS NULL OR c.campus_code = 'GLOBAL' OR c.campus_code = public.auth_campus_access());
  END IF;

  -- adding somebody else: creator only
  IF c.created_by IS DISTINCT FROM v_actor THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.chat_channel_members m WHERE m.channel_id = p_channel AND m.user_id = p_user) THEN RETURN true; END IF;

  IF c.is_dm THEN
    SELECT count(*) INTO v_members FROM public.chat_channel_members m WHERE m.channel_id = p_channel;
    RETURN v_members < 2;
  END IF;

  SELECT p.campus_code INTO v_target_campus FROM public.profiles p WHERE p.id = p_user;
  RETURN v_target_campus IS NOT NULL
         AND (v_target_campus = v_actor_campus OR v_target_campus = 'GLOBAL' OR v_actor_campus = 'GLOBAL')
         AND (c.campus_code IS NULL OR c.campus_code = 'GLOBAL' OR c.campus_code = v_target_campus OR v_target_campus = 'GLOBAL');
END;
$$;

DO $cm$
BEGIN
  IF to_regclass('public.chat_channel_members') IS NOT NULL AND to_regclass('public.chat_channels') IS NOT NULL THEN
    CREATE POLICY "chat_channel_members_insert" ON public.chat_channel_members
      FOR INSERT TO authenticated
      WITH CHECK (public.can_add_channel_member(channel_id, user_id));
  END IF;
END
$cm$;

DO $notif$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    CREATE POLICY "Users can view own notifications" ON public.notifications
      FOR SELECT TO authenticated USING (auth.uid() = recipient_id OR public.auth_is_super_admin());
    CREATE POLICY "Users can update own notification read state" ON public.notifications
      FOR UPDATE TO authenticated
      USING (auth.uid() = recipient_id OR public.auth_is_super_admin())
      WITH CHECK (auth.uid() = recipient_id OR public.auth_is_super_admin());
    CREATE POLICY "Users can delete own notifications" ON public.notifications
      FOR DELETE TO authenticated USING (auth.uid() = recipient_id OR public.auth_is_super_admin());
  END IF;
  IF to_regclass('public.connections') IS NOT NULL THEN
    CREATE POLICY "Connections viewable by participants or admin" ON public.connections
      FOR SELECT TO authenticated USING (auth.uid() IN (requester_id, recipient_id) OR public.auth_is_super_admin());
    CREATE POLICY "Participants can delete connections" ON public.connections
      FOR DELETE TO authenticated USING (auth.uid() IN (requester_id, recipient_id) OR public.auth_is_super_admin());
    CREATE POLICY "Recipient can respond to connection requests" ON public.connections
      FOR UPDATE TO authenticated
      USING ((auth.uid() = recipient_id AND status = 'pending') OR public.auth_is_super_admin())
      WITH CHECK ((auth.uid() = recipient_id AND status IN ('accepted', 'declined')) OR public.auth_is_super_admin());
  END IF;
  IF to_regclass('public.user_blocks') IS NOT NULL THEN
    CREATE POLICY "Admins have full access to user blocks" ON public.user_blocks
      FOR ALL TO authenticated USING (public.auth_is_super_admin()) WITH CHECK (public.auth_is_super_admin());
  END IF;
  IF to_regclass('public.mentorships') IS NOT NULL THEN
    CREATE POLICY "Admins manage mentorships" ON public.mentorships
      FOR ALL TO authenticated
      USING (public.auth_is_super_admin() OR public.can_admin_campus(public.campus_of(student_id)))
      WITH CHECK (public.auth_is_super_admin() OR public.can_admin_campus(public.campus_of(student_id)));
    CREATE POLICY "Mentorships viewable by student, mentor, or admin" ON public.mentorships
      FOR SELECT TO authenticated
      USING (auth.uid() = student_id OR auth.uid() = mentor_id OR public.can_admin_campus(public.campus_of(student_id)));
  END IF;
  IF to_regclass('public.mentorship_feedback') IS NOT NULL AND to_regclass('public.mentorships') IS NOT NULL THEN
    CREATE POLICY "mentorship_feedback_select" ON public.mentorship_feedback
      FOR SELECT TO authenticated
      USING (from_user = auth.uid() OR to_user = auth.uid()
             OR EXISTS (SELECT 1 FROM public.mentorships m
                        WHERE m.id = mentorship_feedback.mentorship_id
                          AND public.can_admin_campus(public.campus_of(m.student_id))));
  END IF;
END
$notif$;

-- ----------------------------------------------------------------------------
-- 7. Notification spam / spoofing
-- ----------------------------------------------------------------------------
-- The client really does insert peer notifications itself (connection request / accepted, call invite,
-- "you were mentioned", moderator and admin messages, announcement fan-out), so the table keeps its INSERT
-- policy, but it is now constrained:
--   * sender_id is always the caller (a BEFORE INSERT trigger rewrites it - incl. admins, incl. NULL);
--   * action_url must be a relative in-app path;
--   * students / alumni: type 'message' or 'system', recipients on the same campus (or GLOBAL), or a person
--     they share a chat / connection with, never someone with a block either way; 120 per hour;
--   * admin / staff: recipients on their own campus (or GLOBAL members) only; Super Admin: anyone;
--   * notifications created by SECURITY DEFINER code (triggers, RPCs) are not touched.
CREATE TABLE IF NOT EXISTS public.notification_send_log (
  id         bigserial PRIMARY KEY,
  sender_id  uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_send_log_sender ON public.notification_send_log (sender_id, created_at DESC);
ALTER TABLE public.notification_send_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_send_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notification_send_log TO service_role;
-- RLS is on and there is deliberately NO policy: members can "read" the table (no 42501 noise in generic table
-- sweeps) but never see a row. Only the SECURITY DEFINER limiter writes to it.
GRANT SELECT ON public.notification_send_log TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_notification_rate()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_n int;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT p.role::text INTO v_role FROM public.profiles p WHERE p.id = v_uid;
  IF v_role IN ('admin', 'staff') THEN RETURN; END IF;     -- announcement fan-out; campus-restricted by the policy
  SELECT count(*) INTO v_n FROM public.notification_send_log WHERE sender_id = v_uid AND created_at > now() - interval '1 hour';
  IF v_n >= 120 THEN
    RAISE EXCEPTION 'Rate limit: too many notifications sent - please wait a while' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.notification_send_log (sender_id) VALUES (v_uid);
  DELETE FROM public.notification_send_log WHERE sender_id = v_uid AND created_at < now() - interval '2 hours';
END;
$$;

CREATE OR REPLACE FUNCTION public.can_insert_notification(p_recipient uuid, p_sender uuid, p_type text, p_url text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_my_campus text;
  v_rec_campus text;
  v_susp boolean;
BEGIN
  IF pg_trigger_depth() > 0 THEN RETURN true; END IF;          -- written by system trigger code, not by a client
  IF v_uid IS NULL OR p_recipient IS NULL THEN RETURN false; END IF;
  IF p_sender IS NOT NULL AND p_sender <> v_uid THEN RETURN false; END IF;
  IF p_url IS NOT NULL AND NOT (p_url ~ '^/[A-Za-z0-9/_().?=&%#:~@+,-]*$' AND p_url !~ '^//' AND length(p_url) <= 300) THEN
    RETURN false;
  END IF;

  SELECT p.role::text, p.campus_code, COALESCE(p.is_suspended, false) INTO v_role, v_my_campus, v_susp
    FROM public.profiles p WHERE p.id = v_uid;
  IF NOT FOUND OR v_susp THEN RETURN false; END IF;
  SELECT p.campus_code INTO v_rec_campus FROM public.profiles p WHERE p.id = p_recipient;
  IF NOT FOUND THEN RETURN false; END IF;

  IF p_recipient = v_uid THEN RETURN true; END IF;
  IF public.users_have_block(v_uid, p_recipient) THEN RETURN false; END IF;

  IF public.auth_is_super_admin() THEN RETURN true; END IF;

  IF v_role IN ('admin', 'staff') AND v_my_campus IS NOT NULL AND v_my_campus <> 'GLOBAL'
     AND (v_rec_campus = v_my_campus OR v_rec_campus = 'GLOBAL') AND public.admin_aal2_ok() THEN
    RETURN true;
  END IF;

  -- peer notifications
  IF p_type IS NULL OR p_type NOT IN ('message', 'system') THEN RETURN false; END IF;
  IF v_my_campus IS NOT DISTINCT FROM v_rec_campus OR v_my_campus = 'GLOBAL' OR v_rec_campus = 'GLOBAL' THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.chat_channel_members a JOIN public.chat_channel_members b ON a.channel_id = b.channel_id
                  WHERE a.user_id = v_uid AND b.user_id = p_recipient)
      OR EXISTS (SELECT 1 FROM public.connections c
                  WHERE (c.requester_id = v_uid AND c.recipient_id = p_recipient)
                     OR (c.requester_id = p_recipient AND c.recipient_id = v_uid));
END;
$$;

CREATE OR REPLACE FUNCTION public.notifications_guard_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') OR auth.uid() IS NULL
     OR COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  NEW.sender_id := auth.uid();
  NEW.title := left(NEW.title, 200);
  NEW.body := left(NEW.body, 1000);
  PERFORM public.enforce_notification_rate();
  RETURN NEW;
END;
$$;

DO $nt$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_rate_limit_notifications ON public.notifications;   -- superseded by the log-based limit
    DROP TRIGGER IF EXISTS trg_notifications_guard_insert ON public.notifications;
    CREATE TRIGGER trg_notifications_guard_insert BEFORE INSERT ON public.notifications
      FOR EACH ROW EXECUTE FUNCTION public.notifications_guard_insert();
    CREATE POLICY "notifications_insert_checked" ON public.notifications
      FOR INSERT TO authenticated
      WITH CHECK (public.can_insert_notification(recipient_id, sender_id, type, action_url));
  END IF;
END
$nt$;

-- ----------------------------------------------------------------------------
-- 4. Job applications: résumé ownership, initial state, open jobs only
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_open_for_applications(p_job uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = p_job AND COALESCE(j.is_closed, false) = false AND (j.expires_at IS NULL OR j.expires_at > now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_job_application()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.resume_url IS NOT NULL AND split_part(NEW.resume_url, '/', 1) IS DISTINCT FROM NEW.applicant_id::text THEN
      RAISE EXCEPTION 'The résumé must be a file in your own folder.' USING ERRCODE = '23514';
    END IF;
    IF NOT public.job_open_for_applications(NEW.job_id) THEN
      RAISE EXCEPTION 'This job is closed or has expired.' USING ERRCODE = '23514';
    END IF;
    NEW.status := 'applied';
    NEW.reviewed_at := NULL;
  ELSE
    -- a reviewer changes the status; nobody re-points an application
    NEW.resume_url := OLD.resume_url;
    NEW.applicant_id := OLD.applicant_id;
    NEW.job_id := OLD.job_id;
  END IF;
  RETURN NEW;
END;
$$;

DO $ja$
BEGIN
  IF to_regclass('public.job_applications') IS NOT NULL AND to_regclass('public.jobs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_guard_job_application ON public.job_applications;
    CREATE TRIGGER trg_guard_job_application BEFORE INSERT OR UPDATE ON public.job_applications
      FOR EACH ROW EXECUTE FUNCTION public.guard_job_application();
  END IF;
END
$ja$;

-- ----------------------------------------------------------------------------
-- 14. role_permissions: the matrix is for signed-in members
-- ----------------------------------------------------------------------------
DO $rp$
BEGIN
  IF to_regclass('public.role_permissions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Anyone can read role permissions" ON public.role_permissions;
    CREATE POLICY "Anyone can read role permissions" ON public.role_permissions
      FOR SELECT TO authenticated USING (true);
  END IF;
END
$rp$;

-- ----------------------------------------------------------------------------
-- 9 / 15 + resumes. storage.objects policies (owner of that table required)
-- ----------------------------------------------------------------------------
-- verification_doc_locked(): evidence is frozen once a request referencing it has been decided; it stays editable
-- while a pending request references it, or when no request does.
CREATE OR REPLACE FUNCTION public.verification_doc_locked(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR split_part(p_name, '/', 1) <> auth.uid()::text THEN RETURN false; END IF;
  RETURN EXISTS (
           SELECT 1 FROM public.verifications v
           WHERE v.status::text <> 'pending'
             AND (public.media_ref_matches(v.id_card_front_url, p_name)
               OR public.media_ref_matches(v.id_card_back_url, p_name)
               OR public.media_ref_matches(v.selfie_url, p_name)))
     AND NOT EXISTS (
           SELECT 1 FROM public.verifications v
           WHERE v.status::text = 'pending'
             AND (public.media_ref_matches(v.id_card_front_url, p_name)
               OR public.media_ref_matches(v.id_card_back_url, p_name)
               OR public.media_ref_matches(v.selfie_url, p_name)));
END;
$$;

DO $st$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;

  IF to_regclass('public.verifications') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users and admins can update their verification documents" ON storage.objects;
    CREATE POLICY "Users and admins can update their verification documents" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'verifications'
             AND (public.auth_is_super_admin()
                  OR ((storage.foldername(name))[1] = auth.uid()::text AND NOT public.verification_doc_locked(name))));
    DROP POLICY IF EXISTS "Users and admins can delete their verification documents" ON storage.objects;
    CREATE POLICY "Users and admins can delete their verification documents" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'verifications'
             AND (public.auth_is_super_admin()
                  OR ((storage.foldername(name))[1] = auth.uid()::text AND NOT public.verification_doc_locked(name))));
  END IF;

  -- A job poster may open a résumé only when the application that references it belongs to that very folder.
  IF to_regclass('public.job_applications') IS NOT NULL AND to_regclass('public.jobs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Resumes viewable by owner, the job poster, and admins" ON storage.objects;
    CREATE POLICY "Resumes viewable by owner, the job poster, and admins" ON storage.objects
      FOR SELECT TO authenticated USING (
        bucket_id = 'resumes' AND (
          auth.uid()::text = (storage.foldername(name))[1]
          OR public.auth_is_super_admin()
          OR public.can_admin_object_owner(name)
          OR EXISTS (
            SELECT 1 FROM public.job_applications ja JOIN public.jobs j ON j.id = ja.job_id
            WHERE ja.resume_url = name
              AND ja.applicant_id::text = (storage.foldername(name))[1]
              AND j.poster_id = auth.uid())
        ));
  END IF;

  -- The avatars bucket stays PUBLIC (profile pictures load by URL, which never consulted this policy); only the
  -- anonymous / authenticated LISTING of every member's folder goes away.
  DROP POLICY IF EXISTS "Avatars are publicly viewable" ON storage.objects;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Not owner of storage.objects: storage policies were NOT changed (checked again below).';
END
$st$;

-- Fail loudly (instead of a warning nobody reads) when the listing policy is still there although this role
-- could have dropped it. A role that genuinely cannot manage storage.objects only gets the warning: re-run
-- this section from the Supabase SQL editor as the owner role.
DO $chk$
DECLARE
  v_owner oid;
  v_can   boolean := false;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Avatars are publicly viewable') THEN
    SELECT relowner INTO v_owner FROM pg_class WHERE oid = 'storage.objects'::regclass;
    v_can := pg_has_role(current_user, v_owner, 'MEMBER') OR (SELECT rolsuper FROM pg_roles WHERE rolname = current_user);
    IF v_can THEN
      RAISE EXCEPTION 'The "Avatars are publicly viewable" listing policy on storage.objects is still present although % can manage that table.', current_user;
    ELSE
      RAISE WARNING 'The "Avatars are publicly viewable" policy is still present: % cannot manage storage.objects. Drop it as the owner role.', current_user;
    END IF;
  END IF;
END
$chk$;

-- ----------------------------------------------------------------------------
-- 13. SECURITY DEFINER functions: pg_temp must be searched LAST (otherwise a caller can plant a pg_temp object
--     that shadows something the function refers to)
-- ----------------------------------------------------------------------------
DO $sp$
DECLARE
  r record;
  v_cfg text;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    SELECT c INTO v_cfg FROM pg_proc p2, unnest(COALESCE(p2.proconfig, ARRAY[]::text[])) c
     WHERE p2.oid = r.oid AND c LIKE 'search_path=%' LIMIT 1;
    BEGIN
      -- (a definer function with NO search_path setting at all is left alone: it may rely on the extensions schema)
      IF v_cfg IS NOT NULL AND v_cfg !~* 'pg_temp' THEN
        EXECUTE format('ALTER FUNCTION %s SET search_path = %s, pg_temp', r.sig, substr(v_cfg, length('search_path=') + 1));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'search_path of % not changed: %', r.sig, SQLERRM;
    END;
  END LOOP;
END
$sp$;

-- ----------------------------------------------------------------------------
-- 1. Schema-wide EXECUTE sweep
-- ----------------------------------------------------------------------------
-- Supabase's default privileges give anon (and PUBLIC) EXECUTE on every function created in `public`; REVOKE ... FROM
-- PUBLIC alone never closed that. Each SECURITY DEFINER function runs with its owner's rights, so every one anon could
-- reach was a way in unless it guarded itself against a NULL auth.uid().
--
-- ANON ALLOW-LIST (SECURITY DEFINER functions that must stay callable before sign-in):
--   check_username_available(text)   sign-up form: is this @handle free?  (src/api/auth.ts)
-- Everything else is authenticated / service_role only. The client's other RPCs are all made by signed-in members
-- (checked: src/, app/, supabase/functions/); the policies that apply to anon only use INVOKER helpers
-- (is_secret_setting_key, ...), which stay executable. SECURITY INVOKER (non-definer) functions keep anon access
-- unchanged, because they run with anon's own rights and cannot escalate.
DO $sweep$
DECLARE
  r record;
BEGIN
  -- 1) preserve what signed-in members and the service role can do today (it may have come only through PUBLIC)
  FOR r IN
    SELECT p.oid::regprocedure AS sig, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE p.prokind IN ('f', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    BEGIN
      IF r.auth_ok THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig); END IF;
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'cannot adjust grants of % (not owner)', r.sig;
    END;
  END LOOP;

  -- 2) remember the invoker-rights functions anon may keep, then close everything for PUBLIC / anon
  CREATE TEMP TABLE _anon_keep ON COMMIT DROP AS
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE p.prokind = 'f' AND NOT p.prosecdef AND p.prorettype <> 'trigger'::regtype
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE p.prokind IN ('f', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'cannot revoke on % (not owner)', r.sig;
    END;
  END LOOP;

  -- 3) re-open the allow-list + the harmless invoker functions
  FOR r IN SELECT sig FROM _anon_keep LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cannot re-grant anon on %: %', r.sig, SQLERRM;
    END;
  END LOOP;
  IF to_regprocedure('public.check_username_available(text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon;
  END IF;

  -- 4) internal helpers nobody should call as an RPC
  IF to_regprocedure('public.promote_event_waitlist(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.promote_event_waitlist(uuid) FROM authenticated;
  END IF;
END
$sweep$;

-- Functions created from now on: no PUBLIC / anon EXECUTE (authenticated and service_role keep their default grant).
DO $dp$
BEGIN
  -- PUBLIC's built-in EXECUTE default can only be revoked with the non-schema form of the command (the IN SCHEMA
  -- form removes only grants that were added per schema). It applies to functions this role creates from now on.
  ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'default privileges (current role) not changed';
END
$dp$;
DO $dp2$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'default privileges of supabase_admin not changed: %', SQLERRM;
END
$dp2$;

NOTIFY pgrst, 'reload schema';

COMMIT;
