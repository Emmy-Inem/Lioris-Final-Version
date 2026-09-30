-- ============================================================================
-- LIORIS - TRUST & SAFETY GAPS
-- ============================================================================
-- Three blind spots found while auditing for missing functionality:
--
--   1. Marketplace listings and job postings could not be reported by users
--      and had no admin moderation path at all, unlike posts/events/pod posts/
--      users which already flow through moderation_queue. Jobs already have
--      an is_approved takedown path (jobs.ts); marketplace listings are taken
--      down by deleting the row (sellers/admins/staff already have DELETE
--      rights on marketplace_listings - see supabase_schema.sql). This
--      migration only widens what a report can target; the client (Report
--      buttons on JobCard/MarketplaceItemCard + generic ModerationQueue
--      admin screen) does the rest.
--
--   2. Mentorships had zero admin oversight: end_mentorship() only let a
--      participant end their own pairing, so staff had no way to step in on
--      an abusive mentor/mentee match. This widens that one function to also
--      allow an admin to end (or mark complete) a mentorship they are not
--      part of - never to withdraw a pending request, which stays the
--      requesting student's call.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.moderation_queue') IS NULL THEN
    RAISE EXCEPTION 'public.moderation_queue missing. Apply supabase_schema.sql first.';
  END IF;
  IF to_regprocedure('public.end_mentorship(uuid, text, text)') IS NULL THEN
    RAISE EXCEPTION 'public.end_mentorship(uuid, text, text) missing. Apply 20260925100000_mentorship_v2.sql first.';
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 1. Reportable content: marketplace listings and job postings.
-- ----------------------------------------------------------------------------
ALTER TYPE public.moderation_item_type ADD VALUE IF NOT EXISTS 'marketplace_listing';
ALTER TYPE public.moderation_item_type ADD VALUE IF NOT EXISTS 'job';

-- ----------------------------------------------------------------------------
-- 2. Admin can end an active mentorship they are not a party to.
--    (Everything else about end_mentorship is unchanged - see
--    20260925100000_mentorship_v2.sql for the full original.)
-- ----------------------------------------------------------------------------
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

  v_is_admin := public.auth_profile_role() = 'admin';
  -- A participant can do anything valid for their role; an admin can end/complete
  -- (never withdraw - that stays the requesting student's own decision) a pairing
  -- they are not part of, e.g. to step in on an abusive match.
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
    -- Nothing should stay scheduled once it is over.
    UPDATE public.mentorship_sessions SET status = 'cancelled', updated_at = now()
     WHERE mentorship_id = p_id AND status IN ('proposed', 'confirmed');

    IF v_uid IN (v_row.student_id, v_row.mentor_id) THEN
      -- A participant acted: tell only the other person (unchanged original behaviour).
      PERFORM public.mentorship_notify(v_other, v_uid,
        CASE WHEN p_action = 'complete' THEN 'Mentorship completed' ELSE 'Mentorship ended' END,
        CASE WHEN p_action = 'complete' THEN format('%s marked your mentorship as complete.', COALESCE(v_me.full_name, 'The other person'))
             ELSE format('%s ended your mentorship.', COALESCE(v_me.full_name, 'The other person')) END,
        '/mentorship/' || p_id::text);
    ELSE
      -- Admin stepped in on a pairing they are not part of: tell both participants.
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

NOTIFY pgrst, 'reload schema';

COMMIT;
