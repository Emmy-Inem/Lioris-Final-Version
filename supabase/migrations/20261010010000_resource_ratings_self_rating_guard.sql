-- ============================================================================
-- LIORIS - BLOCK SELF-RATING ON RESOURCES
-- ============================================================================
-- resource_ratings (20261005020000_resource_ratings.sql) lets any signed-in
-- user who can see a resource rate it - including its own uploader. Nothing
-- stopped someone from rating (and reviewing) their own upload to inflate
-- its average, the same gap that endorseSkill() in src/api/profile.ts
-- already guards against for skill endorsements ("You cannot endorse your
-- own skill."). The client now hides the rating card for the uploader, but
-- that is UI-only - this adds the matching server-side defense-in-depth as a
-- BEFORE INSERT/UPDATE trigger, since the existing RLS WITH CHECK clauses on
-- resource_ratings only check rater_id = auth.uid() and the resource's own
-- visibility, not who uploaded it.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.resource_ratings') IS NULL THEN
    RAISE EXCEPTION 'public.resource_ratings missing. Apply 20261005020000_resource_ratings.sql first.';
  END IF;
  IF to_regclass('public.resources') IS NULL THEN
    RAISE EXCEPTION 'public.resources missing. Apply supabase_schema.sql first.';
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.enforce_resource_rating_not_self()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uploader_id uuid;
BEGIN
  SELECT uploader_id INTO v_uploader_id FROM public.resources WHERE id = NEW.resource_id;
  IF v_uploader_id IS NOT NULL AND v_uploader_id = NEW.rater_id THEN
    RAISE EXCEPTION 'You cannot rate your own upload.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resource_rating_not_self ON public.resource_ratings;
CREATE TRIGGER trg_resource_rating_not_self
BEFORE INSERT OR UPDATE ON public.resource_ratings
FOR EACH ROW EXECUTE FUNCTION public.enforce_resource_rating_not_self();

NOTIFY pgrst, 'reload schema';

COMMIT;
