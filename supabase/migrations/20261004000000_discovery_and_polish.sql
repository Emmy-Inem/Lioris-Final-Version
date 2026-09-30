-- ============================================================================
-- LIORIS - DISCOVERY & POLISH: MUTE, JOB ALERTS, GRANULAR DIRECTORY PRIVACY
-- ============================================================================
-- Found in a wider functionality audit:
--
--   1. Only a full block existed - no lighter "hide their posts, but they can
--      still message me" option. user_mutes mirrors user_blocks exactly
--      (owner-only RLS, same shape); the client threads isUserMuted(...)
--      alongside the existing isUserBlocked(...) in every content filter
--      EXCEPT messaging, which a mute must not affect.
--
--   2. No saved-search alerts anywhere (e.g. "notify me of new jobs matching
--      X"). job_alerts + a trigger on public.jobs that fires once a posting
--      is actually approved and visible (not on every edit) - never before,
--      so a rejected-then-resubmitted posting cannot spam an alert twice
--      from one moderation cycle either.
--
--   3. Settings > Privacy & Data's "Campus Directory Discovery" toggle was
--      device-local only (src/components/SettingsScreenBase.tsx, same class
--      of bug as the old notification preferences) - search_alumni_directory
--      never read it, so turning it off did nothing. profiles.
--      directory_discoverable makes it real. Also adds per-field hide flags
--      (company/location/job title) for finer control than the single
--      on/off switch gave.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.jobs') IS NULL OR to_regclass('public.notifications') IS NULL THEN
    RAISE EXCEPTION 'Core tables missing. Apply supabase_schema.sql first.';
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 1. user_mutes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_mutes (
  muter_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  muted_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (muter_id, muted_id),
  CONSTRAINT user_mutes_not_self CHECK (muter_id <> muted_id)
);

CREATE INDEX IF NOT EXISTS idx_user_mutes_muter ON public.user_mutes(muter_id);
CREATE INDEX IF NOT EXISTS idx_user_mutes_muted ON public.user_mutes(muted_id);

ALTER TABLE public.user_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own mute list" ON public.user_mutes;
CREATE POLICY "Users can view their own mute list"
  ON public.user_mutes FOR SELECT TO authenticated
  USING (auth.uid() = muter_id);

DROP POLICY IF EXISTS "Users can mute other users" ON public.user_mutes;
CREATE POLICY "Users can mute other users"
  ON public.user_mutes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = muter_id);

DROP POLICY IF EXISTS "Users can unmute users" ON public.user_mutes;
CREATE POLICY "Users can unmute users"
  ON public.user_mutes FOR DELETE TO authenticated
  USING (auth.uid() = muter_id);

REVOKE ALL ON public.user_mutes FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.user_mutes TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. job_alerts + notify-on-approval trigger
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_alerts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  keywords          text,
  job_type          text,
  remote_only       boolean NOT NULL DEFAULT false,
  campus_code       text,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_notified_at  timestamptz,
  CONSTRAINT job_alerts_keywords_len CHECK (keywords IS NULL OR char_length(keywords) <= 200),
  CONSTRAINT job_alerts_type_valid CHECK (job_type IS NULL OR job_type IN ('Full-time', 'Part-time', 'Internship', 'Contract'))
);

CREATE INDEX IF NOT EXISTS idx_job_alerts_user ON public.job_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_job_alerts_active ON public.job_alerts(is_active) WHERE is_active;

ALTER TABLE public.job_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can view own job alerts" ON public.job_alerts;
CREATE POLICY "Owner can view own job alerts"
  ON public.job_alerts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owner can create own job alerts" ON public.job_alerts;
CREATE POLICY "Owner can create own job alerts"
  ON public.job_alerts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owner can update own job alerts" ON public.job_alerts;
CREATE POLICY "Owner can update own job alerts"
  ON public.job_alerts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owner can delete own job alerts" ON public.job_alerts;
CREATE POLICY "Owner can delete own job alerts"
  ON public.job_alerts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.job_alerts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_alerts TO authenticated;

-- Fires once a posting is actually approved and visible - matching alert
-- owners (never the poster themself) get one notification per match, and
-- last_notified_at is stamped so a future "digest instead of instant" mode
-- has something to work from. A single bad match must never block the
-- triggering write, hence the per-row exception handler.
CREATE OR REPLACE FUNCTION public.notify_matching_job_alerts()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, user_id FROM public.job_alerts
    WHERE is_active
      AND user_id <> COALESCE(NEW.poster_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (keywords IS NULL OR NEW.title ILIKE '%' || keywords || '%' OR NEW.company ILIKE '%' || keywords || '%')
      AND (job_type IS NULL OR job_type = NEW.type)
      AND (NOT remote_only OR NEW.is_remote = true)
      AND (campus_code IS NULL OR campus_code = 'ALL' OR NEW.campus_code = campus_code OR NEW.campus_code = 'GLOBAL')
  LOOP
    BEGIN
      INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
      VALUES (r.user_id, NULL, 'New job matching your alert', left(NEW.title || ' at ' || COALESCE(NEW.company, 'a campus employer'), 178), 'system', '/jobs', false);
      UPDATE public.job_alerts SET last_notified_at = now() WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_matching_job_alerts failed for alert %: %', r.id, SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.notify_matching_job_alerts() FROM PUBLIC, anon, authenticated;

-- Two triggers, not one combined INSERT-OR-UPDATE trigger: a WHEN clause on
-- a single trigger covering both events cannot safely reference OLD (it does
-- not exist for INSERT), so approval-on-create and approval-on-update are
-- split into their own WHEN-guarded triggers that both call the same function.
DROP TRIGGER IF EXISTS trg_notify_job_alerts_on_insert ON public.jobs;
CREATE TRIGGER trg_notify_job_alerts_on_insert
  AFTER INSERT ON public.jobs
  FOR EACH ROW
  WHEN (NEW.is_approved = true)
  EXECUTE FUNCTION public.notify_matching_job_alerts();

DROP TRIGGER IF EXISTS trg_notify_job_alerts_on_update ON public.jobs;
CREATE TRIGGER trg_notify_job_alerts_on_update
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  WHEN (NEW.is_approved = true AND OLD.is_approved IS DISTINCT FROM true)
  EXECUTE FUNCTION public.notify_matching_job_alerts();

-- ----------------------------------------------------------------------------
-- 3. Granular directory privacy
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS directory_discoverable boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS directory_hide_company boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS directory_hide_location boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS directory_hide_job_title boolean NOT NULL DEFAULT false;

GRANT SELECT (directory_discoverable, directory_hide_company, directory_hide_location, directory_hide_job_title)
  ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
