-- ============================================================================================================
-- 20261112000000_reminders_and_public_analytics.sql
--
--   1  Event reminders are read AND delivered by the server.
--        * set_event_reminder(event, on): idempotent (the old toggle could flip the wrong way on a retry or a
--          double tap), the event must be visible to the caller and not over, at most 200 active reminders.
--        * toggle_event_reminder() now goes through the same checks (older app versions still call it).
--        * get_my_event_reminders() lists only reminders for events that are not long over.
--        * dispatch_event_reminders(): every 5 minutes, writes an in-app notification (the send-push webhook turns
--          it into a push) for each reminder whose event starts within 70 minutes, once. Reminders for events
--          that already started are closed without a ping. Moving an event later re-arms its reminders.
--   2  Signed-out page views: record_public_page_view(name) for a fixed list of public pages, anonymous (no user
--      or device id), with a global rate cap. record_user_activity stays signed-in only.
--
-- Idempotent. Safe to run in one transaction with lock_timeout.
-- ============================================================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. event reminders
-- ---------------------------------------------------------------------------
ALTER TABLE public.event_reminders ADD COLUMN IF NOT EXISTS notified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_event_reminders_pending
  ON public.event_reminders (event_id) WHERE notified_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_event_reminder(p_event_id uuid, p_on boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  e public.events%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated: sign in to set event reminders';
  END IF;

  IF NOT COALESCE(p_on, false) THEN
    DELETE FROM public.event_reminders WHERE user_id = v_uid AND event_id = p_event_id;
    RETURN jsonb_build_object('reminder_on', false, 'event_id', p_event_id);
  END IF;

  SELECT * INTO e FROM public.events WHERE id = p_event_id;
  IF NOT FOUND OR NOT public.events_visible_to_me(e.campus_code, e.visibility_scope::text) THEN
    RAISE EXCEPTION 'not_found: event does not exist';
  END IF;
  IF e.status::text = 'cancelled' OR COALESCE(e.end_time, e.start_time) < now() THEN
    RAISE EXCEPTION 'event_over: this event is over, so a reminder is not needed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.event_reminders WHERE user_id = v_uid AND event_id = p_event_id)
     AND (SELECT count(*) FROM public.event_reminders WHERE user_id = v_uid AND notified_at IS NULL) >= 200 THEN
    RAISE EXCEPTION 'too_many: you already have 200 active event reminders';
  END IF;

  INSERT INTO public.event_reminders (user_id, event_id)
  VALUES (v_uid, p_event_id)
  ON CONFLICT (user_id, event_id) DO NOTHING;
  RETURN jsonb_build_object('reminder_on', true, 'event_id', p_event_id);
END $$;

-- Older app versions call the toggle; it keeps working, with the same checks.
CREATE OR REPLACE FUNCTION public.toggle_event_reminder(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated: sign in to set event reminders';
  END IF;
  RETURN public.set_event_reminder(
    p_event_id,
    NOT EXISTS (SELECT 1 FROM public.event_reminders WHERE user_id = v_uid AND event_id = p_event_id)
  );
END $$;

CREATE OR REPLACE FUNCTION public.get_my_event_reminders()
RETURNS TABLE (event_id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT er.event_id, er.created_at
    FROM public.event_reminders er
    JOIN public.events ev ON ev.id = er.event_id
    WHERE er.user_id = auth.uid()
      AND COALESCE(ev.end_time, ev.start_time) > now() - interval '1 day'
    ORDER BY er.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.dispatch_event_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r record;
  n integer := 0;
  v_when text;
BEGIN
  -- Reminders for events that started (or were cancelled) before they were sent: close them without a ping.
  UPDATE public.event_reminders er
     SET notified_at = now()
    FROM public.events ev
   WHERE ev.id = er.event_id AND er.notified_at IS NULL
     AND (ev.start_time <= now() OR ev.status::text = 'cancelled');

  FOR r IN
    SELECT er.id, er.user_id, er.event_id, ev.title, ev.start_time
    FROM public.event_reminders er
    JOIN public.events ev ON ev.id = er.event_id
    JOIN public.profiles p ON p.id = er.user_id
    WHERE er.notified_at IS NULL
      AND ev.start_time > now() AND ev.start_time <= now() + interval '70 minutes'
      AND ev.status::text IN ('upcoming', 'ongoing')
      AND COALESCE(p.is_suspended, false) = false
    ORDER BY ev.start_time
    LIMIT 500
    FOR UPDATE OF er SKIP LOCKED
  LOOP
    v_when := to_char(r.start_time AT TIME ZONE 'Africa/Lagos', 'Dy DD Mon "at" HH24:MI');
    BEGIN
      INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
      VALUES (r.user_id, NULL, 'Starting soon', left(format('"%s" starts %s.', r.title, v_when), 400),
              'system', '/events/' || r.event_id::text, false);
      UPDATE public.event_reminders SET notified_at = now() WHERE id = r.id;
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'dispatch_event_reminders: reminder % not sent: %', r.id, SQLERRM;
    END;
  END LOOP;

  -- Housekeeping: reminders for events that ended a week ago are no longer needed.
  DELETE FROM public.event_reminders er
   USING public.events ev
   WHERE ev.id = er.event_id AND COALESCE(ev.end_time, ev.start_time) < now() - interval '7 days';

  RETURN n;
END $$;

-- An event moved to a later time must remind people again.
CREATE OR REPLACE FUNCTION public.rearm_event_reminders()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.start_time > OLD.start_time + interval '2 hours' THEN
    UPDATE public.event_reminders SET notified_at = NULL WHERE event_id = NEW.id AND notified_at IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rearm_event_reminders ON public.events;
CREATE TRIGGER trg_rearm_event_reminders
  AFTER UPDATE OF start_time ON public.events
  FOR EACH ROW
  WHEN (NEW.start_time IS DISTINCT FROM OLD.start_time)
  EXECUTE FUNCTION public.rearm_event_reminders();

REVOKE ALL ON FUNCTION public.set_event_reminder(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.toggle_event_reminder(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_event_reminders() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dispatch_event_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rearm_event_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_reminder(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_event_reminder(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_event_reminders() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_event_reminders() TO service_role;

DO $do$
BEGIN
  BEGIN
    PERFORM cron.unschedule('lioris_dispatch_event_reminders');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  BEGIN
    PERFORM cron.schedule('lioris_dispatch_event_reminders', '*/5 * * * *', 'SELECT public.dispatch_event_reminders()');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not schedule cron job lioris_dispatch_event_reminders (pg_cron missing?): %. Enable pg_cron, then run: select cron.schedule(''lioris_dispatch_event_reminders'', ''*/5 * * * *'', ''SELECT public.dispatch_event_reminders()'');', SQLERRM;
  END;
END
$do$;

-- ---------------------------------------------------------------------------
-- 2. signed-out page views
-- ---------------------------------------------------------------------------
-- Only the fixed public pages below are accepted, nothing identifies the visitor (user_id stays NULL, no IP or device
-- id is read), and the whole endpoint is capped at 600 rows a minute so it cannot be used to flood the table.
CREATE OR REPLACE FUNCTION public.record_public_page_view(p_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text := btrim(COALESCE(p_name, ''));
BEGIN
  IF v_name NOT IN ('/', '/login', '/register', '/reset-password', '/verify-email',
                    '/privacy', '/terms', '/copyright', '/community-rules') THEN
    RETURN;
  END IF;
  IF to_regclass('public.analytics_events') IS NULL THEN
    RETURN;
  END IF;
  IF to_regprocedure('public.consume_rate_limit_ex(text,integer,integer)') IS NOT NULL THEN
    IF NOT COALESCE((public.consume_rate_limit_ex('public_page_view', 600, 60) ->> 'allowed')::boolean, false) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.analytics_events (user_id, event_type, name, campus_code, metadata, created_at)
  VALUES (NULL, 'page_view', v_name, 'GLOBAL', '{"signed_out": true}'::jsonb, now());
END $$;

REVOKE ALL ON FUNCTION public.record_public_page_view(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_public_page_view(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
