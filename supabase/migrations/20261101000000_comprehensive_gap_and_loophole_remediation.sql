-- ============================================================================
-- Migration: 20261101000000_comprehensive_gap_and_loophole_remediation.sql
-- Description:
--   Comprehensive remediation of all security, RLS, role-permission, campus
--   isolation, moderation sanction, mentorship, campus-deletion, and
--   notification deep-link gaps identified in the platform-wide audit.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Restore public.is_super_admin() with MFA AAL2 enforcement
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.auth_is_super_admin();
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- 2. Restore strict server-truth public.is_profile_verified(p_user_id UUID)
--    (Removes the unconfirmed .edu.ng bypass re-introduced in 20261031000000)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_profile_verified(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
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

REVOKE ALL ON FUNCTION public.is_profile_verified(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_profile_verified(UUID) TO authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- 3. Restore strict RESOURCES & EVENTS SELECT RLS Policies
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Resources viewable if approved and matching campus or global or owner or admin or staff" ON public.resources;
DROP POLICY IF EXISTS "Resources viewable if approved and matching campus or global or" ON public.resources;
DROP POLICY IF EXISTS "resources_select_policy" ON public.resources;
CREATE POLICY "Resources viewable if approved and matching campus or global or owner or admin or staff" ON public.resources
  FOR SELECT TO authenticated
  USING (public.resource_visible_to_me(uploader_id, campus_code, is_approved));

DROP POLICY IF EXISTS "Events viewable by campus or global" ON public.events;
CREATE POLICY "Events viewable by campus or global" ON public.events
  FOR SELECT TO authenticated
  USING (
    public.auth_is_super_admin()
    OR creator_id = auth.uid()
    OR public.can_admin_campus(campus_code)
    OR visibility_scope = 'global'
    OR campus_code IS NULL
    OR campus_code = 'GLOBAL'
    OR campus_code = public.auth_campus_access()
  );

-- ----------------------------------------------------------------------------
-- 4. Add profiles.muted_until & restore non-PII operational column SELECT grants
--    (Fixes 42501 permission denied on Admin Dashboard Active 24h, Analytics,
--     and AuthContext onboarding_step hydration)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;

DO $do$
DECLARE
  v_auth_candidates text[] := ARRAY[
    'id','full_name','username','role','campus_code','department','faculty','level','bio','interests',
    'avatar_url','banner_url','verification_status','custom_accent_color','trust_score','is_suspended',
    'suspension_reason','muted_until','onboarding_complete','onboarding_step','is_bot',
    'last_active_at','last_login_at','created_at','updated_at','admin_role','is_campus_ambassador',
    'graduation_year','industry','company','job_title','location','linkedin_url','resume_url',
    'directory_discoverable','directory_hide_company','directory_hide_location','directory_hide_job_title'
  ];
  v_cols text[];
BEGIN
  SELECT array_agg(quote_ident(column_name) ORDER BY column_name) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = ANY (v_auth_candidates);
  IF v_cols IS NOT NULL THEN
    EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', array_to_string(v_cols, ', '));
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 5. Harden prevent_profile_role_escalation (protect muted_until & check can_manage_roles)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_role VARCHAR(50);
    v_caller_admin_role VARCHAR(50);
    v_caller_campus VARCHAR(50);
    v_caller_email TEXT;
BEGIN
    SELECT role::text, admin_role, campus_code, LOWER(COALESCE(email, ''))
    INTO v_caller_role, v_caller_admin_role, v_caller_campus, v_caller_email 
    FROM public.profiles WHERE id = auth.uid();

    -- Root Super Admin retains absolute authority
    IF (v_caller_role = 'admin' AND v_caller_admin_role = 'super_admin')
       OR v_caller_email = 'inememmanuel@gmail.com'
       OR auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Protect Super Admin accounts from being modified by ANY non-super admin
    IF (OLD.admin_role = 'super_admin' OR LOWER(COALESCE(OLD.email, '')) = 'inememmanuel@gmail.com') THEN
        NEW.role := OLD.role;
        NEW.admin_role := OLD.admin_role;
        NEW.campus_code := OLD.campus_code;
        NEW.is_suspended := OLD.is_suspended;
        NEW.suspension_reason := OLD.suspension_reason;
        NEW.muted_until := OLD.muted_until;
        NEW.trust_score := OLD.trust_score;
        NEW.verification_status := OLD.verification_status;
        RETURN NEW;
    END IF;

    -- Campus Admin authority: strictly scoped to non-admins on their own campus node
    IF v_caller_role = 'admin' AND (v_caller_admin_role = 'campus_admin' OR v_caller_admin_role IS NULL) THEN
        IF OLD.role::text = 'admin' OR NEW.role::text = 'admin' OR (NEW.admin_role IS DISTINCT FROM OLD.admin_role) THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_suspended := OLD.is_suspended;
            NEW.suspension_reason := OLD.suspension_reason;
            NEW.muted_until := OLD.muted_until;
            NEW.trust_score := OLD.trust_score;
            NEW.verification_status := OLD.verification_status;
            RETURN NEW;
        END IF;

        -- If role management permission is disabled for campus_admin, block role promotions
        IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_campus_ambassador IS DISTINCT FROM OLD.is_campus_ambassador)
           AND NOT public.has_role_permission('can_manage_roles') THEN
            NEW.role := OLD.role;
            NEW.is_campus_ambassador := OLD.is_campus_ambassador;
        END IF;

        -- Cannot transfer users to a different campus
        IF NEW.campus_code IS DISTINCT FROM OLD.campus_code THEN
            NEW.campus_code := OLD.campus_code;
        END IF;

        -- If target is outside their campus, prevent moderating suspension/verification/ambassador
        IF v_caller_campus IS NULL OR v_caller_campus = 'GLOBAL' OR OLD.campus_code IS DISTINCT FROM v_caller_campus THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_suspended := OLD.is_suspended;
            NEW.suspension_reason := OLD.suspension_reason;
            NEW.muted_until := OLD.muted_until;
            NEW.trust_score := OLD.trust_score;
            NEW.verification_status := OLD.verification_status;
            NEW.is_campus_ambassador := OLD.is_campus_ambassador;
            RETURN NEW;
        END IF;

        RETURN NEW;
    END IF;

    -- Allow Campus Staff to update is_suspended and verification_status for users in their same campus
    IF v_caller_role = 'staff' THEN
        IF OLD.role::text IN ('admin', 'staff') THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_suspended := OLD.is_suspended;
            NEW.suspension_reason := OLD.suspension_reason;
            NEW.muted_until := OLD.muted_until;
            NEW.trust_score := OLD.trust_score;
            NEW.verification_status := OLD.verification_status;
            RETURN NEW;
        END IF;

        IF v_caller_campus IS NOT NULL AND v_caller_campus <> 'GLOBAL' AND v_caller_campus = OLD.campus_code THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_campus_ambassador := OLD.is_campus_ambassador;
            RETURN NEW;
        END IF;
    END IF;

    -- Regular users / self updates: prevent mutating privileged columns
    IF (NEW.role IS DISTINCT FROM OLD.role)
       OR (NEW.admin_role IS DISTINCT FROM OLD.admin_role)
       OR (NEW.verification_status IS DISTINCT FROM OLD.verification_status)
       OR (NEW.is_suspended IS DISTINCT FROM OLD.is_suspended)
       OR (NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason)
       OR (NEW.muted_until IS DISTINCT FROM OLD.muted_until)
       OR (NEW.trust_score IS DISTINCT FROM OLD.trust_score)
       OR (NEW.campus_code IS DISTINCT FROM OLD.campus_code)
       OR (NEW.is_campus_ambassador IS DISTINCT FROM OLD.is_campus_ambassador) THEN
        NEW.role := OLD.role;
        NEW.admin_role := OLD.admin_role;
        NEW.verification_status := OLD.verification_status;
        NEW.is_suspended := OLD.is_suspended;
        NEW.suspension_reason := OLD.suspension_reason;
        NEW.muted_until := OLD.muted_until;
        NEW.trust_score := OLD.trust_score;
        NEW.campus_code := OLD.campus_code;
        NEW.is_campus_ambassador := OLD.is_campus_ambassador;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 6. Upgrade has_role_permission(p_key text) + Enforce All 22 Permission Keys
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role_permission(p_key text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role       text;
  v_system     text;
  v_enabled    boolean;
  v_ambassador boolean := false;
  v_muted      boolean := false;
BEGIN
  IF auth.role() = 'service_role' THEN RETURN true; END IF;
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF public.auth_is_super_admin() THEN RETURN true; END IF;

  SELECT p.role::text,
         COALESCE(p.is_campus_ambassador, false),
         COALESCE(p.muted_until > now(), false)
    INTO v_role, v_ambassador, v_muted
    FROM public.profiles p
   WHERE p.id = auth.uid();

  IF v_role IS NULL THEN RETURN false; END IF;

  -- Active temporary mute blocks content creation & messaging keys
  IF v_muted AND p_key IN (
    'can_post_forum', 'can_comment_forum', 'can_create_spaces',
    'can_upload_resources', 'can_create_events', 'can_list_marketplace',
    'can_post_jobs', 'can_create_study_pods', 'can_send_messages'
  ) THEN
    RETURN false;
  END IF;

  -- Campus Ambassadors are always entitled to propose events and discussion spaces
  IF v_ambassador AND p_key IN ('can_create_events', 'can_create_spaces') THEN
    RETURN true;
  END IF;

  v_system := CASE v_role
                WHEN 'admin' THEN 'campus_admin'
                WHEN 'staff' THEN 'staff'
                WHEN 'alumni' THEN 'alumni'
                ELSE 'student'
              END;

  IF to_regclass('public.role_permissions') IS NULL THEN RETURN true; END IF;
  SELECT rp.enabled INTO v_enabled
  FROM public.role_permissions rp
  WHERE rp.role = v_system AND rp.permission_key = p_key;
  RETURN COALESCE(v_enabled, true);
END;
$$;

REVOKE ALL ON FUNCTION public.has_role_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role_permission(text) TO authenticated, service_role;

-- Enforce role_permission_insert across all creation/action tables
DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('posts',                'can_post_forum'),
      ('post_comments',        'can_comment_forum'),
      ('forum_communities',    'can_create_spaces'),
      ('events',               'can_create_events'),
      ('event_attendees',      'can_rsvp_events'),
      ('event_waitlist',       'can_rsvp_events'),
      ('marketplace_listings', 'can_list_marketplace'),
      ('jobs',                 'can_post_jobs'),
      ('job_applications',     'can_access_jobs'),
      ('study_groups',         'can_create_study_pods'),
      ('study_group_members',  'can_join_study_pods'),
      ('chat_messages',        'can_send_messages'),
      ('announcements',        'can_broadcast_announcements')
    ) AS x(tbl, perm)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS role_permission_insert ON public.%I', r.tbl);
    EXECUTE format($f$CREATE POLICY role_permission_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (public.has_role_permission(%L))$f$, r.tbl, r.perm);
  END LOOP;
END
$do$;

-- Enforce read/moderation role permissions on marketplace_listings, jobs, moderation_queue, and resources
DO $do$
BEGIN
  IF to_regclass('public.marketplace_listings') IS NOT NULL THEN
    DROP POLICY IF EXISTS role_permission_select ON public.marketplace_listings;
    CREATE POLICY role_permission_select ON public.marketplace_listings AS RESTRICTIVE FOR SELECT TO authenticated
      USING (seller_id = auth.uid() OR public.has_role_permission('can_access_marketplace'));
  END IF;

  IF to_regclass('public.jobs') IS NOT NULL THEN
    DROP POLICY IF EXISTS role_permission_select ON public.jobs;
    CREATE POLICY role_permission_select ON public.jobs AS RESTRICTIVE FOR SELECT TO authenticated
      USING (poster_id = auth.uid() OR public.has_role_permission('can_access_jobs'));
  END IF;

  IF to_regclass('public.moderation_queue') IS NOT NULL THEN
    DROP POLICY IF EXISTS role_permission_update ON public.moderation_queue;
    CREATE POLICY role_permission_update ON public.moderation_queue AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (public.has_role_permission('can_moderate_campus'))
      WITH CHECK (public.has_role_permission('can_moderate_campus'));
  END IF;
END
$do$;

-- Update forum_communities INSERT policy so verified Students, Alumni, Ambassadors, Staff, and Admins
-- with can_create_spaces permission can propose communities (fixes Alumni & Student space proposal dead-end)
DROP POLICY IF EXISTS "Authenticated users can propose communities" ON public.forum_communities;
DROP POLICY IF EXISTS "Ambassadors and admins can propose communities" ON public.forum_communities;
CREATE POLICY "Ambassadors and admins can propose communities" ON public.forum_communities
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND approval_status = 'pending'
  AND public.is_profile_verified(auth.uid())
  AND public.has_role_permission('can_create_spaces')
);

-- Tighten jobs INSERT policy to require is_profile_verified(auth.uid())
DROP POLICY IF EXISTS "Alumni, staff and admin can create jobs" ON public.jobs;
CREATE POLICY "Alumni, staff and admin can create jobs" ON public.jobs
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = poster_id
  AND public.is_profile_verified(auth.uid())
  AND public.has_role_permission('can_post_jobs')
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('alumni', 'staff', 'admin'))
);

-- Tighten giving_campaigns INSERT & SELECT policies to require verification and campus scoping
DROP POLICY IF EXISTS "A member proposes a giving campaign, held for review" ON public.giving_campaigns;
CREATE POLICY "A member proposes a giving campaign, held for review" ON public.giving_campaigns
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = creator_id
  AND public.is_profile_verified(auth.uid())
);

DROP POLICY IF EXISTS "Approved campaigns are readable by anyone; owner/admin see all of theirs" ON public.giving_campaigns;
CREATE POLICY "Approved campaigns are readable by anyone; owner/admin see all of theirs" ON public.giving_campaigns
FOR SELECT TO authenticated
USING (
  creator_id = auth.uid()
  OR public.can_admin_campus(campus_code)
  OR (
    review_status = 'approved'
    AND (campus_code IS NULL OR campus_code = 'GLOBAL' OR campus_code = public.auth_campus_access())
  )
);

-- Tighten mentor_profiles write policy to require verification and can_offer_mentorship
DROP POLICY IF EXISTS "mentor_profiles_write_own" ON public.mentor_profiles;
CREATE POLICY "mentor_profiles_write_own" ON public.mentor_profiles
FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  AND public.auth_profile_role() IN ('alumni', 'staff', 'admin')
)
WITH CHECK (
  user_id = auth.uid()
  AND public.auth_profile_role() IN ('alumni', 'staff', 'admin')
  AND public.is_profile_verified(auth.uid())
  AND public.has_role_permission('can_offer_mentorship')
);

-- ----------------------------------------------------------------------------
-- 7. Scope Unscoped SECURITY DEFINER RPCs & Policies
-- ----------------------------------------------------------------------------

-- 7a. admin_get_profile_contacts: scope non-super-admins to their own campus
CREATE OR REPLACE FUNCTION public.admin_get_profile_contacts(p_user_ids UUID[])
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    email TEXT,
    role TEXT,
    campus_code TEXT,
    student_id_number TEXT
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

    IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT p.id, p.full_name::TEXT, p.email::TEXT, p.role::TEXT, p.campus_code::TEXT, p.student_id_number::TEXT
    FROM public.profiles p
    WHERE p.id = ANY(p_user_ids)
      AND (
        auth.role() = 'service_role'
        OR public.auth_is_super_admin()
        OR public.can_admin_campus(p.campus_code)
      );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_profile_contacts(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_profile_contacts(UUID[]) TO authenticated, service_role;

-- 7b. admin_get_user_diagnostics: scope both staff AND campus_admin to their own campus
CREATE OR REPLACE FUNCTION public.admin_get_user_diagnostics(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
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
    SELECT LOWER(COALESCE(role::text, ''))
    INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role NOT IN ('admin', 'staff') AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    SELECT campus_code INTO v_target_campus FROM public.profiles WHERE id = p_user_id;
    IF v_target_campus IS NULL THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;

    IF auth.role() <> 'service_role' AND NOT public.auth_is_super_admin() AND NOT public.can_admin_campus(v_target_campus) THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

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
            'total_count', v_alerts_total_count,
            'active_count', v_alerts_active_count,
            'alerts', v_alerts
        ),
        'notification_preferences', v_prefs
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_diagnostics(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_diagnostics(UUID) TO authenticated, service_role;

-- 7c. resource_takedown_requests RLS + resolve_takedown_request (scope by campus + fix storage object path)
DROP POLICY IF EXISTS "Takedown requests readable by reporter and admins" ON public.resource_takedown_requests;
CREATE POLICY "Takedown requests readable by reporter and admins"
  ON public.resource_takedown_requests FOR SELECT TO authenticated
  USING (
    reporter_id = auth.uid()
    OR public.auth_is_super_admin()
    OR (
      public.auth_profile_role() = 'admin'
      AND (
        EXISTS (
          SELECT 1 FROM public.resources r
          WHERE r.id = resource_takedown_requests.resource_id
            AND public.can_admin_campus(r.campus_code)
        )
        OR public.can_admin_campus(public.campus_of(resource_takedown_requests.resource_uploader))
      )
    )
  );

CREATE OR REPLACE FUNCTION public.resolve_takedown_request(
  p_request_id uuid,
  p_decision   text,
  p_notes      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_req        public.resource_takedown_requests%ROWTYPE;
  v_res_campus text;
  v_path       text;
BEGIN
  IF v_uid IS NULL OR public.auth_profile_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an administrator can decide a takedown request.' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('uphold', 'reject') THEN
    RAISE EXCEPTION 'Decision must be uphold or reject.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req FROM public.resource_takedown_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been decided.' USING ERRCODE = '23505';
  END IF;

  IF v_req.resource_id IS NOT NULL THEN
    SELECT campus_code INTO v_res_campus FROM public.resources WHERE id = v_req.resource_id;
  END IF;
  IF v_res_campus IS NULL AND v_req.resource_uploader IS NOT NULL THEN
    v_res_campus := public.campus_of(v_req.resource_uploader);
  END IF;

  IF NOT public.auth_is_super_admin() AND NOT public.can_admin_campus(v_res_campus) THEN
    RAISE EXCEPTION 'You can only resolve takedown requests for your own campus.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('lioris.takedown_action', 'on', true);

  IF p_decision = 'uphold' THEN
    v_path := COALESCE(
      public.resource_object_path(v_req.resource_file_url),
      substring(v_req.resource_file_url FROM '/resources/([^?]+)')
    );
    IF v_req.resource_id IS NOT NULL THEN
      DELETE FROM public.resources WHERE id = v_req.resource_id;
    END IF;
    UPDATE public.resource_takedown_requests
       SET status = 'upheld', admin_notes = nullif(btrim(coalesce(p_notes, '')), ''),
           reviewed_by = v_uid, reviewed_at = now()
     WHERE id = v_req.id;
  ELSE
    IF v_req.resource_id IS NOT NULL THEN
      UPDATE public.resources
         SET takedown_status = NULL,
             is_approved = CASE WHEN v_req.auto_hidden THEN true ELSE is_approved END
       WHERE id = v_req.resource_id AND takedown_status IS NOT NULL;
    END IF;
    UPDATE public.resource_takedown_requests
       SET status = 'rejected', admin_notes = nullif(btrim(coalesce(p_notes, '')), ''),
           reviewed_by = v_uid, reviewed_at = now()
     WHERE id = v_req.id;
  END IF;

  PERFORM set_config('lioris.takedown_action', 'off', true);

  IF v_req.reporter_id IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
    VALUES (v_req.reporter_id, v_uid,
            CASE WHEN p_decision = 'uphold' THEN 'Your takedown request was upheld'
                 ELSE 'Your takedown request was reviewed' END,
            CASE WHEN p_decision = 'uphold'
                 THEN 'We removed "' || v_req.resource_title || '" following your request.'
                 ELSE 'We reviewed your request about "' || v_req.resource_title || '" and kept the resource online.' END,
            'system', '/notifications', false);
  END IF;

  IF v_req.resource_uploader IS NOT NULL AND v_req.resource_uploader IS DISTINCT FROM v_req.reporter_id THEN
    INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
    VALUES (v_req.resource_uploader, v_uid,
            CASE WHEN p_decision = 'uphold' THEN 'Your resource was removed (copyright takedown)'
                 ELSE 'Your resource is back online' END,
            CASE WHEN p_decision = 'uphold'
                 THEN '"' || v_req.resource_title || '" was permanently removed after a copyright review.'
                 ELSE 'The review on "' || v_req.resource_title || '" is complete and the resource has been restored.' END,
            'system', '/notifications', false);
  END IF;

  RETURN jsonb_build_object('status', CASE WHEN p_decision = 'uphold' THEN 'upheld' ELSE 'rejected' END,
                            'storage_path', v_path);
END
$$;

REVOKE ALL ON FUNCTION public.resolve_takedown_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_takedown_request(uuid, text, text) TO authenticated;

-- 7d. end_mentorship: require can_admin_campus when an admin ends a mentorship they are not part of
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

  v_is_admin := public.auth_is_super_admin()
                OR public.can_admin_campus(public.campus_of(v_row.student_id))
                OR public.can_admin_campus(public.campus_of(v_row.mentor_id));

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

REVOKE ALL ON FUNCTION public.end_mentorship(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_mentorship(uuid, text, text) TO authenticated;

-- 7e. chat_channel_members INSERT & admin_delete_chat_message: prevent DM snooping by Campus Admins
DROP POLICY IF EXISTS "Members or admins can add members to channels" ON public.chat_channel_members;
CREATE POLICY "Members or admins can add members to channels"
ON public.chat_channel_members FOR INSERT TO authenticated
WITH CHECK (
    NOT COALESCE((SELECT is_suspended FROM public.profiles WHERE id = auth.uid()), false)
    AND (
        public.auth_is_super_admin()
        OR public.is_channel_member(channel_id)
        OR EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = channel_id AND c.created_by = auth.uid())
        OR (
            public.auth_profile_role() = 'admin'
            AND EXISTS (
                SELECT 1 FROM public.chat_channels c
                WHERE c.id = channel_id
                  AND COALESCE(c.is_direct_message, false) = false
                  AND public.can_admin_campus(c.campus_code)
            )
        )
        OR (
            auth.uid() = user_id
            AND EXISTS (
                SELECT 1 FROM public.chat_channels c
                WHERE c.id = channel_id
                  AND COALESCE(c.is_direct_message, false) = false
                  AND (
                      c.campus_code IS NULL
                      OR c.campus_code = 'GLOBAL'
                      OR c.campus_code = (SELECT p.campus_code FROM public.profiles p WHERE p.id = auth.uid())
                  )
            )
        )
    )
);

CREATE OR REPLACE FUNCTION public.admin_delete_chat_message(p_message_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF public.auth_profile_role() NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'not_allowed: moderator-only action';
  END IF;

  SELECT sender_id INTO v_sender_id FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: message does not exist';
  END IF;

  IF NOT public.auth_is_super_admin() AND NOT public.can_admin_campus(public.campus_of(v_sender_id)) THEN
    RAISE EXCEPTION 'not_allowed: message belongs to another campus';
  END IF;

  DELETE FROM public.chat_messages WHERE id = p_message_id;
END
$$;

REVOKE ALL ON FUNCTION public.admin_delete_chat_message(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_chat_message(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. Fix moderation_queue Campus Resolution, Sanctions RPC, and Escalation RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_moderation_queue_campus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_resolved text;
BEGIN
  IF NEW.campus_code IS NOT NULL AND NEW.campus_code <> '' AND NEW.campus_code <> 'GLOBAL' THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF NEW.item_type = 'post' THEN
      SELECT campus_code INTO v_resolved FROM public.posts WHERE id::text = NEW.item_id::text;
    ELSIF NEW.item_type = 'event' THEN
      SELECT campus_code INTO v_resolved FROM public.events WHERE id::text = NEW.item_id::text;
    ELSIF NEW.item_type = 'marketplace_listing' THEN
      SELECT campus_code INTO v_resolved FROM public.marketplace_listings WHERE id::text = NEW.item_id::text;
    ELSIF NEW.item_type = 'job' THEN
      SELECT campus_code INTO v_resolved FROM public.jobs WHERE id::text = NEW.item_id::text;
    ELSIF NEW.item_type IN ('user', 'user_profile') THEN
      SELECT campus_code INTO v_resolved FROM public.profiles WHERE id::text = NEW.item_id::text;
    ELSIF NEW.item_type = 'pod_post' THEN
      SELECT sg.campus_code INTO v_resolved
      FROM public.study_group_posts sgp
      JOIN public.study_groups sg ON sg.id = sgp.group_id
      WHERE sgp.id::text = NEW.item_id::text;
    ELSIF NEW.item_type IN ('comment', 'message') THEN
      SELECT p.campus_code INTO v_resolved
      FROM public.chat_messages cm
      JOIN public.profiles p ON p.id = cm.sender_id
      WHERE cm.id::text = NEW.item_id::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_resolved := NULL;
  END;

  IF (v_resolved IS NULL OR v_resolved = 'GLOBAL') AND NEW.reporter_id IS NOT NULL THEN
    SELECT campus_code INTO v_resolved FROM public.profiles WHERE id = NEW.reporter_id;
  END IF;

  NEW.campus_code := COALESCE(NULLIF(v_resolved, ''), 'GLOBAL');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_moderation_queue_resolve_campus ON public.moderation_queue;
CREATE TRIGGER trg_moderation_queue_resolve_campus
  BEFORE INSERT ON public.moderation_queue
  FOR EACH ROW EXECUTE FUNCTION public.resolve_moderation_queue_campus();

-- Backfill existing GLOBAL/NULL pending reports in moderation_queue from their reporter's campus
UPDATE public.moderation_queue mq
   SET campus_code = p.campus_code
  FROM public.profiles p
 WHERE mq.reporter_id = p.id
   AND (mq.campus_code IS NULL OR mq.campus_code = 'GLOBAL')
   AND p.campus_code IS NOT NULL
   AND p.campus_code <> 'GLOBAL';

-- Allow Campus Admins and Staff to update/resolve moderation_queue items for their campus or filed by their campus members
DROP POLICY IF EXISTS scope_privileged_update ON public.moderation_queue;
CREATE POLICY scope_privileged_update ON public.moderation_queue AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    (SELECT NOT public.is_scoped_privileged())
    OR campus_code = (SELECT public.auth_profile_campus())
    OR public.can_admin_campus(public.campus_of(reporter_id))
  )
  WITH CHECK (
    (SELECT NOT public.is_scoped_privileged())
    OR campus_code = (SELECT public.auth_profile_campus())
    OR public.can_admin_campus(public.campus_of(reporter_id))
  );

-- RPC: admin_apply_moderation_sanction (distinct handling for warn, mute, shadowban, permaban)
CREATE OR REPLACE FUNCTION public.admin_apply_moderation_sanction(
  p_target_user_id UUID,
  p_sanction       TEXT,
  p_reason         TEXT DEFAULT 'Moderation policy violation'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_target public.profiles%ROWTYPE;
  v_reason text := COALESCE(NULLIF(btrim(p_reason), ''), 'Moderation policy violation');
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;
  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required.';
  END IF;
  IF v_caller = p_target_user_id THEN
    RAISE EXCEPTION 'You cannot sanction your own account.' USING ERRCODE = '42501';
  END IF;
  IF p_sanction NOT IN ('warn', 'mute', 'shadowban', 'permaban') THEN
    RAISE EXCEPTION 'Invalid sanction type.';
  END IF;

  SELECT LOWER(COALESCE(role::text, '')) INTO v_caller_role FROM public.profiles WHERE id = v_caller;
  IF v_caller_role NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'Moderator privileges required.' USING ERRCODE = '42501';
  END IF;

  IF p_sanction IN ('shadowban', 'permaban') AND v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'Only an administrator can suspend or ban an account.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found.';
  END IF;

  IF v_target.admin_role = 'super_admin' OR LOWER(COALESCE(v_target.email, '')) = 'inememmanuel@gmail.com' THEN
    RAISE EXCEPTION 'Super Administrator accounts cannot be sanctioned.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.auth_is_super_admin() AND NOT public.can_admin_campus(v_target.campus_code) THEN
    RAISE EXCEPTION 'You can only sanction members of your own campus.' USING ERRCODE = '42501';
  END IF;

  IF p_sanction = 'warn' THEN
    UPDATE public.profiles
       SET trust_score = GREATEST(0, COALESCE(trust_score, 100) - 5),
           updated_at = now()
     WHERE id = p_target_user_id;
  ELSIF p_sanction = 'mute' THEN
    UPDATE public.profiles
       SET muted_until = now() + interval '24 hours',
           trust_score = GREATEST(0, COALESCE(trust_score, 100) - 10),
           updated_at = now()
     WHERE id = p_target_user_id;
  ELSIF p_sanction = 'shadowban' THEN
    UPDATE public.profiles
       SET is_suspended = true,
           suspension_reason = '[7-Day Suspension] ' || left(v_reason, 450),
           muted_until = now() + interval '7 days',
           trust_score = GREATEST(0, COALESCE(trust_score, 100) - 25),
           updated_at = now()
     WHERE id = p_target_user_id;
  ELSIF p_sanction = 'permaban' THEN
    UPDATE public.profiles
       SET is_suspended = true,
           suspension_reason = left(v_reason, 500),
           trust_score = 0,
           updated_at = now()
     WHERE id = p_target_user_id;
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_target_user_id,
    'sanction', p_sanction,
    'reason', v_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_moderation_sanction(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_apply_moderation_sanction(UUID, TEXT, TEXT) TO authenticated, service_role;

-- RPC: escalate_moderation_report (persists escalation note on moderation_queue and alerts Campus/Super Admins)
CREATE OR REPLACE FUNCTION public.escalate_moderation_report(
  p_report_id UUID,
  p_note      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_rep   public.moderation_queue%ROWTYPE;
  v_note  text := COALESCE(NULLIF(btrim(p_note), ''), 'Escalated by staff moderator for admin review');
  v_admin uuid;
BEGIN
  IF v_uid IS NULL OR public.auth_profile_role() NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'Moderator privileges required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rep FROM public.moderation_queue WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.moderation_queue
     SET action_taken = 'ESCALATED: ' || left(v_note, 450)
   WHERE id = p_report_id;

  FOR v_admin IN
    SELECT id FROM public.profiles
    WHERE role = 'admin'
      AND NOT COALESCE(is_suspended, false)
      AND (
        admin_role = 'super_admin'
        OR LOWER(COALESCE(email, '')) = 'inememmanuel@gmail.com'
        OR campus_code = v_rep.campus_code
      )
  LOOP
    INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
    VALUES (
      v_admin,
      v_uid,
      'Escalated Moderation Report',
      format('A %s report (%s) was escalated for administrator review: %s', COALESCE(v_rep.item_type::text, 'content'), COALESCE(v_rep.reason, 'policy violation'), left(v_note, 200)),
      'moderation',
      '/(admin)/moderation-queue',
      false
    );
  END LOOP;

  RETURN jsonb_build_object('id', p_report_id, 'status', 'escalated');
END;
$$;

REVOKE ALL ON FUNCTION public.escalate_moderation_report(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escalate_moderation_report(UUID, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9. Mentorship Verification & Campus Isolation (request_mentorship & mentor_directory)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_mentorship(
  p_mentor_id     uuid,
  p_track         text,
  p_level         text DEFAULT NULL,
  p_pitch         text DEFAULT NULL,
  p_goals         text DEFAULT NULL,
  p_cadence       text DEFAULT NULL,
  p_plan_outline  text DEFAULT NULL,
  p_document_url  text DEFAULT NULL,
  p_document_name text DEFAULT NULL
) RETURNS public.mentorships
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_me     public.profiles%ROWTYPE;
  v_mentor public.profiles%ROWTYPE;
  v_prof   public.mentor_profiles%ROWTYPE;
  v_active integer;
  v_pending integer;
  v_row    public.mentorships;
  v_track  text := btrim(COALESCE(p_track, ''));
  v_pitch  text := NULLIF(btrim(COALESCE(p_pitch, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR COALESCE(v_me.is_suspended, false) THEN RAISE EXCEPTION 'account_suspended'; END IF;
  IF v_me.role::text NOT IN ('student', 'admin') THEN RAISE EXCEPTION 'not_allowed: only students can request a mentor'; END IF;
  IF NOT public.is_profile_verified(v_uid) THEN RAISE EXCEPTION 'verification_required: verify your campus account before requesting a mentor'; END IF;
  IF NOT public.has_role_permission('can_access_mentorship') THEN RAISE EXCEPTION 'not_allowed: mentorship requests are currently disabled for your role'; END IF;
  IF p_mentor_id IS NULL OR p_mentor_id = v_uid THEN RAISE EXCEPTION 'invalid_input: choose another person as your mentor'; END IF;

  IF char_length(v_track) < 2 OR char_length(v_track) > 80 THEN RAISE EXCEPTION 'invalid_input: choose what you want help with'; END IF;
  IF v_pitch IS NULL OR char_length(v_pitch) < 20 THEN RAISE EXCEPTION 'invalid_input: tell the mentor a little about yourself (at least 20 characters)'; END IF;
  IF char_length(v_pitch) > 1500 THEN RAISE EXCEPTION 'invalid_input: your introduction is too long (1500 characters max)'; END IF;
  IF p_goals IS NOT NULL AND char_length(p_goals) > 1500 THEN RAISE EXCEPTION 'invalid_input: goals are too long (1500 characters max)'; END IF;
  IF p_plan_outline IS NOT NULL AND char_length(p_plan_outline) > 2000 THEN RAISE EXCEPTION 'invalid_input: the plan is too long (2000 characters max)'; END IF;
  IF p_document_url IS NOT NULL AND p_document_url <> '' AND p_document_url !~* '^https://' THEN RAISE EXCEPTION 'invalid_input: the attached document link is not valid'; END IF;

  SELECT * INTO v_mentor FROM public.profiles WHERE id = p_mentor_id;
  IF NOT FOUND OR COALESCE(v_mentor.is_suspended, false)
     OR v_mentor.role::text NOT IN ('alumni', 'staff', 'admin')
     OR (v_mentor.verification_status::text <> 'verified' AND v_mentor.role::text <> 'admin') THEN
    RAISE EXCEPTION 'mentor_unavailable';
  END IF;
  SELECT * INTO v_prof FROM public.mentor_profiles WHERE user_id = p_mentor_id;
  IF NOT FOUND OR NOT v_prof.is_accepting THEN RAISE EXCEPTION 'mentor_unavailable'; END IF;

  SELECT count(*) INTO v_active FROM public.mentorships WHERE mentor_id = p_mentor_id AND status = 'active';
  IF v_active >= v_prof.max_mentees THEN RAISE EXCEPTION 'mentor_full'; END IF;

  IF EXISTS (SELECT 1 FROM public.mentorships WHERE student_id = v_uid AND mentor_id = p_mentor_id AND status IN ('pending', 'active')) THEN
    RAISE EXCEPTION 'already_requested';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mentorships
             WHERE student_id = v_uid AND mentor_id = p_mentor_id AND status = 'declined'
               AND COALESCE(ended_at, updated_at, created_at) > now() - interval '7 days') THEN
    RAISE EXCEPTION 'cooldown';
  END IF;
  SELECT count(*) INTO v_pending FROM public.mentorships WHERE student_id = v_uid AND status = 'pending';
  IF v_pending >= 5 THEN RAISE EXCEPTION 'too_many_pending'; END IF;

  INSERT INTO public.mentorships
    (student_id, mentor_id, status, focus_area, track, level, pitch, goals, cadence, plan_outline, document_url, document_name)
  VALUES
    (v_uid, p_mentor_id, 'pending', v_track, v_track,
     NULLIF(btrim(COALESCE(p_level, '')), ''), v_pitch,
     NULLIF(btrim(COALESCE(p_goals, '')), ''), NULLIF(btrim(COALESCE(p_cadence, '')), ''),
     NULLIF(btrim(COALESCE(p_plan_outline, '')), ''),
     NULLIF(btrim(COALESCE(p_document_url, '')), ''), NULLIF(btrim(COALESCE(p_document_name, '')), ''))
  RETURNING * INTO v_row;

  PERFORM public.mentorship_notify(
    p_mentor_id, v_uid, 'New mentorship request',
    format('%s asked you to mentor them in %s.', COALESCE(v_me.full_name, 'A student'), v_track),
    '/mentorship/' || v_row.id::text);
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.mentor_directory(
  p_q text DEFAULT NULL,
  p_expertise text DEFAULT NULL,
  p_campus text DEFAULT NULL,
  p_only_accepting boolean DEFAULT true,
  p_limit integer DEFAULT 60
) RETURNS TABLE (
  user_id uuid, full_name text, avatar_url text, department text, campus_code text, role text,
  headline text, about text, job_title text, company text, years_experience integer,
  expertise text[], industries text[], session_modes text[], availability jsonb, linkedin_url text,
  is_accepting boolean, max_mentees integer, active_mentees integer, open_slots integer,
  completed_count integer, avg_rating numeric, rating_count integer, match_score integer, my_request_status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_q            text := NULLIF(btrim(COALESCE(p_q, '')), '');
  v_exp          text := NULLIF(btrim(COALESCE(p_expertise, '')), '');
  v_like         text;
  v_elike        text;
  v_caller_campus text;
  v_is_super     boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.has_role_permission('can_access_mentorship') THEN RETURN; END IF;

  v_is_super := public.auth_is_super_admin();
  v_caller_campus := public.auth_campus_access();

  IF v_exp IS NOT NULL AND lower(v_exp) IN ('all fields', 'all') THEN v_exp := NULL; END IF;
  v_like  := CASE WHEN v_q  IS NULL THEN NULL ELSE '%' || replace(replace(replace(v_q,  '\', '\\'), '%', '\%'), '_', '\_') || '%' END;
  v_elike := CASE WHEN v_exp IS NULL THEN NULL ELSE '%' || replace(replace(replace(v_exp, '\', '\\'), '%', '\%'), '_', '\_') || '%' END;

  RETURN QUERY
  WITH me AS (
    SELECT lower(COALESCE(p.department, '')) AS dept, p.campus_code AS campus,
           COALESCE((SELECT array_agg(lower(i)) FROM unnest(COALESCE(p.interests, '{}')) i), '{}') AS interests
    FROM public.profiles p WHERE p.id = v_uid
  ),
  base AS (
    SELECT mp.*, p.full_name AS p_name, p.avatar_url AS p_avatar, p.department AS p_dept,
           p.campus_code AS p_campus, p.role::text AS p_role
    FROM public.mentor_profiles mp
    JOIN public.profiles p ON p.id = mp.user_id
    WHERE mp.user_id <> v_uid
      AND (p.verification_status::text = 'verified' OR p.role::text = 'admin')
      AND NOT COALESCE(p.is_suspended, false)
      AND (NOT p_only_accepting OR mp.is_accepting)
      AND (
        CASE
          WHEN v_is_super THEN (p_campus IS NULL OR upper(p_campus) = 'ALL' OR upper(p.campus_code) = upper(p_campus) OR p.campus_code = 'GLOBAL')
          ELSE (p.campus_code = 'GLOBAL' OR (v_caller_campus IS NOT NULL AND upper(p.campus_code) = upper(v_caller_campus)))
        END
      )
      AND (v_like IS NULL
           OR p.full_name ILIKE v_like OR mp.headline ILIKE v_like OR mp.company ILIKE v_like OR mp.job_title ILIKE v_like
           OR EXISTS (SELECT 1 FROM unnest(mp.expertise) e WHERE e ILIKE v_like))
      AND (v_elike IS NULL
           OR EXISTS (SELECT 1 FROM unnest(mp.expertise || mp.industries) e WHERE e ILIKE v_elike)
           OR p.department ILIKE v_elike OR mp.headline ILIKE v_elike)
  )
  SELECT b.user_id, b.p_name, b.p_avatar, b.p_dept, b.p_campus, b.p_role,
         b.headline, b.about, b.job_title, b.company, b.years_experience,
         b.expertise, b.industries, b.session_modes, b.availability, b.linkedin_url,
         b.is_accepting, b.max_mentees,
         s.active_n::integer, GREATEST(b.max_mentees - s.active_n, 0)::integer,
         s.done_n::integer, r.avg_r, r.n::integer,
         (3 * (SELECT count(*) FROM unnest(b.expertise) e, me
                WHERE lower(e) = ANY (me.interests) OR EXISTS (SELECT 1 FROM unnest(me.interests) i WHERE lower(e) LIKE '%' || i || '%' AND char_length(i) > 2))
          + CASE WHEN (SELECT dept FROM me) <> '' AND lower(COALESCE(b.p_dept, '')) = (SELECT dept FROM me) THEN 2 ELSE 0 END
          + CASE WHEN b.p_campus = (SELECT campus FROM me) THEN 1 ELSE 0 END)::integer,
         (SELECT m2.status FROM public.mentorships m2
           WHERE m2.student_id = v_uid AND m2.mentor_id = b.user_id AND m2.status IN ('pending', 'active')
           ORDER BY m2.created_at DESC LIMIT 1)
  FROM base b
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE m.status = 'active') AS active_n,
           count(*) FILTER (WHERE m.status = 'completed') AS done_n
    FROM public.mentorships m WHERE m.mentor_id = b.user_id) s ON true
  LEFT JOIN LATERAL (
    SELECT round(avg(f.rating)::numeric, 1) AS avg_r, count(*) AS n
    FROM public.mentorship_feedback f JOIN public.mentorships m ON m.id = f.mentorship_id
    WHERE f.to_user = b.user_id AND f.from_user = m.student_id) r ON true
  ORDER BY (GREATEST(b.max_mentees - s.active_n, 0) > 0 AND b.is_accepting) DESC, 24 DESC, r.avg_r DESC NULLS LAST, b.p_name
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 60), 100));
END $$;

-- ----------------------------------------------------------------------------
-- 10. Harden admin_delete_campus (demote former campus admins) & add cascade alias
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_campus(p_code text, p_members text DEFAULT 'reassign')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  t        record;
  n        bigint;
  pass     int;
  pending  text[] := '{}';
  failed   text[];
  deleted  jsonb := '{}'::jsonb;
  moved    bigint := 0;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.auth_is_super_admin() THEN
    RAISE EXCEPTION 'super_admin_required: only a Super Administrator can delete a campus' USING ERRCODE = '42501';
  END IF;

  p_code := upper(btrim(p_code));
  IF p_code IS NULL OR p_code = '' OR p_code = 'GLOBAL' THEN
    RAISE EXCEPTION 'protected_campus: the Global network cannot be deleted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.campuses WHERE code = p_code) THEN
    RAISE EXCEPTION 'not_found: that campus does not exist';
  END IF;
  IF p_members NOT IN ('reassign', 'block') THEN
    RAISE EXCEPTION 'bad_request: members must be reassign or block';
  END IF;

  SELECT count(*) INTO moved FROM public.profiles WHERE campus_code = p_code;
  IF moved > 0 AND p_members = 'block' THEN
    RAISE EXCEPTION 'has_members: % member(s) still belong to this campus', moved;
  END IF;

  -- Members keep their accounts and land on GLOBAL; Campus Admins of the deleted campus are
  -- demoted to student so they do not retain role='admin' with campus_code='GLOBAL'.
  IF moved > 0 THEN
    UPDATE public.profiles
       SET campus_code = 'GLOBAL',
           role = CASE
             WHEN role::text = 'admin'
                  AND COALESCE(admin_role, 'campus_admin') <> 'super_admin'
                  AND LOWER(COALESCE(email, '')) <> 'inememmanuel@gmail.com'
             THEN 'student'::public.user_role
             ELSE role
           END,
           admin_role = CASE
             WHEN role::text = 'admin'
                  AND COALESCE(admin_role, 'campus_admin') <> 'super_admin'
                  AND LOWER(COALESCE(email, '')) <> 'inememmanuel@gmail.com'
             THEN NULL
             ELSE admin_role
           END,
           is_campus_ambassador = false
     WHERE campus_code = p_code;
  END IF;

  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'campus_code' AND c.table_name <> 'profiles'
    ORDER BY c.table_name
  LOOP
    pending := array_append(pending, t.table_name);
  END LOOP;

  FOR pass IN 1..4 LOOP
    failed := '{}';
    FOR t IN SELECT x AS table_name FROM unnest(pending) x LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE campus_code = $1', t.table_name) USING p_code;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN
          deleted := deleted || jsonb_build_object(t.table_name, COALESCE((deleted ->> t.table_name)::bigint, 0) + n);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        failed := array_append(failed, t.table_name);
      END;
    END LOOP;
    pending := failed;
    EXIT WHEN COALESCE(array_length(pending, 1), 0) = 0;
  END LOOP;

  IF COALESCE(array_length(pending, 1), 0) > 0 THEN
    RAISE EXCEPTION 'delete_blocked: could not clear tables: %', array_to_string(pending, ', ');
  END IF;

  DELETE FROM public.campuses WHERE code = p_code;

  RETURN jsonb_build_object('code', p_code, 'members_reassigned', moved, 'deleted', deleted);
END $$;

REVOKE ALL ON FUNCTION public.admin_delete_campus(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_campus(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_campus_cascade(p_campus_code text)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.admin_delete_campus(p_campus_code, 'reassign');
$$;

REVOKE ALL ON FUNCTION public.admin_delete_campus_cascade(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_campus_cascade(text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 11. Role-Neutral Verification Notification Deep Links + New Chat Message Bell Trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_verification_status_change_notify()
RETURNS TRIGGER AS $$
DECLARE
  v_campus TEXT;
  v_reason TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text IN ('approved', 'rejected') THEN
    v_campus := NEW.campus_code;
    IF NEW.status::text = 'approved' THEN
      INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url)
      VALUES (
        NEW.user_id, NEW.reviewed_by,
        'Campus Verification Approved! 🎉',
        format('Congratulations! Your verification for %s has been approved. You now have full access to campus feeds, events, and resources.', COALESCE(v_campus, 'your campus')),
        'system', '/dashboard'
      );
    ELSE
      v_reason := COALESCE(NULLIF(TRIM(NEW.rejection_reason), ''), NULLIF(TRIM(split_part(COALESCE(NEW.review_notes, ''), E'\n--- Reviewer decision:', 2)), ''));
      INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url)
      VALUES (
        NEW.user_id, NEW.reviewed_by,
        'Verification Needs Revision ⚠️',
        CASE
          WHEN v_reason IS NOT NULL THEN format('Your verification could not be approved: %s. Please upload an updated ID or document to re-apply.', v_reason)
          ELSE 'We could not verify your student or staff ID from the submitted document. Please upload a clear photo of your ID card to re-apply.'
        END,
        'system', '/profile'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Trigger: Notify channel recipients on new direct/channel messages (with 2-minute anti-spam dedupe per channel)
CREATE OR REPLACE FUNCTION public.notify_new_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender_name text;
  v_preview     text;
  v_member_id   uuid;
BEGIN
  IF NEW.sender_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(btrim(full_name), ''), 'Someone')
    INTO v_sender_name
    FROM public.profiles
   WHERE id = NEW.sender_id;

  v_preview := left(btrim(COALESCE(NEW.content, '')), 120);
  IF v_preview = '' AND NEW.media_url IS NOT NULL THEN
    v_preview := 'Sent an attachment';
  END IF;

  FOR v_member_id IN
    SELECT m.user_id
      FROM public.chat_channel_members m
     WHERE m.channel_id = NEW.channel_id
       AND m.user_id <> NEW.sender_id
       AND NOT EXISTS (
         SELECT 1 FROM public.user_mutes um
         WHERE um.muter_id = m.user_id AND um.muted_id = NEW.sender_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.notifications n
         WHERE n.recipient_id = m.user_id
           AND n.action_url = '/messages/' || NEW.channel_id::text
           AND COALESCE(n.is_read, false) = false
           AND n.created_at > now() - interval '2 minutes'
       )
  LOOP
    INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
    VALUES (
      v_member_id,
      NEW.sender_id,
      'New message from ' || v_sender_name,
      v_preview,
      'message',
      '/messages/' || NEW.channel_id::text,
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_chat_message ON public.chat_messages;
CREATE TRIGGER trg_notify_new_chat_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_chat_message();

NOTIFY pgrst, 'reload schema';

COMMIT;
