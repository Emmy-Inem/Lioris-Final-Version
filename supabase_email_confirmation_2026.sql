-- Real email confirmation + automatic verification for institutional emails.
--
-- DO NOT APPLY until custom SMTP is configured in Supabase Auth and the confirmation
-- email template shows the 6-digit code ({{ .Token }}). Applying this without working
-- email delivery would stop every new signup from ever being able to sign in.
--
-- Before this migration email confirmation was disabled in three independent places:
--   1. BEFORE INSERT trigger on_auth_user_created_auto_confirm stamped email_confirmed_at
--      on every new user,
--   2. confirm_user_email(text) was SECURITY DEFINER and executable by anon, so anyone
--      could confirm any address, and
--   3. the client (register/login/verify-email) called that RPC as a fallback.
-- This migration removes (1) and (2); the app change removes (3).
--
-- New rule (server-side, not client-controlled):
--   * the user proves they own the inbox (OTP / link) -> email_confirmed_at is set
--   * if the confirmed address belongs to a launched institution's domain (exact or a
--     subdomain such as student.funaab.edu.ng) a student/alumni profile is auto-verified
--   * any other address (gmail, yahoo, ...) stays 'unverified' and must apply with a
--     document, exactly as before.

-- 1. Institution email domains live in the database (previously only in the client bundle).
ALTER TABLE public.campuses ADD COLUMN IF NOT EXISTS email_domains text[] NOT NULL DEFAULT '{}';

UPDATE public.campuses SET email_domains = CASE code
  WHEN 'UNILAG' THEN ARRAY['unilag.edu.ng']
  WHEN 'UI'     THEN ARRAY['ui.edu.ng']
  WHEN 'FUNAAB' THEN ARRAY['funaab.edu.ng', 'unaab.edu.ng']
  WHEN 'UNN'    THEN ARRAY['unn.edu.ng']
  WHEN 'OAU'    THEN ARRAY['oauife.edu.ng']
  WHEN 'CU'     THEN ARRAY['covenantuniversity.edu.ng']
  ELSE email_domains
END;

-- Exact domain or a real subdomain only. The old signup trigger used ILIKE '%ui.edu.ng',
-- which also matched hostile look-alikes such as 'notui.edu.ng'.
CREATE OR REPLACE FUNCTION public.campus_for_email(p_email text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.code
  FROM public.campuses c
  CROSS JOIN LATERAL unnest(c.email_domains) AS d(domain)
  WHERE c.is_active
    AND (
      lower(split_part(trim(p_email), '@', 2)) = d.domain
      OR right(lower(split_part(trim(p_email), '@', 2)), length(d.domain) + 1) = '.' || d.domain
    )
  ORDER BY length(d.domain) DESC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.campus_for_email(text) FROM PUBLIC, anon, authenticated;

-- 2. Profile creation: derive the campus from the email domain (server truth) before
--    falling back to what the client sent, and carry the chosen username across (the
--    client can no longer upsert the profile itself before it has a session).
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
    detected_campus TEXT;
BEGIN
    detected_campus := COALESCE(
        public.campus_for_email(NEW.email),
        NULLIF(NEW.raw_user_meta_data->>'campus_code', ''),
        'GLOBAL'
    );

    INSERT INTO profiles (
        id,
        email,
        full_name,
        role,
        campus_code,
        verification_status
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        CASE
            WHEN NEW.email = 'inememmanuel@gmail.com' THEN 'admin'::user_role_type
            WHEN NEW.raw_user_meta_data->>'role' = 'alumni' THEN 'alumni'::user_role_type
            ELSE 'student'::user_role_type
        END,
        detected_campus,
        CASE
            WHEN NEW.email = 'inememmanuel@gmail.com' THEN 'verified'::verification_status_type
            ELSE 'unverified'::verification_status_type
        END
    )
    ON CONFLICT (id) DO UPDATE SET
        role = CASE WHEN NEW.email = 'inememmanuel@gmail.com' THEN 'admin'::user_role_type ELSE profiles.role END,
        verification_status = CASE WHEN NEW.email = 'inememmanuel@gmail.com' THEN 'verified'::verification_status_type ELSE profiles.verification_status END;

    -- Best effort: a taken username must never make signup itself fail.
    BEGIN
        IF NULLIF(NEW.raw_user_meta_data->>'username', '') IS NOT NULL THEN
            UPDATE profiles SET username = NEW.raw_user_meta_data->>'username' WHERE id = NEW.id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN NEW;
END;
$function$;

-- 3. Auto-verify on confirmed institutional email.
CREATE OR REPLACE FUNCTION public.auto_verify_institutional_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
    v_campus text;
BEGIN
    -- Only the moment the address first becomes confirmed.
    IF OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL THEN
        RETURN NEW;
    END IF;

    v_campus := public.campus_for_email(NEW.email);
    IF v_campus IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE public.profiles
    SET verification_status = 'verified',
        campus_code = v_campus
    WHERE id = NEW.id
      AND role IN ('student', 'alumni')
      AND verification_status = 'unverified';

    IF FOUND THEN
        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
        VALUES (NULL, 'verification_auto_approved', 'profile', NEW.id,
                jsonb_build_object('method', 'institutional_email', 'campus', v_campus));
    END IF;

    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.auto_verify_institutional_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
    AFTER UPDATE OF email_confirmed_at ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.auto_verify_institutional_email();

-- The verification_status guard must let this nested, JWT-less server-side update through
-- (GoTrue confirms the email with no end-user JWT). Direct client updates still carry a
-- JWT (auth.uid() is set) or run at trigger depth 1, so they stay blocked.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_caller_role VARCHAR(50);
    v_caller_campus VARCHAR(50);
    v_self_submitting_for_review BOOLEAN;
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
        -- Role and campus code cannot be escalated by staff
        NEW.role := OLD.role;
        NEW.campus_code := OLD.campus_code;
        RETURN NEW;
    END IF;

    -- A user submitting their own verification request is allowed to move
    -- their own row from unverified/rejected to pending - this is not a
    -- privilege grant, just a "my documents are under review now" flag.
    -- Self-granting 'verified' (or any other transition) is still blocked
    -- below like every other protected column.
    v_self_submitting_for_review :=
        NEW.verification_status = 'pending'
        AND OLD.verification_status IN ('unverified', 'rejected');

    -- For regular users / self updates: prevent mutating role, verification, suspension, trust_score, campus_code
    IF (NEW.role IS DISTINCT FROM OLD.role)
       OR (NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NOT v_self_submitting_for_review)
       OR (NEW.is_suspended IS DISTINCT FROM OLD.is_suspended)
       OR (NEW.trust_score IS DISTINCT FROM OLD.trust_score)
       OR (NEW.campus_code IS DISTINCT FROM OLD.campus_code) THEN
        NEW.role := OLD.role;
        IF NOT v_self_submitting_for_review THEN
            NEW.verification_status := OLD.verification_status;
        END IF;
        NEW.is_suspended := OLD.is_suspended;
        NEW.trust_score := OLD.trust_score;
        NEW.campus_code := OLD.campus_code;
    END IF;
    RETURN NEW;
END;
$function$;

-- 4. Turn real confirmation on: stop stamping every new user as confirmed, and close the
--    public "confirm any address" function.
DROP TRIGGER IF EXISTS on_auth_user_created_auto_confirm ON auth.users;
DROP FUNCTION IF EXISTS public.handle_auto_confirm_user();

REVOKE EXECUTE ON FUNCTION public.confirm_user_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_user_email(text) TO service_role;
