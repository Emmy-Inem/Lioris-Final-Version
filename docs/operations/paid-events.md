# Paid events (discovery + referral)

Lioris helps students find paid events. It **does not take ticket payments**: the organiser collects the money on their
own payment page (Paystack, Flutterwave, Selar, their site...) or at the venue. Lioris shows the price, sends students
to the organiser, gives every registration a reference code / QR, and lets the organiser check people in at the door so
that Lioris's contribution can be measured.

Migration `20260925140000_paid_events.sql`, edge function `admin-review-paid-event`, tests in
`tools/sql-harness/run.mjs` ("paid events" section) and `src/utils/paidEvents.test.ts`.

## Rules the product follows

1. **Nobody is marked "paid" or holds a "confirmed ticket" because they clicked a link or registered.** Lioris cannot
   verify an external payment. The wording is "Register interest" / "Reserve a place" (only if the organiser said they
   hold places), and only the organiser can confirm at the door that a checked-in student actually bought entry.
2. **Reach is not revenue.** Reports keep four numbers apart: opened the payment page, registered, checked in, confirmed
   as bought entry. Only the last counts as a purchase. Without an agreement and confirmed purchases, check-ins show
   reach and do not establish money owed.
3. **Every paid event is reviewed by an administrator before students see any of it.** An edit to the price, method or
   payment details sends it back to review.
4. **The first paid events are manual.** Automated fee calculation is not built; the arrangement is recorded per event
   and the numbers are there when both sides trust them.
5. **Collect only what booking and attendance need, and say what is shared** (see "Data shared with the organiser").

## What an organiser sets (event form)

| Field | Notes |
| --- | --- |
| Tickets: Free / Paid | Paid only appears when the admin switch is on (admins can always create one). |
| Ticket price (₦) | 0 < price <= 1,000,000. Displayed as "Paid event · ₦2,000". |
| How students pay | Organiser's website / At the venue / Either. |
| Payment link | Required for website/either. https only, no IP address, no login in the URL, no port, no localhost. Opened outside Lioris, with the organiser named as the payment provider. |
| Payment instructions | Required (5+ characters) for venue/either ("Pay at the entrance; cash or transfer accepted"); max 400. |
| "I will hold a place for people who reserve" | Venue/either only. Off = the button says "Register interest" and makes no promise of a seat. |
| Capacity | Limits registrations for free events and for paid events that hold places. For paid events that do not hold places, interest is not capped (a cap would only turn people away from an interest list). |
| Booking deadline | Optional; not later than the end of the event. Shortcuts: 1 hour / 1 day / 3 days before, or a date and time. |

## Student flow

Event page (and `EventTicketPanel`):

- Label "Paid event · ₦2,000" and how the organiser takes payment; "the organiser collects the payment, not Lioris".
- If the payment details are approved: **"Continue to organiser's payment page"** opens a "You are leaving Lioris" notice that
  names the organiser and the website. Confirming records a referral click (one row per student, with a counter) and
  opens the link. The URL is never in the event data: it comes from `open_event_payment_page()`, which only answers once
  the payment details are approved and paid events are switched on. Venue instructions are shown next to it.
- **Register interest / Reserve a place** opens a sheet: what the organiser will see (name, photo, reference,
  check-in status, and whether they were confirmed as having bought entry), an optional switch to also share matric
  number and department, and (paid events) a required acknowledgement that registering is not paying.
- After registering: a pass with QR and reference (`A1B2-C3D4-E5F6`), check-in status, and Cancel (blocked once checked in).
- Reminders 24 h and ~1 h before (`lioris_event_reminders`, every 10 minutes) to registered people who are not checked in.
- Event list: Free / Paid / My registrations filters; the card's quick RSVP opens the event for paid events.

## Organiser flow: door desk

`EventDoorDesk` (Roster button on the event page; also used by admins):

- **Check in**: type the reference, or scan the QR (browser camera where `BarcodeDetector` exists: Chrome, Edge, Android
  Chrome; other browsers and the native apps use typing or the People tab). Accepts `LIORIS:A1B2C3D4E5F6`, grouped codes,
  lowercase. Check-in is open from 6 hours before the start to 12 hours after the end (admins: any time). Already checked
  in is reported, not repeated.
- **People**: search, check in / undo, and for paid events "Confirm bought entry" (only after check-in; undo clears it).
- **Report**: the four numbers, no-shows after the event, CSV download.

## Admin control

Everything is under Content Desk -> Events -> **Paid events** (`PaidEventsDesk`), plus the same review from an event's own page.

- **Master switch** (`paid_events` feature flag, default OFF; also in Platform -> Feature Controls). Off: organisers
  cannot create or convert paid events, existing paid events show no payment page and take no bookings, the payment
  link is not returned. Admins can still work.
- **Needs review / Live / Past / All** with totals for the funnel.
- **Review payment** (`PaymentReviewSheet`): the offer, the link and venue instructions, the link check, a note, and
  Approve (optionally publishing the event in the same step) / Send back (a reason is required and is sent to the
  organiser as a notification). Approving an online payment needs a passing check of the *current* link; "Approve anyway"
  needs a written reason. A paid event cannot be published (by anyone) while its payment details are pending.
- **Link check** (edge function): DNS, https, redirects (up to 4, each re-validated), HTTP status, provider recognised or
  not. It never reads the page. Warnings (shortener, redirect to another host, bot protection answers 401/403/429/503,
  unknown provider) do not block approval, a failure does. The admin is told to open the link themselves too.
- **Arrangement** (`event_partnerships`, admin only): none / proposed / agreed / ended, organiser's legal name and contact,
  fee per confirmed paying attendee, dispute window (1-90 days, default 7), notes. "Agreed" needs name, contact and fee.
  The report shows `confirmed purchases × fee` as an *estimate* and whether the dispute window is open.
- **Attendance report**: the door desk's Report tab with the agreement and estimate, CSV for sharing with the organiser.
- Existing controls apply: revoke/purge an event, spotlight (admin only), moderation reports.
- Audit log (Moderation filter): `event_payment_approved`, `event_payment_rejected`, `event_link_checked`,
  `event_partnership_updated`, each with the acting admin.

## Backend

| Piece | What it does |
| --- | --- |
| `events` columns | `ticket_type`, `currency` (NGN), `payment_method`, `reservation_held`, `booking_deadline`, `payment_review_status` (`not_required`/`pending`/`approved`/`rejected`) and reviewer/note. A CHECK keeps a free event free of price/method/review and a paid event complete. |
| `events_paid_guard` trigger | Forces review to `pending` on insert, resets it when price/method/type/reservation change, stops non-admins setting review columns, blocks publishing while pending, blocks the switch-off when purchases were confirmed, honours the master switch. |
| `event_payment_details` | Link + instructions + last link check. **Not readable by students** (only organiser, admin, campus staff); written only through `save_event_payment_details()`. |
| `event_partnerships`, `event_payment_clicks` | Admin-only agreement; referral click counter. No client policies. |
| `event_attendees` | Now the referral record: reference code, consent, `checked_in_at/by`, `purchase_confirmed_at/by`, reminders. **Was readable by every signed-in user (all ticket codes) and directly writable; now a person sees only their own row, the organiser/admin/campus staff see theirs, and no one writes it directly.** |
| Functions | `rsvp_event`, `cancel_event_rsvp`, `get_event_payment_info`, `open_event_payment_page`, `event_roster`, `checkin_event_attendee`, `confirm_event_purchase`, `event_referral_report`, `save_event_payment_details`, `admin_paid_events_overview`, `send_event_reminders`. |
| Edge-function-only functions | `admin_apply_payment_review`, `admin_store_link_check`, `admin_save_partnership` (granted to `service_role` only; each writes the audit trail). |
| Edge function `admin-review-paid-event` | `check_link` / `review` / `set_partnership`. Admin only, AAL2 step-up when an authenticator is enrolled (`REQUIRE_ADMIN_MFA` policy), 40 link checks and 60 decisions per admin per hour. |

Registration rules in `rsvp_event()` (same as `bookingState()` on the client): signed in and not suspended; can see the
event (campus wall); event published; before the booking deadline (or the end); paid events: switch on, payment
approved, acknowledgement given; capacity as described above; one registration per person (idempotent, only the sharing
choice can change).

## Data shared with the organiser

Always: name, profile photo, reference code, registration time, check-in and (paid) purchase confirmation. Only if the
student chooses to: matric number (`profiles.student_id_number`) and department. The registration sheet says so before
the student registers. Nothing else from the profile is exposed by `event_roster()`. Clicks are stored as (event,
student, first/last time, count) and shown to the organiser only as a number of people. Registrations, clicks and check-ins are
deleted with the account (foreign keys cascade). A short line about paid events in the Privacy Policy would be sensible
before launch; it is not changed here because a legal text change re-prompts everyone for consent.

## Running a pilot event

1. Admin switches **Paid events** on (Feature Controls, or the switch on the desk).
2. Organiser creates the event (Paid, price, method, link/instructions). It lands in **Needs review**.
3. Admin agrees the terms with the organiser outside Lioris, opens **Arrangement**, and records them (optional).
4. Admin runs the link check, opens the link, and approves (publishing in the same step). If something is off:
   Send back with a reason; the organiser fixes it and the event returns to review.
5. Students register and pay the organiser. On the day the organiser (or an admin) checks people in and confirms who
   bought entry. The same report can be downloaded as CSV and shared.
6. After the event the report shows the estimate and the dispute window. Invoicing is outside Lioris.

## Deploy

```bash
npx supabase db push --project-ref fdtnbluslkabwsmspbem --dry-run
npx supabase db push --project-ref fdtnbluslkabwsmspbem
supabase functions deploy admin-review-paid-event
```

Deploy the web app right after the migration: the old client wrote `event_attendees` directly, which is no longer
allowed (registering from an old browser tab fails until it reloads). The native apps need a new build for the same reason
(see `docs/operations/mobile-releases.md`; the new screens are JavaScript, so once a build that has expo-updates is out an
OTA update carries them).

## Not built (on purpose, for now)

- Taking payments, refunds, automatic "paid" status, automatic fee invoicing.
- Camera scanning in the native apps (needs a camera module = a new native build); browsers with `BarcodeDetector` scan,
  everything else types the code.
- Co-organisers / door staff accounts (today: the event's creator, admins, campus staff when the staff portal is on).
- Payment-link scanning beyond DNS/redirect/status (no page content, no reputation feeds). SSRF note: the check resolves DNS
  itself and then `fetch` resolves again, so a hostile DNS server could in theory answer differently the second time; only
  the status code and host names are ever returned, never content.
- Waitlists (a full event says "Full").
