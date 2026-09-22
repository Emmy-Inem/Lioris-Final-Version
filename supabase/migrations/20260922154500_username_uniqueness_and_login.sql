-- Trimmed version of the loose supabase_username_uniqueness_and_login_2026.sql:
-- only the parts that don't already exist live. Section 4 of that file
-- (replacing handle_new_user_profile) is DELIBERATELY EXCLUDED - the live
-- version of that trigger is already newer than the one in that file (it
-- checks campuses.is_active, merges campus_code on conflict instead of
-- ON CONFLICT DO NOTHING, and handles campus_for_email failing), so applying
-- the older version here would have been a regression. src/api/auth.ts's
-- checkUsernameAvailable/getEmailForUsername already fall back to a direct
-- profiles query when these RPCs 404, so this is a hardening fix, not a
-- currently-broken feature - the previous fallback path just isn't
-- case-insensitive/race-free the way these are.

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
ON public.profiles (LOWER(TRIM(username)))
WHERE username IS NOT NULL AND TRIM(username) <> '';

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
    IF v_clean IS NULL OR length(v_clean) < 3 OR length(v_clean) > 24 THEN
        RETURN false;
    END IF;
    RETURN NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE lower(trim(username)) = v_clean
    );
END;
$$;

REVOKE ALL ON FUNCTION public.check_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated, service_role;

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
    SELECT email INTO v_email FROM public.profiles WHERE lower(trim(username)) = v_clean LIMIT 1;
    RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.get_email_for_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_email_for_username(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
