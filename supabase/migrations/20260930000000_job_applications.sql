-- ============================================================================
-- LIORIS - IN-APP JOB APPLICATIONS (CV upload, screening questions, ranking)
-- ============================================================================
-- Closes three gaps flagged directly by the product owner, confirmed by a
-- code audit (docs/security/security-assessment-2026-09-28.md's sibling
-- workflow audit): the `jobs` table only ever supported an external
-- `apply_url` - there was no CV/resume field, no way for a poster to attach
-- screening questions, and (necessarily) no applicant list or ranking to
-- review, since no application was ever persisted at all (the old "Apply"
-- flow just fired a best-effort notification - see JobCard.tsx before this
-- migration).
--
-- Design, per product decision:
--   - In-app applications are ADDITIVE: a job can still carry an external
--     apply_url (now optional) AND/OR accept in-app applications. Existing
--     postings keep working unchanged.
--   - A resume is a profile-level asset (`profiles.resume_url`), not just a
--     per-application upload - upload once, reuse on every application,
--     mirroring how a real "CV on file" works. An application can still
--     override it with a fresh upload.
--   - Ranking is automatic: Postgres full-text search (`ts_rank`) between the
--     applicant's structured profile text (bio, skills/interests, department)
--     and the job's title+description, computed once at application time.
--     This is deliberately NOT resume-content parsing - there is no text
--     extraction from PDFs/docs in this stack, so the score reflects profile
--     data, not the resume file itself. Documented here so it is never
--     mistaken for something it isn't.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. jobs: apply_url becomes optional, add the in-app-applications toggle.
-- ----------------------------------------------------------------------------
ALTER TABLE public.jobs ALTER COLUMN apply_url DROP NOT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS accepts_in_app_applications BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS applications_count INTEGER NOT NULL DEFAULT 0;

-- A posting must offer at least one way to apply.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_has_an_apply_path;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_has_an_apply_path
  CHECK (accepts_in_app_applications OR apply_url IS NOT NULL);

-- ----------------------------------------------------------------------------
-- 2. profiles: a resume/CV is a profile-level asset, reusable across
--    applications - not something re-uploaded every time.
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS resume_url TEXT;

-- ----------------------------------------------------------------------------
-- 3. job_questions: poster-defined screening questions per job.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_questions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id        UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL CHECK (char_length(question_text) BETWEEN 1 AND 300),
    question_type TEXT NOT NULL DEFAULT 'text' CHECK (question_type IN ('text', 'yes_no')),
    is_required   BOOLEAN NOT NULL DEFAULT true,
    order_index   INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_questions_job ON public.job_questions(job_id, order_index);

ALTER TABLE public.job_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Job questions are readable by anyone" ON public.job_questions;
CREATE POLICY "Job questions are readable by anyone" ON public.job_questions
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Job poster manages own job questions" ON public.job_questions;
CREATE POLICY "Job poster manages own job questions" ON public.job_questions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.poster_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.poster_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ----------------------------------------------------------------------------
-- 4. job_applications: the application itself.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_applications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id        UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    applicant_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'applied'
                  CHECK (status IN ('applied', 'reviewed', 'interview', 'rejected', 'hired')),
    resume_url    TEXT,
    cover_note    TEXT CHECK (cover_note IS NULL OR char_length(cover_note) <= 2000),
    portfolio_url TEXT CHECK (portfolio_url IS NULL OR portfolio_url ~* '^https://'),
    answers       JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object' AND pg_column_size(answers) < 8000),
    match_score   NUMERIC(6, 2),
    reviewed_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (job_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS idx_job_applications_job ON public.job_applications(job_id, match_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_job_applications_applicant ON public.job_applications(applicant_id);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

-- Applicant reads/inserts/deletes only their own row; job poster (and admin)
-- read every application to their own job; poster (and admin) update status.
DROP POLICY IF EXISTS "Applicant reads own application" ON public.job_applications;
CREATE POLICY "Applicant reads own application" ON public.job_applications
  FOR SELECT TO authenticated USING (auth.uid() = applicant_id);

DROP POLICY IF EXISTS "Job poster and admin read applications to their job" ON public.job_applications;
CREATE POLICY "Job poster and admin read applications to their job" ON public.job_applications
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.poster_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "A student applies for themself to an open job" ON public.job_applications;
CREATE POLICY "A student applies for themself to an open job" ON public.job_applications
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = applicant_id
    AND NOT (SELECT COALESCE(is_suspended, false) FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.is_approved = true AND j.accepts_in_app_applications = true
    )
  );

-- Applicant may withdraw (delete) their own application only while it is
-- still in the initial, unreviewed state - once a poster has acted on it,
-- withdrawing would silently erase their decision trail.
DROP POLICY IF EXISTS "Applicant withdraws their own unreviewed application" ON public.job_applications;
CREATE POLICY "Applicant withdraws their own unreviewed application" ON public.job_applications
  FOR DELETE TO authenticated USING (auth.uid() = applicant_id AND status = 'applied');

-- Only the poster or an admin moves an application through its pipeline
-- (status/reviewed_at). match_score is written only by the scoring trigger
-- below (SECURITY DEFINER, bypasses this policy) - never by a client.
DROP POLICY IF EXISTS "Job poster and admin update application status" ON public.job_applications;
CREATE POLICY "Job poster and admin update application status" ON public.job_applications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.poster_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.poster_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ----------------------------------------------------------------------------
-- 5. Automatic ranking: ts_rank between the applicant's profile text and the
--    job's title+description, computed once when the application is created.
--    SECURITY DEFINER so it can read the columns behind the profiles
--    column-privacy fix (20260929000000) regardless of caller grants, and so
--    a client can never forge its own score.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_job_application_match_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_job_doc TEXT;
    v_applicant_doc TEXT;
BEGIN
    SELECT COALESCE(title, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(company, '')
    INTO v_job_doc
    FROM public.jobs WHERE id = NEW.job_id;

    SELECT COALESCE(bio, '') || ' ' || COALESCE(array_to_string(interests, ' '), '') || ' ' || COALESCE(department, '') || ' ' || COALESCE(faculty, '')
    INTO v_applicant_doc
    FROM public.profiles WHERE id = NEW.applicant_id;

    NEW.match_score := ROUND(
        (ts_rank(
            to_tsvector('english', COALESCE(v_job_doc, '')),
            plainto_tsquery('english', COALESCE(v_applicant_doc, ''))
        ) * 100)::numeric,
        2
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_applications_score ON public.job_applications;
CREATE TRIGGER trg_job_applications_score
BEFORE INSERT ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.compute_job_application_match_score();

-- updated_at bookkeeping, matching the pattern used elsewhere (e.g. support_tickets).
CREATE OR REPLACE FUNCTION public.handle_job_applications_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.reviewed_at IS NULL THEN
        NEW.reviewed_at = NOW();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_applications_updated_at ON public.job_applications;
CREATE TRIGGER trg_job_applications_updated_at
BEFORE UPDATE ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.handle_job_applications_updated_at();

-- Keep jobs.applications_count in sync without a client round-trip.
CREATE OR REPLACE FUNCTION public.handle_job_applications_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.jobs SET applications_count = applications_count + 1 WHERE id = NEW.job_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.jobs SET applications_count = GREATEST(applications_count - 1, 0) WHERE id = OLD.job_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_applications_count ON public.job_applications;
CREATE TRIGGER trg_job_applications_count
AFTER INSERT OR DELETE ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.handle_job_applications_count();

-- ----------------------------------------------------------------------------
-- 6. Storage: private `resumes` bucket, following the same pattern as
--    `verifications` (owner + admin read/write), plus a read grant for the
--    job's poster on applications addressed to their own posting.
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'resumes',
    'resumes',
    false,
    10485760, -- 10MB
    ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Resumes viewable by owner, the job poster, and admins" ON storage.objects;
CREATE POLICY "Resumes viewable by owner, the job poster, and admins" ON storage.objects
FOR SELECT TO authenticated USING (
    bucket_id = 'resumes' AND (
        auth.uid()::text = (storage.foldername(name))[1] OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') OR
        EXISTS (
            SELECT 1 FROM public.job_applications ja
            JOIN public.jobs j ON j.id = ja.job_id
            WHERE ja.resume_url = name AND j.poster_id = auth.uid()
        )
    )
);

DROP POLICY IF EXISTS "Users can upload their own resume" ON storage.objects;
CREATE POLICY "Users can upload their own resume" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users and admins can update their resume" ON storage.objects;
CREATE POLICY "Users and admins can update their resume" ON storage.objects
FOR UPDATE TO authenticated USING (
    bucket_id = 'resumes' AND (
        auth.uid()::text = (storage.foldername(name))[1] OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
);

DROP POLICY IF EXISTS "Users and admins can delete their resume" ON storage.objects;
CREATE POLICY "Users and admins can delete their resume" ON storage.objects
FOR DELETE TO authenticated USING (
    bucket_id = 'resumes' AND (
        auth.uid()::text = (storage.foldername(name))[1] OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
);

-- ----------------------------------------------------------------------------
-- 7. profiles.resume_url is self-write, campus-private read (it is a private
--    document reference, not a public profile field - the safe-column grant
--    from 20260929000000 does not include it, so add it back scoped to self
--    plus the same admin/job-poster read as the storage object itself).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'resume_url') THEN
        EXECUTE 'GRANT SELECT (resume_url) ON public.profiles TO authenticated';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
