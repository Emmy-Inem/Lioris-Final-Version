-- Paid events: discovery + referral, no payment processing.
--
-- Lioris helps students find paid events and measures how many turn up. It never takes a ticket payment:
-- the organiser collects the money (their own payment page, or at the venue). So nothing here marks anyone
-- "paid" because they clicked a link or RSVP'd; only the organiser can confirm, at the door, who bought entry.
--
--   1. feature flag `paid_events` (admin switch, default OFF)
--   2. events: ticket type, method, deadline and an admin payment review that gates the payment link
--   3. event_payment_details (link + instructions, never readable by students), event_partnerships (admin only),
--      event_payment_clicks (referral funnel)
--   4. event_attendees becomes the referral record: reference code, consent, check-in, purchase confirmation
--   5. RSVP/cancel/check-in/roster/report are SECURITY DEFINER functions; the table is no longer world-readable
--      (it exposed every ticket code and attendee to any signed-in user) or directly writable
--   6. admin review function (called by the admin-review-paid-event edge function), overview, reminders
-- Idempotent: safe to run twice.

-- =====================================================================================================
-- 1. feature flag
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.paid_events_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    (SELECT (value ->> 'paid_events')::boolean FROM public.platform_settings WHERE key = 'feature_flags'),
    false);
$$;

-- =====================================================================================================
-- 2. events
-- =====================================================================================================
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ticket_type text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS reservation_held boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS payment_review_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS payment_reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_review_note text;

-- Events that already carry a price were shown as paid; keep them paid, but they need a review like any other.
UPDATE public.events
   SET ticket_type = 'paid', payment_method = COALESCE(payment_method, 'at_venue'), payment_review_status = 'pending'
 WHERE ticket_type = 'free' AND COALESCE(ticket_price, 0) > 0;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_ticket_type_chk;
ALTER TABLE public.events ADD CONSTRAINT events_ticket_type_chk CHECK (ticket_type IN ('free', 'paid'));
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_currency_chk;
ALTER TABLE public.events ADD CONSTRAINT events_currency_chk CHECK (currency = 'NGN');
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_payment_method_chk;
ALTER TABLE public.events ADD CONSTRAINT events_payment_method_chk CHECK (payment_method IS NULL OR payment_method IN ('online', 'at_venue', 'both'));
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_review_status_chk;
ALTER TABLE public.events ADD CONSTRAINT events_review_status_chk CHECK (payment_review_status IN ('not_required', 'pending', 'approved', 'rejected'));
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_paid_shape_chk;
ALTER TABLE public.events ADD CONSTRAINT events_paid_shape_chk CHECK (
  (ticket_type = 'free' AND COALESCE(ticket_price, 0) = 0 AND payment_method IS NULL AND NOT reservation_held AND payment_review_status = 'not_required')
  OR
  (ticket_type = 'paid' AND ticket_price > 0 AND ticket_price <= 1000000 AND payment_method IS NOT NULL AND payment_review_status <> 'not_required'
   AND (NOT reservation_held OR payment_method IN ('at_venue', 'both')))
);
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_booking_deadline_chk;
ALTER TABLE public.events ADD CONSTRAINT events_booking_deadline_chk CHECK (booking_deadline IS NULL OR booking_deadline <= end_time);
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_review_note_len_chk;
ALTER TABLE public.events ADD CONSTRAINT events_review_note_len_chk CHECK (payment_review_note IS NULL OR length(payment_review_note) <= 500);
CREATE INDEX IF NOT EXISTS idx_events_paid_review ON public.events (payment_review_status) WHERE ticket_type = 'paid';

-- =====================================================================================================
-- 2b. who may run an event's door
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.event_can_manage(p_event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE e.id = p_event
      AND COALESCE(p.is_suspended, false) = false
      AND (e.creator_id = p.id
           OR p.role::text = 'admin'
           OR (p.role::text = 'staff' AND p.campus_code = e.campus_code))
  );
$$;

-- =====================================================================================================
-- 3. payment details, partnership, clicks
-- =====================================================================================================
-- Why the link is a table of its own: events are readable by everyone on the campus (pending ones too), and a
-- payment link is exactly what a scammer would want to slip in. Students never SELECT it; they get it from
-- open_event_payment_page(), which only answers once an admin approved the event's payment details.
CREATE OR REPLACE FUNCTION public.payment_url_problem(p_url text)
RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_host text;
BEGIN
  IF p_url IS NULL OR btrim(p_url) = '' THEN RETURN NULL; END IF;
  IF length(p_url) > 500 THEN RETURN 'The payment link is too long (500 characters at most).'; END IF;
  IF p_url ~ '[[:space:][:cntrl:]]' THEN RETURN 'The payment link cannot contain spaces.'; END IF;
  IF p_url !~* '^https://' THEN RETURN 'The payment link must start with https://.'; END IF;
  v_host := lower(substring(p_url FROM '^https://([^/?#]*)'));
  IF v_host IS NULL OR v_host = '' THEN RETURN 'The payment link needs a website address.'; END IF;
  IF v_host LIKE '%@%' THEN RETURN 'The payment link cannot contain a username or password.'; END IF;
  IF v_host ~ ':' THEN RETURN 'Use the normal website address without a port number.'; END IF;
  IF v_host ~ '^[0-9.]+$' OR v_host LIKE '[%' THEN RETURN 'Use the organiser''s website name, not an IP address.'; END IF;
  IF v_host !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$' THEN RETURN 'That does not look like a valid website address.'; END IF;
  IF v_host IN ('localhost') OR v_host ~ '\.(local|internal|localhost|lan|test|invalid)$' THEN RETURN 'That address is not a public website.'; END IF;
  RETURN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.event_payment_details (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  payment_url text,
  instructions text,
  link_check jsonb,
  link_checked_at timestamptz,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.event_payment_details DROP CONSTRAINT IF EXISTS epd_url_chk;
ALTER TABLE public.event_payment_details ADD CONSTRAINT epd_url_chk CHECK (public.payment_url_problem(payment_url) IS NULL);
ALTER TABLE public.event_payment_details DROP CONSTRAINT IF EXISTS epd_instructions_chk;
ALTER TABLE public.event_payment_details ADD CONSTRAINT epd_instructions_chk CHECK (instructions IS NULL OR length(instructions) <= 400);
ALTER TABLE public.event_payment_details ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.event_payment_details FROM anon, authenticated;
DROP POLICY IF EXISTS "epd organisers and staff read" ON public.event_payment_details;
CREATE POLICY "epd organisers and staff read" ON public.event_payment_details FOR SELECT TO authenticated
  USING (public.event_can_manage(event_id));

CREATE TABLE IF NOT EXISTS public.event_partnerships (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'proposed', 'agreed', 'ended')),
  organiser_name text CHECK (organiser_name IS NULL OR length(organiser_name) <= 160),
  organiser_contact text CHECK (organiser_contact IS NULL OR length(organiser_contact) <= 200),
  fee_per_paying_attendee numeric(12, 2) CHECK (fee_per_paying_attendee IS NULL OR (fee_per_paying_attendee >= 0 AND fee_per_paying_attendee <= 1000000)),
  dispute_window_days integer NOT NULL DEFAULT 7 CHECK (dispute_window_days BETWEEN 1 AND 90),
  agreed_at timestamptz,
  agreed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text CHECK (notes IS NULL OR length(notes) <= 1000),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_partnerships_agreed_chk CHECK (status <> 'agreed' OR (fee_per_paying_attendee IS NOT NULL AND agreed_at IS NOT NULL))
);
ALTER TABLE public.event_partnerships ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.event_partnerships FROM anon, authenticated;
DROP POLICY IF EXISTS "partnerships admins read" ON public.event_partnerships;
CREATE POLICY "partnerships admins read" ON public.event_partnerships FOR SELECT TO authenticated
  USING (COALESCE(public.auth_profile_role() = 'admin', false));

CREATE TABLE IF NOT EXISTS public.event_payment_clicks (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  first_clicked_at timestamptz NOT NULL DEFAULT now(),
  last_clicked_at timestamptz NOT NULL DEFAULT now(),
  click_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (event_id, user_id)
);
ALTER TABLE public.event_payment_clicks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_payment_clicks FROM anon, authenticated;

-- =====================================================================================================
-- 4. event_attendees = the referral record
-- =====================================================================================================
-- (md5 rather than gen_random_bytes: the migration runner's search_path does not include the extensions schema)
UPDATE public.event_attendees SET ticket_code = substr(md5(random()::text || clock_timestamp()::text || user_id::text), 1, 12) WHERE ticket_code IS NULL;
ALTER TABLE public.event_attendees
  ALTER COLUMN ticket_code SET NOT NULL,
  ADD COLUMN IF NOT EXISTS shared_details boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS purchase_confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent_at timestamptz;
ALTER TABLE public.event_attendees DROP CONSTRAINT IF EXISTS event_attendees_purchase_needs_checkin_chk;
ALTER TABLE public.event_attendees ADD CONSTRAINT event_attendees_purchase_needs_checkin_chk
  CHECK (purchase_confirmed_at IS NULL OR checked_in_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user ON public.event_attendees (user_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_checkin ON public.event_attendees (event_id) WHERE checked_in_at IS NOT NULL;

-- =====================================================================================================
-- 5b. lock the RSVP table down (was: readable by every signed-in user, ticket codes included)
-- =====================================================================================================
DROP POLICY IF EXISTS "Event attendees viewable by authenticated users" ON public.event_attendees;
DROP POLICY IF EXISTS "Users can RSVP to events" ON public.event_attendees;
DROP POLICY IF EXISTS "Users can cancel RSVP" ON public.event_attendees;
DROP POLICY IF EXISTS "Attendees see their own registration; organisers see theirs" ON public.event_attendees;
CREATE POLICY "Attendees see their own registration; organisers see theirs" ON public.event_attendees FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.event_can_manage(event_id));
-- Nothing writes this table directly any more: registering, cancelling and checking in are functions below.
REVOKE INSERT, UPDATE, DELETE ON public.event_attendees FROM anon, authenticated;

-- =====================================================================================================
-- 5c. protect the payment columns of events
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.events_paid_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role text;
  v_changed boolean;
BEGIN
  -- Keep the row consistent whoever writes it: a free event carries no price, method or review.
  IF NEW.ticket_type = 'free' THEN
    IF COALESCE(NEW.ticket_price, 0) > 0 THEN
      RAISE EXCEPTION 'paid_settings_required: Choose "Paid" and fill in the payment details to charge for an event.';
    END IF;
    NEW.ticket_price := 0;
    NEW.payment_method := NULL;
    NEW.reservation_held := false;
    NEW.payment_review_status := 'not_required';
    NEW.payment_reviewed_by := NULL;
    NEW.payment_reviewed_at := NULL;
    NEW.payment_review_note := NULL;
  ELSIF NEW.payment_review_status = 'not_required' THEN
    NEW.payment_review_status := 'pending';
  END IF;

  -- Service role / SQL editor (no signed-in user), our own functions and nested triggers are trusted.
  IF auth.uid() IS NULL OR pg_trigger_depth() > 1 OR current_setting('lioris.paid_internal', true) = '1' THEN
    RETURN NEW;
  END IF;
  SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    IF NEW.ticket_type = 'paid' THEN
      IF v_role IS DISTINCT FROM 'admin' AND NOT public.paid_events_enabled() THEN
        RAISE EXCEPTION 'paid_events_disabled: Paid events are not open yet.';
      END IF;
      NEW.payment_review_status := 'pending';
    ELSE
      NEW.payment_review_status := 'not_required';
    END IF;
    NEW.payment_reviewed_by := NULL;
    NEW.payment_reviewed_at := NULL;
    NEW.payment_review_note := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE
  v_changed := NEW.ticket_type IS DISTINCT FROM OLD.ticket_type
            OR NEW.ticket_price IS DISTINCT FROM OLD.ticket_price
            OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
            OR NEW.reservation_held IS DISTINCT FROM OLD.reservation_held;

  IF v_changed AND v_role IS DISTINCT FROM 'admin' THEN
    IF NEW.ticket_type = 'paid' AND OLD.ticket_type = 'free' AND NOT public.paid_events_enabled() THEN
      RAISE EXCEPTION 'paid_events_disabled: Paid events are not open yet.';
    END IF;
    IF (NEW.ticket_type IS DISTINCT FROM OLD.ticket_type OR NEW.ticket_price IS DISTINCT FROM OLD.ticket_price)
       AND EXISTS (SELECT 1 FROM public.event_attendees a WHERE a.event_id = OLD.id AND a.purchase_confirmed_at IS NOT NULL) THEN
      RAISE EXCEPTION 'has_confirmed_purchases: The ticket price cannot change after purchases were confirmed at the door.';
    END IF;
  END IF;

  IF v_role IS DISTINCT FROM 'admin' THEN
    -- Only the review decision itself (admin function) may change these; an edit to the offer sends it back to review.
    IF v_changed THEN
      NEW.payment_review_status := CASE WHEN NEW.ticket_type = 'paid' THEN 'pending' ELSE 'not_required' END;
      NEW.payment_reviewed_by := NULL;
      NEW.payment_reviewed_at := NULL;
      NEW.payment_review_note := NULL;
    ELSE
      NEW.payment_review_status := OLD.payment_review_status;
      NEW.payment_reviewed_by := OLD.payment_reviewed_by;
      NEW.payment_reviewed_at := OLD.payment_reviewed_at;
      NEW.payment_review_note := OLD.payment_review_note;
    END IF;
  ELSIF v_changed AND NEW.payment_review_status = OLD.payment_review_status THEN
    NEW.payment_review_status := CASE WHEN NEW.ticket_type = 'paid' THEN 'pending' ELSE 'not_required' END;
  END IF;

  -- A paid event cannot go live until someone decided about its payment details.
  IF NEW.ticket_type = 'paid' AND NEW.payment_review_status = 'pending'
     AND NEW.status::text IN ('upcoming', 'ongoing') AND OLD.status::text = 'pending_approval' THEN
    RAISE EXCEPTION 'payment_review_required: Review this paid event''s payment details before publishing it.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_events_paid_guard ON public.events;
CREATE TRIGGER trg_events_paid_guard BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_paid_guard();

-- =====================================================================================================
-- 6a. organiser: save link + instructions (one place, always sends the offer back to review)
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.save_event_payment_details(p_event uuid, p_url text, p_instructions text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  e public.events%ROWTYPE;
  v_url text := NULLIF(btrim(COALESCE(p_url, '')), '');
  v_instr text := NULLIF(btrim(COALESCE(p_instructions, '')), '');
  v_problem text;
  v_old public.event_payment_details%ROWTYPE;
  v_is_admin boolean := COALESCE(public.auth_profile_role() = 'admin', false);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO e FROM public.events WHERE id = p_event;
  IF NOT FOUND OR NOT public.event_can_manage(p_event) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF e.ticket_type <> 'paid' THEN RAISE EXCEPTION 'not_paid: This event is free, so there are no payment details.'; END IF;
  IF NOT v_is_admin AND NOT public.paid_events_enabled() THEN RAISE EXCEPTION 'paid_events_disabled: Paid events are not open yet.'; END IF;

  IF e.payment_method = 'at_venue' THEN v_url := NULL; END IF;
  v_problem := public.payment_url_problem(v_url);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'invalid_payment_link: %', v_problem; END IF;
  IF e.payment_method IN ('online', 'both') AND v_url IS NULL THEN
    RAISE EXCEPTION 'payment_link_required: Add the organiser''s payment link, or choose "pay at the venue".';
  END IF;
  IF e.payment_method IN ('at_venue', 'both') AND (v_instr IS NULL OR length(v_instr) < 5) THEN
    RAISE EXCEPTION 'instructions_required: Say how people pay at the venue (for example "cash or transfer at the entrance").';
  END IF;
  IF v_instr IS NOT NULL AND length(v_instr) > 400 THEN RAISE EXCEPTION 'instructions_too_long: Keep the payment instructions under 400 characters.'; END IF;

  SELECT * INTO v_old FROM public.event_payment_details WHERE event_id = p_event;
  INSERT INTO public.event_payment_details (event_id, payment_url, instructions, updated_by, updated_at)
  VALUES (p_event, v_url, v_instr, auth.uid(), now())
  ON CONFLICT (event_id) DO UPDATE
    SET payment_url = EXCLUDED.payment_url,
        instructions = EXCLUDED.instructions,
        -- a different link invalidates the previous check
        link_check = CASE WHEN event_payment_details.payment_url IS DISTINCT FROM EXCLUDED.payment_url THEN NULL ELSE event_payment_details.link_check END,
        link_checked_at = CASE WHEN event_payment_details.payment_url IS DISTINCT FROM EXCLUDED.payment_url THEN NULL ELSE event_payment_details.link_checked_at END,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();

  IF NOT v_is_admin AND (v_old.event_id IS NULL OR v_old.payment_url IS DISTINCT FROM v_url OR v_old.instructions IS DISTINCT FROM v_instr) THEN
    PERFORM set_config('lioris.paid_internal', '1', true);
    UPDATE public.events
       SET payment_review_status = 'pending', payment_reviewed_by = NULL, payment_reviewed_at = NULL, payment_review_note = NULL
     WHERE id = p_event AND payment_review_status <> 'pending';
    PERFORM set_config('lioris.paid_internal', '0', true);
  END IF;
END $$;

-- =====================================================================================================
-- 6b. students: payment info, payment page (records the referral click)
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.events_visible_to_me(p_campus text, p_scope text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p_scope = 'global' OR p_campus IS NULL OR p_campus = 'GLOBAL'
      OR p_campus = public.auth_campus_access()
      OR COALESCE(public.auth_profile_role() = ANY (ARRAY['admin', 'staff']), false);
$$;

CREATE OR REPLACE FUNCTION public.get_event_payment_info(p_event uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  e public.events%ROWTYPE;
  d public.event_payment_details%ROWTYPE;
  v_manage boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO e FROM public.events WHERE id = p_event;
  IF NOT FOUND OR NOT public.events_visible_to_me(e.campus_code, e.visibility_scope::text) THEN RAISE EXCEPTION 'not_found'; END IF;
  IF e.ticket_type <> 'paid' THEN RETURN jsonb_build_object('available', false, 'reason', 'free'); END IF;
  v_manage := public.event_can_manage(p_event);
  IF NOT public.paid_events_enabled() AND NOT v_manage THEN
    RETURN jsonb_build_object('available', false, 'reason', 'paused');
  END IF;
  IF e.payment_review_status <> 'approved' AND NOT v_manage THEN
    RETURN jsonb_build_object('available', false, 'reason', 'in_review');
  END IF;
  SELECT * INTO d FROM public.event_payment_details WHERE event_id = p_event;
  RETURN jsonb_build_object(
    'available', e.payment_review_status = 'approved' AND public.paid_events_enabled(),
    'reason', CASE WHEN e.payment_review_status = 'approved' THEN NULL ELSE e.payment_review_status END,
    'instructions', d.instructions,
    'has_online_link', d.payment_url IS NOT NULL AND e.payment_method IN ('online', 'both'),
    'link_host', CASE WHEN e.payment_method IN ('online', 'both') THEN lower(substring(d.payment_url FROM '^https://([^/?#]*)')) END,
    'review_note', CASE WHEN v_manage THEN e.payment_review_note END
  );
END $$;

CREATE OR REPLACE FUNCTION public.open_event_payment_page(p_event uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  e public.events%ROWTYPE;
  d public.event_payment_details%ROWTYPE;
  v_organiser text;
  v_suspended boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT COALESCE(is_suspended, false) INTO v_suspended FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_suspended THEN RAISE EXCEPTION 'account_suspended'; END IF;
  SELECT * INTO e FROM public.events WHERE id = p_event;
  IF NOT FOUND OR NOT public.events_visible_to_me(e.campus_code, e.visibility_scope::text) THEN RAISE EXCEPTION 'not_found'; END IF;
  IF e.ticket_type <> 'paid' OR e.payment_method NOT IN ('online', 'both') THEN
    RAISE EXCEPTION 'no_payment_page: This event has no online payment page.';
  END IF;
  IF NOT public.paid_events_enabled() THEN RAISE EXCEPTION 'paid_events_disabled: Paid events are paused right now.'; END IF;
  IF e.status::text NOT IN ('upcoming', 'ongoing') OR now() > e.end_time THEN RAISE EXCEPTION 'event_not_open: This event is no longer open.'; END IF;
  IF e.payment_review_status <> 'approved' THEN RAISE EXCEPTION 'payment_not_ready: The payment details for this event are still being checked.'; END IF;
  SELECT * INTO d FROM public.event_payment_details WHERE event_id = p_event;
  IF d.payment_url IS NULL THEN RAISE EXCEPTION 'payment_not_ready: The payment details for this event are still being checked.'; END IF;

  INSERT INTO public.event_payment_clicks (event_id, user_id) VALUES (p_event, auth.uid())
  ON CONFLICT (event_id, user_id) DO UPDATE SET last_clicked_at = now(), click_count = event_payment_clicks.click_count + 1;

  SELECT full_name INTO v_organiser FROM public.profiles WHERE id = e.creator_id;
  RETURN jsonb_build_object(
    'url', d.payment_url,
    'host', lower(substring(d.payment_url FROM '^https://([^/?#]*)')),
    'organiser_name', COALESCE(v_organiser, 'the organiser'),
    'price', e.ticket_price
  );
END $$;

-- =====================================================================================================
-- 6c. RSVP / cancel
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.rsvp_event(p_event uuid, p_share_details boolean DEFAULT false, p_ack boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_suspended boolean;
  e public.events%ROWTYPE;
  a public.event_attendees%ROWTYPE;
  v_taken integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT role::text, COALESCE(is_suspended, false) INTO v_role, v_suspended FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR v_suspended THEN RAISE EXCEPTION 'account_suspended'; END IF;

  SELECT * INTO e FROM public.events WHERE id = p_event FOR UPDATE;
  IF NOT FOUND OR NOT (e.campus_code IS NULL OR e.campus_code = 'GLOBAL' OR e.campus_code = public.auth_campus_access() OR v_role IN ('admin', 'staff')) THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  SELECT * INTO a FROM public.event_attendees WHERE event_id = p_event AND user_id = v_uid;
  IF FOUND THEN
    -- already registered: only the sharing choice can change
    IF a.shared_details IS DISTINCT FROM COALESCE(p_share_details, false) AND a.checked_in_at IS NULL THEN
      UPDATE public.event_attendees SET shared_details = COALESCE(p_share_details, false) WHERE event_id = p_event AND user_id = v_uid RETURNING * INTO a;
    END IF;
    RETURN jsonb_build_object('ticket_code', a.ticket_code, 'registered_at', a.registered_at, 'already', true);
  END IF;

  IF e.status::text NOT IN ('upcoming', 'ongoing') THEN RAISE EXCEPTION 'event_not_open: This event is not open for registration.'; END IF;
  IF now() > COALESCE(e.booking_deadline, e.end_time) THEN
    RAISE EXCEPTION 'booking_closed: Registration for this event has closed.';
  END IF;

  IF e.ticket_type = 'paid' THEN
    IF NOT public.paid_events_enabled() THEN RAISE EXCEPTION 'paid_events_disabled: Paid events are paused right now.'; END IF;
    IF e.payment_review_status <> 'approved' THEN RAISE EXCEPTION 'payment_not_ready: The payment details for this event are still being checked.'; END IF;
    IF NOT COALESCE(p_ack, false) THEN RAISE EXCEPTION 'ack_required: Please confirm you understand how paid events work on Lioris.'; END IF;
  END IF;

  -- Places are only limited when the organiser really holds them (free events, or paid ones with reservations honoured).
  IF e.capacity IS NOT NULL AND e.capacity > 0 AND (e.ticket_type = 'free' OR e.reservation_held) THEN
    SELECT count(*) INTO v_taken FROM public.event_attendees WHERE event_id = p_event;
    IF v_taken >= e.capacity THEN RAISE EXCEPTION 'event_full: This event is full.'; END IF;
  END IF;

  INSERT INTO public.event_attendees (event_id, user_id, shared_details, terms_accepted_at)
  VALUES (p_event, v_uid, COALESCE(p_share_details, false), CASE WHEN e.ticket_type = 'paid' THEN now() END)
  RETURNING * INTO a;
  RETURN jsonb_build_object('ticket_code', a.ticket_code, 'registered_at', a.registered_at, 'already', false);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_event_rsvp(p_event uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE a public.event_attendees%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO a FROM public.event_attendees WHERE event_id = p_event AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF a.checked_in_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_checked_in: You were already checked in, so this registration cannot be cancelled.';
  END IF;
  DELETE FROM public.event_attendees WHERE event_id = p_event AND user_id = auth.uid();
END $$;

-- =====================================================================================================
-- 6d. organiser door tools
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.event_roster(p_event uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.event_can_manage(p_event) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', a.user_id,
      'full_name', COALESCE(p.full_name, 'Lioris member'),
      'avatar_url', p.avatar_url,
      'role', p.role::text,
      -- matric number / department only when the student agreed to share them
      'matric_number', CASE WHEN a.shared_details THEN p.student_id_number END,
      'department', CASE WHEN a.shared_details THEN p.department END,
      'registered_at', a.registered_at,
      'ticket_code', a.ticket_code,
      'checked_in_at', a.checked_in_at,
      'purchase_confirmed_at', a.purchase_confirmed_at
    ) ORDER BY a.registered_at DESC)
    FROM public.event_attendees a
    LEFT JOIN public.profiles p ON p.id = a.user_id
    WHERE a.event_id = p_event
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.checkin_event_attendee(
  p_event uuid, p_code text DEFAULT NULL, p_user uuid DEFAULT NULL, p_undo boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  e public.events%ROWTYPE;
  a public.event_attendees%ROWTYPE;
  v_code text;
  v_status text;
  v_name text;
  v_admin boolean := COALESCE(public.auth_profile_role() = 'admin', false);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.event_can_manage(p_event) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT * INTO e FROM public.events WHERE id = p_event;
  IF e.status::text NOT IN ('upcoming', 'ongoing', 'completed') THEN RAISE EXCEPTION 'event_not_open: This event is not published, so nobody can check in yet.'; END IF;
  IF NOT v_admin AND (now() < e.start_time - interval '6 hours' OR now() > e.end_time + interval '12 hours') THEN
    RAISE EXCEPTION 'checkin_closed: Check-in opens 6 hours before the start and closes 12 hours after the end.';
  END IF;

  IF p_code IS NOT NULL AND btrim(p_code) <> '' THEN
    v_code := regexp_replace(upper(p_code), '[^A-Z0-9]', '', 'g');
    IF v_code LIKE 'LIORIS%' THEN v_code := substr(v_code, 7); END IF;
    SELECT * INTO a FROM public.event_attendees WHERE event_id = p_event AND upper(ticket_code) = v_code FOR UPDATE;
  ELSIF p_user IS NOT NULL THEN
    SELECT * INTO a FROM public.event_attendees WHERE event_id = p_event AND user_id = p_user FOR UPDATE;
  ELSE
    RAISE EXCEPTION 'invalid_input: Enter a code or pick a person.';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found: Nobody registered for this event with that code.'; END IF;

  IF p_undo THEN
    UPDATE public.event_attendees
       SET checked_in_at = NULL, checked_in_by = NULL, purchase_confirmed_at = NULL, purchase_confirmed_by = NULL
     WHERE event_id = a.event_id AND user_id = a.user_id RETURNING * INTO a;
    v_status := 'undone';
  ELSIF a.checked_in_at IS NOT NULL THEN
    v_status := 'already';
  ELSE
    UPDATE public.event_attendees SET checked_in_at = now(), checked_in_by = auth.uid()
     WHERE event_id = a.event_id AND user_id = a.user_id RETURNING * INTO a;
    v_status := 'checked_in';
  END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = a.user_id;
  RETURN jsonb_build_object(
    'status', v_status, 'user_id', a.user_id, 'full_name', COALESCE(v_name, 'Lioris member'),
    'ticket_code', a.ticket_code, 'checked_in_at', a.checked_in_at, 'purchase_confirmed_at', a.purchase_confirmed_at,
    'ticket_type', e.ticket_type
  );
END $$;

CREATE OR REPLACE FUNCTION public.confirm_event_purchase(p_event uuid, p_user uuid, p_confirmed boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  e public.events%ROWTYPE;
  a public.event_attendees%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.event_can_manage(p_event) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT * INTO e FROM public.events WHERE id = p_event;
  IF e.ticket_type <> 'paid' THEN RAISE EXCEPTION 'not_paid: This event is free, so there is no purchase to confirm.'; END IF;
  SELECT * INTO a FROM public.event_attendees WHERE event_id = p_event AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found: That person did not register for this event.'; END IF;
  IF a.checked_in_at IS NULL THEN RAISE EXCEPTION 'not_checked_in: Check the person in first, then confirm that they bought entry.'; END IF;
  IF COALESCE(p_confirmed, true) THEN
    UPDATE public.event_attendees SET purchase_confirmed_at = COALESCE(purchase_confirmed_at, now()), purchase_confirmed_by = auth.uid()
     WHERE event_id = p_event AND user_id = p_user RETURNING * INTO a;
  ELSE
    UPDATE public.event_attendees SET purchase_confirmed_at = NULL, purchase_confirmed_by = NULL
     WHERE event_id = p_event AND user_id = p_user RETURNING * INTO a;
  END IF;
  RETURN jsonb_build_object('user_id', a.user_id, 'purchase_confirmed_at', a.purchase_confirmed_at);
END $$;

-- =====================================================================================================
-- 6e. funnel report (organiser: counts; admin: counts + what the agreement says)
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.event_referral_report(p_event uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  e public.events%ROWTYPE;
  v_rsvps integer; v_in integer; v_bought integer; v_clicks integer;
  pt public.event_partnerships%ROWTYPE;
  v_admin boolean := COALESCE(public.auth_profile_role() = 'admin', false);
  v_out jsonb;
BEGIN
  IF NOT public.event_can_manage(p_event) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT * INTO e FROM public.events WHERE id = p_event;
  SELECT count(*), count(*) FILTER (WHERE checked_in_at IS NOT NULL), count(*) FILTER (WHERE purchase_confirmed_at IS NOT NULL)
    INTO v_rsvps, v_in, v_bought FROM public.event_attendees WHERE event_id = p_event;
  SELECT count(*) INTO v_clicks FROM public.event_payment_clicks WHERE event_id = p_event;
  v_out := jsonb_build_object(
    'event_id', e.id, 'ticket_type', e.ticket_type, 'price', e.ticket_price, 'payment_method', e.payment_method,
    'capacity', e.capacity, 'link_clicks', v_clicks, 'rsvps', v_rsvps, 'checked_in', v_in,
    'purchases_confirmed', v_bought, 'awaiting_confirmation', GREATEST(v_in - v_bought, 0),
    'no_shows', CASE WHEN now() > e.end_time THEN v_rsvps - v_in END
  );
  IF v_admin THEN
    SELECT * INTO pt FROM public.event_partnerships WHERE event_id = p_event;
    v_out := v_out || jsonb_build_object(
      'partnership_status', COALESCE(pt.status, 'none'),
      'fee_per_paying_attendee', pt.fee_per_paying_attendee,
      'estimated_amount', CASE WHEN pt.status = 'agreed' THEN v_bought * pt.fee_per_paying_attendee END,
      'dispute_window_days', COALESCE(pt.dispute_window_days, 7),
      'dispute_window_ends_at', e.end_time + make_interval(days => COALESCE(pt.dispute_window_days, 7)),
      'dispute_window_open', now() <= e.end_time + make_interval(days => COALESCE(pt.dispute_window_days, 7))
    );
  END IF;
  RETURN v_out;
END $$;

-- =====================================================================================================
-- 6f. admin: overview + review (review is called by the admin-review-paid-event edge function only)
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.admin_paid_events_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT COALESCE(public.auth_profile_role() = 'admin', false) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_data ORDER BY (row_data ->> 'start_time') DESC)
    FROM (
      SELECT jsonb_build_object(
        'event_id', e.id, 'title', e.title, 'campus_code', e.campus_code, 'status', e.status::text,
        'start_time', e.start_time, 'end_time', e.end_time, 'organiser_id', e.creator_id,
        'organiser_name', COALESCE(o.full_name, 'Organiser'),
        'price', e.ticket_price, 'payment_method', e.payment_method, 'reservation_held', e.reservation_held,
        'capacity', e.capacity, 'booking_deadline', e.booking_deadline,
        'review_status', e.payment_review_status, 'review_note', e.payment_review_note, 'reviewed_at', e.payment_reviewed_at,
        'payment_url', d.payment_url, 'instructions', d.instructions,
        'link_host', lower(substring(d.payment_url FROM '^https://([^/?#]*)')),
        'link_check', d.link_check,
        'link_check_stale', d.link_check IS NOT NULL AND d.link_check ->> 'url' IS DISTINCT FROM d.payment_url,
        'link_clicks', (SELECT count(*) FROM public.event_payment_clicks c WHERE c.event_id = e.id),
        'rsvps', (SELECT count(*) FROM public.event_attendees a WHERE a.event_id = e.id),
        'checked_in', (SELECT count(*) FROM public.event_attendees a WHERE a.event_id = e.id AND a.checked_in_at IS NOT NULL),
        'purchases_confirmed', (SELECT count(*) FROM public.event_attendees a WHERE a.event_id = e.id AND a.purchase_confirmed_at IS NOT NULL),
        'partnership_status', COALESCE(pt.status, 'none'),
        'fee_per_paying_attendee', pt.fee_per_paying_attendee,
        'organiser_legal_name', pt.organiser_name,
        'organiser_contact', pt.organiser_contact,
        'dispute_window_days', COALESCE(pt.dispute_window_days, 7),
        'agreed_at', pt.agreed_at,
        'partnership_notes', pt.notes
      ) AS row_data
      FROM public.events e
      LEFT JOIN public.profiles o ON o.id = e.creator_id
      LEFT JOIN public.event_payment_details d ON d.event_id = e.id
      LEFT JOIN public.event_partnerships pt ON pt.event_id = e.id
      WHERE e.ticket_type = 'paid'
      ORDER BY e.start_time DESC
      LIMIT 500
    ) s
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.event_paid_notify(p_recipient uuid, p_title text, p_body text, p_action_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_recipient IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
  VALUES (p_recipient, NULL, left(p_title, 140), left(p_body, 400), 'system', p_action_url, false);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'event_paid_notify failed: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.admin_apply_payment_review(
  p_event uuid, p_actor uuid, p_decision text, p_note text DEFAULT NULL,
  p_override_link_check boolean DEFAULT false, p_publish boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  e public.events%ROWTYPE;
  d public.event_payment_details%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_status text;
  v_host text;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND role::text = 'admin' AND COALESCE(is_suspended, false) = false) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'invalid_input: decision must be approve or reject.'; END IF;
  SELECT * INTO e FROM public.events WHERE id = p_event FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF e.ticket_type <> 'paid' THEN RAISE EXCEPTION 'not_paid: This event is free.'; END IF;
  SELECT * INTO d FROM public.event_payment_details WHERE event_id = p_event;

  IF p_decision = 'reject' THEN
    IF v_note IS NULL OR length(v_note) < 5 THEN RAISE EXCEPTION 'note_required: Tell the organiser why the payment details were not approved.'; END IF;
    v_status := 'rejected';
  ELSE
    IF e.payment_method IN ('online', 'both') THEN
      IF d.payment_url IS NULL THEN RAISE EXCEPTION 'payment_link_required: The organiser has not added a payment link.'; END IF;
      IF NOT p_override_link_check THEN
        IF d.link_check IS NULL OR d.link_check ->> 'url' IS DISTINCT FROM d.payment_url THEN
          RAISE EXCEPTION 'link_not_checked: Run the link check on the current payment link first.';
        END IF;
        IF d.link_check ->> 'status' = 'failed' THEN
          RAISE EXCEPTION 'link_check_failed: The payment link failed its check. Ask the organiser for a working link, or override with a note.';
        END IF;
      ELSIF v_note IS NULL OR length(v_note) < 5 THEN
        RAISE EXCEPTION 'note_required: Say why you are approving without a passing link check.';
      END IF;
    END IF;
    IF e.payment_method IN ('at_venue', 'both') AND (d.instructions IS NULL OR length(d.instructions) < 5) THEN
      RAISE EXCEPTION 'instructions_required: The organiser has not said how people pay at the venue.';
    END IF;
    v_status := 'approved';
  END IF;

  PERFORM set_config('lioris.paid_internal', '1', true);
  UPDATE public.events
     SET payment_review_status = v_status, payment_reviewed_by = p_actor, payment_reviewed_at = now(), payment_review_note = v_note,
         status = CASE WHEN p_publish AND v_status = 'approved' AND status::text = 'pending_approval' THEN 'upcoming'::event_status_type ELSE status END
   WHERE id = p_event
   RETURNING * INTO e;
  PERFORM set_config('lioris.paid_internal', '0', true);

  v_host := lower(substring(d.payment_url FROM '^https://([^/?#]*)'));
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_actor,
          CASE WHEN v_status = 'approved' THEN 'event_payment_approved' ELSE 'event_payment_rejected' END,
          'event', p_event,
          jsonb_build_object('summary', format('%s payment details for "%s" (NGN %s, %s)', CASE WHEN v_status = 'approved' THEN 'Approved' ELSE 'Rejected' END, e.title, e.ticket_price, e.payment_method),
                             'reason', v_note, 'linkHost', v_host, 'override', p_override_link_check, 'published', p_publish,
                             'targetIdRaw', p_event::text, 'actorRole', 'admin'));

  PERFORM public.event_paid_notify(e.creator_id,
    CASE WHEN v_status = 'approved' THEN 'Payment details approved' ELSE 'Payment details need changes' END,
    CASE WHEN v_status = 'approved'
         THEN format('Students can now see how to pay for "%s".', e.title)
         ELSE format('"%s": %s', e.title, v_note) END,
    '/events/' || p_event::text);

  RETURN jsonb_build_object('event_id', e.id, 'payment_review_status', e.payment_review_status, 'status', e.status::text);
END $$;

-- link check results written by the edge function (service role)
CREATE OR REPLACE FUNCTION public.admin_store_link_check(p_event uuid, p_actor uuid, p_result jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND role::text = 'admin') THEN RAISE EXCEPTION 'not_allowed'; END IF;
  UPDATE public.event_payment_details SET link_check = p_result, link_checked_at = now() WHERE event_id = p_event;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: This event has no payment details yet.'; END IF;
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_actor, 'event_link_checked', 'event', p_event,
          jsonb_build_object('summary', format('Checked payment link (%s)', p_result ->> 'status'), 'linkHost', p_result ->> 'final_host',
                             'targetIdRaw', p_event::text, 'actorRole', 'admin'));
END $$;

CREATE OR REPLACE FUNCTION public.admin_save_partnership(
  p_event uuid, p_actor uuid, p_status text, p_organiser_name text, p_organiser_contact text,
  p_fee numeric, p_dispute_days integer, p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  pt public.event_partnerships%ROWTYPE;
  v_title text;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND role::text = 'admin' AND COALESCE(is_suspended, false) = false) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  SELECT title INTO v_title FROM public.events WHERE id = p_event AND ticket_type = 'paid';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF p_status NOT IN ('none', 'proposed', 'agreed', 'ended') THEN RAISE EXCEPTION 'invalid_input: unknown partnership status.'; END IF;
  IF p_status = 'agreed' AND (p_fee IS NULL OR NULLIF(btrim(COALESCE(p_organiser_name, '')), '') IS NULL OR NULLIF(btrim(COALESCE(p_organiser_contact, '')), '') IS NULL) THEN
    RAISE EXCEPTION 'agreement_incomplete: An agreed partnership needs the organiser''s name, a contact and the fee per paying attendee.';
  END IF;
  INSERT INTO public.event_partnerships AS t (event_id, status, organiser_name, organiser_contact, fee_per_paying_attendee, dispute_window_days, agreed_at, agreed_by, notes, updated_by, updated_at)
  VALUES (p_event, p_status, NULLIF(btrim(COALESCE(p_organiser_name, '')), ''), NULLIF(btrim(COALESCE(p_organiser_contact, '')), ''),
          p_fee, COALESCE(p_dispute_days, 7), CASE WHEN p_status = 'agreed' THEN now() END, CASE WHEN p_status = 'agreed' THEN p_actor END,
          NULLIF(btrim(COALESCE(p_notes, '')), ''), p_actor, now())
  ON CONFLICT (event_id) DO UPDATE SET
    status = EXCLUDED.status, organiser_name = EXCLUDED.organiser_name, organiser_contact = EXCLUDED.organiser_contact,
    fee_per_paying_attendee = EXCLUDED.fee_per_paying_attendee, dispute_window_days = EXCLUDED.dispute_window_days,
    agreed_at = CASE WHEN EXCLUDED.status = 'agreed' THEN COALESCE(t.agreed_at, now()) ELSE t.agreed_at END,
    agreed_by = CASE WHEN EXCLUDED.status = 'agreed' THEN COALESCE(t.agreed_by, p_actor) ELSE t.agreed_by END,
    notes = EXCLUDED.notes, updated_by = p_actor, updated_at = now()
  RETURNING * INTO pt;
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_actor, 'event_partnership_updated', 'event', p_event,
          jsonb_build_object('summary', format('Partnership for "%s" set to %s', v_title, pt.status), 'fee', pt.fee_per_paying_attendee,
                             'targetIdRaw', p_event::text, 'actorRole', 'admin'));
  RETURN to_jsonb(pt);
END $$;

-- =====================================================================================================
-- 6g. reminders
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.send_event_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r record;
  n integer := 0;
  v_when text;
BEGIN
  FOR r IN
    SELECT a.event_id, a.user_id, a.ticket_code, e.title, e.start_time, e.ticket_type, e.payment_method,
           (e.start_time <= now() + interval '70 minutes') AS is_hour
    FROM public.event_attendees a JOIN public.events e ON e.id = a.event_id
    WHERE e.status::text IN ('upcoming', 'ongoing') AND e.start_time > now() AND a.checked_in_at IS NULL
      AND ((e.start_time <= now() + interval '24 hours' AND a.reminder_24h_sent_at IS NULL AND e.start_time > now() + interval '70 minutes')
        OR (e.start_time <= now() + interval '70 minutes' AND a.reminder_1h_sent_at IS NULL))
    FOR UPDATE OF a SKIP LOCKED
  LOOP
    v_when := to_char(r.start_time AT TIME ZONE 'Africa/Lagos', 'Dy DD Mon "at" HH24:MI');
    PERFORM public.event_paid_notify(r.user_id,
      CASE WHEN r.is_hour THEN 'Starting soon' ELSE 'Coming up' END,
      format('"%s" is %s. Show your Lioris pass at the entrance.%s', r.title, v_when,
             CASE WHEN r.ticket_type = 'paid' THEN ' Entry is paid to the organiser, not to Lioris.' ELSE '' END),
      '/events/' || r.event_id::text);
    IF r.is_hour THEN
      UPDATE public.event_attendees SET reminder_1h_sent_at = now(), reminder_24h_sent_at = COALESCE(reminder_24h_sent_at, now())
       WHERE event_id = r.event_id AND user_id = r.user_id;
    ELSE
      UPDATE public.event_attendees SET reminder_24h_sent_at = now() WHERE event_id = r.event_id AND user_id = r.user_id;
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

DO $do$
BEGIN
  BEGIN
    PERFORM cron.unschedule('lioris_event_reminders');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  BEGIN
    PERFORM cron.schedule('lioris_event_reminders', '*/10 * * * *', 'SELECT public.send_event_reminders()');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not schedule cron job lioris_event_reminders: %', SQLERRM;
  END;
END
$do$;

-- =====================================================================================================
-- 7. grants
-- =====================================================================================================
REVOKE ALL ON FUNCTION
  public.paid_events_enabled(),
  public.payment_url_problem(text),
  public.event_can_manage(uuid),
  public.events_visible_to_me(text, text),
  public.save_event_payment_details(uuid, text, text),
  public.get_event_payment_info(uuid),
  public.open_event_payment_page(uuid),
  public.rsvp_event(uuid, boolean, boolean),
  public.cancel_event_rsvp(uuid),
  public.event_roster(uuid),
  public.checkin_event_attendee(uuid, text, uuid, boolean),
  public.confirm_event_purchase(uuid, uuid, boolean),
  public.event_referral_report(uuid),
  public.admin_paid_events_overview(),
  public.event_paid_notify(uuid, text, text, text),
  public.admin_apply_payment_review(uuid, uuid, text, text, boolean, boolean),
  public.admin_store_link_check(uuid, uuid, jsonb),
  public.admin_save_partnership(uuid, uuid, text, text, text, numeric, integer, text),
  public.send_event_reminders()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.paid_events_enabled(),
  public.payment_url_problem(text),
  public.event_can_manage(uuid),
  public.events_visible_to_me(text, text),
  public.save_event_payment_details(uuid, text, text),
  public.get_event_payment_info(uuid),
  public.open_event_payment_page(uuid),
  public.rsvp_event(uuid, boolean, boolean),
  public.cancel_event_rsvp(uuid),
  public.event_roster(uuid),
  public.checkin_event_attendee(uuid, text, uuid, boolean),
  public.confirm_event_purchase(uuid, uuid, boolean),
  public.event_referral_report(uuid),
  public.admin_paid_events_overview()
TO authenticated;

GRANT EXECUTE ON FUNCTION public.paid_events_enabled(), public.payment_url_problem(text) TO service_role;

-- internal helpers and the edge-function-only functions: nobody signed in can call them directly
REVOKE ALL ON FUNCTION
  public.event_paid_notify(uuid, text, text, text),
  public.admin_apply_payment_review(uuid, uuid, text, text, boolean, boolean),
  public.admin_store_link_check(uuid, uuid, jsonb),
  public.admin_save_partnership(uuid, uuid, text, text, text, numeric, integer, text),
  public.send_event_reminders()
FROM authenticated;
GRANT EXECUTE ON FUNCTION
  public.admin_apply_payment_review(uuid, uuid, text, text, boolean, boolean),
  public.admin_store_link_check(uuid, uuid, jsonb),
  public.admin_save_partnership(uuid, uuid, text, text, text, numeric, integer, text)
TO service_role;
