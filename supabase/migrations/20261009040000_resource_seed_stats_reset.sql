-- ============================================================================
-- LIORIS - RESET FABRICATED RESOURCE SEED STATS
-- ============================================================================
-- Bug report: "the resource [page] has a lot of fake views and downloads."
--
-- Root cause: supabase/migrations/20260922160500_seed_verified_public_resources.sql
-- seeded 50 real public-university PDFs (FUNAAB / NOUN OpenCourseWare) with
-- hardcoded, invented downloads_count/upvotes_count values (e.g. 62/29,
-- 71/19, 79/29 ...) instead of starting them at 0. Those rows are real,
-- is_approved = TRUE resources that show up in every student's normal browse
-- feed (app/(student)/resources.tsx -> listResources), so every student saw
-- these numbers as if they were genuine download/upvote activity - they were
-- not; nobody had downloaded or upvoted them.
--
-- That source file has been fixed to seed 0/0 going forward, but a database
-- that already ran the old version still carries the inflated numbers. This
-- migration resets them.
--
-- The seeded rows are identified by file_url host (funaab.edu.ng / nou.edu.ng)
-- - the only two hosts that migration ever inserted - rather than by a count
-- threshold, so a real resource a student or staff member later uploads and
-- which happens to pick up organic downloads/upvotes is never touched by
-- this migration, no matter how it runs.
--
-- Idempotent / safe to re-run: resets to a fixed value (0), not a relative
-- decrement, so running this twice is a no-op the second time.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.resources') IS NULL THEN
    RAISE NOTICE 'public.resources missing - skipping resource seed stats reset.';
    RETURN;
  END IF;

  UPDATE public.resources
  SET downloads_count = 0,
      upvotes_count = 0
  WHERE (file_url ILIKE '%funaab.edu.ng%' OR file_url ILIKE '%nou.edu.ng%')
    AND (downloads_count <> 0 OR upvotes_count <> 0);
END;
$do$;

COMMIT;
