-- ============================================================================
-- LIORIS - RESOURCE DOWNLOAD / UPVOTE COUNTERS
-- ============================================================================
-- Gap: trackResourceDownload() and toggleResourceUpvote() (src/api/resources.ts)
-- did a raw `.update()` on public.resources. The only UPDATE policy on that
-- table is "Admins and staff can approve and manage resources" (FOR ALL,
-- supabase_schema.sql), which requires role IN ('admin', 'staff'). For a
-- student, PostgREST matches 0 rows and returns no error - the counter never
-- persists, while the client's optimistic UI shows it worked anyway.
--
-- Fix: two SECURITY DEFINER RPCs any authenticated user with access to the
-- resource may call, mirroring the access check already used by the
-- resources SELECT policy and resource_ratings (20261005020000):
--   - public.increment_resource_download(p_resource_id)
--   - public.toggle_resource_upvote(p_resource_id)
--
-- Upvotes also had no per-user uniqueness (unlike resource_ratings, which has
-- UNIQUE(resource_id, rater_id)) - repeatedly calling the old client function
-- with increment=true could inflate upvotes_count without bound. This adds a
-- resource_upvotes junction table (composite PK = one upvote per user per
-- resource) and toggle_resource_upvote() does a real toggle: already upvoted
-- -> delete the row and decrement; not upvoted -> insert the row and
-- increment, both in the same SECURITY DEFINER call so the row and the
-- denormalised counter never drift apart.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.resources') IS NULL THEN
    RAISE EXCEPTION 'public.resources missing. Apply supabase_schema.sql first.';
  END IF;
  IF to_regprocedure('public.auth_profile_role()') IS NULL
     OR to_regprocedure('public.auth_profile_campus()') IS NULL THEN
    RAISE EXCEPTION 'public.auth_profile_role()/auth_profile_campus() missing. Apply supabase_schema.sql first.';
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 1. resource_upvotes - one row per (resource, user); upvotes_count is derived
--    from it by toggle_resource_upvote() below, never written directly by a
--    client.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resource_upvotes (
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_upvotes_user ON public.resource_upvotes (user_id, created_at DESC);

ALTER TABLE public.resource_upvotes ENABLE ROW LEVEL SECURITY;

-- Owner-only read (mirrors resource_ratings' "only through the function"
-- write pattern, but here even SELECT is self-only: whether *I* upvoted
-- something is mine to know, not every other viewer's). All writes go
-- through toggle_resource_upvote() (SECURITY DEFINER) below, so there is
-- deliberately no INSERT/UPDATE/DELETE policy for authenticated/anon.
DROP POLICY IF EXISTS "Users can read their own resource upvotes" ON public.resource_upvotes;
CREATE POLICY "Users can read their own resource upvotes" ON public.resource_upvotes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Default privileges (bootstrap/supabase) grant ALL on every new public table
-- to anon AND authenticated, so both must be stripped back down explicitly -
-- not just anon - leaving only the SELECT this table actually needs.
REVOKE ALL ON public.resource_upvotes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.resource_upvotes TO authenticated;
GRANT ALL ON public.resource_upvotes TO service_role;

-- ----------------------------------------------------------------------------
-- 2. increment_resource_download(p_resource_id uuid)
--
-- Same visibility check as the resources SELECT policy / resource_ratings:
-- approved + (GLOBAL or same campus), or the uploader, or admin, or staff on
-- that campus. Anyone else gets a clean error instead of a silent no-op.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.increment_resource_download(uuid);
CREATE OR REPLACE FUNCTION public.increment_resource_download(p_resource_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_res   public.resources%ROWTYPE;
  v_role  text;
  v_campus text;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to do that.' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_res FROM public.resources WHERE id = p_resource_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That resource no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  v_role := public.auth_profile_role();
  v_campus := public.auth_profile_campus();

  IF NOT (
    (v_res.is_approved IS TRUE AND (v_res.campus_code = 'GLOBAL' OR v_res.campus_code = v_campus))
    OR v_res.uploader_id = v_uid
    OR v_role = 'admin'
    OR (v_role = 'staff' AND v_campus = v_res.campus_code)
  ) THEN
    RAISE EXCEPTION 'You do not have access to this resource.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.resources
     SET downloads_count = downloads_count + 1
   WHERE id = p_resource_id
  RETURNING downloads_count INTO v_count;

  RETURN v_count;
END
$$;

REVOKE ALL ON FUNCTION public.increment_resource_download(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_resource_download(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. toggle_resource_upvote(p_resource_id uuid) -> (upvoted, upvotes_count)
--
-- A real toggle, not a client-trusted increment/decrement: looks up whether
-- the caller already has a row in resource_upvotes and flips it, writing the
-- junction row and the denormalised counter in the same statement so a
-- failure can never leave them disagreeing.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.toggle_resource_upvote(uuid);
CREATE OR REPLACE FUNCTION public.toggle_resource_upvote(p_resource_id uuid)
RETURNS TABLE(upvoted boolean, upvotes_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
-- NOTE: RETURNS TABLE(upvoted boolean, upvotes_count integer) implicitly
-- declares "upvoted" and "upvotes_count" as plpgsql variables in this
-- function's scope, which would shadow the identically-named resources
-- column in any bare reference (PL/pgSQL's default variable-over-column
-- resolution). Every reference to that column below is therefore either the
-- UPDATE's SET target (always the table column, never ambiguous) or
-- explicitly qualified with the "r." table alias - the result is only ever
-- assigned to v_new_count/v_new_upvoted and returned once at the end.
DECLARE
  v_uid         uuid := auth.uid();
  v_res         public.resources%ROWTYPE;
  v_role        text;
  v_campus      text;
  v_exists      boolean;
  v_new_count   integer;
  v_new_upvoted boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to do that.' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_res FROM public.resources WHERE id = p_resource_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That resource no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  v_role := public.auth_profile_role();
  v_campus := public.auth_profile_campus();

  IF NOT (
    (v_res.is_approved IS TRUE AND (v_res.campus_code = 'GLOBAL' OR v_res.campus_code = v_campus))
    OR v_res.uploader_id = v_uid
    OR v_role = 'admin'
    OR (v_role = 'staff' AND v_campus = v_res.campus_code)
  ) THEN
    RAISE EXCEPTION 'You do not have access to this resource.' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.resource_upvotes ru
     WHERE ru.resource_id = p_resource_id AND ru.user_id = v_uid
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.resource_upvotes ru WHERE ru.resource_id = p_resource_id AND ru.user_id = v_uid;
    UPDATE public.resources r
       SET upvotes_count = GREATEST(0, r.upvotes_count - 1)
     WHERE r.id = p_resource_id
    RETURNING r.upvotes_count INTO v_new_count;
    v_new_upvoted := false;
  ELSE
    INSERT INTO public.resource_upvotes (resource_id, user_id) VALUES (p_resource_id, v_uid);
    UPDATE public.resources r
       SET upvotes_count = r.upvotes_count + 1
     WHERE r.id = p_resource_id
    RETURNING r.upvotes_count INTO v_new_count;
    v_new_upvoted := true;
  END IF;

  RETURN QUERY SELECT v_new_upvoted, v_new_count;
END
$$;

REVOKE ALL ON FUNCTION public.toggle_resource_upvote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_resource_upvote(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
