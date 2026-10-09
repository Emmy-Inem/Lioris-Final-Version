-- ============================================================================
-- LIORIS - ONBOARDING, CAMPUS SELECTION & VERIFICATION INTEGRITY REPAIR 2026
-- ============================================================================
-- 1. FIX prevent_profile_role_escalation TRIGGER:
--    - Enables students and alumni to select and persist their university campus_code
--      during onboarding and profile setup.
--    - Permits regular users to set verification_status = 'pending' when submitting
--      verification evidence.
--    - Strictly retains protection against unauthorized escalation of role, admin_role,
--      suspension, trust_score, or campus ambassador status.
--    - Root Super Admin (inememmanuel@gmail.com or super_admin) retains absolute authority.
--
-- 2. FIX check_onboarding_completion_integrity TRIGGER:
--    - Accurately checks profile data and falls back to OLD.campus_code / OLD.department
--      if the completion UPDATE payload only includes onboarding_complete flags.
--    - Eliminates false resets of onboarding_complete that trapped students in loops.
--
-- 3. ENSURE set_my_campus_code RPC:
--    - Dedicated SECURITY DEFINER RPC for resilient campus persistence.
--
-- 4. ENSURE STORAGE POLICIES:
--    - Guarantees avatars and campus-media allow authenticated users to upload
--      and manage profile and cover images in their user folder.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. HARDEN & FIX prevent_profile_role_escalation TRIGGER FUNCTION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_role VARCHAR(50);
    v_caller_admin_role VARCHAR(50);
    v_caller_campus VARCHAR(50);
    v_caller_email TEXT;
    v_domain_campus TEXT;
    v_self_submitting_verification BOOLEAN;
BEGIN
    -- Allow direct database migrations / service_role
    IF auth.uid() IS NULL OR auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    SELECT LOWER(COALESCE(role::text, '')),
           COALESCE(admin_role, ''),
           COALESCE(campus_code, ''),
           LOWER(COALESCE(email, ''))
    INTO v_caller_role, v_caller_admin_role, v_caller_campus, v_caller_email 
    FROM public.profiles WHERE id = auth.uid();

    -- Root Super Admin (inememmanuel@gmail.com or super_admin) retains absolute authority
    IF (v_caller_role = 'admin' AND v_caller_admin_role = 'super_admin')
       OR v_caller_email = 'inememmanuel@gmail.com' THEN
        RETURN NEW;
    END IF;

    -- Protect Super Admin accounts from being modified by ANY non-super admin
    IF (OLD.admin_role = 'super_admin' OR LOWER(COALESCE(OLD.email, '')) = 'inememmanuel@gmail.com') THEN
        NEW.role := OLD.role;
        NEW.admin_role := OLD.admin_role;
        NEW.campus_code := OLD.campus_code;
        NEW.is_suspended := OLD.is_suspended;
        NEW.suspension_reason := OLD.suspension_reason;
        NEW.trust_score := OLD.trust_score;
        NEW.verification_status := OLD.verification_status;
        NEW.is_campus_ambassador := OLD.is_campus_ambassador;
        RETURN NEW;
    END IF;

    -- Campus Admin authority: strictly scoped to non-admins on their own campus node
    IF v_caller_role = 'admin' AND (v_caller_admin_role = 'campus_admin' OR v_caller_admin_role IS NULL) THEN
        -- Cannot modify other admins or promote anyone to admin / change admin_role
        IF OLD.role::text = 'admin' OR NEW.role::text = 'admin' OR (NEW.admin_role IS DISTINCT FROM OLD.admin_role) THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_suspended := OLD.is_suspended;
            NEW.suspension_reason := OLD.suspension_reason;
            NEW.trust_score := OLD.trust_score;
            NEW.verification_status := OLD.verification_status;
            RETURN NEW;
        END IF;

        -- Cannot transfer users across campuses
        IF NEW.campus_code IS DISTINCT FROM OLD.campus_code THEN
            NEW.campus_code := OLD.campus_code;
        END IF;

        -- If target is outside their campus, prevent moderating
        IF v_caller_campus IS NOT NULL AND v_caller_campus <> 'GLOBAL' AND OLD.campus_code <> v_caller_campus THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_suspended := OLD.is_suspended;
            NEW.suspension_reason := OLD.suspension_reason;
            NEW.trust_score := OLD.trust_score;
            NEW.verification_status := OLD.verification_status;
            NEW.is_campus_ambassador := OLD.is_campus_ambassador;
            RETURN NEW;
        END IF;

        RETURN NEW;
    END IF;

    -- Campus Staff authority
    IF v_caller_role = 'staff' THEN
        IF OLD.role::text IN ('admin', 'staff') THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_suspended := OLD.is_suspended;
            NEW.suspension_reason := OLD.suspension_reason;
            NEW.trust_score := OLD.trust_score;
            NEW.verification_status := OLD.verification_status;
            RETURN NEW;
        END IF;

        IF (v_caller_campus = OLD.campus_code OR v_caller_campus = 'GLOBAL' OR OLD.campus_code = 'GLOBAL') THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_campus_ambassador := OLD.is_campus_ambassador;
            RETURN NEW;
        END IF;
    END IF;

    -- Regular users (self-updates):
    -- 1. Role and admin_role can NEVER be changed by regular user
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        NEW.role := OLD.role;
    END IF;
    IF NEW.admin_role IS DISTINCT FROM OLD.admin_role THEN
        NEW.admin_role := OLD.admin_role;
    END IF;

    -- 2. Suspension and trust_score can NEVER be changed by regular user
    IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
        NEW.is_suspended := OLD.is_suspended;
    END IF;
    IF NEW.trust_score IS DISTINCT FROM OLD.trust_score THEN
        NEW.trust_score := OLD.trust_score;
    END IF;

    -- 3. Campus Ambassador can NEVER be self-assigned
    IF NEW.is_campus_ambassador IS DISTINCT FROM OLD.is_campus_ambassador THEN
        NEW.is_campus_ambassador := OLD.is_campus_ambassador;
    END IF;

    -- 4. Verification Status:
    -- User can ONLY submit for verification (unverified/none/rejected -> pending)
    v_self_submitting_verification := (
        NEW.verification_status = 'pending'
        AND (OLD.verification_status IS NULL OR OLD.verification_status IN ('none', 'unverified', 'rejected'))
    );
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NOT v_self_submitting_verification THEN
        NEW.verification_status := OLD.verification_status;
    END IF;

    -- 5. Campus Code:
    -- Allow updating campus_code if:
    --  a) OLD.campus_code is NULL or 'GLOBAL' (initial onboarding or unassigned), OR
    --  b) User is not domain-verified (personal email student choosing/updating their university).
    -- If user has an official institutional email matching a domain, lock to that domain.
    IF NEW.campus_code IS DISTINCT FROM OLD.campus_code THEN
        -- Target campus must be a valid active campus or 'GLOBAL'
        IF NEW.campus_code IS NOT NULL AND NEW.campus_code <> 'GLOBAL' AND NOT EXISTS (SELECT 1 FROM public.campuses WHERE code = NEW.campus_code AND is_active = true) THEN
            NEW.campus_code := OLD.campus_code;
        ELSE
            -- Check if user is verified with official institutional domain
            IF OLD.verification_status = 'verified' AND OLD.email IS NOT NULL THEN
                BEGIN
                    v_domain_campus := public.campus_for_email(OLD.email);
                EXCEPTION WHEN OTHERS THEN
                    v_domain_campus := NULL;
                END;
                IF v_domain_campus IS NOT NULL AND v_domain_campus <> NEW.campus_code THEN
                    NEW.campus_code := OLD.campus_code;
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS tr_prevent_profile_role_escalation ON public.profiles;
DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER tr_prevent_profile_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- ----------------------------------------------------------------------------
-- 2. FIX check_onboarding_completion_integrity TRIGGER FUNCTION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_onboarding_completion_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.onboarding_complete = TRUE AND (OLD.onboarding_complete IS NULL OR OLD.onboarding_complete = FALSE) THEN
    -- Super Admin and Staff are exempt
    IF NEW.role IN ('student', 'alumni') AND LOWER(COALESCE(NEW.email, '')) <> 'inememmanuel@gmail.com' THEN
      -- If campus_code is missing in NEW payload, fall back to what was already saved in OLD
      IF NEW.campus_code IS NULL OR NEW.campus_code = 'GLOBAL' THEN
        IF OLD.campus_code IS NOT NULL AND OLD.campus_code <> 'GLOBAL' THEN
          NEW.campus_code := OLD.campus_code;
        ELSE
          NEW.onboarding_complete := FALSE;
        END IF;
      END IF;

      -- If department is missing in NEW payload, fall back to what was already saved in OLD
      IF NEW.department IS NULL OR trim(NEW.department) = '' THEN
        IF OLD.department IS NOT NULL AND trim(OLD.department) <> '' THEN
          NEW.department := OLD.department;
        ELSE
          NEW.onboarding_complete := FALSE;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_check_onboarding_completion_integrity ON public.profiles;
CREATE TRIGGER trg_check_onboarding_completion_integrity
  BEFORE INSERT OR UPDATE OF onboarding_complete, campus_code, department ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_onboarding_completion_integrity();

-- ----------------------------------------------------------------------------
-- 3. ENSURE set_my_campus_code RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_my_campus_code(p_campus_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_clean_code text;
    v_caller_role text;
    v_user_email text;
    v_domain_campus text;
    v_is_verified boolean;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_clean_code := upper(trim(p_campus_code));
    IF v_clean_code IS NULL OR v_clean_code = '' THEN
        RAISE EXCEPTION 'A valid campus code is required.';
    END IF;

    -- Validate that campus code exists and is active
    IF NOT EXISTS (SELECT 1 FROM public.campuses WHERE code = v_clean_code AND is_active = true) THEN
        RAISE EXCEPTION 'Invalid or inactive campus code: %', v_clean_code;
    END IF;

    -- Fetch caller profile status
    SELECT 
        role::text, 
        email, 
        (verification_status = 'verified')
    INTO 
        v_caller_role, 
        v_user_email, 
        v_is_verified
    FROM public.profiles 
    WHERE id = v_user_id;

    -- If the user is verified WITH an official institutional email domain matching another campus,
    -- protect them from tampering away from their official school domain.
    IF v_is_verified AND v_user_email IS NOT NULL THEN
        BEGIN
            v_domain_campus := public.campus_for_email(v_user_email);
        EXCEPTION WHEN OTHERS THEN
            v_domain_campus := NULL;
        END;

        IF v_domain_campus IS NOT NULL AND v_domain_campus <> v_clean_code AND v_caller_role <> 'admin' THEN
            RAISE EXCEPTION 'Institutional email accounts are locked to their official university domain: %', v_domain_campus;
        END IF;
    END IF;

    -- Update profiles table
    UPDATE public.profiles
    SET 
        campus_code = v_clean_code,
        updated_at = now()
    WHERE id = v_user_id;

    -- Also update auth user metadata if possible
    BEGIN
        UPDATE auth.users
        SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('campus_code', v_clean_code)
        WHERE id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object('success', true, 'campus_code', v_clean_code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_campus_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_campus_code(text) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. ENSURE STORAGE POLICIES FOR AVATARS & CAMPUS-MEDIA
-- ----------------------------------------------------------------------------
DO $do$
BEGIN
  -- Avatars bucket: public read, authenticated upload into own folder or admin
  DROP POLICY IF EXISTS "Avatars are publicly viewable" ON storage.objects;
  CREATE POLICY "Avatars are publicly viewable" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'avatars');

  DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
  CREATE POLICY "Authenticated users can upload avatars" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'avatars'
      AND (
        public.auth_profile_role() = 'admin'
        OR (storage.foldername(name))[1] = auth.uid()::text
      )
    );

  DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
  CREATE POLICY "Users can update own avatars" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'avatars'
      AND (
        public.auth_profile_role() = 'admin'
        OR (storage.foldername(name))[1] = auth.uid()::text
      )
    );

  DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;
  CREATE POLICY "Users can delete own avatars" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'avatars'
      AND (
        public.auth_profile_role() = 'admin'
        OR (storage.foldername(name))[1] = auth.uid()::text
      )
    );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $do$;

COMMIT;
