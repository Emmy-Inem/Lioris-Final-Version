-- ============================================================================
-- Migration: 20261028000000_fix_superadmin_rls_and_verification_gaps.sql
-- Description:
--   1. Fix public.is_super_admin() so it strictly requires super_admin hierarchy
--      ((role = 'admin' AND admin_role = 'super_admin') OR master admin email)
--      instead of matching any campus_admin with role = 'admin'.
--   2. Scope resources and events SELECT RLS policies so Campus Admins only see
--      unapproved/pending items for their own campus_code (or GLOBAL), while
--      Super Admins retain global visibility.
--   3. Harden public.is_profile_verified(p_user_id UUID) to recognize super_admin,
--      master admin email, and dynamic campus_for_email(p.email) matches.
--   4. Fix public.normalise_avatar_url() and public.normalise_profile_image_urls()
--      so preset avatar keys (e.g. 'scholar_owl'), data:/asset: URIs, and
--      campus-media paths are never rewritten into broken storage URLs.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Fix public.is_super_admin()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND COALESCE(is_suspended, FALSE) = FALSE
          AND (
              LOWER(COALESCE(email, '')) = 'inememmanuel@gmail.com'
              OR (role = 'admin' AND admin_role = 'super_admin')
          )
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 2. Fix public.is_profile_verified(p_user_id UUID)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_profile_verified(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND (
        p.role::text IN ('admin', 'staff')
        OR p.admin_role::text = 'super_admin'
        OR LOWER(COALESCE(p.email, '')) = 'inememmanuel@gmail.com'
        OR p.verification_status::text = 'verified'
        OR (
          (p.email ~* '\.edu\.ng$' OR public.campus_for_email(p.email) IS NOT NULL)
          AND COALESCE(p.verification_status::text, '') <> 'rejected'
        )
        OR COALESCE(p.is_bot, FALSE) = TRUE
      )
      AND COALESCE(p.is_suspended, FALSE) = FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.is_profile_verified(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_profile_verified(UUID) TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 3. Scope RESOURCES & EVENTS SELECT RLS Policies for Campus Admins vs Super Admins
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Resources viewable if approved and matching campus or global or owner or admin or staff" ON public.resources;
DROP POLICY IF EXISTS "Resources viewable if approved and matching campus or global or" ON public.resources;
CREATE POLICY "Resources viewable if approved and matching campus or global or owner or admin or staff" ON public.resources
FOR SELECT TO authenticated USING (
    public.is_super_admin()
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'staff')
          AND (
              profiles.campus_code = resources.campus_code
              OR profiles.campus_code = 'GLOBAL'
              OR resources.campus_code = 'GLOBAL'
          )
    )
    OR uploader_id = auth.uid()
    OR (
        is_approved = TRUE AND (
            campus_code = 'GLOBAL' OR
            campus_code = (SELECT campus_code FROM public.profiles WHERE id = auth.uid())
        )
    )
);

DROP POLICY IF EXISTS "Events viewable by campus or global" ON public.events;
CREATE POLICY "Events viewable by campus or global" ON public.events
FOR SELECT TO authenticated USING (
    public.is_super_admin()
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'staff')
          AND (
              profiles.campus_code = events.campus_code
              OR profiles.campus_code = 'GLOBAL'
              OR events.campus_code = 'GLOBAL'
          )
    )
    OR creator_id = auth.uid()
    OR visibility_scope = 'global'
    OR campus_code IS NULL
    OR campus_code = 'GLOBAL'
    OR campus_code = (SELECT campus_code FROM public.profiles WHERE id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- 4. Safe Avatar / Cover URL Normalisation (Preserve Preset Keys & Buckets)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalise_avatar_url(raw TEXT)
RETURNS TEXT LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  project_url TEXT;
  clean_path TEXT;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN RETURN raw; END IF;
  -- Preserve full URLs, data/blob/file/asset URIs, and preset avatar keys (no slash and no file extension)
  IF raw ~* '^(https?://|data:|blob:|file:|asset:)' THEN RETURN raw; END IF;
  IF raw ~ '^[A-Za-z0-9_-]+$' THEN RETURN raw; END IF;

  BEGIN
    project_url := coalesce(current_setting('app.supabase_url', true), 'https://fdtnbluslkabwsmspbem.supabase.co');
  EXCEPTION WHEN OTHERS THEN
    project_url := 'https://fdtnbluslkabwsmspbem.supabase.co';
  END;
  IF project_url IS NULL OR project_url = '' THEN
    project_url := 'https://fdtnbluslkabwsmspbem.supabase.co';
  END IF;

  clean_path := ltrim(raw, '/');
  IF clean_path LIKE 'storage/v1/object/public/%' THEN
    RETURN format('%s/%s', rtrim(project_url, '/'), clean_path);
  ELSIF clean_path LIKE 'campus-media/%' OR clean_path LIKE 'avatars/%' THEN
    RETURN format('%s/storage/v1/object/public/%s', rtrim(project_url, '/'), clean_path);
  END IF;

  RETURN format('%s/storage/v1/object/public/avatars/%s', rtrim(project_url, '/'), clean_path);
END;
$$;

CREATE OR REPLACE FUNCTION public.normalise_profile_image_urls()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.avatar_url IS NOT NULL AND btrim(NEW.avatar_url) <> '' THEN
    NEW.avatar_url := public.normalise_avatar_url(NEW.avatar_url);
  END IF;

  IF NEW.banner_url IS NOT NULL AND btrim(NEW.banner_url) <> '' THEN
    NEW.banner_url := public.normalise_avatar_url(NEW.banner_url);
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
