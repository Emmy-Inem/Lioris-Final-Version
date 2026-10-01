-- ============================================================================
-- LIORIS - EVENTS: soft-cancel, a real delete guard, waitlist promotion on
-- capacity increase, and attendee notifications on cancel/material edit
-- ============================================================================
-- Four gaps found in an events audit:
--
--   1. The only "cancel" action anywhere (student/alumni/staff organiser view,
--      admin view) was purgeEvent() - a plain DELETE that cascades away
--      event_attendees/event_payment_details/event_partnerships. There was no
--      soft-cancel, nobody registered was ever notified either way, and -
--      unlike trg_events_paid_guard (which blocks changing ticket price once
--      purchase_confirmed_at is set, but only on UPDATE) - nothing stopped a
--      paid event with confirmed purchases from being purged outright.
--      events.status already has a 'cancelled' member (event_status_type),
--      so this adds:
--        - a BEFORE DELETE guard mirroring trg_events_paid_guard's shape,
--          refusing to delete an event with any confirmed purchase,
--        - a one-line change to the existing enforce_event_status_authority()
--          trigger so an organiser can move their OWN live event straight to
--          'cancelled' (and only that transition) without admin/staff
--          authority - every other status change is unchanged and still
--          needs it,
--        - a notify-on-cancel trigger that tells every current attendee.
--
--   2. Editing a live event's date, venue or virtual link never told anyone
--      who had already RSVP'd - updateEvent() is a plain UPDATE with no
--      notification side effect. A notify-on-material-edit trigger covers
--      this the same way, so it fires no matter which client path writes the
--      row.
--
--   3. promote_from_event_waitlist() (20261001000000_workflow_gaps.sql) only
--      ran AFTER DELETE ON event_attendees, so raising an event's capacity
--      never pulled anyone off the waitlist. Its promotion logic is pulled
--      into a shared, idempotent helper (promote_event_waitlist: promote
--      while there is room and someone is waiting) that both the original
--      cancellation trigger and a new AFTER UPDATE ON events trigger call.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.events') IS NULL
     OR to_regclass('public.event_attendees') IS NULL
     OR to_regclass('public.event_waitlist') IS NULL
     OR to_regclass('public.notifications') IS NULL THEN
    RAISE EXCEPTION 'events_fixes: a required table is missing - run the base schema and 20261001000000_workflow_gaps.sql first';
  END IF;
END $do$;

-- =====================================================================================================
-- 1a. cancellation_reason
-- =====================================================================================================
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_cancellation_reason_len_chk;
ALTER TABLE public.events ADD CONSTRAINT events_cancellation_reason_len_chk CHECK (cancellation_reason IS NULL OR length(cancellation_reason) <= 500);

-- =====================================================================================================
-- 1b. let an organiser cancel (and only cancel) their own event themselves
-- =====================================================================================================
-- enforce_event_status_authority() (supabase_schema.sql) reverts any `status`
-- change made by someone who is neither an admin nor campus staff - correct
-- for self-approval, but it also silently reverted a plain organiser's own
-- cancelEvent() update. This adds one narrowly-scoped exception: the actor
-- is the event's own creator, the new status is 'cancelled', and the event
-- was actually live ('upcoming'/'ongoing') - every other transition (self-
-- approval, un-cancelling, cancelling someone else's event) still falls
-- through to the admin/staff check exactly as before.
CREATE OR REPLACE FUNCTION enforce_event_status_authority() RETURNS TRIGGER AS $$
DECLARE
  actor_role TEXT;
  actor_campus TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'cancelled' AND OLD.creator_id = auth.uid() AND OLD.status IN ('upcoming', 'ongoing') THEN
      RETURN NEW;
    END IF;
    SELECT role, campus_code INTO actor_role, actor_campus FROM profiles WHERE id = auth.uid();
    IF NOT (actor_role = 'admin' OR (actor_role = 'staff' AND actor_campus = OLD.campus_code)) THEN
      NEW.status := OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================================================================
-- 1c. block purging an event that already has a confirmed paid purchase
-- =====================================================================================================
-- Mirrors trg_events_paid_guard (20260925140000_paid_events.sql), just on
-- DELETE instead of UPDATE: once a door organiser has confirmed someone
-- actually bought entry (event_attendees.purchase_confirmed_at), purging the
-- event would silently wipe that record. Internal/service-role callers
-- (auth.uid() IS NULL - migrations, scheduled jobs, the SQL editor) are left
-- alone, same as trg_events_paid_guard; every signed-in caller, organiser or
-- admin, is pointed at cancelEvent() instead.
CREATE OR REPLACE FUNCTION public.events_delete_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.event_attendees a WHERE a.event_id = OLD.id AND a.purchase_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'has_confirmed_purchases: This event has confirmed ticket purchases and cannot be deleted. Cancel it instead.';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_events_delete_guard ON public.events;
CREATE TRIGGER trg_events_delete_guard BEFORE DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_delete_guard();

-- =====================================================================================================
-- 1d. notify every current attendee when an event is cancelled
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.notify_event_cancelled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r RECORD;
  v_body TEXT;
BEGIN
  v_body := '"' || NEW.title || '" has been cancelled.';
  IF NEW.cancellation_reason IS NOT NULL AND btrim(NEW.cancellation_reason) <> '' THEN
    v_body := v_body || ' Reason: ' || NEW.cancellation_reason;
  END IF;
  FOR r IN SELECT user_id FROM public.event_attendees WHERE event_id = NEW.id LOOP
    INSERT INTO public.notifications (recipient_id, title, body, type, action_url, is_read)
    VALUES (r.user_id, 'Event cancelled', v_body, 'event', '/event/' || NEW.id, false);
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_event_cancelled ON public.events;
CREATE TRIGGER trg_notify_event_cancelled
  AFTER UPDATE ON public.events
  FOR EACH ROW
  WHEN (NEW.status::text = 'cancelled' AND OLD.status::text IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION public.notify_event_cancelled();

-- =====================================================================================================
-- 2. notify every current attendee when a live event's date, venue or link changes
-- =====================================================================================================
-- "Material" is deliberately narrow: when/where to show up. A typo fix to
-- the description or a capacity bump is not worth a push notification to
-- every registrant, so only start/end time, venue and the virtual link count.
CREATE OR REPLACE FUNCTION public.notify_event_details_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r RECORD;
  v_changes TEXT := '';
BEGIN
  IF NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.end_time IS DISTINCT FROM OLD.end_time THEN
    v_changes := v_changes || ' the date/time';
  END IF;
  IF NEW.venue IS DISTINCT FROM OLD.venue OR NEW.virtual_link IS DISTINCT FROM OLD.virtual_link THEN
    v_changes := v_changes || CASE WHEN v_changes = '' THEN '' ELSE ' and' END || ' the venue';
  END IF;
  FOR r IN SELECT user_id FROM public.event_attendees WHERE event_id = NEW.id LOOP
    INSERT INTO public.notifications (recipient_id, title, body, type, action_url, is_read)
    VALUES (
      r.user_id,
      'Event details changed',
      'The organiser updated' || v_changes || ' for "' || NEW.title || '". Check the event for what changed.',
      'event',
      '/event/' || NEW.id,
      false
    );
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_event_details_changed ON public.events;
CREATE TRIGGER trg_notify_event_details_changed
  AFTER UPDATE ON public.events
  FOR EACH ROW
  WHEN (
    NEW.status::text <> 'cancelled' AND OLD.status::text <> 'cancelled'
    AND (
      NEW.start_time IS DISTINCT FROM OLD.start_time
      OR NEW.end_time IS DISTINCT FROM OLD.end_time
      OR NEW.venue IS DISTINCT FROM OLD.venue
      OR NEW.virtual_link IS DISTINCT FROM OLD.virtual_link
    )
  )
  EXECUTE FUNCTION public.notify_event_details_changed();

-- =====================================================================================================
-- 3. promote off the waitlist whenever room opens up - on cancellation AND on a capacity raise
-- =====================================================================================================
-- Shared by both triggers below: computed straight from live state (current
-- capacity vs current attendee count) rather than trusting a delta, so it
-- promotes exactly as many people as there is room for whether one seat
-- freed up (a cancellation) or several did (capacity raised by any amount).
CREATE OR REPLACE FUNCTION public.promote_event_waitlist(p_event_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  e public.events%ROWTYPE;
  v_next RECORD;
  v_taken INTEGER;
BEGIN
  SELECT * INTO e FROM public.events WHERE id = p_event_id;
  -- The event may be mid cascading-delete (purgeEvent, on a non-paid-purchase event) - nothing to promote into.
  IF NOT FOUND THEN RETURN; END IF;
  IF e.capacity IS NULL OR e.capacity <= 0 OR (e.ticket_type = 'paid' AND NOT e.reservation_held) THEN RETURN; END IF;

  LOOP
    SELECT count(*) INTO v_taken FROM public.event_attendees WHERE event_id = p_event_id;
    EXIT WHEN v_taken >= e.capacity;

    SELECT w.* INTO v_next FROM public.event_waitlist w
      WHERE w.event_id = p_event_id AND w.promoted_at IS NULL
      ORDER BY w.created_at ASC LIMIT 1
      FOR UPDATE SKIP LOCKED;
    EXIT WHEN v_next IS NULL;

    -- ticket_code is left unset so it picks up the table's own
    -- DEFAULT encode(gen_random_bytes(6), 'hex') - the same generator
    -- rsvp_event() relies on, rather than a second, ad hoc scheme.
    INSERT INTO public.event_attendees (event_id, user_id, registered_at)
    VALUES (p_event_id, v_next.user_id, NOW())
    ON CONFLICT (event_id, user_id) DO NOTHING;

    UPDATE public.event_waitlist SET promoted_at = NOW() WHERE id = v_next.id;

    INSERT INTO public.notifications (recipient_id, title, body, type, action_url, is_read)
    VALUES (
      v_next.user_id,
      'A place opened up!',
      'You have been moved off the waitlist and registered for "' || COALESCE(e.title, 'the event') || '".',
      'event',
      '/event/' || p_event_id,
      false
    );
  END LOOP;
END;
$$;

-- Re-point the existing cancellation trigger's function at the shared helper
-- (same AFTER DELETE ON event_attendees trigger as before - only the function
-- body changes, so this is a plain CREATE OR REPLACE, no DROP/CREATE TRIGGER
-- needed for it).
CREATE OR REPLACE FUNCTION public.promote_from_event_waitlist()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.promote_event_waitlist(OLD.event_id);
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_promote_from_event_waitlist ON public.event_attendees;
CREATE TRIGGER trg_promote_from_event_waitlist
AFTER DELETE ON public.event_attendees
FOR EACH ROW EXECUTE FUNCTION public.promote_from_event_waitlist();

CREATE OR REPLACE FUNCTION public.promote_waitlist_on_capacity_increase()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.promote_event_waitlist(NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_promote_waitlist_on_capacity_increase ON public.events;
CREATE TRIGGER trg_promote_waitlist_on_capacity_increase
  AFTER UPDATE ON public.events
  FOR EACH ROW
  WHEN (NEW.capacity IS DISTINCT FROM OLD.capacity AND NEW.capacity > OLD.capacity)
  EXECUTE FUNCTION public.promote_waitlist_on_capacity_increase();

NOTIFY pgrst, 'reload schema';

COMMIT;
