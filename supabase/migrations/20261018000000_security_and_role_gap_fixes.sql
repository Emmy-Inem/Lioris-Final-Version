-- ============================================================================
-- LIORIS - SECURITY, ROLE, ONBOARDING & ISOLATION GAP FIXES
-- ============================================================================
-- 1. Onboarding persistence & completion integrity (profiles.onboarding_step).
-- 2. Chat privacy: blocks unauthorized third-party self-joining of DMs.
-- 3. Feed integrity: blocks normal student post-pinning escalation on INSERT.
-- 4. Discussion scoping: restricts post_comments SELECT & INSERT to post scope.
-- 5. Marketplace scoping: prevents cross-campus/global student listing injection.
-- 6. Role escalation & hierarchy hardening:
--    - Root Super Admin (inememmanuel@gmail.com & admin_role = 'super_admin')
--      maintains absolute unrestricted control across the entire platform.
--    - Campus Admins cannot promote/demote admins, cannot touch Super Admins,
--      cannot alter campus codes, and can only moderate non-admins in their own campus.
--    - Hardens suspend_user_account() against unauthorized admin suspensions.
-- 7. Audit log visibility: Campus Admins are scoped to their own campus;
--    Super Admin retains full visibility across all campuses.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. ONBOARDING PERSISTENCE & INTEGRITY
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step TEXT,
  ADD COLUMN IF NOT EXISTS admin_role TEXT,
  ADD COLUMN IF NOT EXISTS is_campus_ambassador BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure students & alumni cannot mark onboarding_complete without university and department
CREATE OR REPLACE FUNCTION public.check_onboarding_completion_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.onboarding_complete = TRUE AND (OLD.onboarding_complete IS NULL OR OLD.onboarding_complete = FALSE) THEN
    -- Super Admin and Staff are exempt
    IF NEW.role IN ('student', 'alumni') AND LOWER(COALESCE(NEW.email, '')) <> 'inememmanuel@gmail.com' THEN
      IF NEW.campus_code IS NULL OR NEW.campus_code = 'GLOBAL' OR NEW.department IS NULL OR trim(NEW.department) = '' THEN
        NEW.onboarding_complete := FALSE;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_check_onboarding_completion_integrity ON public.profiles;
CREATE TRIGGER trg_check_onboarding_completion_integrity
  BEFORE INSERT OR UPDATE OF onboarding_complete, campus_code, department ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_onboarding_completion_integrity();

-- ----------------------------------------------------------------------------
-- 2. HARDEN prevent_profile_role_escalation TRIGGER FUNCTION
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

    -- Root Super Admin (inememmanuel@gmail.com or super_admin) retains absolute authority
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
        NEW.trust_score := OLD.trust_score;
        NEW.verification_status := OLD.verification_status;
        RETURN NEW;
    END IF;

    -- Campus Admin authority: strictly scoped to non-admins on their own campus node
    IF v_caller_role = 'admin' AND (v_caller_admin_role = 'campus_admin' OR v_caller_admin_role IS NULL) THEN
        -- Cannot modify other admins or promote anyone to admin / change admin_role
        IF OLD.role::text = 'admin' OR NEW.role::text = 'admin' OR (NEW.admin_role IS DISTINCT FROM OLD.admin_role) THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_suspended := OLD.is_suspended;
            NEW.suspension_reason := OLD.suspension_reason;
            NEW.trust_score := OLD.trust_score;
            NEW.verification_status := OLD.verification_status;
            RETURN NEW;
        END IF;

        -- Cannot transfer users to a different campus
        IF NEW.campus_code IS DISTINCT FROM OLD.campus_code THEN
            NEW.campus_code := OLD.campus_code;
        END IF;

        -- If target is outside their campus, prevent moderating suspension/verification/ambassador
        IF v_caller_campus IS NOT NULL AND v_caller_campus <> 'GLOBAL' AND OLD.campus_code <> v_caller_campus THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_suspended := OLD.is_suspended;
            NEW.suspension_reason := OLD.suspension_reason;
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
            NEW.trust_score := OLD.trust_score;
            NEW.verification_status := OLD.verification_status;
            RETURN NEW;
        END IF;

        IF (v_caller_campus = OLD.campus_code OR v_caller_campus = 'GLOBAL' OR OLD.campus_code = 'GLOBAL') THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_campus_ambassador := OLD.is_campus_ambassador;
            RETURN NEW;
        END IF;
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
-- 3. HARDEN suspend_user_account RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.suspend_user_account(
  p_target_user_id uuid,
  p_reason text DEFAULT 'Moderation policy violation'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_caller_admin_role text;
  v_caller_campus text;
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
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;
  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required.';
  END IF;
  IF v_caller = p_target_user_id THEN
    RAISE EXCEPTION 'You cannot suspend your own account.' USING ERRCODE = '42501';
  END IF;

  SELECT role::text, admin_role, campus_code, LOWER(COALESCE(email, '')), COALESCE(is_suspended, false)
    INTO v_caller_role, v_caller_admin_role, v_caller_campus, v_caller_email, v_caller_suspended
    FROM public.profiles WHERE id = v_caller;

  IF v_caller_role IS NULL OR v_caller_suspended THEN
    RAISE EXCEPTION 'Insufficient permissions to suspend user accounts.' USING ERRCODE = '42501';
  END IF;

  SELECT role::text, admin_role, campus_code, LOWER(COALESCE(email, '')), COALESCE(is_suspended, false)
    INTO v_target_role, v_target_admin_role, v_target_campus, v_target_email, v_target_suspended
    FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found.';
  END IF;

  -- The Root Super Admin can never be suspended by anyone
  IF v_target_email = 'inememmanuel@gmail.com' THEN
    RAISE EXCEPTION 'The primary root administrator cannot be suspended.' USING ERRCODE = '42501';
  END IF;

  -- Super Admin callers maintain full authority (except over inememmanuel@gmail.com and last active admin)
  IF (v_caller_role = 'admin' AND v_caller_admin_role = 'super_admin') OR v_caller_email = 'inememmanuel@gmail.com' THEN
    IF v_target_role = 'admin' AND NOT v_target_suspended THEN
      PERFORM pg_advisory_xact_lock(hashtext('lioris.last_active_admin'));
      SELECT count(*) INTO v_other_admins
        FROM public.profiles p
       WHERE p.id <> p_target_user_id AND p.role::text = 'admin' AND NOT COALESCE(p.is_suspended, false);
      IF v_other_admins = 0 THEN
        RAISE EXCEPTION 'Cannot suspend the last active administrator.' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF v_caller_role = 'admin' AND (v_caller_admin_role = 'campus_admin' OR v_caller_admin_role IS NULL) THEN
    -- Campus admins cannot suspend any admin (super_admin or campus_admin)
    IF v_target_role = 'admin' OR v_target_admin_role = 'super_admin' THEN
      RAISE EXCEPTION 'Campus Admins cannot suspend administrator accounts.' USING ERRCODE = '42501';
    END IF;
    -- Campus admins can only suspend users within their campus
    IF v_target_campus IS DISTINCT FROM v_caller_campus THEN
      RAISE EXCEPTION 'Campus Admins cannot moderate users outside their registered campus node.' USING ERRCODE = '42501';
    END IF;
  ELSIF v_caller_role = 'staff' THEN
    IF v_target_role NOT IN ('student', 'alumni') THEN
      RAISE EXCEPTION 'Staff cannot suspend admin or staff accounts.' USING ERRCODE = '42501';
    END IF;
    IF NOT (v_target_campus = v_caller_campus OR v_caller_campus = 'GLOBAL') THEN
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
  UPDATE public.profiles
     SET is_suspended = true,
         suspension_reason = v_reason
   WHERE id = p_target_user_id;
  PERFORM set_config('lioris.audit_skip', '', true);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_caller, 'user_suspended', 'user', p_target_user_id,
          jsonb_build_object(
            'summary', 'Account suspended via suspend_user_account()',
            'reason', v_reason,
            'actorRole', v_caller_role,
            'targetRole', v_target_role,
            'targetCampus', v_target_campus,
            'source', 'suspend_user_account'));

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE WHEN v_caller_admin_role = 'super_admin' OR v_caller_email = 'inememmanuel@gmail.com'
                    THEN 'User account permanently suspended by Super Admin.'
                    WHEN v_caller_role = 'admin'
                    THEN 'User account permanently suspended by Campus Admin.'
                    ELSE 'User account suspended by Campus Staff.' END);
END;
$$;

REVOKE ALL ON FUNCTION public.suspend_user_account(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suspend_user_account(uuid, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. POST PINNING AUTHORITY (ON INSERT & UPDATE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_post_pin_authority()
RETURNS TRIGGER AS $$
DECLARE
  actor_role TEXT;
  actor_admin_role TEXT;
  actor_campus TEXT;
  actor_email TEXT;
  is_comm_mgr BOOLEAN := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_pinned, false) = true THEN
      SELECT role::text, admin_role, campus_code, LOWER(COALESCE(email, ''))
        INTO actor_role, actor_admin_role, actor_campus, actor_email
        FROM public.profiles WHERE id = auth.uid();

      IF to_regprocedure('public.is_community_manager(text)') IS NOT NULL THEN
        BEGIN
          EXECUTE 'SELECT public.is_community_manager($1)' INTO is_comm_mgr USING NEW.category;
        EXCEPTION WHEN OTHERS THEN
          is_comm_mgr := false;
        END;
      END IF;

      IF NOT (
        actor_role = 'admin' OR
        actor_email = 'inememmanuel@gmail.com' OR
        (actor_role = 'staff' AND (actor_campus = NEW.campus_code OR actor_campus = 'GLOBAL' OR NEW.campus_code = 'GLOBAL')) OR
        is_comm_mgr
      ) THEN
        NEW.is_pinned := false;
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_pinned IS DISTINCT FROM OLD.is_pinned THEN
      SELECT role::text, admin_role, campus_code, LOWER(COALESCE(email, ''))
        INTO actor_role, actor_admin_role, actor_campus, actor_email
        FROM public.profiles WHERE id = auth.uid();

      IF to_regprocedure('public.is_community_manager(text)') IS NOT NULL THEN
        BEGIN
          EXECUTE 'SELECT public.is_community_manager($1)' INTO is_comm_mgr USING OLD.category;
        EXCEPTION WHEN OTHERS THEN
          is_comm_mgr := false;
        END;
      END IF;

      IF NOT (
        actor_role = 'admin' OR
        actor_email = 'inememmanuel@gmail.com' OR
        (actor_role = 'staff' AND (actor_campus = OLD.campus_code OR actor_campus = 'GLOBAL' OR OLD.campus_code = 'GLOBAL')) OR
        is_comm_mgr
      ) THEN
        NEW.is_pinned := OLD.is_pinned;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_post_pin_authority ON public.posts;
CREATE TRIGGER trg_enforce_post_pin_authority
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_post_pin_authority();

-- ----------------------------------------------------------------------------
-- 5. CHAT PRIVACY & SNOOPING PREVENTION (chat_channel_members INSERT)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can join or add members to channels" ON public.chat_channel_members;
DROP POLICY IF EXISTS "Members or admins can add members to channels" ON public.chat_channel_members;

CREATE POLICY "Members or admins can add members to channels"
ON public.chat_channel_members FOR INSERT TO authenticated
WITH CHECK (
    NOT COALESCE((SELECT is_suspended FROM public.profiles WHERE id = auth.uid()), false)
    AND (
        -- Admins and Super Admin retain full access
        public.auth_profile_role() = 'admin'
        -- Existing member can add others
        OR public.is_channel_member(channel_id)
        -- Creator can enroll initial participants
        OR EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = channel_id AND c.created_by = auth.uid())
        -- Normal users can ONLY self-join open/public non-DM channels within their campus
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

-- ----------------------------------------------------------------------------
-- 6. POST COMMENTS SCOPING (SELECT & INSERT)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Post comments are viewable by authenticated users" ON public.post_comments;
DROP POLICY IF EXISTS "Post comments viewable if post is viewable" ON public.post_comments;

CREATE POLICY "Post comments viewable if post is viewable"
ON public.post_comments FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.posts p
        WHERE p.id = post_comments.post_id
          AND (
              p.visibility_scope = 'global'
              OR p.campus_code = 'GLOBAL'
              OR p.campus_code IS NULL
              OR p.campus_code = (SELECT campus_code FROM public.profiles WHERE id = auth.uid())
              OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND (campus_code = p.campus_code OR campus_code = 'GLOBAL'))))
          )
    )
);

DROP POLICY IF EXISTS "Authenticated users can comment on posts" ON public.post_comments;
CREATE POLICY "Authenticated users can comment on posts"
ON public.post_comments FOR INSERT TO authenticated
WITH CHECK (
    auth.uid() = author_id
    AND NOT COALESCE((SELECT is_suspended FROM public.profiles WHERE id = auth.uid()), false)
    AND EXISTS (
        SELECT 1 FROM public.posts p
        WHERE p.id = post_comments.post_id
          AND (
              p.visibility_scope = 'global'
              OR p.campus_code = 'GLOBAL'
              OR p.campus_code IS NULL
              OR p.campus_code = (SELECT campus_code FROM public.profiles WHERE id = auth.uid())
              OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND (campus_code = p.campus_code OR campus_code = 'GLOBAL'))))
          )
    )
);

-- ----------------------------------------------------------------------------
-- 7. MARKETPLACE LISTING SCOPING (INSERT)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can create marketplace listings" ON public.marketplace_listings;
DROP POLICY IF EXISTS "Students, staff and admin can create marketplace listings" ON public.marketplace_listings;
CREATE POLICY "Students, staff and admin can create marketplace listings" ON public.marketplace_listings
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = seller_id
  AND NOT COALESCE((SELECT is_suspended FROM public.profiles WHERE id = auth.uid()), false)
  AND (
    public.auth_profile_role() IN ('admin', 'staff')
    OR (
      public.auth_profile_role() = 'student'
      AND (campus_code = public.auth_profile_campus() OR public.auth_profile_campus() = 'GLOBAL' OR campus_code IS NULL)
    )
  )
);

-- ----------------------------------------------------------------------------
-- 8. AUDIT LOG VISIBILITY (SELECT)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and staff can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins and staff can view audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
              -- Super Admin maintains full, unrestricted visibility
              (p.role = 'admin' AND (p.admin_role = 'super_admin' OR LOWER(COALESCE(p.email, '')) = 'inememmanuel@gmail.com' OR p.campus_code = 'GLOBAL'))
              -- Campus Admins and Staff view entries for their campus node or their own actions
              OR (
                  p.role IN ('admin', 'staff')
                  AND (
                      audit_logs.metadata->>'institutionCode' = p.campus_code
                      OR audit_logs.metadata->>'targetCampus' = p.campus_code
                      OR audit_logs.actor_id = auth.uid()
                  )
              )
          )
    )
);

-- ----------------------------------------------------------------------------
-- 9. SUPER ADMIN HELPER DEFINITION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_is_super_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE((
    SELECT (role = 'admin' AND admin_role = 'super_admin') OR LOWER(COALESCE(email, '')) = 'inememmanuel@gmail.com'
    FROM public.profiles
    WHERE id = auth.uid()
  ), false);
$$;

REVOKE ALL ON FUNCTION public.auth_is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_super_admin() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 10. SCOPE admin_paid_events_overview FOR CAMPUS ADMINS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_paid_events_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_is_super boolean;
  v_caller_campus text;
BEGIN
  IF NOT COALESCE(public.auth_profile_role() = 'admin', false) THEN RAISE EXCEPTION 'not_allowed'; END IF;

  v_is_super := public.auth_is_super_admin();
  v_caller_campus := public.auth_profile_campus();

  RETURN COALESCE((
    SELECT jsonb_agg(row_data ORDER BY (row_data ->> 'start_time') DESC)
    FROM (
      SELECT jsonb_build_object(
        'event_id', e.id, 'title', e.title, 'campus_code', e.campus_code, 'status', e.status::text,
        'start_time', e.start_time, 'end_time', e.end_time, 'organiser_id', e.creator_id,
        'organiser_name', COALESCE(o.full_name, 'Organiser'),
        'price', e.ticket_price, 'payment_method', e.payment_method, 'reservation_held', e.reservation_held,
        'capacity', e.capacity, 'booking_deadline', e.booking_deadline,
        'review_status', e.payment_review_status, 'review_note', e.payment_review_note, 'reviewed_at', e.payment_reviewed_at,
        'payment_url', d.payment_url, 'instructions', d.instructions,
        'link_host', lower(substring(d.payment_url FROM '^https://([^/?#]*)')),
        'link_check', d.link_check,
        'link_check_stale', d.link_check IS NOT NULL AND d.link_check ->> 'url' IS DISTINCT FROM d.payment_url,
        'link_clicks', (SELECT count(*) FROM public.event_payment_clicks c WHERE c.event_id = e.id),
        'rsvps', (SELECT count(*) FROM public.event_attendees a WHERE a.event_id = e.id),
        'checked_in', (SELECT count(*) FROM public.event_attendees a WHERE a.event_id = e.id AND a.checked_in_at IS NOT NULL),
        'purchases_confirmed', (SELECT count(*) FROM public.event_attendees a WHERE a.event_id = e.id AND a.purchase_confirmed_at IS NOT NULL),
        'partnership_status', COALESCE(pt.status, 'none'),
        'fee_per_paying_attendee', pt.fee_per_paying_attendee,
        'organiser_legal_name', pt.organiser_name,
        'organiser_contact', pt.organiser_contact,
        'dispute_window_days', COALESCE(pt.dispute_window_days, 7),
        'agreed_at', pt.agreed_at,
        'partnership_notes', pt.notes
      ) AS row_data
      FROM public.events e
      LEFT JOIN public.profiles o ON o.id = e.creator_id
      LEFT JOIN public.event_payment_details d ON d.event_id = e.id
      LEFT JOIN public.event_partnerships pt ON pt.event_id = e.id
      WHERE e.ticket_type = 'paid'
        AND (
          v_is_super
          OR v_caller_campus IS NULL
          OR v_caller_campus = 'GLOBAL'
          OR e.campus_code = v_caller_campus
          OR e.campus_code = 'GLOBAL'
          OR e.campus_code IS NULL
        )
      ORDER BY e.start_time DESC
      LIMIT 500
    ) s
  ), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.admin_paid_events_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_paid_events_overview() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 11. GIVING CAMPAIGNS CAMPUS SCOPING FOR ADMINS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owner edits their own campaign; admin edits any" ON public.giving_campaigns;
CREATE POLICY "Owner edits their own campaign; admin edits any" ON public.giving_campaigns
  FOR UPDATE TO authenticated USING (
    creator_id = auth.uid()
    OR public.auth_is_super_admin()
    OR (
      public.auth_profile_role() = 'admin'
      AND (
        campus_code = public.auth_profile_campus()
        OR campus_code = 'GLOBAL'
        OR campus_code IS NULL
        OR public.auth_profile_campus() = 'GLOBAL'
        OR public.auth_profile_campus() IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "Owner deletes their own campaign; admin deletes any" ON public.giving_campaigns;
CREATE POLICY "Owner deletes their own campaign; admin deletes any" ON public.giving_campaigns
  FOR DELETE TO authenticated USING (
    creator_id = auth.uid()
    OR public.auth_is_super_admin()
    OR (
      public.auth_profile_role() = 'admin'
      AND (
        campus_code = public.auth_profile_campus()
        OR campus_code = 'GLOBAL'
        OR campus_code IS NULL
        OR public.auth_profile_campus() = 'GLOBAL'
        OR public.auth_profile_campus() IS NULL
      )
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
