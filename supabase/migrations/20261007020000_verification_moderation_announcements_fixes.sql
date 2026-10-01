-- ============================================================================
-- LIORIS - VERIFICATION / MODERATION / ANNOUNCEMENTS RLS FIXES
-- ============================================================================
-- Two narrow RLS gaps found in a read-only audit of the verification,
-- moderation and announcements flows (the rest of that audit's findings are
-- application-code fixes with no schema impact):
--
-- 1. announcements INSERT ("Admins and staff can publish announcements")
--    only checks role IN ('admin','staff') - a staff member could publish an
--    announcement tagged with ANOTHER campus's campus_code. The matching
--    UPDATE policy already restricts staff to their own campus; INSERT never
--    got the same condition. Fixed by adding the same campus_code check to
--    the WITH CHECK clause the UPDATE policy already uses.
--
-- 2. marketplace_listings SELECT ("Marketplace listings viewable by campus or
--    global") lets ANY staff account read EVERY campus's listings, unlike
--    every comparable table (jobs/posts/events/resources/verifications all
--    scope a staff reader to their own campus). Low sensitivity, but fixed
--    for consistency with the UPDATE/DELETE policies on the same table,
--    which already scope staff to campus_code = marketplace_listings.campus_code.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.announcements') IS NULL THEN
    RAISE EXCEPTION 'Dependency missing: apply the base supabase_schema.sql first.';
  END IF;
  IF to_regclass('public.marketplace_listings') IS NULL THEN
    RAISE EXCEPTION 'Dependency missing: apply the base supabase_schema.sql first.';
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 1. Announcements: staff can only publish to their own campus (INSERT now
--    matches what UPDATE already enforces). Admins remain unrestricted, and a
--    campus-wide ('GLOBAL') publish still needs the campus_code = 'GLOBAL'
--    branch below - this mirrors how the application always resolves the
--    publishing staff member's own campus_code (src/api/announcements.ts)
--    rather than letting the client pick an arbitrary one.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and staff can publish announcements" ON public.announcements;
CREATE POLICY "Admins and staff can publish announcements" ON public.announcements FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = author_id AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'admin' OR (role = 'staff' AND campus_code = announcements.campus_code))
    )
);

-- ----------------------------------------------------------------------------
-- 2. Marketplace listings: staff reads are campus-scoped, matching the
--    UPDATE/DELETE policies on this same table (and every other staff-facing
--    SELECT policy in the schema: verifications, moderation_queue, etc).
--    Sellers keep reading their own listing regardless of campus, and admins
--    remain unrestricted.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Marketplace listings viewable by campus or global" ON public.marketplace_listings;
CREATE POLICY "Marketplace listings viewable by campus or global" ON public.marketplace_listings FOR SELECT TO authenticated USING (
    campus_code = 'GLOBAL' OR
    campus_code = (SELECT campus_code FROM public.profiles WHERE id = auth.uid()) OR
    auth.uid() = seller_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'admin' OR (role = 'staff' AND campus_code = marketplace_listings.campus_code))
    )
);

NOTIFY pgrst, 'reload schema';

COMMIT;
