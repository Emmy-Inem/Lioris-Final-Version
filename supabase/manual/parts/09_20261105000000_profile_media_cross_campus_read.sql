-- LIORIS manual SQL, part 9 of 18: 20261105000000_profile_media_cross_campus_read.sql
-- Paste this whole file into the Supabase SQL editor and Run. Parts must be run in order; the guard below
-- stops this part if an earlier one is missing. Safe to run twice.
SET lock_timeout = '8s';
SET statement_timeout = '180s';

CREATE TABLE IF NOT EXISTS public._manual_migration_log (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._manual_migration_log ENABLE ROW LEVEL SECURITY;


-- ########## 20261105000000_profile_media_cross_campus_read.sql ##########
BEGIN;
DO $chain$ BEGIN IF NOT EXISTS (SELECT 1 FROM public._manual_migration_log WHERE version = '20261104000000') THEN RAISE EXCEPTION 'Stopped: migration 20261104000000 has not been applied. Fix it and re-run this whole file.'; END IF; END $chain$;
-- =============================================================================
-- Fix profile banner & avatar media access in campus-media storage bucket (2026-11-05)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_read_media_object(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_owner  text;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF split_part(p_name, '/', 1) = v_uid::text THEN RETURN true; END IF;
  IF public.auth_is_super_admin() THEN RETURN true; END IF;

  v_owner := public.storage_owner_campus(p_name);
  IF v_owner IS NOT NULL THEN
    IF public.can_admin_campus(v_owner) THEN RETURN true; END IF;
    IF v_owner = 'GLOBAL' THEN RETURN true; END IF;
    IF v_owner = public.auth_campus_access() THEN RETURN true; END IF;
  END IF;

  -- Profile banners and avatars: viewable by authenticated users if the profile is not suspended
  IF EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE (
      public.media_ref_matches(pr.banner_url, p_name)
      OR public.media_ref_matches(pr.avatar_url, p_name)
    )
    AND NOT COALESCE(pr.is_suspended, false)
  ) THEN
    RETURN true;
  END IF;

  -- Posts media access: published posts readable by the user
  IF EXISTS (
    SELECT 1 FROM public.posts p
    WHERE (p.status IS NULL OR p.status::text = 'published')
      AND (
        p.visibility_scope = 'global'
        OR p.campus_code IS NULL
        OR p.campus_code = 'GLOBAL'
        OR p.campus_code = public.auth_campus_access()
        OR public.auth_is_super_admin()
        OR public.is_feature_enabled('forum_global_scope')
      )
      AND (
        public.media_ref_matches(p.image_url, p_name)
        OR public.media_ref_matches(p.video_url, p_name)
        OR EXISTS (
          SELECT 1 FROM unnest(COALESCE(p.image_urls, ARRAY[]::text[])) u
          WHERE public.media_ref_matches(u, p_name)
        )
      )
  ) THEN
    RETURN true;
  END IF;

  -- Events banner
  IF EXISTS (
    SELECT 1 FROM public.events e
    WHERE (
      e.visibility_scope = 'global'
      OR e.campus_code IS NULL
      OR e.campus_code = 'GLOBAL'
      OR e.campus_code = public.auth_campus_access()
      OR public.auth_is_super_admin()
    )
    AND public.media_ref_matches(e.banner_url, p_name)
  ) THEN
    RETURN true;
  END IF;

  -- Marketplace listings
  IF EXISTS (
    SELECT 1 FROM public.marketplace_listings m
    WHERE (
      m.campus_code IS NULL
      OR m.campus_code = 'GLOBAL'
      OR m.campus_code = public.auth_campus_access()
      OR public.auth_is_super_admin()
    )
    AND (
      public.media_ref_matches(m.image_url, p_name)
      OR public.media_ref_matches(m.image_path, p_name)
      OR EXISTS (
        SELECT 1 FROM unnest(COALESCE(m.image_paths, ARRAY[]::text[])) u
        WHERE public.media_ref_matches(u, p_name)
      )
    )
  ) THEN
    RETURN true;
  END IF;

  -- Giving campaigns
  IF EXISTS (
    SELECT 1 FROM public.giving_campaigns g
    WHERE public.media_ref_matches(g.cover_image_url, p_name)
  ) THEN
    RETURN true;
  END IF;

  -- Chat messages in channels the viewer belongs to
  IF EXISTS (
    SELECT 1 FROM public.chat_messages cm
    JOIN public.chat_channel_members mem ON mem.channel_id = cm.channel_id
    WHERE mem.user_id = v_uid AND public.media_ref_matches(cm.media_url, p_name)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_read_media_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_media_object(text) TO authenticated, service_role;
INSERT INTO public._manual_migration_log (version) VALUES ('20261105000000') ON CONFLICT (version) DO NOTHING;
COMMIT;
