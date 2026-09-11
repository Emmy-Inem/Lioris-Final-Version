-- ============================================================================
-- LIORIS - EVENTS FIXES 2026
-- ============================================================================
-- Source: audit of the events system (src/api/events.ts + supabase_schema.sql
-- events table, ~line 224-242). Each fix below is its own section and is safe
-- to re-run.
--
-- Fixes in this file:
--   1. Event type (in-app/virtual vs physical/external) has no schema
--      backing at all - selecting "In-App Live Event" vs "Physical Event" in
--      the UI only changed a location label string, nothing real was stored
--      or enforced. Adds venue_type + virtual_link columns.
--   2. Admin-collected fields (ticket price, audience targeting) have no
--      schema backing either, so they were silently dropped on every
--      create/update. Adds ticket_price + target_cohort columns.
--      (capacity and is_spotlight already exist as real columns - see
--      supabase_schema.sql line ~236/238 - only the application layer was
--      missing them; that's fixed in src/api/events.ts, not here.)
--
-- Not needed here:
--   - The approval workflow already has a 'pending_approval' value in
--     event_status_type (supabase_schema.sql line ~25) - that fix is
--     entirely in src/api/events.ts (createEvent now sets it, listEvents /
--     getEvent now map it correctly instead of collapsing it to 'approved').
--   - No 'sponsored'/'is_sponsored' column exists on events in the current
--     schema. CampusEvent.sponsored therefore stays a local-only/display
--     field for now; add a real column in a future migration if that
--     feature is actually wanted server-side.
-- ============================================================================


-- ============================================================================
-- 1. events.venue_type / events.virtual_link (CRITICAL)
-- ============================================================================
-- Cause:
--   The events table has no column distinguishing a physical event from a
--   virtual/external one, and no column to hold a virtual event's join link.
--   PublishEventModal's "In-App Live Event" vs "Physical Event" toggle could
--   therefore only ever change a display string (event.location) - it was
--   never persisted or enforced anywhere.
--
-- Fix:
--   Add venue_type (constrained to the three real venue kinds the app
--   supports) and virtual_link. Defaults to 'physical' so every existing row
--   keeps behaving exactly as it does today.
-- ============================================================================
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_type TEXT DEFAULT 'physical'
    CHECK (venue_type IN ('physical', 'virtual', 'external'));

ALTER TABLE events ADD COLUMN IF NOT EXISTS virtual_link TEXT;


-- ============================================================================
-- 2. events.ticket_price / events.target_cohort (CRITICAL)
-- ============================================================================
-- Cause:
--   updateEvent's dbPayload builder (src/api/events.ts) never wrote
--   capacity/is_spotlight to the database despite both already being real
--   columns, and the admin moderation form also collects a ticket price and
--   a target-cohort audience filter that have no column to land in at all -
--   every one of these was silently discarded on save.
--
-- Fix:
--   capacity/is_spotlight are wired up purely in src/api/events.ts (columns
--   already exist). ticket_price and target_cohort are genuinely new
--   columns, added here.
-- ============================================================================
ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_price NUMERIC DEFAULT 0;

ALTER TABLE events ADD COLUMN IF NOT EXISTS target_cohort TEXT;

NOTIFY pgrst, 'reload schema';
