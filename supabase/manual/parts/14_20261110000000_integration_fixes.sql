-- LIORIS manual SQL, part 14 of 18: 20261110000000_integration_fixes.sql
-- Paste this whole file into the Supabase SQL editor and Run. Parts must be run in order; the guard below
-- stops this part if an earlier one is missing. Safe to run twice.
SET lock_timeout = '8s';
SET statement_timeout = '180s';

CREATE TABLE IF NOT EXISTS public._manual_migration_log (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._manual_migration_log ENABLE ROW LEVEL SECURITY;


-- ########## 20261110000000_integration_fixes.sql ##########
-- ============================================================================
-- LIORIS - INTEGRATION FIXES after the 20261103/20261105 media migrations (2026-11-10)
-- ============================================================================
-- 1. 20261103 and 20261105 call public.is_feature_enabled(text), which no migration defines. Policies / functions
--    that reach it fail at run time (every campus-media read for a post would error). Define it: reads the
--    platform-wide flag object stored by the admin feature-flag screen (platform_settings key 'feature_flags');
--    a missing row or key means "on" (every flag in the app defaults on).
-- 2. Those same migrations added `OR is_feature_enabled('forum_global_scope')` to the posts clause of
--    can_read_media_object. With the flag on (default) that makes the media of EVERY published post readable by
--    every signed-in member, including posts that are visible only to another campus. The global-scope case is
--    already covered by `p.visibility_scope = 'global'`, so the blanket clause is removed. Everything else in the
--    function is exactly the 20261105 version.
-- Safe to re-run.
-- ============================================================================
BEGIN;
DO $chain$ BEGIN IF NOT EXISTS (SELECT 1 FROM public._manual_migration_log WHERE version = '20261109000000') THEN RAISE EXCEPTION 'Stopped: migration 20261109000000 has not been applied. Fix it and re-run this whole file.'; END IF; END $chain$;

CREATE OR REPLACE FUNCTION public.is_feature_enabled(p_key text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_value jsonb;
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' THEN RETURN false; END IF;
  BEGIN
    SELECT value INTO v_value FROM public.platform_settings WHERE key = 'feature_flags';
  EXCEPTION WHEN OTHERS THEN
    RETURN true;
  END;
  IF v_value IS NULL OR jsonb_typeof(v_value) <> 'object' OR NOT (v_value ? p_key) THEN
    RETURN true;
  END IF;
  BEGIN
    RETURN COALESCE((v_value ->> p_key)::boolean, true);
  EXCEPTION WHEN OTHERS THEN
    RETURN true;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.is_feature_enabled(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_feature_enabled(text) TO authenticated, service_role;

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

-- 3. 20261102 request_mentorship calls public.mentorship_notify(recipient, title, body, url) with FOUR arguments but
--    only the five-argument version (with a sender) exists, so every mentorship request failed with
--    "function does not exist". Add the four-argument overload: the sender is the caller.
DO $m$
BEGIN
  IF to_regprocedure('public.mentorship_notify(uuid,uuid,text,text,text)') IS NOT NULL THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.mentorship_notify(p_recipient uuid, p_title text, p_body text, p_action_url text)
      RETURNS void
      LANGUAGE sql SECURITY DEFINER
      SET search_path = public, pg_temp
      AS 'SELECT public.mentorship_notify(p_recipient, auth.uid(), p_title, p_body, p_action_url)'
    $f$;
    REVOKE ALL ON FUNCTION public.mentorship_notify(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
  END IF;
END
$m$;

NOTIFY pgrst, 'reload schema';

INSERT INTO public._manual_migration_log (version) VALUES ('20261110000000') ON CONFLICT (version) DO NOTHING;
COMMIT;
