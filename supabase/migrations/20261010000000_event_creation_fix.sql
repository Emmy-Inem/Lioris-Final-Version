-- Fix: publishing an event with a cover photo always failed with the generic
-- "Could not publish this event. Please try again." error.
--
-- Root cause
-- ----------
-- supabase_security_hardening_2026.sql (SECTION 2) added a generic URL-scheme CHECK constraint to
-- every *_url column across the schema, including events.banner_url, requiring it be NULL or a
-- plain http(s) URL (chk_events_banner_url_url_scheme).
--
-- Separately, `campus-media` (the bucket event banners are uploaded to) was made a PRIVATE bucket
-- (see src/api/signedUrls.ts's header for the full story: it used to leak every uploaded file with
-- no credentials at all). For a private bucket, src/api/storage.ts's uploadMediaFile() /
-- persistMediaReference() correctly return the bare storage PATH ("<uid>/<file>"), never a URL -
-- a URL is only minted on demand, signed, with a short TTL, via resolveMediaUrl()/useSignedUrl()
-- in src/api/signedUrls.ts.
--
-- src/api/events.ts's createEvent() was never updated for that change: it stores whatever
-- persistMediaReference() returns straight into events.banner_url. So every event created with a
-- cover photo stored a bare "<uid>/<file>" path, which chk_events_banner_url_url_scheme then
-- rejected outright - a bare Postgres CHECK-constraint violation that doesn't match any of the
-- known shapes src/utils/rpcErrors.ts's parseRpcError() recognises (it isn't a "<code>: <message>"
-- RPC error, a network error, an RLS/permission error, or a "schema cache" error), so it fell
-- through to the generic fallback message. Events created with no photo were never affected,
-- which is why this only hit "some" students - specifically anyone who attached a cover image.
--
-- Fix
-- ---
-- 1. Relax chk_events_banner_url_url_scheme to also accept the private-bucket path shape events.ts
--    actually stores: exactly "${auth.uid()}/${fileName}" as written by uploadMediaFile() (a uuid,
--    a slash, then the sanitised file name - see src/api/storage.ts). Anything else (javascript:,
--    data:, an arbitrary string with no path shape, ...) is still rejected.
-- 2. src/api/events.ts's listEvents()/getEvent() now resolve that stored path to a signed, directly
--    renderable URL before handing the row to the UI (mirroring how every other private-bucket
--    column in this app is read - see src/api/signedUrls.ts).
-- Idempotent: safe to run more than once.

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS chk_events_banner_url_url_scheme;
ALTER TABLE public.events ADD CONSTRAINT chk_events_banner_url_url_scheme CHECK (
  banner_url IS NULL
  OR banner_url ~* '^https?://'
  OR banner_url ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9_.-]+$'
);
