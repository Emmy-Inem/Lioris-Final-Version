-- ============================================================================
-- LIORIS - GIVING CAMPAIGN SELF-SERVICE (confirmed total + close + clicks)
-- ============================================================================
-- 20261001000000_workflow_gaps.sql added public.giving_campaigns with a
-- confirmed_total column whose own comment says it is "manually confirmed by
-- the campaign owner or an admin", and an UPDATE RLS policy ("Owner edits
-- their own campaign; admin edits any") that nominally lets the owner update
-- their row. But enforce_giving_campaign_moderation() (the BEFORE UPDATE
-- trigger) silently reverted confirmed_total back to OLD for any non-admin
-- caller, so despite the column comment and the RLS policy, an owner could
-- never actually record their own total - only an admin, through the
-- admin-review-giving-campaign edge function, could. The same trigger also
-- forced ANY diff between NEW and OLD on an already-approved campaign back to
-- 'pending', including just flipping is_closed - so an owner reporting a new
-- total or closing a finished campaign would have re-triggered review too,
-- had it worked at all.
--
-- This migration fixes the trigger in place (CREATE OR REPLACE, same
-- signature - no edge function redeploy needed, which is deliberate: edge
-- function deploys need a manual step from a human operator):
--   - review_status/reviewed_by/reviewed_at stay admin-only, exactly as
--     before (always revert-to-OLD for a non-admin who touches them).
--   - confirmed_total is no longer reverted for a non-admin - it is validated
--     directly instead (reject NULL/negative), so the owner's direct table
--     write now actually works, as the column comment always said it should.
--   - an approved campaign is only forced back to 'pending' when a
--     substantive content field changes (title/description/goal_amount/
--     giving_url/cover_image_url/campus_code) - reporting a new
--     confirmed_total or closing the campaign (is_closed) no longer resends
--     it for review, but editing the actual pitch still does, same as today.
--
-- It also adds get_giving_campaign_click_count(), a SECURITY DEFINER RPC that
-- exposes the click count (and only the count - not the clicker identities in
-- giving_campaign_clicks.user_id, which stay private) to the campaign's own
-- owner or an admin. giving_campaign_clicks has had zero SELECT policies
-- since it was created (write-only via open_giving_page()) and nothing
-- client-side has ever queried it, so this is the first funnel visibility
-- either an owner or an admin has had into referral clicks.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.giving_campaigns') IS NULL THEN
    RAISE EXCEPTION 'public.giving_campaigns missing. Apply 20261001000000_workflow_gaps.sql first.';
  END IF;
  IF to_regclass('public.giving_campaign_clicks') IS NULL THEN
    RAISE EXCEPTION 'public.giving_campaign_clicks missing. Apply 20261001000000_workflow_gaps.sql first.';
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 1. enforce_giving_campaign_moderation(): stop reverting confirmed_total for
--    non-admins, validate it instead; only a substantive content edit sends
--    an approved campaign back to pending.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_giving_campaign_moderation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_role text;
BEGIN
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role = 'admin' THEN RETURN NEW; END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.review_status := 'pending';
        NEW.reviewed_by := NULL;
        NEW.reviewed_at := NULL;
        NEW.review_note := NULL;
        NEW.confirmed_total := 0;
    ELSE
        -- review_status/reviewed_by/reviewed_at remain admin-only - a
        -- non-admin's direct attempt to set them is always reverted to OLD.
        IF NEW.review_status IS DISTINCT FROM OLD.review_status
           OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
            NEW.review_status := OLD.review_status;
            NEW.reviewed_by := OLD.reviewed_by;
            NEW.reviewed_at := OLD.reviewed_at;
        END IF;

        -- confirmed_total is "manually confirmed by the campaign owner or an
        -- admin" (see the column comment) - validate it directly rather than
        -- silently reverting it, so the owner's own update actually sticks.
        IF NEW.confirmed_total IS NULL OR NEW.confirmed_total < 0 THEN
            RAISE EXCEPTION 'invalid_confirmed_total: The confirmed total must be zero or a positive amount.';
        END IF;

        -- Only a substantive edit to the campaign's own pitch sends an
        -- approved campaign back for review - reporting a new confirmed
        -- total or closing a finished campaign (is_closed) should not.
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

-- ----------------------------------------------------------------------------
-- 2. get_giving_campaign_click_count(): aggregate-only click visibility for
--    the campaign's owner or an admin. Mirrors event_can_manage()'s
--    owner-or-admin gate (paid events) and admin_apply_payment_review()'s
--    'not_allowed' style for the authorization failure.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_giving_campaign_click_count(p_campaign UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.giving_campaigns c
        WHERE c.id = p_campaign
          AND (c.creator_id = auth.uid()
               OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    ) THEN
        RAISE EXCEPTION 'not_allowed: Only the campaign owner or an admin can see its click count.';
    END IF;

    SELECT count(*) INTO v_count FROM public.giving_campaign_clicks WHERE campaign_id = p_campaign;
    RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_giving_campaign_click_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_giving_campaign_click_count(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
