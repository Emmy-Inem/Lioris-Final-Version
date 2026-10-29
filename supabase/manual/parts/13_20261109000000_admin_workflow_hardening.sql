-- LIORIS manual SQL, part 13 of 18: 20261109000000_admin_workflow_hardening.sql
-- Paste this whole file into the Supabase SQL editor and Run. Parts must be run in order; the guard below
-- stops this part if an earlier one is missing. Safe to run twice.
SET lock_timeout = '8s';
SET statement_timeout = '180s';

CREATE TABLE IF NOT EXISTS public._manual_migration_log (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._manual_migration_log ENABLE ROW LEVEL SECURITY;


-- ########## 20261109000000_admin_workflow_hardening.sql ##########
-- ============================================================================
-- LIORIS - ADMIN / STAFF / ALUMNI WORKFLOW HARDENING
-- ============================================================================
-- Runs after 20261105000000, so every function it replaces is the LATEST definition.
--
--   S1  jobs: an edit of an approved posting by its (non-admin) poster re-queues it;
--       a rejected posting gets rejected_at so it leaves the review queue (C6)
--   S2  giving campaigns: confirmed_total is admin-only, owners report reported_total;
--       admin_review_giving_campaign / admin_update_giving_total record the actor,
--       enforce campus scope, require a pending review, and audit inside SQL
--   S3  paid events: admin_apply_payment_review rejects stale / repeated decisions,
--       enforces campus scope for the actor (GLOBAL / NULL = Super Admin only)
--   S4  unsuspend_user_account() and admin_verify_user() RPCs (scope + audit inside)
--   S5  admin_broadcast_notification(): server-side fan-out with a real recipient count,
--       audit row in the same transaction, per-caller rate limit; notifications get an
--       announcement_id link so deleting an announcement removes its notifications
--   S6  audit_logs: BEFORE INSERT trigger stamps metadata.targetCampus so DB-trigger rows
--       become visible to the right campus admin (still append-only)
--   S7  moderation_queue: reporters cannot pre-set status / assignee / campus
--   C8  admin_active_users_count(): campus-scoped "active now" for the dashboards
--
-- Idempotent, one transaction. Edge functions admin-review-giving-campaign and
-- admin-review-paid-event must be redeployed together with this migration (their RPC
-- signatures gained p_actor / p_expected_* arguments).
-- ============================================================================

BEGIN;
DO $chain$ BEGIN IF NOT EXISTS (SELECT 1 FROM public._manual_migration_log WHERE version = '20261108000000') THEN RAISE EXCEPTION 'Stopped: migration 20261108000000 has not been applied. Fix it and re-run this whole file.'; END IF; END $chain$;

DO $do$
BEGIN
  IF to_regclass('public.profiles') IS NULL OR to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'profiles / audit_logs missing. Apply the base schema first.';
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 0. Actor helpers for functions called by edge functions as service_role
--    (auth.uid() is NULL there, so authority is judged from the passed actor).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lioris_actor_is_super(p_actor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT p.role::text = 'admin'
       AND NOT COALESCE(p.is_suspended, false)
       AND (p.admin_role = 'super_admin' OR lower(COALESCE(p.email, '')) = 'inememmanuel@gmail.com')
    FROM public.profiles p WHERE p.id = p_actor
  ), false);
$$;

-- Super Admin: any campus. Campus Admin: only their own real campus; a GLOBAL / NULL
-- campus row (and a GLOBAL / NULL admin) never matches, so those are Super Admin only.
CREATE OR REPLACE FUNCTION public.lioris_actor_can_admin_campus(p_actor uuid, p_campus text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.lioris_actor_is_super(p_actor)
      OR COALESCE((
        SELECT p.role::text = 'admin'
           AND NOT COALESCE(p.is_suspended, false)
           AND p.campus_code IS NOT NULL
           AND p.campus_code <> 'GLOBAL'
           AND p_campus IS NOT NULL
           AND p.campus_code = p_campus
        FROM public.profiles p WHERE p.id = p_actor
      ), false);
$$;

REVOKE ALL ON FUNCTION public.lioris_actor_is_super(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lioris_actor_can_admin_campus(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lioris_actor_is_super(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.lioris_actor_can_admin_campus(uuid, text) TO service_role;

-- ----------------------------------------------------------------------------
-- S1 / C6. jobs: re-review on edit; rejected_at keeps rejected postings out of the queue
-- ----------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.jobs') IS NOT NULL THEN
    ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
    -- already-rejected postings (reason recorded, never approved) leave the queue
    UPDATE public.jobs
       SET rejected_at = COALESCE(approved_at, created_at, now())
     WHERE is_approved = false AND rejection_reason IS NOT NULL AND rejected_at IS NULL;
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.enforce_job_moderation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_role text;
    v_content_changed boolean;
BEGIN
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid();

    IF TG_OP = 'INSERT' THEN
        IF v_role IN ('admin', 'staff') THEN RETURN NEW; END IF;
        NEW.is_approved := false;
        NEW.approved_by := NULL;
        NEW.approved_at := NULL;
        NEW.rejection_reason := NULL;
        NEW.rejected_at := NULL;
        RETURN NEW;
    END IF;

    v_content_changed :=
        NEW.title IS DISTINCT FROM OLD.title
        OR NEW.company IS DISTINCT FROM OLD.company
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.apply_url IS DISTINCT FROM OLD.apply_url
        OR NEW.accepts_in_app_applications IS DISTINCT FROM OLD.accepts_in_app_applications
        OR NEW.location IS DISTINCT FROM OLD.location
        OR NEW.salary IS DISTINCT FROM OLD.salary
        OR NEW.is_remote IS DISTINCT FROM OLD.is_remote;

    IF v_role = 'admin' THEN RETURN NEW; END IF;
    -- Staff moderate other people's postings freely; a staff member editing the content
    -- of their OWN approved posting goes back through review like everyone else.
    IF v_role = 'staff' AND NOT (v_content_changed AND OLD.is_approved AND OLD.poster_id = auth.uid()) THEN
        RETURN NEW;
    END IF;

    NEW.is_approved := OLD.is_approved;
    NEW.approved_by := OLD.approved_by;
    NEW.approved_at := OLD.approved_at;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.rejected_at := OLD.rejected_at;

    IF v_content_changed THEN
        IF OLD.is_approved THEN
            NEW.is_approved := false;
            NEW.approved_by := NULL;
            NEW.approved_at := NULL;
        ELSIF OLD.rejected_at IS NOT NULL OR OLD.rejection_reason IS NOT NULL THEN
            -- the poster fixed a rejected posting: it is a fresh submission for the queue
            NEW.rejected_at := NULL;
            NEW.rejection_reason := NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DO $do$
BEGIN
  IF to_regclass('public.jobs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_enforce_job_moderation ON public.jobs;
    CREATE TRIGGER trg_enforce_job_moderation
      BEFORE INSERT OR UPDATE ON public.jobs
      FOR EACH ROW EXECUTE FUNCTION public.enforce_job_moderation();
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- S2. giving campaigns
-- ----------------------------------------------------------------------------
ALTER TABLE public.giving_campaigns
  ADD COLUMN IF NOT EXISTS reported_total NUMERIC(12, 2) NOT NULL DEFAULT 0;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'giving_campaigns_reported_total_nonneg') THEN
    ALTER TABLE public.giving_campaigns
      ADD CONSTRAINT giving_campaigns_reported_total_nonneg CHECK (reported_total >= 0);
  END IF;
END
$do$;
COMMENT ON COLUMN public.giving_campaigns.reported_total IS
  'Running total as REPORTED by the campaign organiser (unverified). confirmed_total is admin-only.';
COMMENT ON COLUMN public.giving_campaigns.confirmed_total IS
  'Total confirmed by an administrator. Owners cannot write it; they report reported_total.';

-- Totals owners typed into confirmed_total before this split are really organiser claims.
UPDATE public.giving_campaigns SET reported_total = confirmed_total
 WHERE reported_total = 0 AND confirmed_total > 0;

CREATE OR REPLACE FUNCTION public.enforce_giving_campaign_moderation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_role text;
BEGIN
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role = 'admin' THEN RETURN NEW; END IF;

    IF NEW.reported_total IS NULL OR NEW.reported_total < 0 THEN
        RAISE EXCEPTION 'invalid_reported_total: The reported total must be zero or a positive amount.';
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.review_status := 'pending';
        NEW.reviewed_by := NULL;
        NEW.reviewed_at := NULL;
        NEW.review_note := NULL;
        NEW.confirmed_total := 0;
    ELSE
        IF NEW.review_status IS DISTINCT FROM OLD.review_status
           OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
            NEW.review_status := OLD.review_status;
            NEW.reviewed_by := OLD.reviewed_by;
            NEW.reviewed_at := OLD.reviewed_at;
        END IF;

        -- confirmed_total is admin-only: an owner's value is silently kept at OLD.
        NEW.confirmed_total := OLD.confirmed_total;

        IF OLD.review_status = 'approved' AND (
            NEW.title IS DISTINCT FROM OLD.title
            OR NEW.description IS DISTINCT FROM OLD.description
            OR NEW.goal_amount IS DISTINCT FROM OLD.goal_amount
            OR NEW.giving_url IS DISTINCT FROM OLD.giving_url
            OR NEW.cover_image_url IS DISTINCT FROM OLD.cover_image_url
            OR NEW.campus_code IS DISTINCT FROM OLD.campus_code
        ) THEN
            NEW.review_status := 'pending';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_review_giving_campaign(uuid, boolean, text);
CREATE OR REPLACE FUNCTION public.admin_review_giving_campaign(
    p_campaign uuid, p_approve boolean, p_note text DEFAULT NULL,
    p_actor uuid DEFAULT NULL, p_allow_rereview boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    c public.giving_campaigns%ROWTYPE;
    v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
    v_status text;
    v_rows int;
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_actor AND role::text = 'admin' AND NOT COALESCE(is_suspended, false)
    ) THEN
        RAISE EXCEPTION 'not_allowed: Only an active administrator can review a giving campaign.';
    END IF;

    SELECT * INTO c FROM public.giving_campaigns WHERE id = p_campaign FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found: That giving campaign does not exist.'; END IF;

    IF NOT public.lioris_actor_can_admin_campus(p_actor, c.campus_code) THEN
        RAISE EXCEPTION 'not_allowed: Campus Admins can only review campaigns of their own campus; global campaigns are for Super Admins.';
    END IF;

    IF c.review_status <> 'pending'
       AND NOT (COALESCE(p_allow_rereview, false) AND public.lioris_actor_is_super(p_actor)) THEN
        RAISE EXCEPTION 'already_reviewed: This campaign was already % (re-review is a Super Admin action).', c.review_status;
    END IF;

    IF NOT p_approve THEN
        IF v_note IS NULL OR char_length(v_note) < 5 THEN
            RAISE EXCEPTION 'note_required: A rejection needs a short reason (5+ characters).';
        END IF;
    END IF;
    v_status := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;

    UPDATE public.giving_campaigns
       SET review_status = v_status, reviewed_by = p_actor, reviewed_at = now(), review_note = v_note
     WHERE id = p_campaign;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN RAISE EXCEPTION 'not_found: Nothing was updated; the campaign no longer exists.'; END IF;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_actor,
            CASE WHEN p_approve THEN 'giving_campaign_approved' ELSE 'giving_campaign_rejected' END,
            'giving_campaign', p_campaign,
            jsonb_build_object('summary', format('%s giving campaign "%s"', CASE WHEN p_approve THEN 'Approved' ELSE 'Rejected' END, c.title),
                               'reason', v_note, 'previousStatus', c.review_status,
                               'institutionCode', c.campus_code, 'targetIdRaw', p_campaign::text));

    RETURN jsonb_build_object('campaign_id', p_campaign, 'review_status', v_status);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_review_giving_campaign(uuid, boolean, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_giving_campaign(uuid, boolean, text, uuid, boolean) TO service_role;

DROP FUNCTION IF EXISTS public.admin_update_giving_total(uuid, numeric);
CREATE OR REPLACE FUNCTION public.admin_update_giving_total(
    p_campaign uuid, p_confirmed_total numeric, p_actor uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    c public.giving_campaigns%ROWTYPE;
BEGIN
    IF p_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_actor AND role::text = 'admin' AND NOT COALESCE(is_suspended, false)
    ) THEN
        RAISE EXCEPTION 'not_allowed: Only an active administrator can confirm a total.';
    END IF;
    IF p_confirmed_total IS NULL OR p_confirmed_total < 0 OR p_confirmed_total > 1000000000 THEN
        RAISE EXCEPTION 'invalid_total: The confirmed total must be a non-negative amount.';
    END IF;
    SELECT * INTO c FROM public.giving_campaigns WHERE id = p_campaign FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found: That giving campaign does not exist.'; END IF;
    IF NOT public.lioris_actor_can_admin_campus(p_actor, c.campus_code) THEN
        RAISE EXCEPTION 'not_allowed: Campus Admins can only update campaigns of their own campus.';
    END IF;

    UPDATE public.giving_campaigns SET confirmed_total = p_confirmed_total WHERE id = p_campaign;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_actor, 'giving_total_confirmed', 'giving_campaign', p_campaign,
            jsonb_build_object('summary', format('Confirmed total for "%s" set to %s', c.title, p_confirmed_total),
                               'old', c.confirmed_total, 'new', p_confirmed_total,
                               'institutionCode', c.campus_code, 'targetIdRaw', p_campaign::text));
    RETURN jsonb_build_object('campaign_id', p_campaign, 'confirmed_total', p_confirmed_total);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_giving_total(uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_giving_total(uuid, numeric, uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- S3. paid events: admin_apply_payment_review
-- ----------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regprocedure('public.admin_apply_payment_review(uuid, uuid, text, text, boolean, boolean)') IS NOT NULL THEN
    DROP FUNCTION public.admin_apply_payment_review(uuid, uuid, text, text, boolean, boolean);
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.admin_apply_payment_review(
  p_event uuid, p_actor uuid, p_decision text, p_note text DEFAULT NULL,
  p_override_link_check boolean DEFAULT false, p_publish boolean DEFAULT false,
  p_expected_payment_url text DEFAULT NULL, p_expected_updated_at timestamptz DEFAULT NULL,
  p_allow_rereview boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  e public.events%ROWTYPE;
  d public.event_payment_details%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_status text;
  v_host text;
  v_prev text;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND role::text = 'admin' AND COALESCE(is_suspended, false) = false) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'invalid_input: decision must be approve or reject.'; END IF;
  SELECT * INTO e FROM public.events WHERE id = p_event FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.lioris_actor_can_admin_campus(p_actor, e.campus_code) THEN
    RAISE EXCEPTION 'not_allowed: Campus Admins can only review events of their own campus; global events are for Super Admins.';
  END IF;
  IF e.ticket_type <> 'paid' THEN RAISE EXCEPTION 'not_paid: This event is free.'; END IF;

  v_prev := e.payment_review_status;
  IF v_prev <> 'pending' AND NOT (COALESCE(p_allow_rereview, false) AND public.lioris_actor_is_super(p_actor)) THEN
    RAISE EXCEPTION 'already_reviewed: This payment review is already % (reload the desk; re-review is a Super Admin action).', v_prev;
  END IF;

  SELECT * INTO d FROM public.event_payment_details WHERE event_id = p_event FOR UPDATE;
  IF p_expected_payment_url IS NOT NULL AND d.payment_url IS DISTINCT FROM p_expected_payment_url THEN
    RAISE EXCEPTION 'stale_review: The organiser changed the payment link since you opened this review. Reload and review again.';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND d.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'stale_review: The payment details changed since you opened this review. Reload and review again.';
  END IF;

  IF p_decision = 'reject' THEN
    IF v_note IS NULL OR length(v_note) < 5 THEN RAISE EXCEPTION 'note_required: Tell the organiser why the payment details were not approved.'; END IF;
    v_status := 'rejected';
  ELSE
    IF e.payment_method IN ('online', 'both') THEN
      IF d.payment_url IS NULL THEN RAISE EXCEPTION 'payment_link_required: The organiser has not added a payment link.'; END IF;
      IF NOT p_override_link_check THEN
        IF d.link_check IS NULL OR d.link_check ->> 'url' IS DISTINCT FROM d.payment_url THEN
          RAISE EXCEPTION 'link_not_checked: Run the link check on the current payment link first.';
        END IF;
        IF d.link_check ->> 'status' = 'failed' THEN
          RAISE EXCEPTION 'link_check_failed: The payment link failed its check. Ask the organiser for a working link, or override with a note.';
        END IF;
      ELSIF v_note IS NULL OR length(v_note) < 5 THEN
        RAISE EXCEPTION 'note_required: Say why you are approving without a passing link check.';
      END IF;
    END IF;
    IF e.payment_method IN ('at_venue', 'both') AND (d.instructions IS NULL OR length(d.instructions) < 5) THEN
      RAISE EXCEPTION 'instructions_required: The organiser has not said how people pay at the venue.';
    END IF;
    v_status := 'approved';
  END IF;

  PERFORM set_config('lioris.paid_internal', '1', true);
  UPDATE public.events
     SET payment_review_status = v_status, payment_reviewed_by = p_actor, payment_reviewed_at = now(), payment_review_note = v_note,
         status = CASE WHEN p_publish AND v_status = 'approved' AND status::text = 'pending_approval' THEN 'upcoming'::event_status_type ELSE status END
   WHERE id = p_event
   RETURNING * INTO e;
  PERFORM set_config('lioris.paid_internal', '0', true);

  v_host := lower(substring(d.payment_url FROM '^https://([^/?#]*)'));
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_actor,
          CASE WHEN v_status = 'approved' THEN 'event_payment_approved' ELSE 'event_payment_rejected' END,
          'event', p_event,
          jsonb_build_object('summary', format('%s payment details for "%s" (NGN %s, %s)', CASE WHEN v_status = 'approved' THEN 'Approved' ELSE 'Rejected' END, e.title, e.ticket_price, e.payment_method),
                             'reason', v_note, 'linkHost', v_host, 'override', p_override_link_check, 'published', p_publish,
                             'previousStatus', v_prev, 'institutionCode', e.campus_code,
                             'targetIdRaw', p_event::text, 'actorRole', 'admin'));

  PERFORM public.event_paid_notify(e.creator_id,
    CASE WHEN v_status = 'approved' THEN 'Payment details approved' ELSE 'Payment details need changes' END,
    CASE WHEN v_status = 'approved'
         THEN format('Students can now see how to pay for "%s".', e.title)
         ELSE format('"%s": %s', e.title, v_note) END,
    '/events/' || p_event::text);

  RETURN jsonb_build_object('event_id', e.id, 'payment_review_status', e.payment_review_status, 'status', e.status::text);
END $$;

REVOKE ALL ON FUNCTION public.admin_apply_payment_review(uuid, uuid, text, text, boolean, boolean, text, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_payment_review(uuid, uuid, text, text, boolean, boolean, text, timestamptz, boolean) TO service_role;

-- ----------------------------------------------------------------------------
-- S4. unsuspend_user_account / admin_verify_user
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unsuspend_user_account(p_user_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_role text;
  v_caller_susp boolean;
  v_t public.profiles%ROWTYPE;
  v_reason text := left(NULLIF(btrim(COALESCE(p_reason, '')), ''), 500);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Target user is required.'; END IF;
  SELECT role::text, COALESCE(is_suspended, false) INTO v_caller_role, v_caller_susp FROM public.profiles WHERE id = v_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'staff') OR v_caller_susp THEN
    RAISE EXCEPTION 'Insufficient permissions to unsuspend user accounts.' USING ERRCODE = '42501';
  END IF;
  IF v_uid = p_user_id THEN RAISE EXCEPTION 'You cannot change the suspension of your own account.' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_t FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target user not found.'; END IF;

  IF NOT public.can_admin_campus(v_t.campus_code) THEN
    RAISE EXCEPTION 'You can only unsuspend members of your own campus.' USING ERRCODE = '42501';
  END IF;
  IF (v_t.role::text = 'admin' OR v_t.admin_role = 'super_admin') AND NOT public.auth_is_super_admin() THEN
    RAISE EXCEPTION 'Only a Super Admin can unsuspend an administrator account.' USING ERRCODE = '42501';
  END IF;
  IF v_caller_role = 'staff' AND v_t.role::text IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'Staff cannot unsuspend admin or staff accounts.' USING ERRCODE = '42501';
  END IF;

  IF NOT COALESCE(v_t.is_suspended, false) THEN
    RETURN jsonb_build_object('success', true, 'changed', false, 'message', 'User account is not suspended.');
  END IF;

  PERFORM set_config('lioris.audit_skip', 'is_suspended', true);
  UPDATE public.profiles
     SET is_suspended = false,
         suspension_reason = NULL,
         muted_until = CASE WHEN suspension_reason LIKE '[7-Day Suspension]%' THEN NULL ELSE muted_until END
   WHERE id = p_user_id;
  PERFORM set_config('lioris.audit_skip', '', true);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'user_unsuspended', 'user', p_user_id,
          jsonb_build_object('summary', 'Account unsuspended via unsuspend_user_account()',
                             'reason', v_reason, 'previousReason', v_t.suspension_reason,
                             'targetRole', v_t.role::text, 'targetCampus', v_t.campus_code,
                             'source', 'unsuspend_user_account'));

  RETURN jsonb_build_object('success', true, 'changed', true, 'message', 'User account unsuspended.');
END;
$$;
REVOKE ALL ON FUNCTION public.unsuspend_user_account(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unsuspend_user_account(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_verify_user(p_user_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_t public.profiles%ROWTYPE;
  v_note text := left(NULLIF(btrim(COALESCE(p_note, '')), ''), 500);
  v_closed int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'invalid_input: target user is required'; END IF;
  IF p_user_id = v_uid THEN RAISE EXCEPTION 'conflict_of_interest: you cannot verify your own account'; END IF;

  SELECT * INTO v_t FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: that member no longer exists'; END IF;

  IF NOT public.can_admin_campus(v_t.campus_code) THEN
    RAISE EXCEPTION 'unauthorized_campus_scope: you can only verify members of your own campus';
  END IF;
  IF NOT public.has_role_permission('can_verify_students') THEN
    RAISE EXCEPTION 'permission_disabled: ID verification is switched off for your role';
  END IF;
  IF (v_t.role::text = 'admin' OR v_t.admin_role = 'super_admin') AND NOT public.auth_is_super_admin() THEN
    RAISE EXCEPTION 'unauthorized_campus_scope: only a Super Admin can change an administrator account';
  END IF;

  IF v_t.verification_status::text = 'verified' THEN
    RETURN jsonb_build_object('user_id', p_user_id, 'verification_status', 'verified', 'changed', false);
  END IF;

  -- resolve any pending request in the same transaction (same shape as review_verification_request)
  UPDATE public.verifications
     SET status = 'approved'::public.moderation_status_type,
         reviewed_by = v_uid,
         reviewed_at = now(),
         rejection_reason = NULL
   WHERE user_id = p_user_id AND status::text = 'pending';
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  PERFORM set_config('lioris.audit_skip', 'verification_status', true);
  UPDATE public.profiles
     SET verification_status = 'verified'::public.verification_status_type
   WHERE id = p_user_id;
  PERFORM set_config('lioris.audit_skip', '', true);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'user_verified', 'user', p_user_id,
          jsonb_build_object('summary', format('Verified %s directly (%s pending request(s) closed)', COALESCE(v_t.full_name, 'member'), v_closed),
                             'old', v_t.verification_status::text, 'new', 'verified', 'reason', v_note,
                             'targetCampus', v_t.campus_code, 'institutionCode', v_t.campus_code,
                             'source', 'admin_verify_user'));

  RETURN jsonb_build_object('user_id', p_user_id, 'verification_status', 'verified', 'changed', true, 'requests_closed', v_closed);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_verify_user(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_user(uuid, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- S5. server-side broadcast
-- ----------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL AND to_regclass('public.announcements') IS NOT NULL THEN
    ALTER TABLE public.notifications
      ADD COLUMN IF NOT EXISTS announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_notifications_announcement ON public.notifications (announcement_id)
      WHERE announcement_id IS NOT NULL;
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  p_title text, p_body text, p_type text DEFAULT 'system_announcement', p_audience jsonb DEFAULT '{}'::jsonb,
  p_action_url text DEFAULT NULL, p_announcement_id uuid DEFAULT NULL, p_dry_run boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_susp boolean;
  v_own_campus text;
  v_super boolean;
  v_aud jsonb := CASE WHEN jsonb_typeof(COALESCE(p_audience, '{}'::jsonb)) = 'object' THEN COALESCE(p_audience, '{}'::jsonb) ELSE '{}'::jsonb END;
  v_campus text;
  v_all boolean;
  v_include_global boolean := COALESCE((v_aud ->> 'includeGlobal')::boolean, false);
  v_roles text[];
  v_title text := left(btrim(COALESCE(p_title, '')), 150);
  v_body text := left(btrim(COALESCE(p_body, '')), 1000);
  v_action text := NULLIF(btrim(COALESCE(p_action_url, '')), '');
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT role::text, campus_code, COALESCE(is_suspended, false) INTO v_role, v_own_campus, v_susp FROM public.profiles WHERE id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'staff') OR v_susp THEN
    RAISE EXCEPTION 'not_allowed: only active admins and staff can broadcast.';
  END IF;
  IF NOT public.has_role_permission('can_broadcast_announcements') THEN
    RAISE EXCEPTION 'permission_disabled: broadcasting is switched off for your role.';
  END IF;
  IF v_title = '' OR v_body = '' THEN RAISE EXCEPTION 'invalid_input: a title and a message are required.'; END IF;
  IF p_type NOT IN ('system', 'system_announcement', 'announcement', 'event', 'moderation') THEN
    RAISE EXCEPTION 'invalid_input: unsupported notification type.';
  END IF;
  IF v_action IS NOT NULL AND (left(v_action, 1) <> '/' OR left(v_action, 2) = '//') THEN
    RAISE EXCEPTION 'invalid_input: the link must be an in-app path.';
  END IF;

  v_super := public.auth_is_super_admin();
  v_campus := NULLIF(btrim(COALESCE(v_aud ->> 'campus', '')), '');
  v_all := v_campus IS NULL OR upper(v_campus) = 'ALL';
  IF NOT v_super THEN
    IF v_own_campus IS NULL OR v_own_campus = 'GLOBAL' THEN
      RAISE EXCEPTION 'not_allowed: your account has no campus to broadcast to.';
    END IF;
    IF v_campus IS NOT NULL AND upper(v_campus) <> 'ALL' AND v_campus <> v_own_campus THEN
      RAISE EXCEPTION 'not_allowed: you can only broadcast to your own campus.';
    END IF;
    IF v_campus IS NOT NULL AND upper(v_campus) = 'ALL' THEN
      RAISE EXCEPTION 'not_allowed: only a Super Admin can broadcast to every campus.';
    END IF;
    IF NOT public.can_admin_campus(v_own_campus) THEN
      RAISE EXCEPTION 'not_allowed: your campus authority is not active.';
    END IF;
    v_all := false;
    v_campus := v_own_campus;
    v_include_global := false;
  END IF;

  SELECT array_agg(DISTINCT lower(r)) INTO v_roles
    FROM jsonb_array_elements_text(COALESCE(v_aud -> 'roles', '[]'::jsonb)) r
   WHERE lower(r) IN ('student', 'alumni', 'staff', 'admin');
  -- dry run: the same authority checks and recipient filter, but nothing is written and no rate-limit slot is used
  -- (the composer shows "this will reach N people" before the sender confirms)
  IF COALESCE(p_dry_run, false) THEN
    SELECT count(*)::integer INTO v_count
      FROM public.profiles p
      LEFT JOIN public.notification_preferences np ON np.user_id = p.id
     WHERE NOT COALESCE(p.is_suspended, false)
       AND NOT COALESCE(p.is_bot, false)
       AND (to_jsonb(p) ->> 'deactivated_at') IS NULL
       AND (v_all OR p.campus_code = v_campus OR (v_include_global AND p.campus_code = 'GLOBAL'))
       AND (v_roles IS NULL OR p.role::text = ANY (v_roles))
       AND CASE
             WHEN p_type IN ('announcement', 'system_announcement') THEN COALESCE(np.announcements_enabled, true)
             WHEN p_type = 'event' THEN COALESCE(np.events_enabled, true)
             ELSE true
           END;
    RETURN v_count;
  END IF;

  IF NOT public.consume_rate_limit('broadcast:' || v_uid::text, 20, 3600) THEN
    RAISE EXCEPTION 'rate_limited: too many broadcasts. Try again later.';
  END IF;

  INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read, announcement_id)
  SELECT p.id, v_uid, v_title, v_body, p_type, v_action, false, p_announcement_id
    FROM public.profiles p
    LEFT JOIN public.notification_preferences np ON np.user_id = p.id
   WHERE NOT COALESCE(p.is_suspended, false)
     AND NOT COALESCE(p.is_bot, false)
     AND (to_jsonb(p) ->> 'deactivated_at') IS NULL
     AND (v_all OR p.campus_code = v_campus OR (v_include_global AND p.campus_code = 'GLOBAL'))
     AND (v_roles IS NULL OR p.role::text = ANY (v_roles))
     AND CASE
           WHEN p_type IN ('announcement', 'system_announcement') THEN COALESCE(np.announcements_enabled, true)
           WHEN p_type = 'event' THEN COALESCE(np.events_enabled, true)
           ELSE true
         END;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'broadcast_sent', 'notification', p_announcement_id,
          jsonb_build_object('summary', format('Broadcast "%s" to %s recipient(s) (%s)', v_title, v_count, CASE WHEN v_all THEN 'all campuses' ELSE v_campus END),
                             'recipients', v_count, 'audience', v_aud, 'type', p_type,
                             'targetCampus', CASE WHEN v_all THEN NULL ELSE v_campus END,
                             'source', 'admin_broadcast_notification'));
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_broadcast_notification(text, text, text, jsonb, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, jsonb, text, uuid, boolean) TO authenticated;

-- ----------------------------------------------------------------------------
-- S6. audit_logs: stamp metadata.targetCampus (campus admins see what concerns their campus)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_logs_stamp_target_campus()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tbl text;
  v_campus text;
  v_uid uuid;
BEGIN
  IF NEW.metadata IS NULL THEN
    NEW.metadata := '{}'::jsonb;
  ELSIF jsonb_typeof(NEW.metadata) <> 'object' THEN
    NEW.metadata := jsonb_build_object('raw', NEW.metadata);
  END IF;
  IF COALESCE(NULLIF(NEW.metadata ->> 'targetCampus', ''), NULLIF(NEW.metadata ->> 'institutionCode', '')) IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_tbl := CASE NEW.entity_type
      WHEN 'user' THEN 'profiles' WHEN 'profile' THEN 'profiles' WHEN 'user_profile' THEN 'profiles'
      WHEN 'event' THEN 'events' WHEN 'post' THEN 'posts' WHEN 'resource' THEN 'resources'
      WHEN 'job' THEN 'jobs' WHEN 'giving_campaign' THEN 'giving_campaigns'
      WHEN 'marketplace_listing' THEN 'marketplace_listings' WHEN 'announcement' THEN 'announcements'
      WHEN 'verification_request' THEN 'verifications' WHEN 'verification' THEN 'verifications'
      ELSE NULL END;
    IF v_tbl IS NOT NULL AND NEW.entity_id IS NOT NULL THEN
      EXECUTE format('SELECT campus_code FROM public.%I WHERE id = $1', v_tbl) INTO v_campus USING NEW.entity_id;
    END IF;
    IF v_campus IS NULL AND NULLIF(NEW.metadata ->> 'targetUserId', '') IS NOT NULL THEN
      v_uid := (NEW.metadata ->> 'targetUserId')::uuid;
      SELECT campus_code INTO v_campus FROM public.profiles WHERE id = v_uid;
    END IF;
    IF v_campus IS NULL THEN
      v_campus := COALESCE(NULLIF(NEW.metadata ->> 'campus_code', ''), NULLIF(NEW.metadata ->> 'campusCode', ''));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_campus := NULL;   -- an audit row must never fail because its campus could not be resolved
  END;

  IF v_campus IS NOT NULL AND v_campus <> '' THEN
    NEW.metadata := NEW.metadata || jsonb_build_object('targetCampus', v_campus);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_stamp_target_campus ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_stamp_target_campus
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_stamp_target_campus();

-- ----------------------------------------------------------------------------
-- S7. moderation_queue: a reporter reports, they do not triage
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lioris_moderation_item_campus(p_item_type text, p_item_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v text;
BEGIN
  IF p_item_id IS NULL THEN RETURN NULL; END IF;
  BEGIN
    IF p_item_type = 'post' THEN SELECT campus_code INTO v FROM public.posts WHERE id = p_item_id;
    ELSIF p_item_type = 'event' THEN SELECT campus_code INTO v FROM public.events WHERE id = p_item_id;
    ELSIF p_item_type = 'resource' THEN SELECT campus_code INTO v FROM public.resources WHERE id = p_item_id;
    ELSIF p_item_type = 'marketplace_listing' THEN SELECT campus_code INTO v FROM public.marketplace_listings WHERE id = p_item_id;
    ELSIF p_item_type = 'job' THEN SELECT campus_code INTO v FROM public.jobs WHERE id = p_item_id;
    ELSIF p_item_type IN ('user', 'user_profile') THEN SELECT campus_code INTO v FROM public.profiles WHERE id = p_item_id;
    ELSIF p_item_type = 'pod_post' THEN
      SELECT sg.campus_code INTO v FROM public.study_group_posts sgp
        JOIN public.study_groups sg ON sg.id = sgp.group_id WHERE sgp.id = p_item_id;
    ELSIF p_item_type IN ('comment', 'message') THEN
      SELECT p.campus_code INTO v FROM public.chat_messages cm
        JOIN public.profiles p ON p.id = cm.sender_id WHERE cm.id = p_item_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v := NULL;
  END;
  RETURN NULLIF(v, '');
END;
$$;
REVOKE ALL ON FUNCTION public.lioris_moderation_item_campus(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lioris_moderation_item_campus(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.constrain_moderation_queue_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_campus text;
BEGIN
  -- service role / migrations / SECURITY DEFINER internals that run without a signed-in user keep control
  IF auth.uid() IS NULL OR auth.role() = 'service_role' THEN RETURN NEW; END IF;

  NEW.status := 'pending';
  NEW.assigned_admin_id := NULL;
  NEW.action_taken := NULL;
  NEW.resolved_at := NULL;
  NEW.reporter_id := auth.uid();

  v_campus := public.lioris_moderation_item_campus(NEW.item_type::text, NEW.item_id);
  IF v_campus IS NULL OR v_campus = 'GLOBAL' THEN
    SELECT campus_code INTO v_campus FROM public.profiles WHERE id = auth.uid();
  END IF;
  NEW.campus_code := COALESCE(NULLIF(v_campus, ''), 'GLOBAL');
  RETURN NEW;
END;
$$;

DO $do$
BEGIN
  IF to_regclass('public.moderation_queue') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_a_moderation_queue_constrain_insert ON public.moderation_queue;
    CREATE TRIGGER trg_a_moderation_queue_constrain_insert
      BEFORE INSERT ON public.moderation_queue
      FOR EACH ROW EXECUTE FUNCTION public.constrain_moderation_queue_insert();
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- C8. admin_active_users_count(): the dashboards' "active now", campus-scoped
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_active_users_count(p_minutes integer DEFAULT 15, p_campus text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_campus text;
  v_minutes integer := LEAST(GREATEST(COALESCE(p_minutes, 15), 1), 10080);
  v_n integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT role::text, campus_code INTO v_role, v_campus FROM public.profiles WHERE id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'staff') THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF public.auth_is_super_admin() THEN
    v_campus := NULLIF(p_campus, '');
    IF v_campus IS NOT NULL AND upper(v_campus) = 'ALL' THEN v_campus := NULL; END IF;
  ELSE
    IF v_campus IS NULL OR v_campus = 'GLOBAL' THEN RETURN 0; END IF;
  END IF;
  SELECT count(*)::integer INTO v_n
    FROM public.profiles p
   WHERE p.last_active_at >= now() - make_interval(mins => v_minutes)
     AND NOT COALESCE(p.is_bot, false)
     AND (v_campus IS NULL OR p.campus_code = v_campus);
  RETURN COALESCE(v_n, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_active_users_count(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_active_users_count(integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

INSERT INTO public._manual_migration_log (version) VALUES ('20261109000000') ON CONFLICT (version) DO NOTHING;
COMMIT;
