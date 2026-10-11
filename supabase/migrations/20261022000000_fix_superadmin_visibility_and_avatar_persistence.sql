-- ============================================================================
-- Migration: 20261022000000
-- Fix super admin visibility (resources, events, announcements, posts) and
-- ensure avatar/cover URL is stored as a full public URL, never a bare path.
-- Also seed authentic upcoming campus & national events and UI/UNILAG resources.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ANNOUNCEMENTS SELECT POLICY — super admin campus bypass
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Announcements viewable by target audience and campus" ON announcements;
CREATE POLICY "Announcements viewable by target audience and campus" ON announcements
FOR SELECT TO authenticated USING (
    -- Admins see every announcement regardless of campus or audience scope.
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR (
        -- Non-admins: campus isolation + audience scope check.
        (campus_code IS NULL OR campus_code = 'GLOBAL' OR campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid()))
        AND
        (audience_scope = 'global' OR audience_scope = (SELECT role::text FROM profiles WHERE id = auth.uid()))
    )
);

-- ---------------------------------------------------------------------------
-- 2. POSTS SELECT POLICY — ensure super admin sees all-campus posts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Posts viewable by campus or global" ON posts;
CREATE POLICY "Posts viewable by campus or global" ON posts FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
    OR visibility_scope = 'global'
    OR campus_code = 'GLOBAL'
    OR campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- 3. STUDY GROUPS SELECT POLICY — admin bypass first
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Study groups viewable by campus or global" ON study_groups;
CREATE POLICY "Study groups viewable by campus or global" ON study_groups FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
    OR campus_code = 'GLOBAL'
    OR campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- 4. MARKETPLACE LISTINGS SELECT POLICY — admin bypass first
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Marketplace listings viewable by campus or global" ON marketplace_listings;
CREATE POLICY "Marketplace listings viewable by campus or global" ON marketplace_listings FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'staff'))
    OR campus_code = 'GLOBAL'
    OR campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid())
    OR auth.uid() = seller_id
);

-- ---------------------------------------------------------------------------
-- 5. JOBS SELECT POLICY — admin bypass first
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Jobs viewable by campus or global" ON public.jobs;
CREATE POLICY "Jobs viewable by campus or global" ON public.jobs FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'staff'))
    OR campus_code = 'GLOBAL'
    OR campus_code = (SELECT campus_code FROM public.profiles WHERE id = auth.uid())
    OR auth.uid() = poster_id
);

-- ---------------------------------------------------------------------------
-- 6. RESOURCES SELECT POLICY — admin bypass first
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Resources viewable if approved and matching campus or global or owner or admin or staff" ON resources;
DROP POLICY IF EXISTS "Resources viewable if approved and matching campus or global or" ON resources;
CREATE POLICY "Resources viewable if approved and matching campus or global or owner or admin or staff" ON resources FOR SELECT TO authenticated USING (
    -- Admins and staff see ALL resources (approved or pending) for their scope; root admin / super admin sees all.
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND (
              profiles.email = 'inememmanuel@gmail.com'
              OR profiles.admin_role = 'super_admin'
              OR profiles.role = 'admin'
              OR (profiles.role = 'staff' AND profiles.campus_code = resources.campus_code)
          )
    )
    OR uploader_id = auth.uid()
    OR (
        is_approved = TRUE AND (
            campus_code = 'GLOBAL' OR
            campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid())
        )
    )
);

-- ---------------------------------------------------------------------------
-- 7. EVENTS SELECT POLICY — explicit admin bypass
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Events viewable by campus or global" ON events;
CREATE POLICY "Events viewable by campus or global" ON events FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND (
              profiles.email = 'inememmanuel@gmail.com'
              OR profiles.admin_role = 'super_admin'
              OR profiles.role = 'admin'
              OR (profiles.role = 'staff' AND profiles.campus_code = events.campus_code)
          )
    )
    OR visibility_scope = 'global'
    OR campus_code IS NULL
    OR campus_code = 'GLOBAL'
    OR campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- 8. PROFILE image URL normalisation helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalise_avatar_url(raw TEXT)
RETURNS TEXT LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  project_url TEXT;
BEGIN
  IF raw IS NULL OR raw = '' THEN RETURN raw; END IF;
  IF raw LIKE 'http%' THEN RETURN raw; END IF;
  BEGIN
    project_url := coalesce(current_setting('app.supabase_url', true), 'https://fdtnbluslkabwsmspbem.supabase.co');
  EXCEPTION WHEN OTHERS THEN
    project_url := 'https://fdtnbluslkabwsmspbem.supabase.co';
  END;
  IF project_url IS NULL OR project_url = '' THEN
    project_url := 'https://fdtnbluslkabwsmspbem.supabase.co';
  END IF;
  RETURN format('%s/storage/v1/object/public/avatars/%s', RTRIM(project_url, '/'), LTRIM(raw, '/'));
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. TRIGGER: normalise avatar_url / banner_url on INSERT/UPDATE of profiles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalise_profile_image_urls()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_url TEXT := 'https://fdtnbluslkabwsmspbem.supabase.co';
BEGIN
  BEGIN
    base_url := coalesce(current_setting('app.supabase_url', true), 'https://fdtnbluslkabwsmspbem.supabase.co');
  EXCEPTION WHEN OTHERS THEN
    base_url := 'https://fdtnbluslkabwsmspbem.supabase.co';
  END;
  IF base_url IS NULL OR base_url = '' THEN
    base_url := 'https://fdtnbluslkabwsmspbem.supabase.co';
  END IF;

  IF NEW.avatar_url IS NOT NULL AND NEW.avatar_url <> '' AND NEW.avatar_url NOT LIKE 'http%' THEN
    NEW.avatar_url := rtrim(base_url, '/') || '/storage/v1/object/public/avatars/' || ltrim(NEW.avatar_url, '/');
  END IF;

  IF NEW.banner_url IS NOT NULL AND NEW.banner_url <> '' AND NEW.banner_url NOT LIKE 'http%' THEN
    NEW.banner_url := rtrim(base_url, '/') || '/storage/v1/object/public/avatars/' || ltrim(NEW.banner_url, '/');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalise_profile_image_urls ON profiles;
CREATE TRIGGER trg_normalise_profile_image_urls
BEFORE INSERT OR UPDATE OF avatar_url, banner_url ON profiles
FOR EACH ROW EXECUTE FUNCTION normalise_profile_image_urls();

-- ---------------------------------------------------------------------------
-- 10. RPC: get_my_profile_images
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_profile_images()
RETURNS TABLE(avatar_url TEXT, banner_url TEXT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT avatar_url, banner_url FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_profile_images() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile_images() TO authenticated;

-- Backfill existing bare paths
UPDATE public.profiles
SET avatar_url = normalise_avatar_url(avatar_url)
WHERE avatar_url IS NOT NULL AND avatar_url <> '' AND avatar_url NOT LIKE 'http%';

UPDATE public.profiles
SET banner_url = normalise_avatar_url(banner_url)
WHERE banner_url IS NOT NULL AND banner_url <> '' AND banner_url NOT LIKE 'http%';

-- (Sections 11 and 12, which seeded placeholder events and resources, were removed;
-- see 20261026000000_remove_fake_seeded_resources.sql and 20261026010000_remove_fake_seeded_events.sql.)

