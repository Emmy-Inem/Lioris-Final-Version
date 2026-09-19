-- ============================================================================
-- LIORIS CAMPUS SELECTION & HARDENING FIX 2026
-- 
-- Fixes:
-- 1. Decouples prevent_profile_role_escalation() so that regular users signing up
--    with personal emails (or on campus GLOBAL) can set or update their campus_code
--    during onboarding and profile setup.
-- 2. Ensures institutional-domain verified users cannot tamper with their school campus.
-- 3. Provides a dedicated SECURITY DEFINER RPC public.set_my_campus_code(text)
--    so authenticated users can reliably persist their campus choice.
-- 4. Ensures handle_new_user_profile() faithfully respects the chosen campus_code
--    from auth metadata.
-- ============================================================================

-- 1. Create SECURITY DEFINER function to set campus code directly
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
        END IF;

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
        -- Best effort only
        NULL;
    END;

    RETURN jsonb_build_object('success', true, 'campus_code', v_clean_code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_campus_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_campus_code(text) TO service_role;

-- 2. Decouple prevent_profile_role_escalation() trigger
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_caller_role VARCHAR(50);
    v_caller_campus VARCHAR(50);
    v_self_submitting_for_review BOOLEAN;
    v_domain_campus text;
BEGIN
    IF auth.uid() IS NULL AND pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    SELECT role, campus_code INTO v_caller_role, v_caller_campus
    FROM profiles WHERE id = auth.uid();

    -- Allow Admin full authority over all profiles
    IF v_caller_role = 'admin' THEN
        RETURN NEW;
    END IF;

    -- Allow Campus Staff to update is_suspended and verification_status for users in their same campus or when staff has GLOBAL scope
    IF v_caller_role = 'staff' AND (v_caller_campus = OLD.campus_code OR v_caller_campus = 'GLOBAL' OR OLD.campus_code = 'GLOBAL') THEN
        NEW.role := OLD.role;
        NEW.campus_code := OLD.campus_code;
        RETURN NEW;
    END IF;

    -- Regular user self-verification submission
    v_self_submitting_for_review :=
        NEW.verification_status = 'pending'
        AND OLD.verification_status IN ('unverified', 'rejected');

    -- Decoupled security enforcement:

    -- Role escalation protection
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        NEW.role := OLD.role;
    END IF;

    -- Verification status escalation protection
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NOT v_self_submitting_for_review THEN
        NEW.verification_status := OLD.verification_status;
    END IF;

    -- Suspension escalation protection
    IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
        NEW.is_suspended := OLD.is_suspended;
    END IF;

    -- Trust score escalation protection
    IF NEW.trust_score IS DISTINCT FROM OLD.trust_score THEN
        NEW.trust_score := OLD.trust_score;
    END IF;

    -- Campus code protection:
    -- Allow updating campus_code if:
    -- 1. OLD.campus_code is NULL or 'GLOBAL', OR
    -- 2. User is not institutional-domain verified (e.g. personal email student selecting their university)
    IF NEW.campus_code IS DISTINCT FROM OLD.campus_code THEN
        -- Check if target campus exists and is active
        IF NOT EXISTS (SELECT 1 FROM public.campuses WHERE code = NEW.campus_code AND is_active = true) THEN
            NEW.campus_code := OLD.campus_code;
        ELSE
            -- Check if user is verified via official domain
            IF OLD.verification_status = 'verified' AND OLD.email IS NOT NULL THEN
                BEGIN
                    v_domain_campus := public.campus_for_email(OLD.email);
                EXCEPTION WHEN OTHERS THEN
                    v_domain_campus := NULL;
                END IF;

                IF v_domain_campus IS NOT NULL AND v_domain_campus <> NEW.campus_code THEN
                    -- Locked to official university email domain
                    NEW.campus_code := OLD.campus_code;
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- Ensure trigger is active on profiles
DROP TRIGGER IF EXISTS tr_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER tr_prevent_profile_role_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- 3. Update handle_new_user_profile() to ensure raw_user_meta_data campus_code is prioritized when email has no domain
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
    v_campus text;
    v_role public.user_role_type;
    v_terms_version text;
    v_terms_at timestamptz;
    v_age_raw text;
    v_age boolean;
BEGIN
    -- Determine campus: domain mapping first, then explicit signup metadata, falling back to GLOBAL
    BEGIN
        v_campus := public.campus_for_email(NEW.email);
    EXCEPTION WHEN OTHERS THEN
        v_campus := NULL;
    END;

    IF v_campus IS NULL OR v_campus = '' THEN
        v_campus := NULLIF(NEW.raw_user_meta_data->>'campus_code', '');
    END IF;

    IF v_campus IS NULL OR v_campus = '' OR NOT EXISTS (SELECT 1 FROM public.campuses c WHERE c.code = v_campus AND c.is_active = true) THEN
        v_campus := 'GLOBAL';
    END IF;

    v_role := CASE
        WHEN NEW.raw_user_meta_data->>'role' = 'alumni' THEN 'alumni'::public.user_role_type
        ELSE 'student'::public.user_role_type
    END;

    INSERT INTO public.profiles (id, email, full_name, role, campus_code, verification_status)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1)),
        v_role,
        v_campus,
        'unverified'::public.verification_status_type
    )
    ON CONFLICT (id) DO UPDATE SET
        campus_code = CASE
            WHEN profiles.campus_code IS NULL OR profiles.campus_code = 'GLOBAL' THEN EXCLUDED.campus_code
            ELSE profiles.campus_code
        END;

    -- Best effort: store username if supplied
    BEGIN
        IF NULLIF(NEW.raw_user_meta_data->>'username', '') IS NOT NULL THEN
            UPDATE public.profiles SET username = NEW.raw_user_meta_data->>'username' WHERE id = NEW.id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Consent record
    BEGIN
        v_terms_version := NULLIF(btrim(NEW.raw_user_meta_data->>'terms_version'), '');
        IF v_terms_version IS NOT NULL AND to_regclass('public.consent_records') IS NOT NULL THEN
            BEGIN
                v_terms_at := (NEW.raw_user_meta_data->>'terms_accepted_at')::timestamptz;
            EXCEPTION WHEN OTHERS THEN
                v_terms_at := NULL;
            END IF;
            v_terms_at := LEAST(COALESCE(v_terms_at, now()), now());

            v_age_raw := lower(COALESCE(NEW.raw_user_meta_data->>'age_confirmed_18', ''));
            v_age := CASE WHEN v_age_raw IN ('true', 't', '1', 'yes') THEN true ELSE false END;

            INSERT INTO public.consent_records (user_id, consent_type, version, accepted_at, age_confirmed_18, source)
            VALUES (NEW.id, 'terms_and_privacy', left(v_terms_version, 64), v_terms_at, v_age, 'signup');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'consent record not stored for %: %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$function$;
