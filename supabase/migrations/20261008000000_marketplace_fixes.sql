-- ============================================================================
-- LIORIS - MARKETPLACE FIXES
-- ============================================================================
-- Found in a marketplace audit:
--
--   1. CRITICAL: every listing photo upload was rejected by Postgres.
--      createListing/updateListing (src/api/marketplace.ts) upload the user's
--      photo through src/api/storage.ts's resolveMediaUrl (persistMediaReference),
--      which - for the private `campus-media` bucket - hands back a bare
--      storage PATH, never a URL (see src/api/signedUrls.ts for why the
--      bucket is private and how a path is turned into a short-lived signed
--      URL at render time). That path was then written straight into
--      marketplace_listings.image_url, which has
--      `CHECK (image_url IS NULL OR image_url ~* '^https?://')`
--      (supabase_security_hardening_2026.sql, SECTION 2) - so the INSERT/
--      UPDATE was refused by Postgres every single time a listing had a
--      photo. DESIGN DECISION: rather than relaxing that generic, reusable
--      url-scheme CHECK (shared by a dozen other columns) to also accept a
--      bare path, this follows the same precedent as
--      20261006040000_study_pod_file_sharing.sql's study_group_posts.file_path:
--      a new, dedicated `image_path` (single, back-compat) / `image_paths`
--      (gallery, fix #2 below) column pair that holds the bare storage path(s)
--      and is never passed through the http(s)-only CHECK at all. image_url
--      itself is left completely untouched (still https-only, still there for
--      any genuinely external pasted link) - nothing currently writes to it.
--      The client side (src/api/marketplace.ts, src/components/
--      MarketplaceItemCard.tsx) now stores the bare path and resolves it to a
--      real signed URL only at render time via useSignedUrl('campus-media', ...),
--      exactly like ChatThread.tsx/messaging.ts and PodSpace.tsx/study_group_posts.
--
--   2. Only one photo per listing. Adds `image_paths text[]` (up to 4 bare
--      storage paths) alongside the new singular `image_path`, mirroring
--      posts.image_urls from 20261006020000_forum_fixes.sql: image_path keeps
--      holding the first photo for any reader that only knows the singular
--      column, image_paths is the new source of truth for the gallery.
--
--   3. No listing expiry/staleness. Adds `expires_at timestamptz`, defaulting
--      to 75 days after creation (comfortably inside the 60-90 day window a
--      sold/stale listing should age out by) and backfilled for any existing
--      row from its created_at. No pg_cron purge job - out of scope per the
--      audit; listMarketplaceListings (src/api/marketplace.ts) simply stops
--      showing expired rows in the default browse/search, the same way
--      is_sold = true rows are already excluded (and, like that exclusion,
--      the viewer's own expired listing stays visible to THEM so they can
--      still find and renew/delete it - see listMyMarketplaceListings for the
--      seller's own unfiltered "My Listings" view, fix #4).
--
--   4. "My Listings" (reachable from the Marketplace screen) is application-
--      code only (src/components/MyListingsScreen.tsx,
--      app/(student|alumni)/marketplace-mine.tsx) - it reuses
--      listMarketplaceListings' own SELECT policy and MarketplaceItemCard's
--      existing owner-only edit/sold/delete controls, no schema change.
--
--   5. The silent price-parse bug (a bad price typed in silently became a
--      fake ₦5,000 listing) is application-code only (src/api/marketplace.ts
--      now throws a validation error instead) - no schema change.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.marketplace_listings') IS NULL THEN
    RAISE EXCEPTION 'Dependency missing: apply supabase_schema.sql first.';
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 1 & 2. Bare storage path columns for the listing photo(s). Never checked
--    against the https-only url-scheme CHECK that still guards image_url.
-- ----------------------------------------------------------------------------
ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS image_path text,
  ADD COLUMN IF NOT EXISTS image_paths text[];

ALTER TABLE public.marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_image_path_chk;
ALTER TABLE public.marketplace_listings ADD CONSTRAINT marketplace_listings_image_path_chk
  CHECK (image_path IS NULL OR char_length(image_path) <= 500);

-- Postgres CHECK constraints cannot contain a subquery (not even a
-- correlated unnest() of the row's own column), so the per-element length
-- cap stops at array_to_string's combined length - comfortably enough to
-- block anything pathological while the real per-path cap already lives on
-- the singular image_path column above.
ALTER TABLE public.marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_image_paths_chk;
ALTER TABLE public.marketplace_listings ADD CONSTRAINT marketplace_listings_image_paths_chk
  CHECK (image_paths IS NULL OR (array_length(image_paths, 1) <= 4 AND char_length(array_to_string(image_paths, ',')) <= 2100));

-- ----------------------------------------------------------------------------
-- 3. Listing expiry. Backfill existing rows from created_at, then default new
--    ones to 75 days out, then (now that every row has a value) require one.
-- ----------------------------------------------------------------------------
ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE public.marketplace_listings
   SET expires_at = COALESCE(created_at, now()) + interval '75 days'
 WHERE expires_at IS NULL;

ALTER TABLE public.marketplace_listings
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '75 days');

ALTER TABLE public.marketplace_listings
  ALTER COLUMN expires_at SET NOT NULL;

-- Partial index: the only rows the default browse/search ever filters by
-- expires_at are the still-active ones.
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_active_expiry
  ON public.marketplace_listings (expires_at)
  WHERE is_sold = false;

NOTIFY pgrst, 'reload schema';

COMMIT;
