-- ============================================================================
-- LIORIS - SUSPENSION ENFORCEMENT FIXES
-- ============================================================================
-- Closes gaps confirmed by a read-only audit of suspension enforcement:
--
-- posts / jobs / marketplace_listings UPDATE policies are missing the
-- `is_suspended` check that their matching INSERT policies already have
-- (the same bug class already found and fixed for the `announcements`
-- INSERT policy in an earlier round - 20261007020000). A suspended user
-- could still EDIT their own existing post/job/listing even though they
-- could no longer CREATE a new one. This adds the same
--   AND NOT (SELECT COALESCE(is_suspended, false) FROM profiles WHERE id = auth.uid())
-- condition to each UPDATE policy's USING clause, leaving the rest of each
-- policy's logic (who else may update - admins, campus-matched staff, and
-- for posts, community managers) completely unchanged. Since the appended
-- condition only looks at the *caller's own* suspension status, it never
-- affects a non-suspended owner, admin or staff member - they keep working
-- exactly as before.
--
-- Note: none of these three UPDATE policies declare a separate WITH CHECK
-- clause (matching their pre-existing shape) - Postgres reuses the USING
-- clause as the WITH CHECK for UPDATE when WITH CHECK is omitted, so the
-- suspension check is enforced on both the row being selected for update and
-- the row being written.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.posts') IS NULL THEN
    RAISE EXCEPTION 'Dependency missing: apply the base supabase_schema.sql first.';
  END IF;
  IF to_regclass('public.jobs') IS NULL THEN
    RAISE EXCEPTION 'Dependency missing: apply the base supabase_schema.sql first.';
  END IF;
  IF to_regclass('public.marketplace_listings') IS NULL THEN
    RAISE EXCEPTION 'Dependency missing: apply the base supabase_schema.sql first.';
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 1. posts: "Authors, admins, staff and community managers can update posts"
--    (current definition from 20260922150347_community_moderation.sql) -
--    copied verbatim, only the suspension check added. Guarded by whether
--    is_community_manager() exists: on an environment where
--    20260922150347_community_moderation.sql has not been applied (its
--    policy is still the pre-community-manager
--    "Authors, admins and staff can update posts"), this falls back to that
--    earlier shape plus the suspension check, instead of failing outright on
--    a missing function - every environment ends up with suspension
--    enforced, and one that already has the community-manager grant keeps it
--    verbatim.
-- ----------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regprocedure('public.is_community_manager(text)') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Authors, admins, staff and community managers can update posts" ON posts';
    EXECUTE $pol$
      CREATE POLICY "Authors, admins, staff and community managers can update posts" ON posts FOR UPDATE TO authenticated USING (
          (auth.uid() = author_id OR
          EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = posts.campus_code))) OR
          is_community_manager(posts.category))
          AND NOT (SELECT COALESCE(is_suspended, false) FROM profiles WHERE id = auth.uid())
      )
    $pol$;
  ELSE
    EXECUTE 'DROP POLICY IF EXISTS "Authors, admins and staff can update posts" ON posts';
    EXECUTE $pol$
      CREATE POLICY "Authors, admins and staff can update posts" ON posts FOR UPDATE TO authenticated USING (
          (auth.uid() = author_id OR
          EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = posts.campus_code))))
          AND NOT (SELECT COALESCE(is_suspended, false) FROM profiles WHERE id = auth.uid())
      )
    $pol$;
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 2. jobs: "Posters, admins and staff can update jobs" (current definition
--    from supabase_schema.sql) - copied verbatim, only the suspension check
--    added.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Posters, admins and staff can update jobs" ON public.jobs;
CREATE POLICY "Posters, admins and staff can update jobs" ON public.jobs
FOR UPDATE TO authenticated
USING (
    (auth.uid() = poster_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = jobs.campus_code))))
    AND NOT (SELECT COALESCE(is_suspended, false) FROM profiles WHERE id = auth.uid())
);

-- ----------------------------------------------------------------------------
-- 3. marketplace_listings: "Sellers, admins and staff can update listings"
--    (current definition from supabase_schema.sql) - copied verbatim, only
--    the suspension check added.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Sellers, admins and staff can update listings" ON marketplace_listings;
CREATE POLICY "Sellers, admins and staff can update listings" ON marketplace_listings FOR UPDATE TO authenticated USING (
    (auth.uid() = seller_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = marketplace_listings.campus_code))))
    AND NOT (SELECT COALESCE(is_suspended, false) FROM profiles WHERE id = auth.uid())
);

NOTIFY pgrst, 'reload schema';

COMMIT;
