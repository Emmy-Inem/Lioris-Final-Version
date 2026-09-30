-- ============================================================================
-- LIORIS - TIER 3: NOTIFICATION PREFERENCES THAT ACTUALLY GATE DELIVERY,
-- SELF-SERVICE ACCOUNT DEACTIVATION
-- ============================================================================
-- Found in a wider functionality audit:
--
--   1. Settings > Notification Preferences had four toggles (Push, Campus
--      Announcements, Events & Workshops, Weekly Digest) that only wrote to
--      device-local storage (and, best-effort, auth user_metadata) - nothing
--      server-side ever read them, so muting a category did not stop that
--      push from being sent. This adds public.notification_preferences (one
--      row per user, owner-read/write, service_role read) as the real
--      source of truth; supabase/functions/send-push/index.ts is updated in
--      the same change to check it before delivering.
--
--      There is no "Weekly Digest" generator anywhere in this codebase (no
--      cron job assembles or sends one) - digest_enabled is stored for when
--      that feature exists, but today toggling it has nothing to gate yet.
--      This migration does not invent that feature.
--
--   2. Account deletion was the only way to step away: profiles.deactivated_at
--      plus deactivate_my_account()/reactivate_my_account() let a user pause
--      their own account (signed out immediately, blocked from signing back
--      in until they do - the client clears it automatically on their next
--      successful login, same "log back in to reactivate" pattern most apps
--      use). This is a self-service pause, not a moderation action: distinct
--      from profiles.is_suspended, which staff use to hold a violating
--      account and which this migration does not touch.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. notification_preferences
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id                uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_enabled           boolean NOT NULL DEFAULT true,
  announcements_enabled  boolean NOT NULL DEFAULT true,
  events_enabled         boolean NOT NULL DEFAULT true,
  digest_enabled         boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can read own notification preferences" ON public.notification_preferences;
CREATE POLICY "Owner can read own notification preferences"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Owner can write own notification preferences" ON public.notification_preferences;
CREATE POLICY "Owner can write own notification preferences"
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owner can update own notification preferences" ON public.notification_preferences;
CREATE POLICY "Owner can update own notification preferences"
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role reads notification preferences" ON public.notification_preferences;
CREATE POLICY "Service role reads notification preferences"
  ON public.notification_preferences FOR SELECT TO service_role
  USING (true);

REVOKE ALL ON public.notification_preferences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT SELECT ON public.notification_preferences TO service_role;

CREATE OR REPLACE FUNCTION public.notification_preferences_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_notification_preferences_touch ON public.notification_preferences;
CREATE TRIGGER trg_notification_preferences_touch
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.notification_preferences_touch_updated_at();

REVOKE ALL ON FUNCTION public.notification_preferences_touch_updated_at() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Self-service account deactivation (distinct from staff-applied is_suspended)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

CREATE OR REPLACE FUNCTION public.deactivate_my_account()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  UPDATE public.profiles SET deactivated_at = now() WHERE id = v_uid;
END
$$;

CREATE OR REPLACE FUNCTION public.reactivate_my_account()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  UPDATE public.profiles SET deactivated_at = NULL WHERE id = v_uid;
END
$$;

REVOKE ALL ON FUNCTION public.deactivate_my_account() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reactivate_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_my_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_my_account() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
