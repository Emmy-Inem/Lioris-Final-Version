-- ============================================================================
-- LIORIS - ROLE-EXCLUSIVE JOBS & MARKETPLACE POSTING
-- ============================================================================
-- Product-policy correction: Jobs/Career is an ALUMNI-ONLY feature and must
-- never be reachable by students; Marketplace is a STUDENT-ONLY feature and
-- must never be reachable by alumni. The app-side screens and nav entries
-- that wrongly cross-exposed each feature to the other role are removed in
-- this same change (app/(student)/jobs.tsx deleted;
-- app/(alumni)/marketplace.tsx and marketplace-mine.tsx, which simply
-- re-exported the student implementation, deleted too).
--
-- This migration is the backend defense-in-depth half of that fix: it
-- tightens the INSERT policies on `jobs` and `marketplace_listings` (both
-- originally "Authenticated users can create ..." in supabase_schema.sql,
-- open to every role) so a cross-role posting can never be created even if a
-- client bypasses the UI directly against Supabase. Staff and admin keep
-- exactly the posting ability they already had on both tables, for
-- moderation/testing. No existing row is touched or deleted - this only
-- narrows who can INSERT a new one from here on. job_applications (applying
-- to a job, as distinct from posting one) is intentionally left alone - out
-- of scope for this fix.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.jobs') IS NULL THEN
    RAISE EXCEPTION 'Dependency missing: apply supabase_schema.sql first.';
  END IF;
  IF to_regclass('public.marketplace_listings') IS NULL THEN
    RAISE EXCEPTION 'Dependency missing: apply supabase_schema.sql first.';
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- jobs: only alumni, staff or admin may post a job opening. Students can no
-- longer create one (student-side jobs.tsx, which let them do this, is
-- deleted in this same change).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can create jobs" ON public.jobs;
DROP POLICY IF EXISTS "Alumni, staff and admin can create jobs" ON public.jobs;
CREATE POLICY "Alumni, staff and admin can create jobs" ON public.jobs
FOR INSERT TO authenticated
WITH CHECK (
    auth.uid() = poster_id AND
    NOT (SELECT COALESCE(is_suspended, false) FROM profiles WHERE id = auth.uid()) AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('alumni', 'staff', 'admin'))
);

-- ----------------------------------------------------------------------------
-- marketplace_listings: only students, staff or admin may create a listing.
-- Alumni can no longer create one (the alumni-side marketplace screens, which
-- only re-exported the student implementation, are deleted in this same
-- change).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can create marketplace listings" ON marketplace_listings;
DROP POLICY IF EXISTS "Students, staff and admin can create marketplace listings" ON marketplace_listings;
CREATE POLICY "Students, staff and admin can create marketplace listings" ON marketplace_listings
FOR INSERT TO authenticated
WITH CHECK (
    auth.uid() = seller_id AND
    NOT (SELECT COALESCE(is_suspended, false) FROM profiles WHERE id = auth.uid()) AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('student', 'staff', 'admin'))
);

NOTIFY pgrst, 'reload schema';

COMMIT;
