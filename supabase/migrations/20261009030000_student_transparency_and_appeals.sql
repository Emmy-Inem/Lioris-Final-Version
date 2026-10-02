-- ============================================================================
-- LIORIS - STUDENT TRANSPARENCY & APPEALS
-- ============================================================================
-- Closes gaps confirmed by a read-only audit of student-facing transparency
-- and appeals:
--
--   1. A suspended student was signed out at login with a bare error message
--      and no way to appeal that did not require already being signed in -
--      community-rules.tsx's "the in-app report or Support Desk" appeal path
--      (Settings -> Support) is unreachable to someone who was just signed
--      out. That fix is entirely client-side (src/api/auth.ts's error
--      message, src/constants/legal.ts's new SUSPENSION_APPEAL_EMAIL) - this
--      migration only adds the 'suspension_appeal' support_tickets category
--      so a ticket filed about it (by a user in a less restrictive state who
--      can still sign in to use Settings -> Support) is triaged correctly
--      instead of falling into 'general'.
--
--   2. rejectJob()/rejectResource() wrote a rejection_reason but nothing ever
--      surfaced it to the content owner: resources had no rejection_reason
--      column at all (rejectResource's reason silently never reached
--      Postgres), and neither rejection fired a notification. Both are now
--      app-code fixes (src/api/jobs.ts, src/api/resources.ts - createNotification
--      right after the reject write succeeds, mirroring
--      notify_job_application_status_changed's audience/timing but as plain
--      application code, since rejectJob/rejectResource are themselves plain
--      application code, not RPCs) - this migration only adds the missing
--      resources.rejection_reason column those functions now read and write.
--
--   3. deleteListing() in src/api/marketplace.ts was a hard DELETE with no
--      reason column and no notification - an admin/staff takedown made a
--      seller's listing just vanish with zero trace. Adds takedown_reason +
--      is_removed so an admin/staff-initiated takedown (the new
--      takedownListing() in marketplace.ts) can be a soft removal instead:
--      excluded from the public browse feed, still visible (with its reason)
--      in the seller's own My Listings, and the seller is notified why.
--
--   4. Report only ever carried a content id, never its author - the
--      moderation queue could not show "N other reports against this user"
--      when reviewing a report card, so a repeat offender looked exactly
--      like a first-time one. Adds get_report_count_for_author(), a
--      SECURITY DEFINER RPC (admin/staff only) that resolves a reported
--      item's author server-side and counts other reports against content
--      by that same author, across any content type.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. support_tickets: 'suspension_appeal' category (see header note above -
--    the primary fix for a still-locked-out suspension is the unauthenticated
--    email in the login error itself, not this ticket category).
-- ----------------------------------------------------------------------------
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_category_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_category_check CHECK (category IN (
    'account_issue',
    'matric_id_correction',
    'campus_transfer',
    'verification_appeal',
    'suspension_appeal',
    'content_issue',
    'bug_report',
    'feedback',
    'general'
));

-- ----------------------------------------------------------------------------
-- 2. resources: the rejection reason column rejectResource() always meant to
--    write (src/api/resources.ts's updateResource() was silently dropping it
--    - fixed alongside this migration) and the student-facing "My Uploads"
--    view now reads back.
-- ----------------------------------------------------------------------------
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ----------------------------------------------------------------------------
-- 3. marketplace_listings: soft-takedown columns. A removed listing is
--    excluded from the public browse feed (src/api/marketplace.ts's
--    listMarketplaceListings) but still visible, with its reason, in the
--    seller's own My Listings (listMyMarketplaceListings, unfiltered by
--    design) - existing UPDATE policy ("Sellers, admins and staff can update
--    listings") already covers the admin/staff takedown write, same as it
--    already covers updateListing/markListingSold.
-- ----------------------------------------------------------------------------
ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS takedown_reason TEXT;
ALTER TABLE public.marketplace_listings ADD COLUMN IF NOT EXISTS is_removed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_is_removed ON public.marketplace_listings(is_removed);

-- ----------------------------------------------------------------------------
-- 4. Repeat-offender visibility for the moderation queue.
--
--    resolve_moderation_item_author() mirrors the exact per-type author
--    lookup src/api/moderation.ts's resolveActionedUserId() already does in
--    application code (post -> author_id, event -> creator_id,
--    marketplace_listing -> seller_id, job -> poster_id, user_profile -> the
--    id itself) - a 'comment'/'pod_post'/'resource' report resolves to NULL
--    here exactly as it does there, so this stays scoped to what the app
--    already resolves rather than growing the surface. Revoked from every
--    role: it is only ever reachable through get_report_count_for_author
--    below, never callable directly to probe arbitrary ids.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_moderation_item_author(
    p_item_type public.moderation_item_type,
    p_item_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_author UUID;
BEGIN
    IF p_item_id IS NULL THEN
        RETURN NULL;
    END IF;

    CASE p_item_type
        WHEN 'user_profile' THEN
            v_author := p_item_id;
        WHEN 'post' THEN
            SELECT author_id INTO v_author FROM public.posts WHERE id = p_item_id;
        WHEN 'event' THEN
            SELECT creator_id INTO v_author FROM public.events WHERE id = p_item_id;
        WHEN 'marketplace_listing' THEN
            SELECT seller_id INTO v_author FROM public.marketplace_listings WHERE id = p_item_id;
        WHEN 'job' THEN
            SELECT poster_id INTO v_author FROM public.jobs WHERE id = p_item_id;
        ELSE
            v_author := NULL;
    END CASE;

    RETURN v_author;
END;
$$;

-- Supabase grants ALL on every new function to anon/authenticated via
-- ALTER DEFAULT PRIVILEGES, so both must be revoked explicitly too, not just
-- PUBLIC - mirrors resource_upvotes/api_rate_limits elsewhere in this schema.
REVOKE ALL ON FUNCTION public.resolve_moderation_item_author(public.moderation_item_type, UUID) FROM PUBLIC, anon, authenticated;

-- Admin/staff-only RPC: how many OTHER reports (any content type) target
-- content authored by the same person as (p_item_type, p_item_id), optionally
-- excluding one report row (the card already on screen) so the chip reads
-- "N other reports", not "N reports including this one".
CREATE OR REPLACE FUNCTION public.get_report_count_for_author(
    p_item_type public.moderation_item_type,
    p_item_id UUID,
    p_exclude_report_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_author UUID;
    v_count INTEGER;
BEGIN
    SELECT LOWER(COALESCE(role::text, '')) INTO v_caller_role
    FROM public.profiles WHERE id = auth.uid();

    IF v_caller_role NOT IN ('admin', 'staff') AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    v_author := public.resolve_moderation_item_author(p_item_type, p_item_id);
    IF v_author IS NULL THEN
        RETURN 0;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.moderation_queue mq
    WHERE (p_exclude_report_id IS NULL OR mq.id <> p_exclude_report_id)
      AND public.resolve_moderation_item_author(mq.item_type, mq.item_id) = v_author;

    RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_report_count_for_author(public.moderation_item_type, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_report_count_for_author(public.moderation_item_type, UUID, UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
