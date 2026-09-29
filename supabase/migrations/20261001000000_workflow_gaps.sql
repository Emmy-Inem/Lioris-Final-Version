-- ============================================================================
-- LIORIS - WORKFLOW AUDIT FOLLOW-UPS
-- ============================================================================
-- Closes five gaps found in a workflow audit of the alumni/student/admin
-- experience, on top of the CV/screening-questions/ranking work already
-- shipped (20260930000000_job_applications.sql):
--
--   1. Forum notifications: liking or commenting on a post never notified
--      its author. Comment likes were worse - `post_comments.likes_count`
--      and `PostComment.isLikedByMe` existed in the type/column but nothing
--      ever persisted a like, so the count was permanently stuck wherever a
--      client's local, per-session fake state last left it.
--   2. Alumni directory: `graduation_year`/`industry`/`company`/`job_title`
--      were referenced by the UI (DirectoryCard, DirectorySearchQuery) but
--      never existed as profiles columns - the directory's filters were
--      dead parameters and the fields always rendered empty.
--   3. Events: no waitlist - once a free (or reservation-held paid) event
--      hit capacity, RSVPing just raised `event_full` with no fallback.
--   4. Donations/giving: did not exist at all. Built on the same trust
--      model as paid events (docs/operations/paid-events.md): Lioris never
--      touches money, only refers to the alumnus/org's own external giving
--      page, tracks clicks, and lets an admin review the link and record a
--      manually-confirmed pledge total - nothing here is a real payment
--      integration.
--   5. Jobs moderation: `jobs.is_approved` defaults TRUE and nothing ever
--      set it false or exposed it to an admin - every posting, including
--      one from an unverified/unsuspended-but-untrusted account, went live
--      immediately with no review path, unlike resources/events which both
--      hold new submissions for approval.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. FORUM NOTIFICATIONS + real comment-like persistence
-- ============================================================================

-- 1a. Comment likes never had a table - `post_comments.likes_count` sat
--     unused and `toggleCommentLike()` only mutated a local, per-session
--     array. Mirrors `post_likes` exactly.
CREATE TABLE IF NOT EXISTS public.post_comment_likes (
    comment_id UUID NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE public.post_comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comment likes readable by anyone authenticated" ON public.post_comment_likes;
CREATE POLICY "Comment likes readable by anyone authenticated" ON public.post_comment_likes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "A user likes/unlikes a comment as themself" ON public.post_comment_likes;
CREATE POLICY "A user likes/unlikes a comment as themself" ON public.post_comment_likes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "A user removes only their own comment like" ON public.post_comment_likes;
CREATE POLICY "A user removes only their own comment like" ON public.post_comment_likes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Keep post_comments.likes_count in sync (same shape as sync_post_likes_count()).
CREATE OR REPLACE FUNCTION public.sync_post_comment_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.post_comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.post_comments SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.comment_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_post_comment_likes_count ON public.post_comment_likes;
CREATE TRIGGER trg_sync_post_comment_likes_count
AFTER INSERT OR DELETE ON public.post_comment_likes
FOR EACH ROW EXECUTE FUNCTION public.sync_post_comment_likes_count();

-- 1b. Notification triggers. SECURITY DEFINER so they can always write a
--     notification (bypassing the client-facing notifications INSERT policy,
--     which only allows type IN ('message','system') from a plain user) and
--     never notify someone for acting on their own content.
CREATE OR REPLACE FUNCTION public.notify_post_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_author_id UUID;
    v_liker_name TEXT;
    v_post_title TEXT;
BEGIN
    SELECT author_id, COALESCE(NULLIF(title, ''), LEFT(content, 60))
      INTO v_author_id, v_post_title
      FROM public.posts WHERE id = NEW.post_id;

    IF v_author_id IS NULL OR v_author_id = NEW.user_id THEN
        RETURN NEW;
    END IF;

    SELECT full_name INTO v_liker_name FROM public.profiles WHERE id = NEW.user_id;

    INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
    VALUES (
        v_author_id, NEW.user_id,
        'New like',
        COALESCE(v_liker_name, 'Someone') || ' liked your post' || CASE WHEN v_post_title IS NOT NULL THEN ': "' || v_post_title || '"' ELSE '' END,
        'system',
        '/post/' || NEW.post_id,
        false
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_post_like ON public.post_likes;
CREATE TRIGGER trg_notify_post_like
AFTER INSERT ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.notify_post_like();

CREATE OR REPLACE FUNCTION public.notify_post_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_author_id UUID;
    v_commenter_name TEXT;
    v_post_title TEXT;
BEGIN
    SELECT author_id, COALESCE(NULLIF(title, ''), LEFT(content, 60))
      INTO v_author_id, v_post_title
      FROM public.posts WHERE id = NEW.post_id;

    IF v_author_id IS NULL OR v_author_id = NEW.author_id THEN
        RETURN NEW;
    END IF;

    SELECT full_name INTO v_commenter_name FROM public.profiles WHERE id = NEW.author_id;

    INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
    VALUES (
        v_author_id, NEW.author_id,
        'New comment',
        COALESCE(v_commenter_name, 'Someone') || ' commented on your post' || CASE WHEN v_post_title IS NOT NULL THEN ': "' || v_post_title || '"' ELSE '' END,
        'system',
        '/post/' || NEW.post_id,
        false
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_post_comment ON public.post_comments;
CREATE TRIGGER trg_notify_post_comment
AFTER INSERT ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_post_comment();

CREATE OR REPLACE FUNCTION public.notify_comment_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_comment_author_id UUID;
    v_post_id UUID;
    v_liker_name TEXT;
BEGIN
    SELECT author_id, post_id INTO v_comment_author_id, v_post_id
      FROM public.post_comments WHERE id = NEW.comment_id;

    IF v_comment_author_id IS NULL OR v_comment_author_id = NEW.user_id THEN
        RETURN NEW;
    END IF;

    SELECT full_name INTO v_liker_name FROM public.profiles WHERE id = NEW.user_id;

    INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
    VALUES (
        v_comment_author_id, NEW.user_id,
        'New like',
        COALESCE(v_liker_name, 'Someone') || ' liked your comment',
        'system',
        '/post/' || v_post_id,
        false
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_comment_like ON public.post_comment_likes;
CREATE TRIGGER trg_notify_comment_like
AFTER INSERT ON public.post_comment_likes
FOR EACH ROW EXECUTE FUNCTION public.notify_comment_like();

-- ============================================================================
-- 2. ALUMNI DIRECTORY: real profile fields the UI already tries to render
-- ============================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS graduation_year INTEGER
  CHECK (graduation_year IS NULL OR graduation_year BETWEEN 1950 AND 2100);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_graduation_year ON public.profiles(graduation_year);
CREATE INDEX IF NOT EXISTS idx_profiles_industry ON public.profiles(industry);

-- These are public professional/directory fields (same visibility tier as
-- full_name/department/bio), not the private PII the 20260929 migration
-- locked down (email/student_id_number) - anyone who can already read a
-- profile row can read these.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'graduation_year') THEN
        EXECUTE 'GRANT SELECT (graduation_year, industry, company, job_title, location) ON public.profiles TO authenticated, anon';
    END IF;
END $$;

-- ============================================================================
-- 3. EVENT WAITLIST
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.event_waitlist (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id     UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    promoted_at  TIMESTAMPTZ,
    UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_waitlist_event ON public.event_waitlist(event_id, created_at);

ALTER TABLE public.event_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "A user reads their own waitlist entry" ON public.event_waitlist;
CREATE POLICY "A user reads their own waitlist entry" ON public.event_waitlist
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.creator_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Everything else (join/leave/promote) goes through SECURITY DEFINER RPCs
-- below, matching the events RSVP pattern (rsvp_event/cancel_event_rsvp) -
-- no direct client INSERT/UPDATE/DELETE policy is granted.
REVOKE INSERT, UPDATE, DELETE ON public.event_waitlist FROM anon, authenticated;

-- Join the waitlist. Only makes sense once the event is actually full under
-- the same capacity rule rsvp_event() uses (capacity only really enforced
-- for free events, or paid events where the organiser holds reservations).
CREATE OR REPLACE FUNCTION public.join_event_waitlist(p_event UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_uid UUID := auth.uid();
    e RECORD;
    v_taken INTEGER;
    v_position INTEGER;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not_signed_in: You need to be signed in.'; END IF;

    SELECT * INTO e FROM public.events WHERE id = p_event FOR UPDATE;
    IF e IS NULL THEN RAISE EXCEPTION 'not_found: This event no longer exists.'; END IF;

    IF EXISTS (SELECT 1 FROM public.event_attendees WHERE event_id = p_event AND user_id = v_uid) THEN
        RAISE EXCEPTION 'already_registered: You are already registered for this event.';
    END IF;

    IF e.capacity IS NULL OR e.capacity <= 0 OR (e.ticket_type = 'paid' AND NOT e.reservation_held) THEN
        RAISE EXCEPTION 'not_full: This event is not capacity-limited, so you can just register directly.';
    END IF;

    SELECT count(*) INTO v_taken FROM public.event_attendees WHERE event_id = p_event;
    IF v_taken < e.capacity THEN
        RAISE EXCEPTION 'not_full: This event still has open places - register directly instead.';
    END IF;

    INSERT INTO public.event_waitlist (event_id, user_id) VALUES (p_event, v_uid)
    ON CONFLICT (event_id, user_id) DO NOTHING;

    SELECT count(*) INTO v_position FROM public.event_waitlist
      WHERE event_id = p_event AND promoted_at IS NULL AND created_at <= (
        SELECT created_at FROM public.event_waitlist WHERE event_id = p_event AND user_id = v_uid
      );

    RETURN jsonb_build_object('position', v_position);
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_event_waitlist(p_event UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_signed_in: You need to be signed in.'; END IF;
    DELETE FROM public.event_waitlist WHERE event_id = p_event AND user_id = auth.uid() AND promoted_at IS NULL;
END;
$$;

-- Caller's own waitlist status for one event, for the UI's "you are #3 on
-- the waitlist" state - avoids exposing other people's rows to read it.
CREATE OR REPLACE FUNCTION public.my_event_waitlist_status(p_event UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_row RECORD;
    v_position INTEGER;
BEGIN
    IF v_uid IS NULL THEN RETURN jsonb_build_object('onWaitlist', false); END IF;
    SELECT * INTO v_row FROM public.event_waitlist WHERE event_id = p_event AND user_id = v_uid;
    IF v_row IS NULL THEN RETURN jsonb_build_object('onWaitlist', false); END IF;

    SELECT count(*) INTO v_position FROM public.event_waitlist
      WHERE event_id = p_event AND promoted_at IS NULL AND created_at <= v_row.created_at;

    RETURN jsonb_build_object('onWaitlist', true, 'position', v_position, 'promoted', v_row.promoted_at IS NOT NULL);
END;
$$;

-- When a registration is cancelled, automatically promote the longest-waiting
-- person: register them (reusing the same ticket_code shape as rsvp_event),
-- mark their waitlist row promoted, and notify them. Runs AFTER DELETE on
-- event_attendees so it only fires on a real cancellation, never on RSVP.
CREATE OR REPLACE FUNCTION public.promote_from_event_waitlist()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_next RECORD;
    v_event_title TEXT;
BEGIN
    -- The event itself may be mid cascading-delete (purgeEvent) - promoting
    -- someone into a row that's about to be wiped anyway would either be
    -- pointless or, worse, hit a live FK violation against the vanishing
    -- event and abort the whole purge. Skip cleanly when that's the case.
    IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = OLD.event_id) THEN
        RETURN OLD;
    END IF;

    SELECT w.* INTO v_next FROM public.event_waitlist w
      WHERE w.event_id = OLD.event_id AND w.promoted_at IS NULL
      ORDER BY w.created_at ASC LIMIT 1
      FOR UPDATE SKIP LOCKED;

    IF v_next IS NULL THEN RETURN OLD; END IF;

    -- ticket_code is left unset so it picks up the table's own
    -- DEFAULT encode(gen_random_bytes(6), 'hex') - the same generator
    -- rsvp_event() relies on, rather than a second, ad hoc scheme.
    INSERT INTO public.event_attendees (event_id, user_id, registered_at)
    VALUES (v_next.event_id, v_next.user_id, NOW())
    ON CONFLICT (event_id, user_id) DO NOTHING;

    UPDATE public.event_waitlist SET promoted_at = NOW() WHERE id = v_next.id;

    SELECT title INTO v_event_title FROM public.events WHERE id = v_next.event_id;

    INSERT INTO public.notifications (recipient_id, title, body, type, action_url, is_read)
    VALUES (
        v_next.user_id,
        'A place opened up!',
        'You have been moved off the waitlist and registered for "' || COALESCE(v_event_title, 'the event') || '".',
        'event',
        '/event/' || v_next.event_id,
        false
    );
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_from_event_waitlist ON public.event_attendees;
CREATE TRIGGER trg_promote_from_event_waitlist
AFTER DELETE ON public.event_attendees
FOR EACH ROW EXECUTE FUNCTION public.promote_from_event_waitlist();

GRANT EXECUTE ON FUNCTION public.join_event_waitlist(uuid), public.leave_event_waitlist(uuid), public.my_event_waitlist_status(uuid) TO authenticated;

-- ============================================================================
-- 4. DONATIONS / GIVING
-- ============================================================================
-- Same trust model as paid events (docs/operations/paid-events.md): Lioris
-- never touches money. A campaign just points at the organisation's own
-- external giving page; Lioris tracks referral clicks and lets an admin
-- (or the campaign owner) record a manually-confirmed running total after
-- the fact. Nothing here processes a card or moves money automatically.
CREATE OR REPLACE FUNCTION public.donations_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT COALESCE(
        (SELECT (value ->> 'donations')::boolean FROM public.platform_settings WHERE key = 'feature_flags'),
        false
    );
$$;
GRANT EXECUTE ON FUNCTION public.donations_enabled() TO authenticated, anon, service_role;

CREATE TABLE IF NOT EXISTS public.giving_campaigns (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    campus_code    TEXT DEFAULT 'GLOBAL',
    title          TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 150),
    description    TEXT CHECK (description IS NULL OR char_length(description) <= 4000),
    goal_amount    NUMERIC(12, 2) CHECK (goal_amount IS NULL OR goal_amount > 0),
    currency       TEXT NOT NULL DEFAULT 'NGN',
    -- payment_url_problem() treats an empty string as "no problem" (it's an
    -- optional field for paid events); giving_url is mandatory here, so that
    -- case is rejected explicitly rather than silently allowed through.
    giving_url     TEXT NOT NULL CHECK (btrim(giving_url) <> '' AND public.payment_url_problem(giving_url) IS NULL),
    cover_image_url TEXT,
    -- Manually confirmed by the campaign owner or an admin, from what the
    -- organisation's own giving platform reports - never derived from clicks.
    confirmed_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    review_status  TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),
    review_note    TEXT,
    reviewed_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at    TIMESTAMPTZ,
    is_closed      BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_giving_campaigns_status ON public.giving_campaigns(review_status, is_closed);

ALTER TABLE public.giving_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved campaigns are readable by anyone; owner/admin see all of theirs" ON public.giving_campaigns;
CREATE POLICY "Approved campaigns are readable by anyone; owner/admin see all of theirs" ON public.giving_campaigns
  FOR SELECT TO authenticated USING (
    review_status = 'approved'
    OR creator_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "A member proposes a giving campaign, held for review" ON public.giving_campaigns;
CREATE POLICY "A member proposes a giving campaign, held for review" ON public.giving_campaigns
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = creator_id
    AND NOT (SELECT COALESCE(is_suspended, false) FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Owner edits their own campaign; admin edits any" ON public.giving_campaigns;
CREATE POLICY "Owner edits their own campaign; admin edits any" ON public.giving_campaigns
  FOR UPDATE TO authenticated USING (
    creator_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Owner deletes their own campaign; admin deletes any" ON public.giving_campaigns;
CREATE POLICY "Owner deletes their own campaign; admin deletes any" ON public.giving_campaigns
  FOR DELETE TO authenticated USING (
    creator_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Force every new/edited campaign back to pending unless an admin is the one
-- touching it - mirrors enforce_resource_moderation(). The owner can still
-- edit their own approved campaign (title typo, updated total), but any edit
-- sends it back for review, same as a paid event's ticket edits.
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
        IF NEW.review_status IS DISTINCT FROM OLD.review_status
           OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
           OR NEW.confirmed_total IS DISTINCT FROM OLD.confirmed_total THEN
            NEW.review_status := OLD.review_status;
            NEW.reviewed_by := OLD.reviewed_by;
            NEW.reviewed_at := OLD.reviewed_at;
            NEW.confirmed_total := OLD.confirmed_total;
        END IF;
        IF NEW IS DISTINCT FROM OLD AND OLD.review_status = 'approved' THEN
            NEW.review_status := 'pending';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_giving_campaign_moderation ON public.giving_campaigns;
CREATE TRIGGER trg_enforce_giving_campaign_moderation
BEFORE INSERT OR UPDATE ON public.giving_campaigns
FOR EACH ROW EXECUTE FUNCTION public.enforce_giving_campaign_moderation();

CREATE OR REPLACE FUNCTION public.handle_giving_campaigns_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_giving_campaigns_updated_at ON public.giving_campaigns;
CREATE TRIGGER trg_giving_campaigns_updated_at
BEFORE UPDATE ON public.giving_campaigns
FOR EACH ROW EXECUTE FUNCTION public.handle_giving_campaigns_updated_at();

-- Referral clicks - zero client read access, exactly like event_payment_clicks.
CREATE TABLE IF NOT EXISTS public.giving_campaign_clicks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.giving_campaigns(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.giving_campaign_clicks ENABLE ROW LEVEL SECURITY;
-- No policies granted to anon/authenticated: writes only via open_giving_page() below.

-- Returns the external giving URL (only for an approved, open campaign) and
-- records the click, in one call - same shape as open_event_payment_page().
CREATE OR REPLACE FUNCTION public.open_giving_page(p_campaign UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_campaign RECORD;
BEGIN
    IF NOT public.donations_enabled() THEN
        RAISE EXCEPTION 'donations_disabled: Giving is not open yet.';
    END IF;
    SELECT * INTO v_campaign FROM public.giving_campaigns WHERE id = p_campaign;
    IF v_campaign IS NULL OR v_campaign.review_status <> 'approved' OR v_campaign.is_closed THEN
        RAISE EXCEPTION 'not_available: This campaign is not currently accepting gifts.';
    END IF;

    INSERT INTO public.giving_campaign_clicks (campaign_id, user_id) VALUES (p_campaign, auth.uid());

    RETURN v_campaign.giving_url;
END;
$$;
GRANT EXECUTE ON FUNCTION public.open_giving_page(uuid) TO authenticated;

-- Admin-only review + manual total update, mirroring admin_apply_payment_review().
-- Restricted to service_role: called from an edge function (same MFA-gated
-- pattern as admin-review-paid-event), never callable directly by a signed-in admin.
CREATE OR REPLACE FUNCTION public.admin_review_giving_campaign(
    p_campaign UUID, p_approve BOOLEAN, p_note TEXT DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF p_approve THEN
        UPDATE public.giving_campaigns
        SET review_status = 'approved', reviewed_by = NULL, reviewed_at = NOW(), review_note = p_note
        WHERE id = p_campaign;
    ELSE
        IF p_note IS NULL OR char_length(trim(p_note)) < 5 THEN
            RAISE EXCEPTION 'note_required: A rejection needs a short reason (5+ characters).';
        END IF;
        UPDATE public.giving_campaigns
        SET review_status = 'rejected', reviewed_by = NULL, reviewed_at = NOW(), review_note = p_note
        WHERE id = p_campaign;
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_review_giving_campaign(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_giving_campaign(uuid, boolean, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_update_giving_total(p_campaign UUID, p_confirmed_total NUMERIC)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF p_confirmed_total < 0 THEN
        RAISE EXCEPTION 'invalid_total: The confirmed total cannot be negative.';
    END IF;
    UPDATE public.giving_campaigns SET confirmed_total = p_confirmed_total WHERE id = p_campaign;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_giving_total(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_giving_total(uuid, numeric) TO service_role;

-- ============================================================================
-- 5. JOBS MODERATION QUEUE
-- ============================================================================
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Same shape as enforce_resource_moderation(): a non-admin/staff poster
-- cannot self-approve. is_approved defaulted TRUE at the table level for a
-- reason no longer valid (nothing ever moderated it) - this trigger is what
-- actually makes that default meaningful going forward.
CREATE OR REPLACE FUNCTION public.enforce_job_moderation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_role text;
BEGIN
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role IN ('admin', 'staff') THEN RETURN NEW; END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.is_approved := false;
        NEW.approved_by := NULL;
        NEW.approved_at := NULL;
        NEW.rejection_reason := NULL;
    ELSE
        NEW.is_approved := OLD.is_approved;
        NEW.approved_by := OLD.approved_by;
        NEW.approved_at := OLD.approved_at;
        NEW.rejection_reason := OLD.rejection_reason;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_job_moderation ON public.jobs;
CREATE TRIGGER trg_enforce_job_moderation
BEFORE INSERT OR UPDATE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.enforce_job_moderation();

-- listJobs()'s campus/global SELECT policy already exists (supabase_schema.sql)
-- and does not filter on is_approved - the client filters with .eq('is_approved', true).
-- A poster should still see their own pending posting while it's under review.
DROP POLICY IF EXISTS "Jobs viewable by campus or global" ON public.jobs;
CREATE POLICY "Jobs viewable by campus or global" ON public.jobs
FOR SELECT TO authenticated
USING (
    (is_approved = true AND (
        campus_code = 'GLOBAL' OR
        campus_code = (SELECT campus_code FROM public.profiles WHERE id = auth.uid())
    ))
    OR poster_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);

NOTIFY pgrst, 'reload schema';

COMMIT;
