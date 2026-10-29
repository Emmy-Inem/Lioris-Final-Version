-- Campus Ambassadors are the operational administrators for one campus.
-- They retain a student-facing portal in the client, but their database role
-- is campus_admin so every existing campus scope, audit and hierarchy rule is
-- reused. They never receive super_admin or GLOBAL authority.

BEGIN;

-- The profile guard normally prevents a Campus Admin from creating another
-- administrator. Ambassador appointment/revocation is the one narrow,
-- auditable exception: student <-> flagged campus_admin, same campus only.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_role text;
  v_caller_admin_role text;
  v_caller_campus text;
  v_caller_email text;
  v_scoped boolean;
  v_ambassador_transition boolean;
BEGIN
  IF v_uid IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT LOWER(COALESCE(p.role::text, '')), COALESCE(p.admin_role, ''),
         NULLIF(p.campus_code, ''), LOWER(COALESCE(p.email, ''))
    INTO v_caller_role, v_caller_admin_role, v_caller_campus, v_caller_email
  FROM public.profiles p WHERE p.id = v_uid;

  IF (v_caller_role = 'admin' AND v_caller_admin_role = 'super_admin')
     OR v_caller_email = 'inememmanuel@gmail.com'
     OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'inememmanuel@gmail.com' THEN
    RETURN NEW;
  END IF;

  IF OLD.admin_role = 'super_admin'
     OR LOWER(COALESCE(OLD.email, '')) = 'inememmanuel@gmail.com' THEN
    NEW.role := OLD.role;
    NEW.admin_role := OLD.admin_role;
    NEW.campus_code := OLD.campus_code;
    NEW.is_suspended := OLD.is_suspended;
    NEW.suspension_reason := OLD.suspension_reason;
    NEW.muted_until := OLD.muted_until;
    NEW.trust_score := OLD.trust_score;
    NEW.verification_status := OLD.verification_status;
    NEW.is_campus_ambassador := OLD.is_campus_ambassador;
    NEW.is_bot := OLD.is_bot;
    NEW.email := OLD.email;
    RETURN NEW;
  END IF;

  v_scoped := v_caller_role IN ('admin', 'staff')
              AND v_caller_campus IS NOT NULL AND v_caller_campus <> 'GLOBAL'
              AND v_uid <> OLD.id AND OLD.campus_code = v_caller_campus;

  v_ambassador_transition := v_scoped AND (
    (OLD.role::text = 'student' AND COALESCE(OLD.is_campus_ambassador, false) = false
      AND NEW.role::text = 'admin' AND COALESCE(NEW.admin_role, '') = 'campus_admin'
      AND COALESCE(NEW.is_campus_ambassador, false) = true)
    OR
    (OLD.role::text = 'admin' AND COALESCE(OLD.admin_role, '') = 'campus_admin'
      AND COALESCE(OLD.is_campus_ambassador, false) = true
      AND NEW.role::text = 'student' AND NEW.admin_role IS NULL
      AND COALESCE(NEW.is_campus_ambassador, false) = false)
  );

  IF v_ambassador_transition THEN
    IF NOT public.has_role_permission('can_manage_roles') THEN
      RAISE EXCEPTION 'permission_denied: campus role management is disabled';
    END IF;
    NEW.campus_code := OLD.campus_code;
    NEW.is_suspended := OLD.is_suspended;
    NEW.suspension_reason := OLD.suspension_reason;
    NEW.muted_until := OLD.muted_until;
    NEW.trust_score := OLD.trust_score;
    NEW.is_bot := OLD.is_bot;
    NEW.email := OLD.email;
    RETURN NEW;
  END IF;

  IF v_scoped AND v_caller_role = 'admin' THEN
    IF OLD.role::text = 'admin' OR NEW.role::text = 'admin' OR NEW.admin_role IS DISTINCT FROM OLD.admin_role THEN
      NEW.role := OLD.role;
      NEW.admin_role := OLD.admin_role;
      NEW.campus_code := OLD.campus_code;
      NEW.is_suspended := OLD.is_suspended;
      NEW.suspension_reason := OLD.suspension_reason;
      NEW.muted_until := OLD.muted_until;
      NEW.trust_score := OLD.trust_score;
      NEW.verification_status := OLD.verification_status;
      NEW.is_campus_ambassador := OLD.is_campus_ambassador;
      NEW.is_bot := OLD.is_bot;
      NEW.email := OLD.email;
      RETURN NEW;
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.has_role_permission('can_manage_roles') THEN
      NEW.role := OLD.role;
    END IF;
    -- Ambassador appointments must always use the audited RPC and its atomic
    -- student <-> campus_admin transition. A flag-only write is invalid.
    NEW.is_campus_ambassador := OLD.is_campus_ambassador;
    NEW.campus_code := OLD.campus_code;
    NEW.is_bot := OLD.is_bot;
    NEW.email := OLD.email;
    RETURN NEW;
  END IF;

  IF v_scoped AND v_caller_role = 'staff' THEN
    IF OLD.role::text IN ('admin', 'staff') THEN
      NEW.role := OLD.role;
      NEW.admin_role := OLD.admin_role;
      NEW.campus_code := OLD.campus_code;
      NEW.is_suspended := OLD.is_suspended;
      NEW.suspension_reason := OLD.suspension_reason;
      NEW.muted_until := OLD.muted_until;
      NEW.trust_score := OLD.trust_score;
      NEW.verification_status := OLD.verification_status;
      NEW.is_campus_ambassador := OLD.is_campus_ambassador;
      NEW.is_bot := OLD.is_bot;
      NEW.email := OLD.email;
      RETURN NEW;
    END IF;
    NEW.role := OLD.role;
    NEW.admin_role := OLD.admin_role;
    NEW.campus_code := OLD.campus_code;
    NEW.trust_score := OLD.trust_score;
    NEW.is_campus_ambassador := OLD.is_campus_ambassador;
    NEW.is_bot := OLD.is_bot;
    NEW.email := OLD.email;
    RETURN NEW;
  END IF;

  NEW.role := OLD.role;
  NEW.admin_role := OLD.admin_role;
  NEW.verification_status := OLD.verification_status;
  NEW.is_suspended := OLD.is_suspended;
  NEW.suspension_reason := OLD.suspension_reason;
  NEW.muted_until := OLD.muted_until;
  NEW.trust_score := OLD.trust_score;
  NEW.campus_code := OLD.campus_code;
  NEW.is_campus_ambassador := OLD.is_campus_ambassador;
  NEW.is_bot := OLD.is_bot;
  NEW.email := OLD.email;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_campus_ambassador_status(p_user_id uuid, p_is_ambassador boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_campus text;
  v_target public.profiles%ROWTYPE;
  v_super boolean;
BEGIN
  IF v_actor IS NULL AND auth.role() <> 'service_role' THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_actor = p_user_id THEN RAISE EXCEPTION 'conflict_of_interest: ambassadors cannot change their own appointment'; END IF;

  v_super := auth.role() = 'service_role' OR public.auth_is_super_admin();
  IF NOT v_super THEN
    SELECT LOWER(COALESCE(role::text, '')), NULLIF(campus_code, '')
      INTO v_actor_role, v_actor_campus FROM public.profiles WHERE id = v_actor;
    IF v_actor_role NOT IN ('admin', 'staff') THEN RAISE EXCEPTION 'admin_required'; END IF;
    IF v_actor_campus IS NULL OR v_actor_campus = 'GLOBAL' THEN RAISE EXCEPTION 'campus_assignment_required'; END IF;
    IF NOT public.has_role_permission('can_manage_roles') THEN
      RAISE EXCEPTION 'permission_denied: campus role management is disabled';
    END IF;
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_target.campus_code IS NULL OR v_target.campus_code = 'GLOBAL'
     OR NOT EXISTS (
       SELECT 1 FROM public.campuses c
        WHERE c.code = v_target.campus_code AND c.is_active = true
     ) THEN
    RAISE EXCEPTION 'invalid_target_campus: a Campus Ambassador must belong to an active campus';
  END IF;
  IF NOT v_super AND v_target.campus_code IS DISTINCT FROM v_actor_campus THEN
    RAISE EXCEPTION 'unauthorized_campus_scope: you can only manage ambassadors in your own campus';
  END IF;
  IF p_is_ambassador AND (v_target.role::text <> 'student' OR COALESCE(v_target.is_suspended, false)) THEN
    RAISE EXCEPTION 'invalid_target: only active student accounts can be appointed';
  END IF;
  IF NOT p_is_ambassador AND NOT (
    v_target.role::text = 'admin' AND v_target.admin_role = 'campus_admin' AND COALESCE(v_target.is_campus_ambassador, false)
  ) THEN
    RAISE EXCEPTION 'invalid_target: that account is not an active Campus Ambassador';
  END IF;

  IF p_is_ambassador THEN
    UPDATE public.profiles
       SET role = 'admin', admin_role = 'campus_admin', is_campus_ambassador = true,
           verification_status = 'verified', onboarding_complete = true, updated_at = now()
     WHERE id = p_user_id;
  ELSE
    UPDATE public.profiles
       SET role = 'student', admin_role = NULL, is_campus_ambassador = false, updated_at = now()
     WHERE id = p_user_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_actor, 'campus_ambassador_updated', 'user', p_user_id,
          jsonb_build_object('summary', CASE WHEN p_is_ambassador THEN 'Campus Ambassador appointed with campus-admin authority' ELSE 'Campus Ambassador authority revoked' END,
                             'targetCampus', v_target.campus_code, 'campusAuthority', p_is_ambassador));
END;
$$;

REVOKE ALL ON FUNCTION public.set_campus_ambassador_status(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_campus_ambassador_status(uuid, boolean) TO authenticated, service_role;

-- Upgrade every existing appointment. The migration runner has no end-user
-- auth.uid(), so the profile guard intentionally permits this trusted backfill.
UPDATE public.profiles
   SET role = 'admin', admin_role = 'campus_admin', verification_status = 'verified',
       onboarding_complete = true, updated_at = now()
 WHERE is_campus_ambassador = true
   AND role::text = 'student'
   AND campus_code IS NOT NULL
   AND campus_code <> 'GLOBAL';

COMMIT;
