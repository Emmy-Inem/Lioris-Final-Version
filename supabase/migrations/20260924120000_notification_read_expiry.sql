-- Viewed notifications disappear 30 days after they were viewed.
--
-- The notifications table only had is_read, so "viewed 30 days ago" could not be told
-- apart from "created 30 days ago". read_at records when is_read flipped to true.

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Rows that were already read before this migration start their 30 days now, rather than
-- vanishing the moment it is applied.
UPDATE public.notifications
   SET read_at = now()
 WHERE is_read = true AND read_at IS NULL;

CREATE OR REPLACE FUNCTION public.stamp_notification_read_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_read IS TRUE THEN
    IF TG_OP = 'INSERT' OR OLD.is_read IS DISTINCT FROM TRUE OR NEW.read_at IS NULL THEN
      NEW.read_at := COALESCE(NEW.read_at, now());
    END IF;
  ELSE
    NEW.read_at := NULL;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_notifications_stamp_read_at ON public.notifications;
CREATE TRIGGER trg_notifications_stamp_read_at
  BEFORE INSERT OR UPDATE OF is_read ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.stamp_notification_read_at();

CREATE INDEX IF NOT EXISTS idx_notifications_read_at
  ON public.notifications (read_at)
  WHERE is_read = true;

-- Removes viewed notifications older than p_days. The app also filters them out and deletes
-- the signed-in user's own expired rows, so this only keeps idle accounts tidy.
CREATE OR REPLACE FUNCTION public.purge_viewed_notifications(p_days integer DEFAULT 30)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n bigint;
BEGIN
  DELETE FROM public.notifications
   WHERE is_read = true
     AND read_at IS NOT NULL
     AND read_at < now() - make_interval(days => GREATEST(p_days, 1));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;

REVOKE ALL ON FUNCTION public.purge_viewed_notifications(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_viewed_notifications(integer) TO service_role;

-- Daily job, only when pg_cron is installed (same pattern as the other retention jobs).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed: lioris_purge_viewed_notifications NOT scheduled';
    RETURN;
  END IF;
  BEGIN
    PERFORM cron.unschedule('lioris_purge_viewed_notifications');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  PERFORM cron.schedule('lioris_purge_viewed_notifications', '27 3 * * *', 'SELECT public.purge_viewed_notifications(30)');
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not schedule lioris_purge_viewed_notifications: % (schedule it manually)', SQLERRM;
END
$do$;
