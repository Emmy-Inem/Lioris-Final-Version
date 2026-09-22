-- Account email is changeable: keep the rest of the system in step when auth.users.email changes.
--
-- Why: school email addresses expire (graduation, deactivation). Accounts are keyed on
-- auth.users.id, not on the address, so changing the login email is safe as long as the places
-- that COPY the address follow it. Supabase Auth only updates auth.users.email once the new
-- address has been confirmed, so an UPDATE of that column is the trustworthy signal.
--
-- Apply AFTER supabase_security_hardening_2026.sql and supabase_launch_hardening_2026.sql.
-- Idempotent: safe to run more than once.
--
-- Dashboard settings this depends on (see docs/launch/supabase-dashboard-checklist.md):
--   * Authentication > Sign In / Providers > Email > "Secure email change" must be OFF.
--     With it ON the change needs a code from the OLD inbox as well, which is exactly the
--     inbox that no longer works for someone whose school email has been deactivated.
--   * The "Change Email Address" template must show {{ .Token }} (the app asks for a 6-digit code).

-- 1. profiles.email follows auth.users.email ---------------------------------------------------
-- Without this, `get_email_for_username` (sign in with @handle) keeps returning the OLD address
-- after a change, so username login would break, and the admin directory would show a stale email.
CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
    IF NEW.email IS NOT NULL AND NEW.email IS DISTINCT FROM OLD.email THEN
        UPDATE public.profiles
        SET email = NEW.email
        WHERE id = NEW.id
          AND email IS DISTINCT FROM NEW.email;
    END IF;
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.sync_profile_email_from_auth() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_changed_sync ON auth.users;
CREATE TRIGGER on_auth_user_email_changed_sync
    AFTER UPDATE OF email ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email_from_auth();

-- One-off repair for any row that already drifted (an admin changing an address by hand, etc.).
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id
  AND u.email IS NOT NULL
  AND p.email IS DISTINCT FROM u.email
  AND NOT EXISTS (SELECT 1 FROM public.profiles o WHERE o.email = u.email AND o.id <> p.id);

-- 2. Proving a school inbox later verifies the account ------------------------------------------
-- `auto_verify_institutional_email` only fires the first time an address is confirmed (sign-up).
-- Someone who signed up with a personal address and later moves to a confirmed institutional one
-- has proven exactly the same thing, so verify them too.
--
-- Deliberately one-way: moving AWAY from a school address later does NOT revoke the status. The
-- whole point of allowing an email change is that a graduate keeps their account and standing.
-- Only 'unverified' and 'pending' are promoted; a moderator's 'rejected' decision is not
-- overridden by an email change.
CREATE OR REPLACE FUNCTION public.auto_verify_on_email_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
    v_campus text;
    v_updated bigint;
BEGIN
    IF NEW.email IS NOT DISTINCT FROM OLD.email OR NEW.email_confirmed_at IS NULL THEN
        RETURN NEW;
    END IF;

    v_campus := public.campus_for_email(NEW.email);
    IF v_campus IS NULL THEN
        RETURN NEW;
    END IF;

    PERFORM set_config('lioris.audit_skip', 'verification_status,campus_code', true);
    UPDATE public.profiles
    SET verification_status = 'verified',
        campus_code = v_campus
    WHERE id = NEW.id
      AND role IN ('student', 'alumni')
      AND verification_status IN ('unverified', 'pending');
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    PERFORM set_config('lioris.audit_skip', '', true);

    IF v_updated > 0 THEN
        -- Close any document request still waiting in the moderators' queue: it is now moot, and
        -- a stale "pending" row that a reviewer later rejects would strip the status just earned.
        UPDATE public.verifications
        SET status = 'approved',
            reviewed_at = now()
        WHERE user_id = NEW.id
          AND status = 'pending';

        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
        VALUES (NULL, 'verification_auto_approved', 'profile', NEW.id,
                jsonb_build_object('method', 'institutional_email_change', 'campus', v_campus));
    END IF;

    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.auto_verify_on_email_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_changed_verify ON auth.users;
CREATE TRIGGER on_auth_user_email_changed_verify
    AFTER UPDATE OF email ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.auto_verify_on_email_change();
