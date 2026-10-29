-- LIORIS manual SQL, part 7 of 18: 20261103000000_fix_forum_post_media.sql
-- Paste this whole file into the Supabase SQL editor and Run. Parts must be run in order; the guard below
-- stops this part if an earlier one is missing. Safe to run twice.
SET lock_timeout = '8s';
SET statement_timeout = '180s';

CREATE TABLE IF NOT EXISTS public._manual_migration_log (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._manual_migration_log ENABLE ROW LEVEL SECURITY;


-- ########## 20261103000000_fix_forum_post_media.sql ##########
BEGIN;
DO $chain$ BEGIN IF NOT EXISTS (SELECT 1 FROM public._manual_migration_log WHERE version = '20261102000000') THEN RAISE EXCEPTION 'Stopped: migration 20261102000000 has not been applied. Fix it and re-run this whole file.'; END IF; END $chain$;
-- =============================================================================
-- Fix forum post media storage access, constraints & normalize legacy URLs (2026-11-03)
-- =============================================================================

-- 1. Update can_read_media_object to ensure any authenticated user viewing a
-- published post they are permitted to see can read its attached media (including
-- campus-scoped posts for that campus, Super Admins, and global workspace feeds).
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

-- 2. Relax URL check constraints on posts to allow relative
-- storage paths and stock keys alongside full http(s) URLs.
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS chk_posts_image_url_url_scheme;
ALTER TABLE public.posts ADD CONSTRAINT chk_posts_image_url_url_scheme CHECK (
  image_url IS NULL
  OR image_url ~* '^https?://'
  OR image_url ~* '^asset:'
  OR image_url ~ '^[^/]+/[A-Za-z0-9_.-]+$'
  OR image_url ~ '^[A-Za-z0-9_-]+$'
);

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS chk_posts_video_url_url_scheme;
ALTER TABLE public.posts ADD CONSTRAINT chk_posts_video_url_url_scheme CHECK (
  video_url IS NULL
  OR video_url ~* '^https?://'
  OR video_url ~* '^asset:'
  OR video_url ~ '^[^/]+/[A-Za-z0-9_.-]+$'
  OR video_url ~ '^[A-Za-z0-9_-]+$'
);

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS chk_posts_image_urls_url_scheme;

-- 3. Normalize legacy post image URLs that still contain full Supabase public endpoints
-- into clean relative storage paths so clients can consistently resolve and sign them.
UPDATE public.posts
   SET image_url = regexp_replace(image_url, '^https?://[^/]+/storage/v1/object/(?:public|sign|authenticated)/campus-media/', '')
 WHERE image_url ~* '^https?://[^/]+/storage/v1/object/(?:public|sign|authenticated)/campus-media/';

UPDATE public.posts
   SET image_urls = ARRAY(
     SELECT regexp_replace(u, '^https?://[^/]+/storage/v1/object/(?:public|sign|authenticated)/campus-media/', '')
       FROM unnest(image_urls) u
   )
 WHERE image_urls IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM unnest(image_urls) u
      WHERE u ~* '^https?://[^/]+/storage/v1/object/(?:public|sign|authenticated)/campus-media/'
   );

-- Backfill image_urls where image_url exists but image_urls is missing
UPDATE public.posts
   SET image_urls = ARRAY[image_url]
 WHERE image_url IS NOT NULL
   AND (image_urls IS NULL OR array_length(image_urls, 1) = 0);
INSERT INTO public._manual_migration_log (version) VALUES ('20261103000000') ON CONFLICT (version) DO NOTHING;
COMMIT;
