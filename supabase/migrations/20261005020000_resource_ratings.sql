-- ============================================================================
-- LIORIS - RESOURCE RATINGS
-- ============================================================================
-- Resources (past questions, lecture notes, projects) track likesCount and
-- downloadsCount but have no quality signal at all - a heavily-downloaded
-- resource could be riddled with errors and nothing distinguishes it from a
-- carefully checked one. Mentorship already has a working star-rating
-- pattern (mentorship_feedback / submit_mentorship_feedback); this adds the
-- same idea for resources: one 1-5 star rating per user per resource, with
-- an optional short review, plus a small summary RPC so a card/detail view
-- can show an average and count without shipping every individual row.
--
-- Unlike mentorship_feedback, there is no state machine to guard here (no
-- "only after the mentorship ends" rule) - any signed-in user who can already
-- see a resource may rate it, at any time, and change their mind later. That
-- makes this closer in shape to saved_items / notification_preferences:
-- plain owner-scoped RLS (rater_id = auth.uid()) with the client upserting
-- on (resource_id, rater_id) via ON CONFLICT, rather than a bespoke
-- SECURITY DEFINER write function.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.resources') IS NULL THEN
    RAISE EXCEPTION 'public.resources missing. Apply supabase_schema.sql first.';
  END IF;
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'public.profiles missing. Apply supabase_schema.sql first.';
  END IF;
  IF to_regprocedure('public.auth_profile_role()') IS NULL
     OR to_regprocedure('public.auth_profile_campus()') IS NULL THEN
    RAISE EXCEPTION 'public.auth_profile_role()/auth_profile_campus() missing. Apply supabase_schema.sql first.';
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 1. resource_ratings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resource_ratings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  rater_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review      text CHECK (review IS NULL OR char_length(review) <= 1000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_ratings_unique_per_user UNIQUE (resource_id, rater_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_ratings_resource_created
  ON public.resource_ratings (resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resource_ratings_rater ON public.resource_ratings (rater_id);

ALTER TABLE public.resource_ratings ENABLE ROW LEVEL SECURITY;

-- Read visibility mirrors the resource's own SELECT policy exactly
-- ("Resources viewable if approved and matching campus or global or owner or
-- admin or staff" in supabase_schema.sql): a rating is never more sensitive
-- than the resource it is attached to, and the summary function below is
-- computed from exactly these rows, so it is publicly (to any authenticated
-- viewer of the resource) derivable already.
DROP POLICY IF EXISTS "Ratings readable if the resource is visible" ON public.resource_ratings;
CREATE POLICY "Ratings readable if the resource is visible" ON public.resource_ratings
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.resources r
      WHERE r.id = resource_ratings.resource_id
        AND (
          (r.is_approved = TRUE AND (r.campus_code = 'GLOBAL' OR r.campus_code = public.auth_profile_campus()))
          OR r.uploader_id = auth.uid()
          OR public.auth_profile_role() = 'admin'
          OR (public.auth_profile_role() = 'staff' AND r.campus_code = public.auth_profile_campus())
        )
    )
  );

-- Writes: owner-only. A second submission for the same resource lands on the
-- same row via UNIQUE(resource_id, rater_id) + the client's ON CONFLICT
-- upsert, so it updates rather than duplicates.
DROP POLICY IF EXISTS "Users can rate resources they can see" ON public.resource_ratings;
CREATE POLICY "Users can rate resources they can see" ON public.resource_ratings
  FOR INSERT TO authenticated WITH CHECK (
    rater_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.resources r
      WHERE r.id = resource_ratings.resource_id
        AND (
          (r.is_approved = TRUE AND (r.campus_code = 'GLOBAL' OR r.campus_code = public.auth_profile_campus()))
          OR r.uploader_id = auth.uid()
          OR public.auth_profile_role() = 'admin'
          OR (public.auth_profile_role() = 'staff' AND r.campus_code = public.auth_profile_campus())
        )
    )
  );

DROP POLICY IF EXISTS "Users can update their own rating" ON public.resource_ratings;
CREATE POLICY "Users can update their own rating" ON public.resource_ratings
  FOR UPDATE TO authenticated
  USING (rater_id = auth.uid())
  WITH CHECK (rater_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own rating" ON public.resource_ratings;
CREATE POLICY "Users can delete their own rating" ON public.resource_ratings
  FOR DELETE TO authenticated USING (rater_id = auth.uid());

REVOKE ALL ON public.resource_ratings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_ratings TO authenticated;
GRANT ALL ON public.resource_ratings TO service_role;

-- ----------------------------------------------------------------------------
-- 2. get_resource_rating_summary(p_resource uuid) -> avg_rating, rating_count
--
-- Plain invoker-rights STABLE function (not SECURITY DEFINER): the rows it
-- aggregates are already readable by the caller through the SELECT policy
-- above, so there is no privilege to bypass - this only saves shipping every
-- individual row to compute one average. Mirrors how this codebase already
-- prefers a small RPC for this shape of summary over a client-side aggregate
-- (see the inline avg(rating)/count(*) in get_mentor_directory,
-- 20260925100000_mentorship_v2.sql) rather than a denormalised counter
-- column, since ratings can change/be removed and there is no trigger here
-- to keep a cached column in sync.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_resource_rating_summary(p_resource uuid)
RETURNS TABLE(avg_rating numeric, rating_count integer)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(round(avg(rating)::numeric, 1), 0)::numeric AS avg_rating,
         count(*)::integer AS rating_count
  FROM public.resource_ratings
  WHERE resource_id = p_resource
$$;

REVOKE ALL ON FUNCTION public.get_resource_rating_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_resource_rating_summary(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
