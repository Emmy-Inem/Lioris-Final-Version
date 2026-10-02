-- ============================================================================
-- LIORIS - JOBS MODULE FIXES
-- ============================================================================
-- Closes gaps confirmed by a read-only audit of the jobs module:
--   1. `listMyJobs()` existed with no way to edit/close/delete a posting - the
--      RLS already grants a poster UPDATE/DELETE on their own row
--      (supabase_schema.sql's "Posters, admins and staff can update/delete
--      jobs" policies), nothing server-side needed to change for that part.
--   2. Postings never expired - `jobs` had no `expires_at` and no "closed"
--      concept distinct from moderation status, so a stale six-month-old
--      posting looked exactly as fresh as one from this morning.
--   3. `updateApplicationStatus()` moved an application through its pipeline
--      (applied -> reviewed -> interview -> hired/rejected) but never told
--      the applicant - the only trigger on job_applications
--      (handle_job_applications_updated_at) just stamps reviewed_at.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. jobs: expiry + a soft "closed" flag, independent of moderation status.
--    45 days is a reasonable shelf life for a campus job board posting -
--    long enough to cover a hiring cycle, short enough that the browse feed
--    doesn't fill up with dead listings nobody ever closes by hand.
-- ----------------------------------------------------------------------------
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '45 days');
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON public.jobs(expires_at);

-- A closed or expired posting must not accept new in-app applications, even
-- if someone still has the listing open in another tab. Mirrors the existing
-- "A student applies for themself to an open job" policy
-- (20260930000000_job_applications.sql) with the expiry/closed check added.
DROP POLICY IF EXISTS "A student applies for themself to an open job" ON public.job_applications;
CREATE POLICY "A student applies for themself to an open job" ON public.job_applications
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = applicant_id
    AND NOT (SELECT COALESCE(is_suspended, false) FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id
        AND j.is_approved = true
        AND j.accepts_in_app_applications = true
        AND j.is_closed = false
        AND j.expires_at > NOW()
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Notify an applicant when the poster moves their application through the
--    pipeline. Mirrors notify_post_like/notify_post_comment's shape
--    (20261001000000_workflow_gaps.sql): SECURITY DEFINER so it can always
--    write the notification regardless of the applicant's own RLS grants,
--    pinned search_path, revoked from anon/authenticated so it is only ever
--    reachable through the trigger - never callable directly to forge a
--    notification for someone else's inbox.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_job_application_status_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_job_title TEXT;
    v_company TEXT;
    v_role_phrase TEXT;
    v_title TEXT;
    v_body TEXT;
BEGIN
    SELECT title, company INTO v_job_title, v_company FROM public.jobs WHERE id = NEW.job_id;
    v_role_phrase := '"' || COALESCE(v_job_title, 'this role') || '"' || CASE WHEN v_company IS NOT NULL THEN ' at ' || v_company ELSE '' END;

    v_title := CASE NEW.status
        WHEN 'reviewed' THEN 'Application reviewed'
        WHEN 'interview' THEN 'Interview requested'
        WHEN 'hired' THEN 'You got the job!'
        WHEN 'rejected' THEN 'Application update'
        ELSE 'Application update'
    END;

    v_body := CASE NEW.status
        WHEN 'reviewed' THEN 'Your application for ' || v_role_phrase || ' has been reviewed.'
        WHEN 'interview' THEN 'Great news - you have been invited to interview for ' || v_role_phrase || '.'
        WHEN 'hired' THEN 'Congratulations! You have been offered ' || v_role_phrase || '.'
        WHEN 'rejected' THEN 'Your application for ' || v_role_phrase || ' was not successful this time.'
        ELSE 'Your application status for ' || v_role_phrase || ' changed to ' || NEW.status || '.'
    END;

    INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
    VALUES (NEW.applicant_id, NULL, v_title, v_body, 'job', '/jobs', false);

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_job_application_status_changed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_job_application_status_changed ON public.job_applications;
CREATE TRIGGER trg_notify_job_application_status_changed
AFTER UPDATE ON public.job_applications
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION public.notify_job_application_status_changed();

NOTIFY pgrst, 'reload schema';

COMMIT;
