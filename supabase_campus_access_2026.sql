-- ============================================================================
-- LIORIS - CAMPUS ACCESS CONTROL & STORAGE PRIVATISATION (2026)
-- ============================================================================
-- Architecture: docs/security/campus-access-control.md
-- Contract:     docs/internal/campus-access-contract.md
--
-- Core principles:
-- 1. Campus membership is earned, not self-declared.
-- 2. RLS is the security boundary; client UI only explains.
-- 3. Admins and staff are never locked out (two admins are unverified today).
-- 4. Storage buckets (resources, campus-media) are privatised.
-- 5. Safe kill switch in platform_settings ('campus_wall').
-- 6. Clean notification trigger for verification approvals & rejections.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. SCHEMA PREREQUISITES & COLUMN SAFEGUARDS
-- ---------------------------------------------------------------------------
-- Ensure columns referenced by policies exist regardless of prior migrations
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS audience_scope text NOT NULL DEFAULT 'global';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS visibility_scope text DEFAULT 'campus';

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status text DEFAULT 'upcoming';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS visibility_scope text DEFAULT 'campus';

ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS audience_scope text DEFAULT 'global';

-- ---------------------------------------------------------------------------
-- 1. KILL SWITCH & SETTINGS SEED
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_settings (key, value, description)
VALUES (
  'campus_wall',
  '{"enabled": true}'::jsonb,
  'Enforces campus wall RLS: unverified personal users only see global content.'
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.campus_wall_enabled()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT (value->>'enabled')::boolean
     FROM public.platform_settings
     WHERE key = 'campus_wall'),
    true
  );
$$;

GRANT EXECUTE ON FUNCTION public.campus_wall_enabled() TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 2. CAMPUS ACCESS & VERIFIED MEMBERSHIP HELPERS
-- ---------------------------------------------------------------------------
-- Returns the caller's authorized campus code, or NULL if not entitled.
CREATE OR REPLACE FUNCTION public.auth_campus_access()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    -- Kill switch: if wall is disabled, allow claimed campus
    WHEN NOT public.campus_wall_enabled() THEN p.campus_code
    -- Admins and staff keep full moderation reach regardless of verification status
    WHEN p.role IN ('admin', 'staff')     THEN p.campus_code
    -- Verified students, alumni, and staff access their own campus
    WHEN p.verification_status = 'verified' THEN p.campus_code
    -- Everyone else matches NULL (global only)
    ELSE NULL
  END
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.auth_campus_access() TO authenticated, anon, service_role;

-- Returns true if the caller is considered a verified member of the network.
CREATE OR REPLACE FUNCTION public.auth_is_verified_member()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN NOT public.campus_wall_enabled()   THEN true
    WHEN p.role IN ('admin', 'staff')       THEN true
    WHEN p.verification_status = 'verified' THEN true
    ELSE false
  END
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.auth_is_verified_member() TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 3. STORAGE PRIVATISATION & POLICIES
-- ---------------------------------------------------------------------------
-- Flip resources and campus-media to private buckets
UPDATE storage.buckets SET public = false WHERE id IN ('resources', 'campus-media');
UPDATE storage.buckets SET public = true WHERE id = 'avatars';
UPDATE storage.buckets SET public = false WHERE id = 'verifications';

-- Clean up legacy permissive public read policy
DROP POLICY IF EXISTS "Public storage objects viewable by anyone" ON storage.objects;
DROP POLICY IF EXISTS "Avatars are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read own storage objects" ON storage.objects;
DROP POLICY IF EXISTS "Campus media and resources viewable by verified members" ON storage.objects;

-- Avatars remain publicly readable
CREATE POLICY "Avatars are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Users can always read their own uploaded storage objects
CREATE POLICY "Authenticated users can read own storage objects"
ON storage.objects FOR SELECT TO authenticated
USING (
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Campus media and resources readable by verified members or admins/staff or object owner
CREATE POLICY "Campus media and resources viewable by verified members"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('resources', 'campus-media')
  AND (
    public.auth_is_verified_member()
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- ---------------------------------------------------------------------------
-- 4. PUBLIC PROFILES PROJECTION VIEW (F4)
-- ---------------------------------------------------------------------------
-- Safe view for looking up thread authors and peer cards without exposing
-- sensitive private fields (email, student_id_number, trust_score).
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT
  id,
  full_name,
  username,
  avatar_url,
  banner_url,
  role,
  campus_code,
  department,
  faculty,
  level,
  level AS academic_level,
  NULL::integer AS graduation_year,
  bio,
  (verification_status = 'verified') AS is_verified,
  verification_status,
  created_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 5. RLS POLICY REWRITES (THE 8 CORE SURFACES)
-- ---------------------------------------------------------------------------

-- Surface 1: PROFILES
DROP POLICY IF EXISTS "Profiles viewable by same campus or global or self or admin" ON public.profiles;
CREATE POLICY "Profiles viewable by same campus or global or self or admin"
ON public.profiles FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR campus_code = 'GLOBAL'
  OR campus_code = public.auth_campus_access()
  OR public.auth_profile_role() IN ('admin', 'staff')
);

-- Surface 2: POSTS
DROP POLICY IF EXISTS "Posts readable by target scope or author or staff" ON public.posts;
DROP POLICY IF EXISTS "Posts readable by target scope and campus" ON public.posts;
CREATE POLICY "Posts readable by target scope or author or staff"
ON public.posts FOR SELECT TO authenticated
USING (
  auth.uid() = author_id
  OR public.auth_profile_role() IN ('admin', 'staff')
  OR (
    (status IS NULL OR status = 'published')
    AND (
      audience_scope = 'global'
      OR (audience_scope = 'student' AND public.auth_profile_role() = 'student')
      OR (audience_scope = 'alumni'  AND public.auth_profile_role() = 'alumni')
      OR (audience_scope = 'staff'   AND public.auth_profile_role() = 'staff')
    )
    AND (
      visibility_scope = 'global'
      OR campus_code IS NULL
      OR campus_code = 'GLOBAL'
      OR campus_code = public.auth_campus_access()
    )
  )
);

DROP POLICY IF EXISTS "Users can insert own posts" ON public.posts;
CREATE POLICY "Users can insert own posts"
ON public.posts FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = author_id
  AND NOT (SELECT COALESCE(is_suspended, false) FROM public.profiles WHERE id = auth.uid())
  AND (
    visibility_scope = 'global'
    OR campus_code IS NULL
    OR campus_code = 'GLOBAL'
    OR campus_code = public.auth_campus_access()
    OR public.auth_profile_role() IN ('admin', 'staff')
  )
);

-- Surface 3: EVENTS
DROP POLICY IF EXISTS "Events viewable by campus or global" ON public.events;
CREATE POLICY "Events viewable by campus or global"
ON public.events FOR SELECT TO authenticated
USING (
  visibility_scope = 'global'
  OR campus_code IS NULL
  OR campus_code = 'GLOBAL'
  OR campus_code = public.auth_campus_access()
  OR public.auth_profile_role() IN ('admin', 'staff')
);

DROP POLICY IF EXISTS "Users can create events" ON public.events;
CREATE POLICY "Users can create events"
ON public.events FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = creator_id
  AND (status IS NULL OR status = 'pending_approval' OR public.auth_profile_role() IN ('admin', 'staff'))
  AND NOT (SELECT COALESCE(is_suspended, false) FROM public.profiles WHERE id = auth.uid())
  AND (
    campus_code IS NULL
    OR campus_code = 'GLOBAL'
    OR campus_code = public.auth_campus_access()
    OR public.auth_profile_role() IN ('admin', 'staff')
  )
);

-- Event Attendees: only verified campus members or global/admin can RSVP
DROP POLICY IF EXISTS "Users can RSVP to events" ON public.event_attendees;
CREATE POLICY "Users can RSVP to events"
ON public.event_attendees FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND NOT (SELECT COALESCE(is_suspended, false) FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_id
    AND (
      e.campus_code IS NULL
      OR e.campus_code = 'GLOBAL'
      OR e.campus_code = public.auth_campus_access()
      OR public.auth_profile_role() IN ('admin', 'staff')
    )
  )
);

-- Surface 4: RESOURCES
DROP POLICY IF EXISTS "Resources viewable if approved and matching campus or global or owner or admin or staff" ON public.resources;
CREATE POLICY "Resources viewable if approved and matching campus or global or owner or admin or staff"
ON public.resources FOR SELECT TO authenticated
USING (
  (
    is_approved = TRUE
    AND (
      campus_code IS NULL
      OR campus_code = 'GLOBAL'
      OR campus_code = public.auth_campus_access()
    )
  )
  OR uploader_id = auth.uid()
  OR public.auth_profile_role() IN ('admin', 'staff')
);

DROP POLICY IF EXISTS "Users can upload resources" ON public.resources;
CREATE POLICY "Users can upload resources"
ON public.resources FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = uploader_id
  AND NOT (SELECT COALESCE(is_suspended, false) FROM public.profiles WHERE id = auth.uid())
  AND (
    campus_code IS NULL
    OR campus_code = 'GLOBAL'
    OR campus_code = public.auth_campus_access()
    OR public.auth_profile_role() IN ('admin', 'staff')
  )
);

-- Surface 5: STUDY GROUPS
DROP POLICY IF EXISTS "Study groups viewable by campus or global" ON public.study_groups;
CREATE POLICY "Study groups viewable by campus or global"
ON public.study_groups FOR SELECT TO authenticated
USING (
  campus_code IS NULL
  OR campus_code = 'GLOBAL'
  OR campus_code = public.auth_campus_access()
  OR public.auth_profile_role() IN ('admin', 'staff')
);

DROP POLICY IF EXISTS "Users can create study groups" ON public.study_groups;
CREATE POLICY "Users can create study groups"
ON public.study_groups FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = creator_id
  AND NOT (SELECT COALESCE(is_suspended, false) FROM public.profiles WHERE id = auth.uid())
  AND (
    campus_code IS NULL
    OR campus_code = 'GLOBAL'
    OR campus_code = public.auth_campus_access()
    OR public.auth_profile_role() IN ('admin', 'staff')
  )
);

-- Surface 6: MARKETPLACE LISTINGS
DROP POLICY IF EXISTS "Marketplace listings viewable by campus or global" ON public.marketplace_listings;
CREATE POLICY "Marketplace listings viewable by campus or global"
ON public.marketplace_listings FOR SELECT TO authenticated
USING (
  campus_code IS NULL
  OR campus_code = 'GLOBAL'
  OR campus_code = public.auth_campus_access()
  OR auth.uid() = seller_id
  OR public.auth_profile_role() IN ('admin', 'staff')
);

DROP POLICY IF EXISTS "Authenticated users can create marketplace listings" ON public.marketplace_listings;
CREATE POLICY "Authenticated users can create marketplace listings"
ON public.marketplace_listings FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = seller_id
  AND NOT (SELECT COALESCE(is_suspended, false) FROM public.profiles WHERE id = auth.uid())
  AND (
    campus_code IS NULL
    OR campus_code = 'GLOBAL'
    OR campus_code = public.auth_campus_access()
    OR public.auth_profile_role() IN ('admin', 'staff')
  )
);

-- Surface 7: ANNOUNCEMENTS
DROP POLICY IF EXISTS "Announcements viewable by target audience and campus" ON public.announcements;
CREATE POLICY "Announcements viewable by target audience and campus"
ON public.announcements FOR SELECT TO authenticated
USING (
  (
    campus_code IS NULL
    OR campus_code = 'GLOBAL'
    OR campus_code = public.auth_campus_access()
    OR public.auth_profile_role() IN ('admin', 'staff')
  )
  AND (
    audience_scope = 'global'
    OR audience_scope = (SELECT role::text FROM public.profiles WHERE id = auth.uid())
    OR public.auth_profile_role() IN ('admin', 'staff')
  )
);

-- Surface 8: JOBS (Conditional on table existence)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Jobs viewable by campus or global" ON public.jobs';
    EXECUTE 'CREATE POLICY "Jobs viewable by campus or global" ON public.jobs FOR SELECT TO authenticated USING (
      is_approved = TRUE AND (
        campus_code IS NULL
        OR campus_code = ''GLOBAL''
        OR campus_code = public.auth_campus_access()
        OR public.auth_profile_role() IN (''admin'', ''staff'')
      )
    )';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. VERIFICATION STATUS NOTIFICATION TRIGGER
-- ---------------------------------------------------------------------------
-- Automatically creates an in-app notification when a verification request
-- status changes to 'approved' or 'rejected'.
CREATE OR REPLACE FUNCTION public.handle_verification_status_change_notify()
RETURNS TRIGGER AS $$
DECLARE
  v_campus TEXT;
  v_reason TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected') THEN
    v_campus := NEW.campus_code;

    IF NEW.status = 'approved' THEN
      INSERT INTO public.notifications (
        recipient_id,
        sender_id,
        title,
        body,
        type,
        action_url
      ) VALUES (
        NEW.user_id,
        NEW.reviewed_by,
        'Campus Verification Approved! 🎉',
        format('Congratulations! Your verification for %s has been approved. You now have full access to campus feeds, events, and resources.', COALESCE(v_campus, 'your campus')),
        'system',
        '/(student)/dashboard'
      );
    ELSIF NEW.status = 'rejected' THEN
      v_reason := NULLIF(TRIM(NEW.review_notes), '');
      INSERT INTO public.notifications (
        recipient_id,
        sender_id,
        title,
        body,
        type,
        action_url
      ) VALUES (
        NEW.user_id,
        NEW.reviewed_by,
        'Verification Needs Revision ⚠️',
        CASE
          WHEN v_reason IS NOT NULL THEN format('Your verification could not be approved: %s. Please upload an updated ID or document to re-apply.', v_reason)
          ELSE 'We could not verify your student or staff ID from the submitted document. Please upload a clear photo of your ID card to re-apply.'
        END,
        'system',
        '/(student)/profile'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_verification_status_change_notify ON public.verifications;
CREATE TRIGGER trg_verification_status_change_notify
  AFTER UPDATE OF status ON public.verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_verification_status_change_notify();

NOTIFY pgrst, 'reload schema';
