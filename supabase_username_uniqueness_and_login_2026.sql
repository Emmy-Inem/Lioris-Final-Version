-- ============================================================================
-- LIORIS - USERNAME UNIQUENESS & USERNAME LOGIN SUPPORT (2026)
-- ============================================================================
-- 1. Ensure case-insensitive unique constraint on profiles.username.
--    This prevents duplicate usernames even with different casing (e.g. 'Ineme' vs 'ineme').
-- 2. Provide a SECURITY DEFINER function to check username availability for anon users.
-- 3. Provide a SECURITY DEFINER function to look up email by username for sign-in.
-- ============================================================================

-- 1. Unique index on lowercase username (ignoring nulls)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower 
ON public.profiles (LOWER(TRIM(username)))
WHERE username IS NOT NULL AND TRIM(username) <> '';

-- 2. Check username availability (callable by anon during signup)
CREATE OR REPLACE FUNCTION public.check_username_available(p_username text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean text;
BEGIN
    v_clean := lower(trim(p_username));
    -- Usernames must be 3-24 characters
    IF v_clean IS NULL OR length(v_clean) < 3 OR length(v_clean) > 24 THEN
        RETURN false;
    END IF;

    -- Return true if NOT taken, false if taken
    RETURN NOT EXISTS (
        SELECT 1 
        FROM public.profiles 
        WHERE lower(trim(username)) = v_clean
    );
END;
$$;

REVOKE ALL ON FUNCTION public.check_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated, service_role;

-- 3. Look up email for a given username (callable by anon during login)
CREATE OR REPLACE FUNCTION public.get_email_for_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean text;
    v_email text;
BEGIN
    v_clean := lower(trim(p_username));
    IF v_clean IS NULL OR length(v_clean) < 3 THEN
        RETURN NULL;
    END IF;

    SELECT email INTO v_email
    FROM public.profiles
    WHERE lower(trim(username)) = v_clean
    LIMIT 1;

    RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.get_email_for_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_email_for_username(text) TO anon, authenticated, service_role;

-- 4. Update handle_new_user_profile trigger to store lower-trimmed username cleanly
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
    v_username text;
BEGIN
    v_campus := COALESCE(
        public.campus_for_email(NEW.email),
        NULLIF(NEW.raw_user_meta_data->>'campus_code', ''),
        'GLOBAL'
    );
    IF NOT EXISTS (SELECT 1 FROM public.campuses c WHERE c.code = v_campus) THEN
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
    ON CONFLICT (id) DO NOTHING;

    -- Store username (clean and trimmed)
    v_username := lower(trim(COALESCE(NEW.raw_user_meta_data->>'username', '')));
    IF v_username <> '' AND length(v_username) >= 3 THEN
        BEGIN
            UPDATE public.profiles SET username = v_username WHERE id = NEW.id;
        EXCEPTION WHEN OTHERS THEN
            -- If already taken despite front-end validation, leave null to avoid blocking signup
            NULL;
        END;
    END IF;

    -- Consent record
    BEGIN
        v_terms_version := NULLIF(btrim(NEW.raw_user_meta_data->>'terms_version'), '');
        IF v_terms_version IS NOT NULL AND to_regclass('public.consent_records') IS NOT NULL THEN
            BEGIN
                v_terms_at := (NEW.raw_user_meta_data->>'terms_accepted_at')::timestamptz;
            EXCEPTION WHEN OTHERS THEN
                v_terms_at := NULL;
            END;
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

NOTIFY pgrst, 'reload schema';
