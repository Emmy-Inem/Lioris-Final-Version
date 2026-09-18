-- ============================================================================
-- LIORIS - SECURITY HARDENING MIGRATION 2026
-- ============================================================================
-- Apply AFTER supabase_email_confirmation_2026.sql (it needs campus_for_email()).
-- Single, idempotent, transaction-safe script. Safe to re-run.
--
-- Section index (mirrors the hardening brief):
--   0  Preflight + shared helpers
--   1  platform_settings secrets: redact, restrict SELECT, block secret writes
--   2  URL scheme CHECK constraints (javascript:/data: XSS defence in depth)
--   3  profiles RLS: fix staff tautology + tighten escalation trigger
--   4  suspend_user_account() rewrite + profiles.suspension_reason
--   6  Auth rate-limit RPCs -> service_role only
--   7  Remove hard-coded admin backdoor, last-admin guard, consent on signup
--   8  audit_logs: append-only, non-forgeable, server-side audit triggers
--   9  Storage policies (owner-folder uploads, staff review, safe MIME types)
--   10 Realtime RLS for WebRTC signalling topics
--   11 Compliance: consent_records, export_my_data, purge_user_data,
--      list_expired_verification_documents (retention docs)
--   12 api_rate_limits + consume_rate_limit (edge function primitive)
--   5  SECURITY DEFINER hygiene pass (physically executed after all functions
--      exist, i.e. after section 12)
--   13 Misc: RLS on schema tables, NOTIFY
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 0. PREFLIGHT + SHARED HELPERS
-- ============================================================================
DO $do$
BEGIN
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.audit_logs') IS NULL
     OR to_regclass('public.platform_settings') IS NULL
     OR to_regclass('public.campuses') IS NULL THEN
    RAISE EXCEPTION 'Core tables missing (profiles/audit_logs/platform_settings/campuses). Apply supabase_schema.sql first.';
  END IF;
  IF to_regprocedure('public.campus_for_email(text)') IS NULL THEN
    RAISE EXCEPTION 'public.campus_for_email(text) missing. Apply supabase_email_confirmation_2026.sql first.';
  END IF;
END
$do$;

-- Optional column used by suspend_user_account() (section 4).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspension_reason text;

-- RLS-safe caller accessors (same bodies as before, now with pg_temp last so
-- a temp object can never shadow public objects).
CREATE OR REPLACE FUNCTION public.auth_profile_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.auth_profile_campus()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT campus_code FROM public.profiles WHERE id = auth.uid()
$$;

-- True when the caller's profile is suspended (RLS-safe, used by policies).
CREATE OR REPLACE FUNCTION public.auth_is_suspended()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT is_suspended FROM public.profiles WHERE id = auth.uid()), false)
$$;

-- Names of platform_settings keys that must never hold (or expose) secrets.
CREATE OR REPLACE FUNCTION public.is_secret_setting_key(p_key text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT p_key IN ('ai_service_keys', 'webrtc_keys')
      OR p_key ~* '(secret|token|passw|private|credential|api[_-]?key)'
      OR p_key ~* '_keys$'
$$;

-- These accessors are used inside policies evaluated for `authenticated`.
-- No policy applying to `anon` calls them, so anon loses EXECUTE.
REVOKE ALL ON FUNCTION public.auth_profile_role()   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auth_profile_campus() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auth_is_suspended()   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_profile_role()   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_profile_campus() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_is_suspended()   TO authenticated, service_role;

-- ============================================================================
-- SECTION 1. platform_settings SECRETS
-- ============================================================================
-- (a) Redact. The write-block trigger is dropped first so re-runs can redact.
DROP TRIGGER IF EXISTS trg_block_secret_settings ON public.platform_settings;

UPDATE public.platform_settings
   SET value = '{}'::jsonb,
       updated_at = now()
 WHERE public.is_secret_setting_key(key)
   AND value IS DISTINCT FROM '{}'::jsonb;

-- (b) SELECT policy: everyone authenticated reads only non-secret keys.
DROP POLICY IF EXISTS "Platform settings viewable by authenticated users" ON public.platform_settings;
DROP POLICY IF EXISTS "Platform settings viewable (non-secret keys)" ON public.platform_settings;
CREATE POLICY "Platform settings viewable (non-secret keys)"
  ON public.platform_settings FOR SELECT TO authenticated
  USING (NOT public.is_secret_setting_key(key));
-- The admin FOR ALL policy still lets admins SELECT every row, but secret rows
-- now only hold '{}'. Its WITH CHECK additionally refuses secret keys.
DROP POLICY IF EXISTS "Admins can manage platform settings" ON public.platform_settings;
CREATE POLICY "Admins can manage platform settings"
  ON public.platform_settings FOR ALL TO authenticated
  USING (public.auth_profile_role() = 'admin')
  WITH CHECK (public.auth_profile_role() = 'admin' AND NOT public.is_secret_setting_key(key));

-- (c) Nobody (admin, service_role included) may write secrets through this table.
CREATE OR REPLACE FUNCTION public.block_secret_platform_settings()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF public.is_secret_setting_key(NEW.key) THEN
    RAISE EXCEPTION 'platform_settings key "%" is reserved for secrets; store secrets in Edge Function secrets, not in the database', NEW.key
      USING ERRCODE = '42501';
  END IF;
  -- Defence in depth: refuse JSON payloads carrying secret-looking field names.
  IF NEW.value::text ~* '"[a-z0-9_-]*(secret|passw|private[_-]?key|api[_-]?key|access[_-]?token|auth[_-]?token)[a-z0-9_-]*"\s*:' THEN
    RAISE EXCEPTION 'platform_settings value for "%" contains secret-looking fields; refusing to store', NEW.key
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_block_secret_settings
  BEFORE INSERT OR UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.block_secret_platform_settings();

-- ============================================================================
-- SECTION 2. URL SCHEME CHECK CONSTRAINTS
-- ============================================================================
-- Rule: NULL or ^https?:// (case-insensitive); posts image/video also allow
-- the client's `asset:` scheme. Constraint is added NOT VALID (enforced for all
-- new/updated rows immediately). Nullable columns: offending existing values
-- are set to NULL, then the constraint is validated. NOT NULL columns
-- (jobs.apply_url, resources.file_url, portal_links.url) cannot be cleaned
-- automatically: the constraint stays NOT VALID if legacy bad rows exist
-- (a NOTICE is emitted; fix them by hand then run VALIDATE CONSTRAINT).
-- Missing tables/columns are skipped. notifications.action_url is NOT covered:
-- it holds in-app deep links (relative paths). verifications.*_url hold signed
-- URLs or storage paths and are owner/admin-only.
DO $do$
DECLARE
  r record;
  v_nullable boolean;
  v_regex text;
  v_con text;
  v_rel regclass;
  v_n bigint;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('jobs','apply_url',false),
      ('resources','file_url',false),
      ('resources','thumbnail_url',false),
      ('resources','cover_url',false),
      ('resources','preview_url',false),
      ('chat_messages','media_url',false),
      ('posts','image_url',true),
      ('posts','video_url',true),
      ('events','banner_url',false),
      ('events','virtual_link',false),
      ('marketplace_listings','image_url',false),
      ('profiles','avatar_url',false),
      ('profiles','banner_url',false),
      ('profiles','website',false),
      ('profiles','website_url',false),
      ('profiles','linkedin_url',false),
      ('profiles','github_url',false),
      ('profiles','twitter_url',false),
      ('profiles','portfolio_url',false),
      ('portal_links','url',false),
      ('announcements','link_url',false),
      ('announcements','action_url',false),
      ('announcements','url',false),
      ('announcements','image_url',false),
      ('campuses','logo_url',false),
      ('study_groups','meeting_link',false)
    ) AS t(tbl, col, allow_asset)
  LOOP
    v_rel := to_regclass(format('public.%I', r.tbl));
    IF v_rel IS NULL THEN CONTINUE; END IF;

    SELECT (c.is_nullable = 'YES') INTO v_nullable
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = r.tbl AND c.column_name = r.col;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_regex := CASE WHEN r.allow_asset THEN '^(https?://|asset:)' ELSE '^https?://' END;
    v_con := left(format('chk_%s_%s_url_scheme', r.tbl, r.col), 63);

    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = v_con AND conrelid = v_rel) THEN
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%I IS NULL OR %I ~* %L) NOT VALID',
                       r.tbl, v_con, r.col, r.col, v_regex);
      END IF;

      IF v_nullable THEN
        -- chat_messages has a guard trigger that rejects JWT-less updates; lift
        -- it only for this cleanup (rolled back automatically on failure).
        IF r.tbl = 'chat_messages' AND EXISTS (
             SELECT 1 FROM pg_trigger
              WHERE tgname = 'tr_restrict_chat_message_recipient_update' AND tgrelid = v_rel) THEN
          EXECUTE 'ALTER TABLE public.chat_messages DISABLE TRIGGER tr_restrict_chat_message_recipient_update';
          EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I IS NOT NULL AND %I !~* %L',
                         r.tbl, r.col, r.col, r.col, v_regex);
          GET DIAGNOSTICS v_n = ROW_COUNT;
          EXECUTE 'ALTER TABLE public.chat_messages ENABLE TRIGGER tr_restrict_chat_message_recipient_update';
        ELSE
          EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I IS NOT NULL AND %I !~* %L',
                         r.tbl, r.col, r.col, r.col, v_regex);
          GET DIAGNOSTICS v_n = ROW_COUNT;
        END IF;
        IF v_n > 0 THEN
          RAISE NOTICE 'Cleaned % non-http(s) value(s) in %.%', v_n, r.tbl, r.col;
        END IF;
      ELSE
        RAISE NOTICE '%.% is NOT NULL: legacy rows are not auto-cleaned (constraint enforced for new writes)', r.tbl, r.col;
      END IF;

      IF EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = v_con AND conrelid = v_rel AND NOT convalidated) THEN
        BEGIN
          EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', r.tbl, v_con);
        EXCEPTION WHEN check_violation THEN
          RAISE NOTICE 'Constraint % left NOT VALID: legacy rows still violate it (new writes are still checked)', v_con;
        END;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'URL constraint for %.% skipped: %', r.tbl, r.col, SQLERRM;
    END;
  END LOOP;
END
$do$;

-- ============================================================================
-- SECTION 3. profiles RLS
-- ============================================================================
-- The old staff policy compared campus_code = profiles.campus_code inside
-- FROM profiles (always true), so ANY staff could update ANY profile.
-- Staff may now update only student/alumni rows in their campus (or GLOBAL
-- scope rules), never admin/staff rows.
DROP POLICY IF EXISTS "Staff can update profiles for their campus" ON public.profiles;
CREATE POLICY "Staff can update profiles for their campus"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    public.auth_profile_role() = 'staff'
    AND role IN ('student', 'alumni')
    AND (
      campus_code = public.auth_profile_campus()
      OR public.auth_profile_campus() = 'GLOBAL'
      OR campus_code = 'GLOBAL'
    )
  )
  WITH CHECK (
    public.auth_profile_role() = 'staff'
    AND role IN ('student', 'alumni')
    AND (
      campus_code = public.auth_profile_campus()
      OR public.auth_profile_campus() = 'GLOBAL'
      OR campus_code = 'GLOBAL'
    )
  );

-- Escalation trigger: latest live version (email confirmation migration) plus
--  * trust_score revert for staff (regressed by later re-definitions),
--  * staff branch only for OTHER users with role student/alumni (a staff member
--    editing their own row, or an admin/staff row, is treated as a normal user),
--  * suspension_reason protected from non-privileged writers,
--  * pinned search_path.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_caller_role text;
    v_caller_campus text;
    v_self_submitting_for_review boolean;
BEGIN
    -- Nested, JWT-less server-side update (e.g. GoTrue email confirmation).
    IF auth.uid() IS NULL AND pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    SELECT role::text, campus_code INTO v_caller_role, v_caller_campus
    FROM public.profiles WHERE id = auth.uid();

    IF v_caller_role = 'admin' THEN
        RETURN NEW;
    END IF;

    IF v_caller_role = 'staff'
       AND auth.uid() <> OLD.id
       AND OLD.role::text IN ('student', 'alumni')
       AND (v_caller_campus = OLD.campus_code OR v_caller_campus = 'GLOBAL' OR OLD.campus_code = 'GLOBAL') THEN
        NEW.role := OLD.role;
        NEW.campus_code := OLD.campus_code;
        NEW.trust_score := OLD.trust_score;
        RETURN NEW;
    END IF;

    v_self_submitting_for_review :=
        NEW.verification_status = 'pending'
        AND OLD.verification_status IN ('unverified', 'rejected');

    IF (NEW.role IS DISTINCT FROM OLD.role)
       OR (NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NOT v_self_submitting_for_review)
       OR (NEW.is_suspended IS DISTINCT FROM OLD.is_suspended)
       OR (NEW.trust_score IS DISTINCT FROM OLD.trust_score)
       OR (NEW.campus_code IS DISTINCT FROM OLD.campus_code)
       OR (NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason) THEN
        NEW.role := OLD.role;
        IF NOT v_self_submitting_for_review THEN
            NEW.verification_status := OLD.verification_status;
        END IF;
        NEW.is_suspended := OLD.is_suspended;
        NEW.trust_score := OLD.trust_score;
        NEW.campus_code := OLD.campus_code;
        NEW.suspension_reason := OLD.suspension_reason;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER tr_prevent_profile_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- Un-suspending clears the stored reason.
CREATE OR REPLACE FUNCTION public.profile_clear_suspension_reason()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF COALESCE(OLD.is_suspended, false) AND NOT COALESCE(NEW.is_suspended, false) THEN
    NEW.suspension_reason := NULL;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_profile_clear_suspension_reason ON public.profiles;
CREATE TRIGGER trg_profile_clear_suspension_reason
  BEFORE UPDATE OF is_suspended ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profile_clear_suspension_reason();

-- ============================================================================
-- SECTION 4. suspend_user_account(uuid, text)
-- ============================================================================
-- Rules: authenticated caller (not suspended); cannot suspend yourself; staff
-- may suspend only student/alumni users on their own campus (or when the staff
-- member has GLOBAL scope); admins may suspend anyone but themselves, never
-- the last active admin. Stores the reason, writes an audit_logs row.
-- Same signature and jsonb {success,message} return shape as before.
-- (Unsuspend: the client does it as an admin direct profiles UPDATE, which the
-- admin RLS policy allows; the server-side audit trigger in section 8 records
-- it and trg_profile_clear_suspension_reason clears the reason. No RPC needed.)
CREATE OR REPLACE FUNCTION public.suspend_user_account(
  p_target_user_id uuid,
  p_reason text DEFAULT 'Moderation policy violation'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_caller_campus text;
  v_caller_suspended boolean;
  v_target_role text;
  v_target_campus text;
  v_target_suspended boolean;
  v_reason text;
  v_other_admins int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;
  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required.';
  END IF;
  IF v_caller = p_target_user_id THEN
    RAISE EXCEPTION 'You cannot suspend your own account.' USING ERRCODE = '42501';
  END IF;

  SELECT role::text, campus_code, COALESCE(is_suspended, false)
    INTO v_caller_role, v_caller_campus, v_caller_suspended
    FROM public.profiles WHERE id = v_caller;

  IF v_caller_role IS NULL OR v_caller_suspended THEN
    RAISE EXCEPTION 'Insufficient permissions to suspend user accounts.' USING ERRCODE = '42501';
  END IF;

  SELECT role::text, campus_code, COALESCE(is_suspended, false)
    INTO v_target_role, v_target_campus, v_target_suspended
    FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found.';
  END IF;

  IF v_caller_role = 'admin' THEN
    IF v_target_role = 'admin' AND NOT v_target_suspended THEN
      PERFORM pg_advisory_xact_lock(hashtext('lioris.last_active_admin'));
      SELECT count(*) INTO v_other_admins
        FROM public.profiles p
       WHERE p.id <> p_target_user_id AND p.role::text = 'admin' AND NOT COALESCE(p.is_suspended, false);
      IF v_other_admins = 0 THEN
        RAISE EXCEPTION 'Cannot suspend the last active administrator.' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF v_caller_role = 'staff' THEN
    IF v_target_role NOT IN ('student', 'alumni') THEN
      RAISE EXCEPTION 'Staff cannot suspend admin or staff accounts.' USING ERRCODE = '42501';
    END IF;
    IF NOT (v_target_campus = v_caller_campus OR v_caller_campus = 'GLOBAL') THEN
      RAISE EXCEPTION 'Staff cannot moderate users outside their registered campus node.' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Insufficient permissions to suspend user accounts.' USING ERRCODE = '42501';
  END IF;

  IF v_target_suspended THEN
    RETURN jsonb_build_object('success', true, 'message', 'User account is already suspended.');
  END IF;

  v_reason := left(COALESCE(NULLIF(btrim(p_reason), ''), 'Moderation policy violation'), 500);

  -- The generic profile audit trigger skips is_suspended for this statement so
  -- the explicit 'user_suspended' row below is the only entry.
  PERFORM set_config('lioris.audit_skip', 'is_suspended', true);
  UPDATE public.profiles
     SET is_suspended = true,
         suspension_reason = v_reason
   WHERE id = p_target_user_id;
  PERFORM set_config('lioris.audit_skip', '', true);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_caller, 'user_suspended', 'user', p_target_user_id,
          jsonb_build_object(
            'summary', 'Account suspended via suspend_user_account()',
            'reason', v_reason,
            'actorRole', v_caller_role,
            'targetRole', v_target_role,
            'targetCampus', v_target_campus,
            'source', 'suspend_user_account'));

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE WHEN v_caller_role = 'admin'
                    THEN 'User account permanently suspended by Admin.'
                    ELSE 'User account suspended by Campus Staff.' END);
END
$$;

REVOKE ALL ON FUNCTION public.suspend_user_account(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suspend_user_account(uuid, text) TO authenticated, service_role;

-- ============================================================================
-- SECTION 6. AUTH RATE-LIMIT RPCs -> service_role only
-- ============================================================================
-- They let any anonymous caller lock out any account (targeted lockout).
-- The table public.auth_rate_limits is left untouched.
DO $do$
BEGIN
  IF to_regprocedure('public.check_auth_rate_limit(text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.check_auth_rate_limit(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.check_auth_rate_limit(text) TO service_role;
  END IF;
  IF to_regprocedure('public.record_auth_attempt(text,boolean)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.record_auth_attempt(text, boolean) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.record_auth_attempt(text, boolean) TO service_role;
  END IF;
END
$do$;

-- ============================================================================
-- SECTION 7. ADMIN BACKDOOR REMOVAL, LAST-ADMIN GUARD, SIGNUP CONSENT
-- ============================================================================
-- handle_new_user_profile(): no email-based admin/verified elevation any more,
-- no ON CONFLICT elevation branch. Role is student, or alumni when the signup
-- metadata says so - NEVER admin/staff. Campus comes from the verified domain
-- map (campus_for_email) first; unknown metadata campus falls back to GLOBAL.
-- Also (section 11b) records consent from terms_version / terms_accepted_at /
-- age_confirmed_18 metadata; consent failures never block signup.
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

    -- Best effort: a taken username must never make signup itself fail.
    BEGIN
        IF NULLIF(NEW.raw_user_meta_data->>'username', '') IS NOT NULL THEN
            UPDATE public.profiles SET username = NEW.raw_user_meta_data->>'username' WHERE id = NEW.id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Consent record (section 11a table). Never blocks signup.
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- auto_verify_institutional_email(): unchanged behaviour (institutional domain
-- => verified + campus), but it tells the audit trigger (section 8) to skip
-- its own generic rows so only the existing 'verification_auto_approved'
-- entry is written.
CREATE OR REPLACE FUNCTION public.auto_verify_institutional_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
    v_campus text;
    v_updated bigint;
BEGIN
    IF OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL THEN
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
      AND verification_status = 'unverified';
    -- PERFORM below would overwrite FOUND, so capture the row count first.
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    PERFORM set_config('lioris.audit_skip', '', true);

    IF v_updated > 0 THEN
        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
        VALUES (NULL, 'verification_auto_approved', 'profile', NEW.id,
                jsonb_build_object('method', 'institutional_email', 'campus', v_campus));
    END IF;

    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.auto_verify_institutional_email() FROM PUBLIC, anon, authenticated;

-- Last-active-admin guard. Fires after tr_prevent_profile_role_escalation
-- (trigger names fire alphabetically). Raises when an UPDATE (demotion or
-- suspension) or DELETE would leave zero active admins. It applies to every
-- actor including service_role / JWT-less sessions: deleting the whole auth
-- user of the LAST active admin (cascade) is refused too; promote another admin
-- first. Deleting a non-last admin is allowed. Concurrency: advisory lock.
CREATE OR REPLACE FUNCTION public.guard_last_active_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_others int;
BEGIN
  IF OLD.role::text <> 'admin' OR COALESCE(OLD.is_suspended, false) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.role::text = 'admin' AND NOT COALESCE(NEW.is_suspended, false) THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lioris.last_active_admin'));
  SELECT count(*) INTO v_others
    FROM public.profiles p
   WHERE p.id <> OLD.id AND p.role::text = 'admin' AND NOT COALESCE(p.is_suspended, false);

  IF v_others = 0 THEN
    RAISE EXCEPTION 'Refusing to remove, demote or suspend the last active administrator.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_guard_last_admin_update ON public.profiles;
CREATE TRIGGER trg_guard_last_admin_update
  BEFORE UPDATE OF role, is_suspended ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role = 'admin' AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended))
  EXECUTE FUNCTION public.guard_last_active_admin();

DROP TRIGGER IF EXISTS trg_guard_last_admin_delete ON public.profiles;
CREATE TRIGGER trg_guard_last_admin_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role = 'admin')
  EXECUTE FUNCTION public.guard_last_active_admin();

-- ============================================================================
-- SECTION 8. audit_logs INTEGRITY
-- ============================================================================
-- (0) Make sure the actor FK is ON DELETE SET NULL (an FK that blocks or
--     cascades would either prevent user deletion or destroy audit rows).
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.confdeltype, c.confrelid::regclass::text AS ref
      FROM pg_constraint c
     WHERE c.conrelid = 'public.audit_logs'::regclass
       AND c.contype = 'f'
       AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a
                              WHERE a.attrelid = 'public.audit_logs'::regclass AND a.attname = 'actor_id')]::int2[]
  LOOP
    IF r.confdeltype <> 'n' THEN
      EXECUTE format('ALTER TABLE public.audit_logs DROP CONSTRAINT %I', r.conname);
      EXECUTE format('ALTER TABLE public.audit_logs ADD CONSTRAINT %I FOREIGN KEY (actor_id) REFERENCES %s(id) ON DELETE SET NULL',
                     r.conname, r.ref);
      RAISE NOTICE 'audit_logs.actor_id FK % recreated with ON DELETE SET NULL', r.conname;
    END IF;
  END LOOP;
END
$do$;

-- (a) Append-only. UPDATE/DELETE/TRUNCATE raise for everyone (service_role and
--     table owner included). Single exception: the FK's own SET NULL action
--     (nested trigger depth > 1, ONLY actor_id changing, ONLY to NULL) so that
--     deleting a user still works. To purge old logs deliberately, disable the
--     triggers explicitly in a maintenance session.
CREATE OR REPLACE FUNCTION public.audit_logs_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF pg_trigger_depth() > 1
       AND OLD.actor_id IS NOT NULL
       AND NEW.actor_id IS NULL
       AND (to_jsonb(NEW) - 'actor_id') = (to_jsonb(OLD) - 'actor_id') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only (% refused)', TG_OP USING ERRCODE = '42501';
END
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_block_mutation();

DROP TRIGGER IF EXISTS trg_audit_logs_no_truncate ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_no_truncate
  BEFORE TRUNCATE ON public.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_logs_block_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM PUBLIC, anon, authenticated;

-- (b) Insert hygiene: created_at is always server time; actorRole / actorName in
--     metadata always come from profiles for the row's actor.
CREATE OR REPLACE FUNCTION public.audit_logs_sanitize_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_name text;
BEGIN
  NEW.created_at := now();
  IF NEW.actor_id IS NOT NULL THEN
    SELECT p.role::text, p.full_name INTO v_role, v_name
      FROM public.profiles p WHERE p.id = NEW.actor_id;
    IF FOUND THEN
      IF NEW.metadata IS NULL THEN
        NEW.metadata := '{}'::jsonb;
      ELSIF jsonb_typeof(NEW.metadata) <> 'object' THEN
        NEW.metadata := jsonb_build_object('raw', NEW.metadata);
      END IF;
      NEW.metadata := NEW.metadata || jsonb_build_object('actorRole', v_role, 'actorName', v_name);
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_sanitize_insert ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_sanitize_insert
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_sanitize_insert();

-- INSERT policy: actor must be the caller, caller must be active admin/staff,
-- and action names written by server-side triggers/functions are reserved.
DROP POLICY IF EXISTS "Admins and staff can create audit log entries" ON public.audit_logs;
CREATE POLICY "Admins and staff can create audit log entries"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = actor_id
    AND public.auth_profile_role() IN ('admin', 'staff')
    AND NOT public.auth_is_suspended()
    AND action <> ALL (ARRAY[
      'profile_role_changed', 'profile_suspension_changed', 'profile_verification_changed',
      'profile_campus_changed', 'profile_deleted', 'data_export_requested',
      'user_data_purged', 'verification_auto_approved'
    ])
  );

-- (c) Authoritative server-side audit of privileged profile changes.
--     Recursion-safe: it only INSERTs into audit_logs (no profiles writes).
--     Skips fields listed in the transaction-local GUC lioris.audit_skip, set by
--     auto_verify_institutional_email() and suspend_user_account() which write
--     their own dedicated audit rows.
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_skip text[];
BEGIN
  IF v_actor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_actor) THEN
    v_actor := NULL;
  END IF;
  v_skip := string_to_array(COALESCE(current_setting('lioris.audit_skip', true), ''), ',');

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT ('role' = ANY (v_skip)) THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (v_actor, 'profile_role_changed', 'profile', NEW.id,
            jsonb_build_object('old', OLD.role::text, 'new', NEW.role::text, 'source', 'db_trigger'));
  END IF;

  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended AND NOT ('is_suspended' = ANY (v_skip)) THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (v_actor, 'profile_suspension_changed', 'profile', NEW.id,
            jsonb_build_object('old', COALESCE(OLD.is_suspended, false), 'new', COALESCE(NEW.is_suspended, false),
                               'reason', NEW.suspension_reason, 'source', 'db_trigger'));
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NOT ('verification_status' = ANY (v_skip)) THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (v_actor, 'profile_verification_changed', 'profile', NEW.id,
            jsonb_build_object('old', OLD.verification_status::text, 'new', NEW.verification_status::text, 'source', 'db_trigger'));
  END IF;

  IF NEW.campus_code IS DISTINCT FROM OLD.campus_code AND NOT ('campus_code' = ANY (v_skip)) THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (v_actor, 'profile_campus_changed', 'profile', NEW.id,
            jsonb_build_object('old', OLD.campus_code, 'new', NEW.campus_code, 'source', 'db_trigger'));
  END IF;

  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_zz_audit_profile_changes ON public.profiles;
CREATE TRIGGER trg_zz_audit_profile_changes
  AFTER UPDATE OF role, is_suspended, verification_status, campus_code ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role
        OR OLD.is_suspended IS DISTINCT FROM NEW.is_suspended
        OR OLD.verification_status IS DISTINCT FROM NEW.verification_status
        OR OLD.campus_code IS DISTINCT FROM NEW.campus_code)
  EXECUTE FUNCTION public.audit_profile_changes();

CREATE OR REPLACE FUNCTION public.audit_profile_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  -- The deleted profile may be the caller itself (FK would fail): store NULL.
  IF v_actor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_actor) THEN
    v_actor := NULL;
  END IF;
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_actor, 'profile_deleted', 'profile', OLD.id,
          jsonb_build_object('role', OLD.role::text, 'campus_code', OLD.campus_code,
                             'verification_status', OLD.verification_status::text,
                             'source', 'db_trigger'));
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_zz_audit_profile_deleted ON public.profiles;
CREATE TRIGGER trg_zz_audit_profile_deleted
  AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profile_deleted();

-- ============================================================================
-- SECTION 9. STORAGE POLICIES
-- ============================================================================
-- Helper: may the calling STAFF member view verification documents stored
-- under <owner-uid>/...? Same scope as the verifications table RLS: the owner
-- is a student/alumni on the staff member's own campus. Admin access stays in
-- the pre-existing policy. (src/api/verification.ts + ApprovalsModerationTab
-- show staff DO review verifications in the app.)
CREATE OR REPLACE FUNCTION public.staff_can_view_verification_doc(p_owner text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.auth_profile_role() = 'staff'
     AND p_owner IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id::text = p_owner
          AND p.role::text IN ('student', 'alumni')
          AND p.campus_code IS NOT NULL
          AND p.campus_code = public.auth_profile_campus())
$$;
REVOKE ALL ON FUNCTION public.staff_can_view_verification_doc(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_can_view_verification_doc(text) TO authenticated, service_role;

DO $do$
BEGIN
  -- Public buckets: uploads only into your own <uid>/ folder (admins exempt), and
  -- suspended users cannot upload. Public read is kept (app needs it).
  DROP POLICY IF EXISTS "Authenticated users can upload public storage objects" ON storage.objects;
  CREATE POLICY "Authenticated users can upload public storage objects" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id IN ('resources', 'avatars', 'campus-media')
      AND (
        public.auth_profile_role() = 'admin'
        OR ((storage.foldername(name))[1] = auth.uid()::text AND NOT public.auth_is_suspended())
      )
    );

  -- UPDATE (upsert overwrite): same owner-folder rule for the NEW row so an
  -- object cannot be moved into someone else's folder.
  DROP POLICY IF EXISTS "Users and admins can update public storage objects" ON storage.objects;
  CREATE POLICY "Users and admins can update public storage objects" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id IN ('resources', 'avatars', 'campus-media')
      AND (auth.uid()::text = (storage.foldername(name))[1] OR public.auth_profile_role() = 'admin')
    )
    WITH CHECK (
      bucket_id IN ('resources', 'avatars', 'campus-media')
      AND (
        public.auth_profile_role() = 'admin'
        OR ((storage.foldername(name))[1] = auth.uid()::text AND NOT public.auth_is_suspended())
      )
    );

  -- Verifications bucket stays private: owner + admin (existing policies) and,
  -- new, staff of the owner's campus (SELECT only).
  DROP POLICY IF EXISTS "Verifications viewable by campus staff" ON storage.objects;
  CREATE POLICY "Verifications viewable by campus staff" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'verifications'
      AND public.staff_can_view_verification_doc((storage.foldername(name))[1])
    );
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Not owner of storage.objects: storage policies NOT changed. Re-run this section as the postgres/owner role.';
END
$do$;

-- Bucket MIME allow-lists must not permit active content (HTML/SVG/JS). NULL
-- (= anything allowed) or wildcard lists are reset to the canonical lists from
-- supabase_schema.sql.
DO $do$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN RETURN; END IF;

  UPDATE storage.buckets b
     SET allowed_mime_types = CASE
           WHEN b.allowed_mime_types IS NULL
             OR EXISTS (SELECT 1 FROM unnest(b.allowed_mime_types) m WHERE m LIKE '%/*' OR m = '*')
           THEN CASE b.id
                  WHEN 'resources' THEN ARRAY['application/pdf','application/zip','application/x-zip-compressed','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','image/jpeg','image/png']
                  WHEN 'avatars' THEN ARRAY['image/jpeg','image/png','image/webp','image/gif']
                  ELSE ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']
                END
           ELSE ARRAY(
                  SELECT m FROM unnest(b.allowed_mime_types) m
                   WHERE m NOT IN ('text/html', 'application/xhtml+xml', 'image/svg+xml',
                                   'application/javascript', 'text/javascript', 'application/x-javascript',
                                   'text/xml', 'application/xml'))
         END
   WHERE b.id IN ('resources', 'avatars', 'campus-media');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Cannot update storage.buckets: MIME allow-lists NOT changed.';
END
$do$;

-- ============================================================================
-- SECTION 10. REALTIME RLS FOR WEBRTC SIGNALLING
-- ============================================================================
-- Client room name (src/api/calling.ts getCallRoomName): 'lioris-ui-' + the first
-- 16 alphanumerics of the conversation (= chat_channels.id without dashes);
-- src/api/webrtc.ts subscribes to topic 'webrtc:' + roomName (sanitised with
-- [^a-zA-Z0-9_-] -> '_', a no-op for that name). Only 16 hex chars survive, so the
-- policy cannot call is_channel_member(uuid); it matches the prefix against the
-- caller's own chat_channel_members rows instead (64 bits, collisions ~impossible).
-- The policies grant access ONLY to topics of that exact shape for members. They
-- grant nothing for other topics (so private channels elsewhere stay default-deny,
-- and postgres_changes - which never touches realtime.messages - is unaffected).
-- NOTE: RLS on realtime.messages is enforced only for PRIVATE channels: the
-- client must create the channel with { config: { private: true } }.
CREATE OR REPLACE FUNCTION public.can_access_webrtc_topic(p_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hex text;
BEGIN
  IF auth.uid() IS NULL OR p_topic IS NULL THEN RETURN false; END IF;
  v_hex := substring(p_topic from '^webrtc:lioris-ui-([0-9a-f]{16})$');
  IF v_hex IS NULL THEN RETURN false; END IF;
  IF public.auth_is_suspended() THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.chat_channel_members m
     WHERE m.user_id = auth.uid()
       AND left(replace(m.channel_id::text, '-', ''), 16) = v_hex);
END
$$;
REVOKE ALL ON FUNCTION public.can_access_webrtc_topic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_webrtc_topic(text) TO authenticated, service_role;

DO $do$
BEGIN
  IF to_regclass('realtime.messages') IS NULL OR to_regprocedure('realtime.topic()') IS NULL THEN
    RAISE NOTICE 'realtime.messages / realtime.topic() not available: skipping realtime policies';
    RETURN;
  END IF;

  BEGIN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not ALTER realtime.messages (not owner); assuming RLS is already enabled';
  END;

  EXECUTE 'DROP POLICY IF EXISTS "Lioris webrtc signalling: members can receive" ON realtime.messages';
  EXECUTE $p$CREATE POLICY "Lioris webrtc signalling: members can receive" ON realtime.messages
    FOR SELECT TO authenticated
    USING (realtime.messages.extension IN ('broadcast', 'presence')
           AND public.can_access_webrtc_topic((SELECT realtime.topic())))$p$;

  EXECUTE 'DROP POLICY IF EXISTS "Lioris webrtc signalling: members can send" ON realtime.messages';
  EXECUTE $p$CREATE POLICY "Lioris webrtc signalling: members can send" ON realtime.messages
    FOR INSERT TO authenticated
    WITH CHECK (realtime.messages.extension IN ('broadcast', 'presence')
                AND public.can_access_webrtc_topic((SELECT realtime.topic())))$p$;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Not allowed to create policies on realtime.messages; create them from the Supabase dashboard.';
END
$do$;

-- ============================================================================
-- SECTION 11. COMPLIANCE DATA MODEL
-- ============================================================================
-- (a) consent_records: append-only evidence of what each user accepted.
CREATE TABLE IF NOT EXISTS public.consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type text NOT NULL,
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  age_confirmed_18 boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'signup',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consent_records_user ON public.consent_records(user_id);

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own consent records" ON public.consent_records;
CREATE POLICY "Users can view own consent records"
  ON public.consent_records FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can record own consent" ON public.consent_records;
CREATE POLICY "Users can record own consent"
  ON public.consent_records FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all consent records" ON public.consent_records;
CREATE POLICY "Admins can view all consent records"
  ON public.consent_records FOR SELECT TO authenticated
  USING (public.auth_profile_role() = 'admin');

-- No UPDATE / DELETE policies exist; also drop the privileges.
REVOKE ALL ON public.consent_records FROM PUBLIC, anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.consent_records FROM authenticated;
GRANT SELECT, INSERT ON public.consent_records TO authenticated;
GRANT ALL ON public.consent_records TO service_role;

-- (b) Signup consent capture lives in handle_new_user_profile() (section 7) so
--     there is a single definition of that trigger function.

-- (c) export_my_data(): everything that belongs to the caller.
--     Tables/columns are discovered from foreign keys pointing at profiles /
--     auth.users, so tables added later are covered too:
--       * every ON DELETE CASCADE ownership column (posts.author_id, ...),
--         except user_blocks.blocked_id (other people's blocks against you);
--       * plus moderation_queue.reporter_id, forum_communities.created_by,
--         chat_channels.created_by (SET NULL ownership columns).
--     Never included: rows only linked via reviewed_by/approved_by/sender_id
--     etc. (other people's data), verification document URLs, internal
--     support_tickets.admin_notes, chat messages written by other people.
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_data jsonb := '{}'::jsonb;
  v_truncated jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_where text;
  v_strip text[];
  v_cnt bigint;
  r record;
  c_cap constant int := 20000;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  FOR r IN
    SELECT cl.relname::text AS tbl,
           array_agg(DISTINCT a.attname::text ORDER BY a.attname::text) AS cols
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid AND cl.relkind = 'r'
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND array_length(c.conkey, 1) = 1
       AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
       AND cl.relname <> 'audit_logs'
       AND (
            (c.confdeltype = 'c' AND NOT (cl.relname = 'user_blocks' AND a.attname = 'blocked_id'))
         OR (cl.relname = 'moderation_queue' AND a.attname = 'reporter_id')
         OR (cl.relname = 'forum_communities' AND a.attname = 'created_by')
         OR (cl.relname = 'chat_channels' AND a.attname = 'created_by')
       )
     GROUP BY cl.relname
     ORDER BY cl.relname
  LOOP
    SELECT string_agg(format('%I = $1', col), ' OR ') INTO v_where FROM unnest(r.cols) AS col;
    v_strip := CASE r.tbl
      WHEN 'verifications' THEN ARRAY['id_card_front_url', 'id_card_back_url', 'selfie_url', 'reviewed_by']
      WHEN 'support_tickets' THEN ARRAY['admin_notes', 'resolved_by']
      ELSE ARRAY[]::text[]
    END;

    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', r.tbl, v_where) INTO v_cnt USING v_uid;
    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t) - $2), ''[]''::jsonb) FROM (SELECT * FROM public.%I WHERE %s LIMIT %s) t',
      r.tbl, v_where, c_cap)
      INTO v_rows USING v_uid, v_strip;

    v_data := v_data || jsonb_build_object(r.tbl, v_rows);
    IF v_cnt > c_cap THEN
      v_truncated := v_truncated || jsonb_build_object(r.tbl, v_cnt);
    END IF;
  END LOOP;

  -- Actions the user performed (admin/staff) and actions taken on the account.
  v_data := v_data || jsonb_build_object(
    'audit_logs_performed_by_you',
    COALESCE((SELECT jsonb_agg(jsonb_build_object('action', a.action, 'entity_type', a.entity_type,
                                                  'entity_id', a.entity_id, 'created_at', a.created_at)
                               ORDER BY a.created_at DESC)
                FROM (SELECT * FROM public.audit_logs WHERE actor_id = v_uid
                       ORDER BY created_at DESC LIMIT 5000) a), '[]'::jsonb),
    'audit_logs_about_your_account',
    COALESCE((SELECT jsonb_agg(jsonb_build_object('action', a.action, 'created_at', a.created_at)
                               ORDER BY a.created_at DESC)
                FROM (SELECT * FROM public.audit_logs
                       WHERE entity_id = v_uid AND actor_id IS DISTINCT FROM v_uid
                       ORDER BY created_at DESC LIMIT 5000) a), '[]'::jsonb)
  );

  -- Uploaded files: metadata only (paths, sizes), never content.
  BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
      EXECUTE $q$
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'bucket', o.bucket_id, 'path', o.name,
                 'size_bytes', o.metadata->>'size', 'mime_type', o.metadata->>'mimetype',
                 'created_at', o.created_at)), '[]'::jsonb)
          FROM (SELECT * FROM storage.objects
                 WHERE (storage.foldername(name))[1] = $1::text LIMIT 20000) o
      $q$ INTO v_rows USING v_uid;
      v_data := v_data || jsonb_build_object('storage_objects', v_rows);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_data := v_data || jsonb_build_object('storage_objects', '[]'::jsonb);
  END;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'data_export_requested', 'user', v_uid,
          jsonb_build_object('summary', 'User exported their personal data', 'source', 'export_my_data'));

  RETURN jsonb_build_object(
    'schema_version', 1,
    'exported_at', now(),
    'user_id', v_uid,
    'data', v_data,
    'truncated_tables', v_truncated
  );
END
$$;

REVOKE ALL ON FUNCTION public.export_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;

-- (d) purge_user_data(): erasure of everything owned by a user (service_role
--     only; called by the delete-account Edge Function).
--     Recommended edge function order: 1) purge_user_data(uid)  2) delete storage
--     objects under '<uid>/' in every bucket via the Storage API (this function
--     never touches storage.objects, SQL deletes would orphan the blobs)
--     3) auth.admin.deleteUser(uid) (cascades the anonymised profile row).
--     * ON DELETE CASCADE ownership rows are hard-deleted (posts, comments, chat
--       messages, events, resources, verifications, notifications, ...).
--     * ON DELETE SET NULL references (reporter_id, sender_id, created_by,
--       reviewed_by, ...) are anonymised (set NULL) so other people's records survive.
--     * audit_logs rows are kept (append-only); deleting the profile later
--       nulls actor_id through the FK action, which the append-only trigger allows.
--     * The profile row itself is anonymised here (PII removed) and removed by
--       deleteUser. Admin accounts cannot be purged (demote first).
CREATE OR REPLACE FUNCTION public.purge_user_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_n bigint;
  v_role text;
  v_email text;
  v_deleted jsonb := '{}'::jsonb;
  v_anonymised jsonb := '{}'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_sets text[] := ARRAY[]::text[];
  v_col text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required.';
  END IF;

  SELECT role::text, email INTO v_role, v_email FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('user_id', p_user_id, 'profile_found', false,
                              'deleted', v_deleted, 'anonymised', v_anonymised,
                              'storage_prefix', p_user_id::text || '/');
  END IF;
  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Admin accounts cannot be purged; demote the account first.' USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT DISTINCT cl.relname::text AS tbl, a.attname::text AS col, c.confdeltype AS del
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid AND cl.relkind = 'r'
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND array_length(c.conkey, 1) = 1
       AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
       AND cl.relname NOT IN ('audit_logs', 'profiles')
     ORDER BY 1, 2
  LOOP
    IF r.del = 'c' THEN
      EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.tbl, r.col) USING p_user_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_deleted := v_deleted || jsonb_build_object(r.tbl || '.' || r.col, v_n); END IF;
    ELSIF r.del = 'n' THEN
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I = $1', r.tbl, r.col, r.col) USING p_user_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_anonymised := v_anonymised || jsonb_build_object(r.tbl || '.' || r.col, v_n); END IF;
    ELSE
      v_skipped := v_skipped || to_jsonb(r.tbl || '.' || r.col);
    END IF;
  END LOOP;

  -- Rows keyed by e-mail instead of user id.
  IF v_email IS NOT NULL THEN
    IF to_regclass('public.waitlist_entries') IS NOT NULL THEN
      DELETE FROM public.waitlist_entries WHERE lower(email) = lower(v_email);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_deleted := v_deleted || jsonb_build_object('waitlist_entries.email', v_n); END IF;
    END IF;
    IF to_regclass('public.auth_rate_limits') IS NOT NULL THEN
      DELETE FROM public.auth_rate_limits WHERE identifier = lower(btrim(v_email));
    END IF;
  END IF;

  -- Anonymise the profile row (removed for good by auth.admin.deleteUser).
  FOR v_col IN
    SELECT c.column_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = 'profiles' AND c.is_nullable = 'YES'
       AND c.column_name = ANY (ARRAY['username', 'bio', 'avatar_url', 'banner_url', 'student_id_number',
                                      'push_token', 'department', 'faculty', 'level', 'matric_number',
                                      'phone', 'phone_number', 'website', 'website_url', 'linkedin_url',
                                      'github_url', 'twitter_url', 'portfolio_url'])
  LOOP
    v_sets := v_sets || format('%I = NULL', v_col);
  END LOOP;
  EXECUTE format(
    'UPDATE public.profiles SET email = %L, full_name = %L, interests = ''{}''%s WHERE id = $1',
    'deleted+' || p_user_id::text || '@deleted.invalid', 'Deleted user',
    CASE WHEN array_length(v_sets, 1) IS NULL THEN '' ELSE ', ' || array_to_string(v_sets, ', ') END)
    USING p_user_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (NULL, 'user_data_purged', 'user', p_user_id,
          jsonb_build_object('deleted', v_deleted, 'anonymised', v_anonymised, 'source', 'purge_user_data'));

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'profile_found', true,
    'purged_at', now(),
    'deleted', v_deleted,
    'anonymised', v_anonymised,
    'skipped_restrictive_fks', v_skipped,
    'profile_anonymised', true,
    'storage_prefix', p_user_id::text || '/',
    'note', 'Storage objects are NOT touched; delete them via the Storage API, then call auth.admin.deleteUser.'
  );
END
$$;

REVOKE ALL ON FUNCTION public.purge_user_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_user_data(uuid) TO service_role;

-- (e) Retention. RECOMMENDED POLICY: verification documents (bucket
--     'verifications': ID cards, selfies) are deleted 30 days after the FINAL
--     decision (verifications.status approved/rejected + reviewed_at). A scheduled
--     Edge Function calls list_expired_verification_documents(30) with the
--     service role and removes each returned path through the Storage API (never
--     by SQL). Also returned: objects whose owner profile no longer exists
--     (orphans after account deletion) once older than p_days. Users with a
--     newer pending request are not affected (matching is per request id, the
--     upload path is '<uid>/<verification id>.<ext>'). Other suggested retention:
--     Rate-limit rows: call cleanup_api_rate_limits() from a scheduled job.
CREATE OR REPLACE FUNCTION public.list_expired_verification_documents(p_days int DEFAULT 30)
RETURNS TABLE (bucket text, path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT o.bucket_id::text, o.name::text
    FROM storage.objects o
   WHERE o.bucket_id = 'verifications'
     AND (storage.foldername(o.name))[1] IS NOT NULL
     AND (
       EXISTS (
         SELECT 1 FROM public.verifications v
          WHERE v.user_id::text = (storage.foldername(o.name))[1]
            AND split_part(storage.filename(o.name), '.', 1) = v.id::text
            AND v.status IN ('approved', 'rejected')
            AND v.reviewed_at IS NOT NULL
            AND v.reviewed_at < now() - make_interval(days => GREATEST(COALESCE(p_days, 30), 1))
       )
       OR (
         NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id::text = (storage.foldername(o.name))[1])
         AND o.created_at < now() - make_interval(days => GREATEST(COALESCE(p_days, 30), 1))
       )
     )
   ORDER BY o.created_at
$$;

REVOKE ALL ON FUNCTION public.list_expired_verification_documents(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_expired_verification_documents(int) TO service_role;

-- ============================================================================
-- SECTION 12. RATE-LIMIT PRIMITIVE FOR EDGE FUNCTIONS
-- ============================================================================
-- Interface contract: public.api_rate_limits(key, window_start, count) and
-- public.consume_rate_limit(p_key text, p_limit int, p_window_seconds int) -> boolean
-- (true = within limit / allowed, false = limit exceeded), service_role only.
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count int NOT NULL
);
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;  -- no policies on purpose
REVOKE ALL ON public.api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_key text, p_limit int, p_window_seconds int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' OR length(p_key) > 256 THEN
    RAISE EXCEPTION 'invalid rate limit key';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'p_window_seconds must be positive';
  END IF;
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RETURN false;
  END IF;

  -- Atomic: insert the first hit, or bump the counter, or reset an expired window.
  INSERT INTO public.api_rate_limits AS r (key, window_start, count)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE
    SET window_start = CASE WHEN r.window_start + make_interval(secs => p_window_seconds) <= now()
                            THEN now() ELSE r.window_start END,
        count        = CASE WHEN r.window_start + make_interval(secs => p_window_seconds) <= now()
                            THEN 1 ELSE r.count + 1 END
  RETURNING r.count INTO v_count;

  RETURN v_count <= p_limit;
END
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, int, int) TO service_role;

-- Cleanup helper: removes rows whose window started more than p_older_than_seconds
-- ago (default 1 day; must exceed the longest window you use). Returns rows removed.
CREATE OR REPLACE FUNCTION public.cleanup_api_rate_limits(p_older_than_seconds int DEFAULT 86400)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n bigint;
BEGIN
  DELETE FROM public.api_rate_limits
   WHERE window_start < now() - make_interval(secs => GREATEST(COALESCE(p_older_than_seconds, 86400), 60));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;

REVOKE ALL ON FUNCTION public.cleanup_api_rate_limits(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_api_rate_limits(int) TO service_role;

-- ============================================================================
-- SECTION 5. SECURITY DEFINER HYGIENE PASS (runs after every function exists)
-- ============================================================================
-- For every SECURITY DEFINER function in schema public (extension members
-- excluded):
--   * search_path is pinned, and pg_temp is appended when missing so temp
--     objects can never shadow public ones;
--   * EXECUTE is revoked from PUBLIC and anon (authenticated / service_role
--     grants are left as they are; trigger functions also lose authenticated,
--     they never need EXECUTE to fire).
-- Deliberate exceptions are handled per function above (service_role-only RPCs).
DO $do$
DECLARE
  r record;
  v_cfg text;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure::text AS sig, p.proconfig, (p.prorettype = 'trigger'::regtype) AS is_trigger
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
     WHERE p.prosecdef
       AND p.prokind = 'f'
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    BEGIN
      SELECT substring(c FROM 13) INTO v_cfg
        FROM unnest(COALESCE(r.proconfig, ARRAY[]::text[])) AS c
       WHERE c LIKE 'search_path=%' LIMIT 1;

      IF v_cfg IS NULL THEN
        EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
      ELSIF v_cfg !~ 'pg_temp' THEN
        EXECUTE format('ALTER FUNCTION %s SET search_path = %s, pg_temp', r.sig, v_cfg);
      END IF;

      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
      IF r.is_trigger THEN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'SECURITY DEFINER hygiene skipped for %: %', r.sig, SQLERRM;
    END;
  END LOOP;
END
$do$;

-- ============================================================================
-- SECTION 13. MISC
-- ============================================================================
-- Enable RLS on tables created by the schema files that somehow lack it.
-- Other public tables without RLS (e.g. legacy leftovers) are only reported.
DO $do$
DECLARE
  r record;
  v_known constant text[] := ARRAY[
    'campuses', 'profiles', 'user_blocks', 'posts', 'post_likes', 'post_comments',
    'forum_communities', 'events', 'event_attendees', 'resources', 'verifications',
    'moderation_queue', 'audit_logs', 'study_groups', 'study_group_members',
    'chat_channels', 'chat_channel_members', 'chat_messages', 'notifications',
    'connections', 'mentorships', 'marketplace_listings', 'announcements',
    'waitlist_entries', 'platform_settings', 'portal_links', 'auth_rate_limits',
    'jobs', 'support_tickets', 'chat_channel_archives', 'consent_records', 'api_rate_limits'
  ];
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity LOOP
    IF r.tablename = ANY (v_known) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
      RAISE NOTICE 'Enabled RLS on public.%', r.tablename;
    ELSE
      RAISE WARNING 'public.% has RLS disabled and is not created by the schema files: review manually', r.tablename;
    END IF;
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';

COMMIT;
