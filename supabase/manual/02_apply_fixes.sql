-- ============================================================================
-- LIORIS - 02 APPLY FIXES (run once, after 01_diagnostics_before.sql)
-- = migrations 20261028000000, 20261029000000, 20261030000000 in order.
-- Each part is its own transaction and is safe to re-run. Run the whole file.
-- The 2FA requirement stays OFF until you turn it on (see the last section of README.md).
-- ============================================================================

-- ########## 20261028000000_audit_remediation.sql ##########
-- ============================================================================
-- LIORIS - PLATFORM AUDIT REMEDIATION (2026-10-28)
-- ============================================================================
-- Closes the database-level holes found in the 2026-10-15 platform audit
-- (docs/audit/2026-10-15-platform-audit.md). Every statement is idempotent.
--
-- READ BEFORE APPLYING
--   1. Run supabase/diagnostics/audit_live_state.sql first and keep its output.
--   2. Make sure every platform-wide administrator has profiles.admin_role =
--      'super_admin'. After this migration only that value (or the root account)
--      has cross-campus power; an admin with a NULL admin_role becomes a Campus
--      Admin. The migration prints a NOTICE listing every admin it sees.
--   3. Deploy the `login-with-username` edge function BEFORE (or together with)
--      this migration - get_email_for_username() is no longer callable by the
--      public key, so username sign-in goes through that function instead.
--
-- WHAT THIS FIXES (numbers match the audit report)
--   C1  profiles: whole-table SELECT was re-granted to anon and authenticated by
--       20261023000000, exposing email / student_id_number / push_token to anyone
--       holding the public key (directory_discoverable defaults to TRUE).
--   C2  is_super_admin() returned TRUE for every role='admin' account, so every
--       Campus Admin was a Super Admin inside RLS; "Admins have full profile
--       access" let a Campus Admin edit or DELETE users on any campus.
--   C3  storage: any verified member of ANY campus (and nobody unverified) could
--       read every object in the `resources` bucket - cross-campus leak, and
--       GLOBAL resources could not be downloaded by unverified students.
--   C4  get_email_for_username() handed the e-mail of any @handle to anon.
--   H1  profile self-update: verified users could change campus; is_bot and email
--       were self-editable and both feed is_profile_verified().
--   H2  admin_get_user_profiles() returned every campus to staff and to admins
--       with a NULL admin_role (and labelled them super_admin).
--   H3  verifications: a student could INSERT a row already 'approved' for any
--       campus; reviews wrote request + profile non-atomically; any admin could
--       review any campus.
--   H4  campuses: any admin could rewrite campuses (domains drive auto-verify).
--   H5  Role Permission toggles were never enforced anywhere.
--   M*  resources INSERT/SELECT/ALL scoping, events/audit_logs admin scoping,
--       ambassador scope bypass for campus-less callers, download-counter abuse.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Sanity: required objects
-- ----------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.profiles') IS NULL OR to_regclass('public.verifications') IS NULL
     OR to_regclass('public.resources') IS NULL OR to_regclass('public.campuses') IS NULL THEN
    RAISE EXCEPTION 'Dependency missing: apply the base schema and earlier migrations first.';
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 1. ONE definition of "super admin" and campus-scoped authority
-- ----------------------------------------------------------------------------
-- auth_is_super_admin(): role = admin AND admin_role = super_admin, or the root
-- account (kept as a bootstrap so the owner can never be locked out).
-- admin_aal2_ok(): hook for the OPTIONAL two-factor requirement (migration 20261030000000 replaces this body).
-- Created only if absent, so re-running this file never undoes that migration. Permissive until then.
DO $mfa$
BEGIN
  IF to_regprocedure('public.admin_aal2_ok()') IS NULL THEN
    EXECUTE $f$
      CREATE FUNCTION public.admin_aal2_ok() RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
      AS 'SELECT true'
    $f$;
    REVOKE ALL ON FUNCTION public.admin_aal2_ok() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.admin_aal2_ok() TO authenticated, service_role;
  END IF;
END
$mfa$;

CREATE OR REPLACE FUNCTION public.auth_is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (
    COALESCE((
      SELECT (p.role::text = 'admin' AND p.admin_role = 'super_admin')
          OR LOWER(COALESCE(p.email, '')) = 'inememmanuel@gmail.com'
      FROM public.profiles p
      WHERE p.id = auth.uid()
    ), false)
    OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'inememmanuel@gmail.com'
  ) AND public.admin_aal2_ok();
$$;

-- is_super_admin() used to be a second, LOOSER definition (role = 'admin'). Both
-- names now mean exactly the same thing.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.auth_is_super_admin(); $$;

REVOKE ALL ON FUNCTION public.auth_is_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_super_admin() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, anon, service_role;

-- can_admin_campus(campus): may the caller moderate rows that belong to `campus`?
--   * Super Admin: every campus.
--   * Campus Admin / staff: ONLY their own, real campus (never GLOBAL, never NULL),
--     and only while not suspended. A campus-less or GLOBAL admin has no campus
--     authority at all instead of silently having all of it.
CREATE OR REPLACE FUNCTION public.can_admin_campus(p_campus text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.auth_is_super_admin()
      OR (
        COALESCE((
          SELECT p.role::text IN ('admin', 'staff')
             AND p.campus_code IS NOT NULL
             AND p.campus_code <> 'GLOBAL'
             AND p_campus IS NOT NULL
             AND p.campus_code = p_campus
             AND NOT COALESCE(p.is_suspended, false)
          FROM public.profiles p
          WHERE p.id = auth.uid()
        ), false)
        AND public.admin_aal2_ok()
      );
$$;

REVOKE ALL ON FUNCTION public.can_admin_campus(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_admin_campus(text) TO authenticated, service_role;

-- has_role_permission(key): reads the Super Admin's Role Permissions matrix so the
-- toggles finally do something. Super Admin is always allowed; a missing row means
-- "allowed" (fail open for keys nobody configured) but a row set to false denies.
CREATE OR REPLACE FUNCTION public.has_role_permission(p_key text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role    text;
  v_system  text;
  v_enabled boolean;
BEGIN
  IF auth.role() = 'service_role' THEN RETURN true; END IF;
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF public.auth_is_super_admin() THEN RETURN true; END IF;

  SELECT p.role::text INTO v_role FROM public.profiles p WHERE p.id = auth.uid();
  IF v_role IS NULL THEN RETURN false; END IF;

  v_system := CASE v_role
                WHEN 'admin' THEN 'campus_admin'
                WHEN 'staff' THEN 'staff'
                WHEN 'alumni' THEN 'alumni'
                ELSE 'student'
              END;

  IF to_regclass('public.role_permissions') IS NULL THEN RETURN true; END IF;
  SELECT rp.enabled INTO v_enabled
  FROM public.role_permissions rp
  WHERE rp.role = v_system AND rp.permission_key = p_key;
  RETURN COALESCE(v_enabled, true);
END;
$$;

REVOKE ALL ON FUNCTION public.has_role_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role_permission(text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Admin roster normalisation (no admin without an explicit tier)
-- ----------------------------------------------------------------------------
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id, email, campus_code, admin_role FROM public.profiles WHERE role::text = 'admin' ORDER BY created_at
  LOOP
    RAISE NOTICE 'ADMIN ROSTER: % | campus=% | admin_role=%', COALESCE(r.email, r.id::text), COALESCE(r.campus_code, '(none)'), COALESCE(r.admin_role, '(NULL -> becomes campus_admin)');
  END LOOP;
END
$do$;

-- The root account is always a Super Admin.
UPDATE public.profiles
SET role = 'admin', admin_role = 'super_admin'
WHERE LOWER(COALESCE(email, '')) = 'inememmanuel@gmail.com'
  AND (role::text IS DISTINCT FROM 'admin' OR admin_role IS DISTINCT FROM 'super_admin');

UPDATE public.profiles
SET admin_role = 'campus_admin'
WHERE role::text = 'admin' AND admin_role IS NULL
  AND LOWER(COALESCE(email, '')) <> 'inememmanuel@gmail.com';

CREATE OR REPLACE FUNCTION public.normalise_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role::text = 'admin' THEN
    IF NEW.admin_role IS NULL THEN NEW.admin_role := 'campus_admin'; END IF;
  ELSE
    NEW.admin_role := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_normalise_admin_role ON public.profiles;
CREATE TRIGGER trg_profiles_normalise_admin_role
  BEFORE INSERT OR UPDATE OF role, admin_role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalise_admin_role();

-- ----------------------------------------------------------------------------
-- 3. profiles: privacy (grants), RLS, and the self-update guard
-- ----------------------------------------------------------------------------
-- 3a. Column privacy. 20260929 revoked the sensitive columns; 20261023 re-opened
--     the whole table "to fix 42501 errors". The errors came from two RLS policies
--     and six client queries reading profiles.email - those are fixed below / in the
--     app, so the privacy boundary can be restored properly.
REVOKE ALL ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM authenticated;

DO $do$
DECLARE
  v_auth_candidates text[] := ARRAY[
    'id','full_name','username','role','campus_code','department','faculty','level','bio','interests',
    'avatar_url','banner_url','verification_status','custom_accent_color','trust_score','is_suspended',
    'onboarding_complete','is_bot','created_at','updated_at','admin_role','is_campus_ambassador',
    'graduation_year','industry','company','job_title','location','linkedin_url','resume_url',
    'directory_discoverable','directory_hide_company','directory_hide_location','directory_hide_job_title'
  ];
  v_anon_candidates text[] := ARRAY[
    'id','full_name','username','role','campus_code','department','faculty','level','avatar_url',
    'verification_status','created_at'
  ];
  v_cols text[];
BEGIN
  SELECT array_agg(quote_ident(column_name) ORDER BY column_name) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = ANY (v_auth_candidates);
  IF v_cols IS NULL THEN RAISE EXCEPTION 'profiles: no expected columns found'; END IF;
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', array_to_string(v_cols, ', '));

  SELECT array_agg(quote_ident(column_name) ORDER BY column_name) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = ANY (v_anon_candidates);
  IF v_cols IS NOT NULL THEN
    EXECUTE format('GRANT SELECT (%s) ON public.profiles TO anon', array_to_string(v_cols, ', '));
  END IF;
END
$do$;

-- public_profiles has no row filter and is owned by the table owner, so granting it
-- bypassed both RLS and the column privacy above. Nothing in the app reads it.
DO $do$
BEGIN
  IF to_regclass('public.public_profiles') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.public_profiles FROM anon, authenticated';
    EXECUTE 'GRANT SELECT ON public.public_profiles TO service_role';
  END IF;
END
$do$;

-- 3b. Row policies
DROP POLICY IF EXISTS "Profiles viewable by same campus or global or self or admin" ON public.profiles;
CREATE POLICY "Profiles viewable by same campus or global or self or admin" ON public.profiles
  FOR SELECT TO authenticated USING (
    auth.uid() = id
    OR public.auth_is_super_admin()
    OR campus_code = 'GLOBAL'
    OR campus_code = public.auth_profile_campus()
  );

-- Anonymous visitors: only the public face (name / avatar / department) of members who
-- belong to no campus. The old rule also exposed everyone with directory_discoverable
-- (default TRUE), i.e. everyone.
DROP POLICY IF EXISTS "Public profiles viewable by anon" ON public.profiles;
CREATE POLICY "Public profiles viewable by anon" ON public.profiles
  FOR SELECT TO anon USING (campus_code = 'GLOBAL');

-- "Admins have full profile access" was FOR ALL on role='admin': a Campus Admin could
-- read, edit and DELETE any user on any campus through the REST API.
DROP POLICY IF EXISTS "Admins have full profile access" ON public.profiles;
DROP POLICY IF EXISTS "Super admins manage all profiles" ON public.profiles;
CREATE POLICY "Super admins manage all profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.auth_is_super_admin())
  WITH CHECK (public.auth_is_super_admin());

DROP POLICY IF EXISTS "Staff can update profiles for their campus" ON public.profiles;
DROP POLICY IF EXISTS "Campus staff and admins update own-campus members" ON public.profiles;
CREATE POLICY "Campus staff and admins update own-campus members" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.can_admin_campus(campus_code)
    AND (role::text IN ('student', 'alumni') OR (role::text = 'staff' AND public.auth_profile_role() = 'admin'))
  )
  WITH CHECK (
    public.can_admin_campus(campus_code)
    AND (role::text IN ('student', 'alumni', 'staff'))
  );

-- 3c. The self-update / delegation guard. One definition, replacing the eleven that
--     accumulated. Rules:
--       * server side (no JWT / service_role): unrestricted.
--       * Super Admin (strict): unrestricted; but see guard_last_active_admin().
--       * nobody except a Super Admin can touch a Super Admin or the root account.
--       * Campus Admin: only members of their OWN real campus; never other admins; can
--         moderate (suspend, trust, verify, ambassador, role among student/alumni/staff)
--         but cannot transfer campus, edit e-mail or flip is_bot.
--       * Staff: only students/alumni of their own campus; suspend / verify only.
--       * Everyone else, including admins/staff editing themselves: profile fields only.
--         role, admin_role, suspension, trust, ambassador, is_bot and e-mail are frozen;
--         verification may only go unverified/rejected -> pending; campus follows the
--         lock rules below.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid               uuid := auth.uid();
  v_caller_role       text;
  v_caller_admin_role text;
  v_caller_campus     text;
  v_caller_email      text;
  v_domain_campus     text;
  v_scoped            boolean;
BEGIN
  IF v_uid IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT LOWER(COALESCE(p.role::text, '')),
         COALESCE(p.admin_role, ''),
         NULLIF(COALESCE(p.campus_code, ''), ''),
         LOWER(COALESCE(p.email, ''))
    INTO v_caller_role, v_caller_admin_role, v_caller_campus, v_caller_email
  FROM public.profiles p WHERE p.id = v_uid;

  IF (v_caller_role = 'admin' AND v_caller_admin_role = 'super_admin')
     OR v_caller_email = 'inememmanuel@gmail.com'
     OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'inememmanuel@gmail.com' THEN
    RETURN NEW;
  END IF;

  -- Super Admin / root accounts can only be changed by a Super Admin.
  IF OLD.admin_role = 'super_admin' OR LOWER(COALESCE(OLD.email, '')) = 'inememmanuel@gmail.com' THEN
    NEW.role := OLD.role;
    NEW.admin_role := OLD.admin_role;
    NEW.campus_code := OLD.campus_code;
    NEW.is_suspended := OLD.is_suspended;
    NEW.suspension_reason := OLD.suspension_reason;
    NEW.trust_score := OLD.trust_score;
    NEW.verification_status := OLD.verification_status;
    NEW.is_campus_ambassador := OLD.is_campus_ambassador;
    NEW.is_bot := OLD.is_bot;
    NEW.email := OLD.email;
    RETURN NEW;
  END IF;

  v_scoped := v_caller_role IN ('admin', 'staff')
              AND v_caller_campus IS NOT NULL AND v_caller_campus <> 'GLOBAL'
              AND v_uid <> OLD.id
              AND OLD.campus_code = v_caller_campus;

  IF v_scoped AND v_caller_role = 'admin' THEN
    IF OLD.role::text = 'admin' OR NEW.role::text = 'admin' OR NEW.admin_role IS DISTINCT FROM OLD.admin_role THEN
      NEW.role := OLD.role;
      NEW.admin_role := OLD.admin_role;
      NEW.campus_code := OLD.campus_code;
      NEW.is_suspended := OLD.is_suspended;
      NEW.suspension_reason := OLD.suspension_reason;
      NEW.trust_score := OLD.trust_score;
      NEW.verification_status := OLD.verification_status;
      NEW.is_campus_ambassador := OLD.is_campus_ambassador;
      NEW.is_bot := OLD.is_bot;
      NEW.email := OLD.email;
      RETURN NEW;
    END IF;
    NEW.campus_code := OLD.campus_code;      -- no cross-campus transfers by a Campus Admin
    NEW.is_bot := OLD.is_bot;
    NEW.email := OLD.email;
    RETURN NEW;
  END IF;

  IF v_scoped AND v_caller_role = 'staff' THEN
    IF OLD.role::text NOT IN ('student', 'alumni') THEN
      NEW.role := OLD.role;
      NEW.admin_role := OLD.admin_role;
      NEW.campus_code := OLD.campus_code;
      NEW.is_suspended := OLD.is_suspended;
      NEW.suspension_reason := OLD.suspension_reason;
      NEW.trust_score := OLD.trust_score;
      NEW.verification_status := OLD.verification_status;
      NEW.is_campus_ambassador := OLD.is_campus_ambassador;
    ELSE
      NEW.role := OLD.role;
      NEW.admin_role := OLD.admin_role;
      NEW.campus_code := OLD.campus_code;
      NEW.trust_score := OLD.trust_score;
      NEW.is_campus_ambassador := OLD.is_campus_ambassador;
    END IF;
    NEW.is_bot := OLD.is_bot;
    NEW.email := OLD.email;
    RETURN NEW;
  END IF;

  -- ---- Self edits (and anybody acting outside their authority) --------------------
  NEW.role := OLD.role;
  NEW.admin_role := OLD.admin_role;
  NEW.is_suspended := OLD.is_suspended;
  NEW.suspension_reason := OLD.suspension_reason;
  NEW.trust_score := OLD.trust_score;
  NEW.is_campus_ambassador := OLD.is_campus_ambassador;
  NEW.is_bot := OLD.is_bot;
  NEW.email := OLD.email;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    IF NOT (NEW.verification_status::text = 'pending'
            AND COALESCE(OLD.verification_status::text, 'unverified') IN ('unverified', 'none', 'rejected')) THEN
      NEW.verification_status := OLD.verification_status;
    END IF;
  END IF;

  IF NEW.campus_code IS DISTINCT FROM OLD.campus_code THEN
    IF NEW.campus_code IS NULL
       OR (NEW.campus_code <> 'GLOBAL'
           AND NOT EXISTS (SELECT 1 FROM public.campuses c WHERE c.code = NEW.campus_code AND c.is_active = true)) THEN
      NEW.campus_code := OLD.campus_code;
    ELSE
      BEGIN
        v_domain_campus := public.campus_for_email(OLD.email);
      EXCEPTION WHEN OTHERS THEN
        v_domain_campus := NULL;
      END;

      IF v_domain_campus IS NOT NULL AND v_domain_campus <> NEW.campus_code THEN
        -- An institutional e-mail belongs to its own campus (server truth, not a choice).
        NEW.campus_code := OLD.campus_code;
      ELSIF OLD.verification_status::text = 'verified' AND COALESCE(OLD.campus_code, 'GLOBAL') <> 'GLOBAL' THEN
        -- Verified membership is bound to the campus it was verified for. Moving needs an admin.
        NEW.campus_code := OLD.campus_code;
      ELSE
        IF OLD.verification_status::text = 'verified' AND v_domain_campus IS DISTINCT FROM NEW.campus_code THEN
          -- A verified member of no campus (e.g. their campus was deleted) joining a new one has
          -- not proven anything for it: verification starts again.
          NEW.verification_status := 'unverified';
        END IF;
        IF OLD.verification_status::text = 'pending' THEN
          UPDATE public.verifications SET campus_code = NEW.campus_code
          WHERE user_id = OLD.id AND status::text = 'pending';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_prevent_profile_role_escalation ON public.profiles;
DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER tr_prevent_profile_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- 3d. The sign-up trigger. handle_new_user_profile() has been redefined five times across the repo's
--     SQL files (one of them elevating the owner's e-mail to admin AT SIGN-UP, before the address is
--     confirmed), so which behaviour production runs depends on apply order. This is the one definition:
--       * role is student, or alumni when asked - never admin/staff, whatever the metadata says;
--       * campus: the verified e-mail domain first, then the member's own choice if that campus exists
--         and is active, else GLOBAL;
--       * the consent record keeps the age answer. The app sends `age_eligibility_confirmed`; every
--         previous trigger read `age_confirmed_18`, so every sign-up since the age gate changed was
--         stored as "age NOT confirmed".
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
    BEGIN
        v_campus := public.campus_for_email(NEW.email);
    EXCEPTION WHEN OTHERS THEN
        v_campus := NULL;
    END;
    v_campus := COALESCE(v_campus, NULLIF(NEW.raw_user_meta_data->>'campus_code', ''), 'GLOBAL');
    IF v_campus <> 'GLOBAL' AND NOT EXISTS (SELECT 1 FROM public.campuses c WHERE c.code = v_campus AND c.is_active) THEN
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

    -- Username: best effort (a taken handle must never make sign-up itself fail).
    v_username := lower(trim(COALESCE(NEW.raw_user_meta_data->>'username', '')));
    IF v_username <> '' AND length(v_username) >= 3 THEN
        BEGIN
            UPDATE public.profiles SET username = v_username WHERE id = NEW.id;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    BEGIN
        v_terms_version := NULLIF(btrim(NEW.raw_user_meta_data->>'terms_version'), '');
        IF v_terms_version IS NOT NULL AND to_regclass('public.consent_records') IS NOT NULL THEN
            BEGIN
                v_terms_at := (NEW.raw_user_meta_data->>'terms_accepted_at')::timestamptz;
            EXCEPTION WHEN OTHERS THEN
                v_terms_at := NULL;
            END;
            v_terms_at := LEAST(COALESCE(v_terms_at, now()), now());

            v_age_raw := lower(COALESCE(NEW.raw_user_meta_data->>'age_eligibility_confirmed', NEW.raw_user_meta_data->>'age_confirmed_18', ''));
            v_age := v_age_raw IN ('true', 't', '1', 'yes');

            INSERT INTO public.consent_records (user_id, consent_type, version, accepted_at, age_confirmed_18, source)
            VALUES (NEW.id, 'terms_and_privacy', left(v_terms_version, 64), v_terms_at, v_age, 'signup');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'consent record not stored for %: %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4. Username sign-in must not hand out e-mail addresses
-- ----------------------------------------------------------------------------
-- The login-with-username edge function (service role) resolves the handle and signs
-- the user in server side, so the address never reaches the browser.
REVOKE ALL ON FUNCTION public.get_email_for_username(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_for_username(text) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. admin_get_user_profiles: one scoping rule for every admin tool
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_get_user_profiles(TEXT, INT);
CREATE OR REPLACE FUNCTION public.admin_get_user_profiles(
    p_campus_code TEXT DEFAULT NULL,
    p_limit INT DEFAULT 1000
)
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    username TEXT,
    email TEXT,
    role TEXT,
    campus_code TEXT,
    department TEXT,
    student_id_number TEXT,
    verification_status TEXT,
    trust_score NUMERIC,
    is_suspended BOOLEAN,
    last_active_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    is_bot BOOLEAN,
    avatar_url TEXT,
    created_at TIMESTAMPTZ,
    admin_role TEXT,
    is_campus_ambassador BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_campus TEXT;
    v_effective_campus TEXT;
BEGIN
    IF auth.role() = 'service_role' OR public.auth_is_super_admin() THEN
        v_effective_campus := NULLIF(UPPER(TRIM(COALESCE(p_campus_code, ''))), 'ALL');
        v_effective_campus := NULLIF(v_effective_campus, '');
    ELSE
        SELECT LOWER(COALESCE(p.role::text, '')), NULLIF(UPPER(TRIM(COALESCE(p.campus_code, ''))), '')
          INTO v_caller_role, v_caller_campus
        FROM public.profiles p WHERE p.id = auth.uid();

        IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'staff') THEN
            RAISE EXCEPTION 'admin_required';
        END IF;
        IF v_caller_campus IS NULL OR v_caller_campus = 'GLOBAL' THEN
            RAISE EXCEPTION 'campus_assignment_required';
        END IF;
        -- Campus Admins and staff are pinned to their own campus whatever they ask for.
        v_effective_campus := v_caller_campus;
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.full_name::TEXT,
        p.username::TEXT,
        COALESCE(u.email::TEXT, p.email::TEXT) AS email,
        p.role::TEXT,
        p.campus_code::TEXT,
        p.department::TEXT,
        p.student_id_number::TEXT,
        p.verification_status::TEXT,
        p.trust_score,
        COALESCE(p.is_suspended, FALSE) AS is_suspended,
        p.last_active_at,
        p.last_login_at,
        COALESCE(p.is_bot, FALSE) AS is_bot,
        p.avatar_url::TEXT,
        p.created_at,
        p.admin_role::TEXT,
        COALESCE(p.is_campus_ambassador, FALSE) AS is_campus_ambassador
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE (v_effective_campus IS NULL OR UPPER(COALESCE(p.campus_code, '')) = v_effective_campus)
    ORDER BY p.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 5000);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_profiles(TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_profiles(TEXT, INT) TO authenticated, service_role;

-- 5b. Ambassador appointments: a caller with no real campus used to skip the scope check.
CREATE OR REPLACE FUNCTION public.set_campus_ambassador_status(
    p_user_id UUID,
    p_is_ambassador BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_campus TEXT;
    v_target_role TEXT;
    v_target_campus TEXT;
    v_target_suspended BOOLEAN;
    v_super BOOLEAN;
BEGIN
    IF auth.uid() IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    v_super := auth.role() = 'service_role' OR public.auth_is_super_admin();

    IF NOT v_super THEN
        SELECT LOWER(COALESCE(p.role::text, '')), NULLIF(COALESCE(p.campus_code, ''), '')
          INTO v_caller_role, v_caller_campus
        FROM public.profiles p WHERE p.id = auth.uid();
        IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'staff') THEN
            RAISE EXCEPTION 'admin_required';
        END IF;
        IF v_caller_campus IS NULL OR v_caller_campus = 'GLOBAL' THEN
            RAISE EXCEPTION 'campus_assignment_required: you need a campus assignment before appointing ambassadors';
        END IF;
    END IF;

    SELECT LOWER(COALESCE(p.role::text, '')), COALESCE(p.campus_code, ''), COALESCE(p.is_suspended, FALSE)
      INTO v_target_role, v_target_campus, v_target_suspended
    FROM public.profiles p WHERE p.id = p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;

    IF v_target_role <> 'student' THEN
        RAISE EXCEPTION 'invalid_target_role: Only student accounts can be appointed as Campus Ambassadors';
    END IF;
    IF p_is_ambassador AND v_target_suspended THEN
        RAISE EXCEPTION 'cannot_appoint_suspended_user: Suspended students cannot be appointed as Campus Ambassadors';
    END IF;
    IF NOT v_super AND v_target_campus <> v_caller_campus THEN
        RAISE EXCEPTION 'unauthorized_campus_scope: Campus admins can only manage ambassadors within their own campus';
    END IF;

    UPDATE public.profiles SET is_campus_ambassador = p_is_ambassador WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_campus_ambassador_status(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_campus_ambassador_status(UUID, BOOLEAN) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Verification: server-side submit and review, tight policies
-- ----------------------------------------------------------------------------
ALTER TABLE public.verifications ADD COLUMN IF NOT EXISTS rejection_reason text;

-- 6a. Policies
DROP POLICY IF EXISTS "Users can view own verification requests, admins and staff view all" ON public.verifications;
DROP POLICY IF EXISTS "Users can view own verification requests, admins and staff view al" ON public.verifications;
DROP POLICY IF EXISTS "Users can submit verification requests" ON public.verifications;
DROP POLICY IF EXISTS "Admins and staff can update verification status" ON public.verifications;
DROP POLICY IF EXISTS "Admins can delete verifications" ON public.verifications;
DROP POLICY IF EXISTS "Verification requests readable by owner and campus reviewers" ON public.verifications;
DROP POLICY IF EXISTS "Users submit their own pending verification request" ON public.verifications;
DROP POLICY IF EXISTS "Campus reviewers decide verification requests" ON public.verifications;
DROP POLICY IF EXISTS "Super admins delete verification requests" ON public.verifications;

CREATE POLICY "Verification requests readable by owner and campus reviewers" ON public.verifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.can_admin_campus(campus_code));

-- A student can only file a PENDING request for their OWN campus and role. (Before, any
-- column value was accepted, including status = 'approved' for another campus.)
CREATE POLICY "Users submit their own pending verification request" ON public.verifications
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND status::text = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND campus_code = public.auth_profile_campus()
    AND requested_role::text = public.auth_profile_role()
  );

CREATE POLICY "Campus reviewers decide verification requests" ON public.verifications
  FOR UPDATE TO authenticated
  USING (public.can_admin_campus(campus_code))
  WITH CHECK (public.can_admin_campus(campus_code));

CREATE POLICY "Super admins delete verification requests" ON public.verifications
  FOR DELETE TO authenticated USING (public.auth_is_super_admin());

-- One open application per person (skipped, with a notice, if legacy duplicates exist).
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.verifications WHERE status::text = 'pending' GROUP BY user_id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'verifications: duplicate pending requests exist - unique index NOT created. Resolve them, then re-run this migration.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_verifications_one_pending_per_user
      ON public.verifications (user_id) WHERE status = 'pending';
  END IF;
END
$do$;

-- 6b. Notification text: use the dedicated reason, not the raw document notes.
CREATE OR REPLACE FUNCTION public.handle_verification_status_change_notify()
RETURNS TRIGGER AS $$
DECLARE
  v_campus TEXT;
  v_reason TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text IN ('approved', 'rejected') THEN
    v_campus := NEW.campus_code;
    IF NEW.status::text = 'approved' THEN
      INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url)
      VALUES (
        NEW.user_id, NEW.reviewed_by,
        'Campus Verification Approved! 🎉',
        format('Congratulations! Your verification for %s has been approved. You now have full access to campus feeds, events, and resources.', COALESCE(v_campus, 'your campus')),
        'system', '/(student)/dashboard'
      );
    ELSE
      v_reason := COALESCE(NULLIF(TRIM(NEW.rejection_reason), ''), NULLIF(TRIM(split_part(COALESCE(NEW.review_notes, ''), E'\n--- Reviewer decision:', 2)), ''));
      INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url)
      VALUES (
        NEW.user_id, NEW.reviewed_by,
        'Verification Needs Revision ⚠️',
        CASE
          WHEN v_reason IS NOT NULL THEN format('Your verification could not be approved: %s. Please upload an updated ID or document to re-apply.', v_reason)
          ELSE 'We could not verify your student or staff ID from the submitted document. Please upload a clear photo of your ID card to re-apply.'
        END,
        'system', '/(student)/profile'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_verification_status_change_notify ON public.verifications;
CREATE TRIGGER trg_verification_status_change_notify
  AFTER UPDATE OF status ON public.verifications
  FOR EACH ROW EXECUTE FUNCTION public.handle_verification_status_change_notify();

-- 6c. submit_verification_request: validates the evidence path, derives campus and role
--     from the PROFILE (never from the client) and flips the profile to pending in the
--     same transaction. Idempotent while a request is already open.
CREATE OR REPLACE FUNCTION public.submit_verification_request(
    p_document_path      text,
    p_document_type      text DEFAULT 'Student ID',
    p_document_reference text DEFAULT NULL
)
RETURNS public.verifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_me    public.profiles%ROWTYPE;
  v_path  text := btrim(COALESCE(p_document_path, ''));
  v_notes text;
  v_row   public.verifications;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_missing'; END IF;
  IF COALESCE(v_me.is_suspended, false) THEN RAISE EXCEPTION 'account_suspended'; END IF;
  IF v_me.role::text NOT IN ('student', 'alumni') THEN
    RAISE EXCEPTION 'not_applicable: only students and alumni apply for verification';
  END IF;
  IF v_me.verification_status::text = 'verified' THEN RAISE EXCEPTION 'already_verified'; END IF;
  IF v_me.campus_code IS NULL OR v_me.campus_code = 'GLOBAL' THEN
    RAISE EXCEPTION 'campus_required: choose your university before applying';
  END IF;
  IF v_path = '' OR length(v_path) > 200 OR v_path !~ ('^' || v_uid::text || '/[A-Za-z0-9_.-]+$') THEN
    RAISE EXCEPTION 'invalid_document: upload the document first, then submit it';
  END IF;

  SELECT * INTO v_row FROM public.verifications WHERE user_id = v_uid AND status::text = 'pending' ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  v_notes := left(btrim(COALESCE(NULLIF(btrim(p_document_type), ''), 'Student ID')), 60);
  IF NULLIF(btrim(COALESCE(p_document_reference, '')), '') IS NOT NULL THEN
    v_notes := v_notes || ': ' || left(btrim(p_document_reference), 80);
  END IF;

  INSERT INTO public.verifications (user_id, campus_code, requested_role, id_card_front_url, status, review_notes)
  VALUES (v_uid, v_me.campus_code, v_me.role, v_path, 'pending', v_notes)
  RETURNING * INTO v_row;

  UPDATE public.profiles SET verification_status = 'pending' WHERE id = v_uid;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_verification_request(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_verification_request(text, text, text) TO authenticated;

-- 6d. review_verification_request: the ONLY correct way to decide - request, profile and
--     audit entry change together or not at all, and the reviewer's authority is checked
--     against the request's campus.
CREATE OR REPLACE FUNCTION public.review_verification_request(
    p_request_id uuid,
    p_approve    boolean,
    p_reason     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_req    public.verifications%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_name   text;
BEGIN
  IF v_uid IS NULL AND auth.role() <> 'service_role' THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_req FROM public.verifications WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: that request no longer exists'; END IF;

  IF auth.role() <> 'service_role' THEN
    IF NOT public.can_admin_campus(v_req.campus_code) THEN
      RAISE EXCEPTION 'unauthorized_campus_scope: you can only review requests from your own campus';
    END IF;
    IF NOT public.has_role_permission('can_verify_students') THEN
      RAISE EXCEPTION 'permission_disabled: ID verification is switched off for your role';
    END IF;
    IF v_req.user_id = v_uid THEN
      RAISE EXCEPTION 'conflict_of_interest: you cannot review your own request';
    END IF;
  END IF;

  IF v_req.status::text <> 'pending' THEN
    RAISE EXCEPTION 'already_reviewed: this request was already %', v_req.status::text;
  END IF;
  IF NOT p_approve AND (v_reason IS NULL OR char_length(v_reason) < 5) THEN
    RAISE EXCEPTION 'reason_required: tell the applicant what to fix (at least 5 characters)';
  END IF;

  UPDATE public.verifications
     SET status = (CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END)::public.moderation_status_type,
         reviewed_by = v_uid,
         reviewed_at = now(),
         rejection_reason = CASE WHEN p_approve THEN NULL ELSE left(v_reason, 500) END,
         review_notes = CASE
           WHEN p_approve THEN review_notes
           ELSE split_part(COALESCE(review_notes, ''), E'\n--- Reviewer decision:', 1) || E'\n--- Reviewer decision: ' || left(v_reason, 500)
         END
   WHERE id = p_request_id;

  UPDATE public.profiles
     SET verification_status = (CASE WHEN p_approve THEN 'verified' ELSE 'rejected' END)::public.verification_status_type
   WHERE id = v_req.user_id;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_req.user_id;
  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (v_uid, CASE WHEN p_approve THEN 'verification_approved' ELSE 'verification_rejected' END,
            'verification_request', p_request_id,
            jsonb_build_object('summary', format('%s a verification application from %s (%s)', CASE WHEN p_approve THEN 'Approved' ELSE 'Rejected' END, COALESCE(v_name, 'applicant'), v_req.campus_code),
                               'institutionCode', v_req.campus_code, 'targetUserId', v_req.user_id, 'reason', v_reason));
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- an audit hiccup must never undo a decision
  END;

  RETURN jsonb_build_object('request_id', p_request_id, 'user_id', v_req.user_id,
                            'status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
                            'campus_code', v_req.campus_code);
END;
$$;

REVOKE ALL ON FUNCTION public.review_verification_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_verification_request(uuid, boolean, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. campuses: only a Super Admin may change them (domains drive auto-verification)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins have full campus management access" ON public.campuses;
DROP POLICY IF EXISTS "Super admins manage campuses" ON public.campuses;
CREATE POLICY "Super admins manage campuses" ON public.campuses
  FOR ALL TO authenticated
  USING (public.auth_is_super_admin())
  WITH CHECK (public.auth_is_super_admin());

-- ----------------------------------------------------------------------------
-- 8. Resources: row scope, upload scope, file access, honest download counts
-- ----------------------------------------------------------------------------
-- 8a. One visibility rule, shared by the SELECT policy, the storage policy and the
--     download counter. It follows the campus wall (auth_campus_access): unverified
--     members see GLOBAL material, verified members also see their campus.
CREATE OR REPLACE FUNCTION public.resource_visible_to_me(p_uploader uuid, p_campus text, p_approved boolean)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- COALESCE: auth_campus_access() is NULL for unverified members, and `x = NULL` is NULL, which a
  -- plpgsql `IF NOT ...` guard would read as "allowed". Always answer true or false.
  SELECT COALESCE(
           p_uploader = auth.uid()
           OR public.can_admin_campus(p_campus)
           OR (
                COALESCE(p_approved, false)
                AND (p_campus IS NULL OR p_campus = 'GLOBAL' OR p_campus = public.auth_campus_access())
              ),
           false);
$$;
REVOKE ALL ON FUNCTION public.resource_visible_to_me(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resource_visible_to_me(uuid, text, boolean) TO authenticated, service_role;

DROP POLICY IF EXISTS "Resources viewable if approved and matching campus or global or owner or admin or staff" ON public.resources;
DROP POLICY IF EXISTS "resources_select_policy" ON public.resources;
CREATE POLICY "Resources viewable if approved and matching campus or global or owner or admin or staff" ON public.resources
  FOR SELECT TO authenticated USING (public.resource_visible_to_me(uploader_id, campus_code, is_approved));

DROP POLICY IF EXISTS "Admins and staff can approve and manage resources" ON public.resources;
CREATE POLICY "Admins and staff can approve and manage resources" ON public.resources
  FOR ALL TO authenticated
  USING (public.can_admin_campus(campus_code))
  WITH CHECK (public.can_admin_campus(campus_code));

-- Uploads must land in the uploader's own campus (a student cannot file material into
-- another campus's moderation queue).
DROP POLICY IF EXISTS "Verified users can upload resources" ON public.resources;
CREATE POLICY "Verified users can upload resources" ON public.resources
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = uploader_id
    AND public.is_profile_verified(auth.uid())
    AND public.has_role_permission('can_upload_resources')
    AND (campus_code = public.auth_profile_campus() OR public.can_admin_campus(campus_code))
  );

-- 8b. Which storage object does a resources row point at? (rows hold a bare path or a
--     legacy public URL.) Indexed so the storage policy is a lookup, not a scan.
CREATE OR REPLACE FUNCTION public.resource_object_path(p_file_url text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_file_url IS NULL THEN NULL
    WHEN p_file_url ~* '^https?://' THEN substring(p_file_url from '/storage/v1/object/(?:public|sign|authenticated)/resources/([^?#]+)')
    WHEN p_file_url ~ '^[A-Za-z][A-Za-z0-9+.-]*:' THEN NULL
    ELSE NULLIF(ltrim(p_file_url, '/'), '')
  END;
$$;
CREATE INDEX IF NOT EXISTS idx_resources_object_path ON public.resources (public.resource_object_path(file_url));

CREATE OR REPLACE FUNCTION public.can_read_resource_object(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    split_part(p_name, '/', 1) = auth.uid()::text
    OR public.auth_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.resources r
      WHERE public.resource_object_path(r.file_url) = p_name
        AND (
          public.can_admin_campus(r.campus_code)
          OR (public.resource_visible_to_me(r.uploader_id, r.campus_code, r.is_approved)
              AND public.has_role_permission('can_download_resources'))
        )
    )
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_resource_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_resource_object(text) TO authenticated, service_role;

-- 8c. Storage: `resources` is readable exactly where the resources ROW is; `campus-media`
--     keeps the verified-member rule (it is referenced from posts/events/marketplace).
DO $do$
BEGIN
  DROP POLICY IF EXISTS "Campus media and resources viewable by verified members" ON storage.objects;
  -- 20261029 replaces this with a per-object rule (can_read_media_object). Re-running THIS file after
  -- that migration must not re-open the bucket, so the interim rule is only created when it is absent.
  DROP POLICY IF EXISTS "Campus media viewable by verified members" ON storage.objects;
  IF to_regprocedure('public.can_read_media_object(text)') IS NULL THEN
    CREATE POLICY "Campus media viewable by verified members" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'campus-media'
        AND (public.auth_is_verified_member() OR (storage.foldername(name))[1] = auth.uid()::text)
      );
  END IF;

  DROP POLICY IF EXISTS "Resource files readable by entitled members" ON storage.objects;
  CREATE POLICY "Resource files readable by entitled members" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'resources' AND public.can_read_resource_object(name));
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Not owner of storage.objects: storage policies NOT changed. Re-run this section as the postgres/owner role.';
END
$do$;

-- 8d. Download counter: once per person per resource (it used to count every tap).
CREATE TABLE IF NOT EXISTS public.resource_downloads (
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_id, user_id)
);
ALTER TABLE public.resource_downloads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resource_downloads FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.resource_downloads TO service_role;

DROP FUNCTION IF EXISTS public.increment_resource_download(uuid);
CREATE OR REPLACE FUNCTION public.increment_resource_download(p_resource_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_res   public.resources%ROWTYPE;
  v_count integer;
  v_new   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to do that.' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_res FROM public.resources WHERE id = p_resource_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That resource no longer exists.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.resource_visible_to_me(v_res.uploader_id, v_res.campus_code, v_res.is_approved) THEN
    RAISE EXCEPTION 'You do not have access to this resource.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.resource_downloads (resource_id, user_id) VALUES (p_resource_id, v_uid)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_new = ROW_COUNT;
  IF v_new > 0 THEN
    UPDATE public.resources SET downloads_count = COALESCE(downloads_count, 0) + 1
    WHERE id = p_resource_id RETURNING downloads_count INTO v_count;
  ELSE
    SELECT downloads_count INTO v_count FROM public.resources WHERE id = p_resource_id;
  END IF;
  RETURN v_count;
END
$$;
REVOKE ALL ON FUNCTION public.increment_resource_download(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_resource_download(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9. Other policies that read profiles.email or treated any admin as global
-- ----------------------------------------------------------------------------
-- events: the SELECT policy read profiles directly and let every admin see every campus.
DROP POLICY IF EXISTS "Events viewable by campus or global" ON public.events;
CREATE POLICY "Events viewable by campus or global" ON public.events
  FOR SELECT TO authenticated USING (
    public.auth_is_super_admin()
    OR creator_id = auth.uid()
    OR public.can_admin_campus(campus_code)
    OR visibility_scope = 'global'
    OR campus_code IS NULL
    OR campus_code = 'GLOBAL'
    OR campus_code = public.auth_profile_campus()
  );

-- audit_logs: the policy selected profiles.email (now private) and treated GLOBAL-campus
-- admins as super admins.
DROP POLICY IF EXISTS "Admins and staff can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins and staff can view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (
    public.auth_is_super_admin()
    OR audit_logs.actor_id = auth.uid()
    OR (
      public.auth_profile_role() IN ('admin', 'staff')
      AND public.auth_profile_campus() IS NOT NULL
      AND public.auth_profile_campus() <> 'GLOBAL'
      AND (
        audit_logs.metadata ->> 'institutionCode' = public.auth_profile_campus()
        OR audit_logs.metadata ->> 'targetCampus' = public.auth_profile_campus()
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 10. is_profile_verified: server truth only
-- ----------------------------------------------------------------------------
-- It used to accept ANY *.edu.ng address (not just launched campuses) and is_bot = TRUE,
-- both writable by the user themselves, and so disagreed with the campus wall.
CREATE OR REPLACE FUNCTION public.is_profile_verified(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND (
        p.role::text IN ('admin', 'staff')
        OR p.verification_status::text = 'verified'
        OR COALESCE(p.is_bot, FALSE) = TRUE
      )
      AND COALESCE(p.is_suspended, FALSE) = FALSE
  );
$$;
REVOKE ALL ON FUNCTION public.is_profile_verified(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_profile_verified(UUID) TO authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- 11. Onboarding: the server reports what was actually saved
-- ----------------------------------------------------------------------------
-- The client used to update profiles directly; the guard trigger silently reverted the
-- campus for institutional e-mails and verified members, and the app kept showing the
-- campus it had *asked* for. These two functions return the authoritative result.
CREATE OR REPLACE FUNCTION public.save_academic_profile(
    p_campus_code text,
    p_department  text,
    p_faculty     text DEFAULT NULL,
    p_level       text DEFAULT NULL,
    p_bio         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_me      public.profiles%ROWTYPE;
  v_campus  text := UPPER(BTRIM(COALESCE(p_campus_code, '')));
  v_dept    text := NULLIF(BTRIM(COALESCE(p_department, '')), '');
  v_domain  text;
  v_locked  boolean := false;
  v_reason  text;
  v_after   public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_missing'; END IF;
  IF v_dept IS NULL THEN RAISE EXCEPTION 'department_required: choose your department'; END IF;
  IF v_campus = '' OR v_campus = 'GLOBAL' OR NOT EXISTS (SELECT 1 FROM public.campuses c WHERE c.code = v_campus AND c.is_active) THEN
    RAISE EXCEPTION 'invalid_campus: choose your university from the list';
  END IF;

  BEGIN
    v_domain := public.campus_for_email(v_me.email);
  EXCEPTION WHEN OTHERS THEN
    v_domain := NULL;
  END;

  IF v_domain IS NOT NULL AND v_domain <> v_campus THEN
    v_campus := v_domain; v_locked := true; v_reason := 'email_domain';
  ELSIF v_me.verification_status::text = 'verified' AND COALESCE(v_me.campus_code, 'GLOBAL') <> 'GLOBAL' AND v_me.campus_code <> v_campus THEN
    v_campus := v_me.campus_code; v_locked := true; v_reason := 'verified';
  END IF;

  UPDATE public.profiles
     SET campus_code = v_campus,
         department  = v_dept,
         faculty     = NULLIF(BTRIM(COALESCE(p_faculty, '')), ''),
         level       = COALESCE(NULLIF(BTRIM(COALESCE(p_level, '')), ''), level),
         bio         = CASE WHEN p_bio IS NULL THEN bio ELSE left(BTRIM(p_bio), 500) END,
         updated_at  = now()
   WHERE id = v_uid;

  BEGIN
    UPDATE auth.users SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('campus_code', v_campus)
    WHERE id = v_uid;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  SELECT * INTO v_after FROM public.profiles WHERE id = v_uid;
  RETURN jsonb_build_object(
    'campus_code', v_after.campus_code,
    'department', v_after.department,
    'faculty', v_after.faculty,
    'verification_status', v_after.verification_status::text,
    'campus_locked', v_locked,
    'lock_reason', v_reason
  );
END;
$$;
REVOKE ALL ON FUNCTION public.save_academic_profile(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_academic_profile(text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_my_onboarding()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_me  public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_missing'; END IF;

  IF v_me.role::text IN ('student', 'alumni') THEN
    IF v_me.campus_code IS NULL OR v_me.campus_code = 'GLOBAL' OR NULLIF(BTRIM(COALESCE(v_me.department, '')), '') IS NULL THEN
      RAISE EXCEPTION 'academic_profile_incomplete: choose your university and department first';
    END IF;
  END IF;

  UPDATE public.profiles SET onboarding_complete = true, onboarding_step = NULL WHERE id = v_uid;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;
  RETURN jsonb_build_object('onboarding_complete', COALESCE(v_me.onboarding_complete, false),
                            'campus_code', v_me.campus_code, 'department', v_me.department);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_my_onboarding() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_my_onboarding() TO authenticated;

-- ----------------------------------------------------------------------------
-- 12. Backfill: members who confirmed an institutional e-mail BEFORE auto-verification existed
-- ----------------------------------------------------------------------------
-- auto_verify_institutional_email() only fires at the moment an address becomes confirmed. Anyone who
-- confirmed earlier is still 'unverified' although the sign-up screen promised "you'll be verified
-- automatically". The database is the authority, so make it true for them as well (rejected and
-- suspended members are left alone).
UPDATE public.profiles p
   SET verification_status = 'verified',
       campus_code = public.campus_for_email(u.email)
  FROM auth.users u
 WHERE u.id = p.id
   AND u.email_confirmed_at IS NOT NULL
   AND p.role::text IN ('student', 'alumni')
   AND p.verification_status::text = 'unverified'
   AND NOT COALESCE(p.is_suspended, false)
   AND public.campus_for_email(u.email) IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ########## 20261029000000_admin_scope_completion.sql ##########
-- ============================================================================
-- LIORIS - ADMIN SCOPE COMPLETION (2026-10-29)  -  follows 20261028000000_audit_remediation.sql
-- ============================================================================
-- 20261028 rewrote the policies that mattered most. The audit found 89 more policies on 40 tables
-- that still treat ANY role='admin' (and in many cases any staff member) as platform-wide. Rewriting
-- 89 policies by hand would be error-prone, so this migration adds a RESTRICTIVE layer instead:
-- a restrictive policy is ANDed with whatever permissive policies exist, so the old "admin can do
-- anything" branches stay in place but can no longer reach outside the caller's own campus.
--
-- Who is affected: only "scoped privileged" callers - role admin or staff who are NOT Super Admins.
-- Students, alumni and Super Admins evaluate to "not blocked" and behave exactly as before.
--
--   * campus-owned tables (posts, events, announcements, jobs, marketplace, ...): a Campus Admin/staff
--     can read, change and create rows of their OWN campus (plus GLOBAL/global-visibility rows to read,
--     and rows they authored). Nothing else.
--   * child tables (comments, attendees, applications, study-group members, ...): follow the parent row.
--   * platform data (push tokens, client errors, consent records, waitlist, user blocks, partnerships):
--     Super Admin only (owners keep their own rows).
--   * support tickets / mentorships: scoped by the member's campus.
--   * storage: verification documents, resumes, avatars and uploads were readable/writable by ANY admin;
--     now Super Admin or the admin of the OWNER's campus. campus-media is no longer readable across
--     campuses just because the reader is verified somewhere.
--   * Role Permissions that were decorative are enforced for forum posts/comments, marketplace listings
--     and direct messages.
--
-- Deliberately NOT scoped (membership governs them, scoping would hide a member's own cross-campus DMs):
--   chat_channels, chat_channel_members, chat_messages, chat_channel_archives.
--   audit_logs, profiles, verifications, resources, campuses were handled in 20261028.
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Helpers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campus_of(p_user uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT p.campus_code FROM public.profiles p WHERE p.id = p_user; $$;
REVOKE ALL ON FUNCTION public.campus_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campus_of(uuid) TO authenticated, service_role;

-- True for an admin or staff member who is not a Super Admin. Everyone else (students, alumni,
-- Super Admins, the service role) is "not scoped".
CREATE OR REPLACE FUNCTION public.is_scoped_privileged()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT p.role::text IN ('admin', 'staff') FROM public.profiles p WHERE p.id = auth.uid()), false)
     AND NOT public.auth_is_super_admin();
$$;
REVOKE ALL ON FUNCTION public.is_scoped_privileged() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_scoped_privileged() TO authenticated, service_role;

-- May a scoped admin/staff READ a row? Only their own campus, GLOBAL/NULL rows, global-visibility
-- rows, or rows they own.
CREATE OR REPLACE FUNCTION public.scoped_priv_blocked_read(p_campus text, p_owner uuid, p_global boolean)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT NOT COALESCE(p_owner = auth.uid(), false)
     AND NOT COALESCE(p_global, false)
     AND NOT (p_campus IS NULL OR p_campus = 'GLOBAL')
     AND p_campus IS DISTINCT FROM public.auth_profile_campus();
$$;
REVOKE ALL ON FUNCTION public.scoped_priv_blocked_read(text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scoped_priv_blocked_read(text, uuid, boolean) TO authenticated, service_role;

-- Folder owner of a storage object name ("<uuid>/file"), NULL when the first segment is not a uuid.
CREATE OR REPLACE FUNCTION public.storage_owner_campus(p_name text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid;
BEGIN
  BEGIN
    v_uid := NULLIF(split_part(p_name, '/', 1), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  RETURN (SELECT p.campus_code FROM public.profiles p WHERE p.id = v_uid);
END;
$$;
REVOKE ALL ON FUNCTION public.storage_owner_campus(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_owner_campus(text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Campus-owned tables: restrictive read / insert / update / delete
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  t           text;
  v_owner     text;
  v_global    text;
  v_cols      text[];
  v_read_only text[] := ARRAY['analytics_events', 'moderation_queue'];  -- members file these themselves; no insert rule
  c           text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'analytics_events', 'announcements', 'events', 'forum_communities', 'giving_campaigns', 'jobs',
    'marketplace_listings', 'moderation_queue', 'portal_links', 'posts', 'study_groups'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    SELECT array_agg(column_name::text) INTO v_cols
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t;
    IF NOT ('campus_code' = ANY (v_cols)) THEN CONTINUE; END IF;

    v_owner := 'NULL::uuid';
    FOREACH c IN ARRAY ARRAY['author_id', 'creator_id', 'seller_id', 'poster_id', 'uploader_id', 'user_id'] LOOP
      IF c = ANY (v_cols) THEN v_owner := quote_ident(c); EXIT; END IF;
    END LOOP;
    v_global := CASE WHEN 'visibility_scope' = ANY (v_cols) THEN '(visibility_scope = ''global'')' ELSE 'false' END;

    EXECUTE format('DROP POLICY IF EXISTS scope_privileged_select ON public.%I', t);
    EXECUTE format($f$CREATE POLICY scope_privileged_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated
      USING ((SELECT NOT public.is_scoped_privileged()) OR NOT public.scoped_priv_blocked_read(campus_code, %s, %s))$f$,
      t, v_owner, v_global);

    EXECUTE format('DROP POLICY IF EXISTS scope_privileged_update ON public.%I', t);
    EXECUTE format($f$CREATE POLICY scope_privileged_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
      USING ((SELECT NOT public.is_scoped_privileged()) OR COALESCE(%s = auth.uid(), false) OR campus_code = (SELECT public.auth_profile_campus()))
      WITH CHECK ((SELECT NOT public.is_scoped_privileged()) OR COALESCE(%s = auth.uid(), false) OR campus_code = (SELECT public.auth_profile_campus()))$f$,
      t, v_owner, v_owner);

    EXECUTE format('DROP POLICY IF EXISTS scope_privileged_delete ON public.%I', t);
    EXECUTE format($f$CREATE POLICY scope_privileged_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
      USING ((SELECT NOT public.is_scoped_privileged()) OR COALESCE(%s = auth.uid(), false) OR campus_code = (SELECT public.auth_profile_campus()))$f$,
      t, v_owner);

    EXECUTE format('DROP POLICY IF EXISTS scope_privileged_insert ON public.%I', t);
    IF NOT (t = ANY (v_read_only)) THEN
      EXECUTE format($f$CREATE POLICY scope_privileged_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK ((SELECT NOT public.is_scoped_privileged()) OR campus_code = (SELECT public.auth_profile_campus()))$f$, t);
    END IF;
  END LOOP;
END
$do$;

-- ----------------------------------------------------------------------------
-- 3. Child tables follow their parent row (the parent's own RLS decides what the caller can see)
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  r record;
  v_cols text[];
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('post_comments',              'posts',             'post_id',      'author_id'),
      ('event_attendees',            'events',            'event_id',     'user_id'),
      ('event_waitlist',             'events',            'event_id',     'user_id'),
      ('study_group_members',        'study_groups',      'group_id',     'user_id'),
      ('study_group_posts',          'study_groups',      'group_id',     'author_id'),
      ('study_group_sessions',       'study_groups',      'group_id',     'created_by'),
      ('job_applications',           'jobs',              'job_id',       'applicant_id'),
      ('job_questions',              'jobs',              'job_id',       NULL),
      ('forum_community_moderators', 'forum_communities', 'community_id', 'user_id'),
      ('forum_community_members',    'forum_communities', 'community_id', 'user_id')
    ) AS x(child, parent, fk, owner)
  LOOP
    IF to_regclass('public.' || r.child) IS NULL OR to_regclass('public.' || r.parent) IS NULL THEN CONTINUE; END IF;
    SELECT array_agg(column_name::text) INTO v_cols FROM information_schema.columns WHERE table_schema = 'public' AND table_name = r.child;
    IF NOT (r.fk = ANY (v_cols)) THEN CONTINUE; END IF;

    EXECUTE format('DROP POLICY IF EXISTS scope_privileged_child ON public.%I', r.child);
    EXECUTE format($f$CREATE POLICY scope_privileged_child ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
      USING ((SELECT NOT public.is_scoped_privileged())
             %s
             OR EXISTS (SELECT 1 FROM public.%I par WHERE par.id = %I.%I))
      WITH CHECK ((SELECT NOT public.is_scoped_privileged())
             %s
             OR EXISTS (SELECT 1 FROM public.%I par WHERE par.id = %I.%I))$f$,
      r.child,
      CASE WHEN r.owner IS NOT NULL AND r.owner = ANY (v_cols) THEN format('OR %I = auth.uid()', r.owner) ELSE '' END,
      r.parent, r.child, r.fk,
      CASE WHEN r.owner IS NOT NULL AND r.owner = ANY (v_cols) THEN format('OR %I = auth.uid()', r.owner) ELSE '' END,
      r.parent, r.child, r.fk);
  END LOOP;
END
$do$;

-- ----------------------------------------------------------------------------
-- 4. Member-keyed tables: scoped by the MEMBER's campus
-- ----------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.support_tickets') IS NOT NULL THEN
    DROP POLICY IF EXISTS scope_privileged_member ON public.support_tickets;
    CREATE POLICY scope_privileged_member ON public.support_tickets AS RESTRICTIVE FOR ALL TO authenticated
      USING ((SELECT NOT public.is_scoped_privileged()) OR user_id = auth.uid() OR public.can_admin_campus(public.campus_of(user_id)))
      WITH CHECK ((SELECT NOT public.is_scoped_privileged()) OR user_id = auth.uid() OR public.can_admin_campus(public.campus_of(user_id)));
  END IF;
  IF to_regclass('public.mentorships') IS NOT NULL THEN
    DROP POLICY IF EXISTS scope_privileged_member ON public.mentorships;
    CREATE POLICY scope_privileged_member ON public.mentorships AS RESTRICTIVE FOR ALL TO authenticated
      USING ((SELECT NOT public.is_scoped_privileged()) OR student_id = auth.uid() OR mentor_id = auth.uid() OR public.can_admin_campus(public.campus_of(student_id)))
      WITH CHECK ((SELECT NOT public.is_scoped_privileged()) OR student_id = auth.uid() OR mentor_id = auth.uid() OR public.can_admin_campus(public.campus_of(student_id)));
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 5. Platform data: Super Admin only (owners keep their own rows)
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  r record;
  v_cols text[];
  v_owner text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('push_tokens', 'user_id'), ('client_errors', 'user_id'), ('consent_records', 'user_id'),
      ('waitlist_entries', NULL), ('user_blocks', 'blocker_id'), ('event_partnerships', NULL)
    ) AS x(tbl, owner)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN CONTINUE; END IF;
    SELECT array_agg(column_name::text) INTO v_cols FROM information_schema.columns WHERE table_schema = 'public' AND table_name = r.tbl;
    v_owner := CASE WHEN r.owner IS NOT NULL AND r.owner = ANY (v_cols) THEN format(' OR %I = auth.uid()', r.owner) ELSE '' END;
    EXECUTE format('DROP POLICY IF EXISTS scope_super_only ON public.%I', r.tbl);
    EXECUTE format($f$CREATE POLICY scope_super_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
      USING ((SELECT NOT public.is_scoped_privileged())%s) WITH CHECK ((SELECT NOT public.is_scoped_privileged())%s)$f$,
      r.tbl, v_owner, v_owner);
  END LOOP;
END
$do$;

-- ----------------------------------------------------------------------------
-- 6. Role Permissions that were decorative (only keys whose seeded default matches shipped behaviour)
-- ----------------------------------------------------------------------------
DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('posts', 'can_post_forum'), ('post_comments', 'can_comment_forum'),
      ('marketplace_listings', 'can_list_marketplace'), ('chat_messages', 'can_send_messages')
    ) AS x(tbl, perm)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS role_permission_insert ON public.%I', r.tbl);
    EXECUTE format($f$CREATE POLICY role_permission_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (public.has_role_permission(%L))$f$, r.tbl, r.perm);
  END LOOP;
END
$do$;

-- ----------------------------------------------------------------------------
-- 7. Storage: verification documents, resumes, avatars, uploads, campus-media
-- ----------------------------------------------------------------------------
-- Does the object belong to somebody the caller may administer?
CREATE OR REPLACE FUNCTION public.can_admin_object_owner(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.can_admin_campus(public.storage_owner_campus(p_name)); $$;
REVOKE ALL ON FUNCTION public.can_admin_object_owner(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_admin_object_owner(text) TO authenticated, service_role;

-- Does a stored media reference (bare path or legacy public URL) point at this object?
CREATE OR REPLACE FUNCTION public.media_ref_matches(p_ref text, p_name text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_ref IS NOT NULL AND p_name IS NOT NULL AND (
    p_ref = p_name OR right(split_part(p_ref, '?', 1), length(p_name) + 1) = '/' || p_name
  );
$$;

-- May the caller read a campus-media object?
--   own upload > Super Admin > admin of the uploader's campus > uploader is a member of the reader's
--   (wall-verified) campus or of GLOBAL > the object is attached to content the reader may see
--   (global-visibility post/event, GLOBAL listing, approved campaign, a chat they belong to).
CREATE OR REPLACE FUNCTION public.can_read_media_object(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_owner  text;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF split_part(p_name, '/', 1) = v_uid::text THEN RETURN true; END IF;
  IF public.auth_is_super_admin() THEN RETURN true; END IF;

  v_owner := public.storage_owner_campus(p_name);
  IF v_owner IS NOT NULL THEN
    IF public.can_admin_campus(v_owner) THEN RETURN true; END IF;
    IF v_owner = 'GLOBAL' THEN RETURN true; END IF;
    IF v_owner = public.auth_campus_access() THEN RETURN true; END IF;
  END IF;

  -- Cross-campus references the reader is legitimately allowed to see.
  IF EXISTS (SELECT 1 FROM public.posts p
             WHERE (p.visibility_scope = 'global' OR p.campus_code IS NULL OR p.campus_code = 'GLOBAL')
               AND (p.status IS NULL OR p.status::text = 'published')
               AND (public.media_ref_matches(p.image_url, p_name) OR public.media_ref_matches(p.video_url, p_name)
                    OR EXISTS (SELECT 1 FROM unnest(COALESCE(p.image_urls, ARRAY[]::text[])) u WHERE public.media_ref_matches(u, p_name)))) THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.events e
             WHERE (e.visibility_scope = 'global' OR e.campus_code IS NULL OR e.campus_code = 'GLOBAL')
               AND public.media_ref_matches(e.banner_url, p_name)) THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.marketplace_listings m
             WHERE (m.campus_code IS NULL OR m.campus_code = 'GLOBAL')
               AND (public.media_ref_matches(m.image_url, p_name) OR public.media_ref_matches(m.image_path, p_name)
                    OR EXISTS (SELECT 1 FROM unnest(COALESCE(m.image_paths, ARRAY[]::text[])) u WHERE public.media_ref_matches(u, p_name)))) THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.giving_campaigns g WHERE public.media_ref_matches(g.cover_image_url, p_name)) THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.chat_messages cm
             JOIN public.chat_channel_members mem ON mem.channel_id = cm.channel_id
             WHERE mem.user_id = v_uid AND public.media_ref_matches(cm.media_url, p_name)) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.can_read_media_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_media_object(text) TO authenticated, service_role;

DO $do$
BEGIN
  -- campus-media: no longer "any verified member of any campus"
  DROP POLICY IF EXISTS "Campus media viewable by verified members" ON storage.objects;
  DROP POLICY IF EXISTS "Campus media viewable by entitled members" ON storage.objects;
  CREATE POLICY "Campus media viewable by entitled members" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'campus-media' AND public.can_read_media_object(name));

  -- verification documents: owner, Super Admin, or the admin of the OWNER's campus (was: any admin)
  DROP POLICY IF EXISTS "Verifications viewable only by owner and admins" ON storage.objects;
  DROP POLICY IF EXISTS "Verifications viewable by campus staff" ON storage.objects;
  DROP POLICY IF EXISTS "Verification documents viewable by owner and campus reviewers" ON storage.objects;
  CREATE POLICY "Verification documents viewable by owner and campus reviewers" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'verifications'
      AND ((storage.foldername(name))[1] = auth.uid()::text OR public.auth_is_super_admin() OR public.can_admin_object_owner(name))
    );
  DROP POLICY IF EXISTS "Users and admins can update their verification documents" ON storage.objects;
  CREATE POLICY "Users and admins can update their verification documents" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'verifications' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.auth_is_super_admin()));
  DROP POLICY IF EXISTS "Users and admins can delete their verification documents" ON storage.objects;
  CREATE POLICY "Users and admins can delete their verification documents" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'verifications' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.auth_is_super_admin()));

  -- resumes: owner, the job poster, Super Admin, admin of the applicant's campus
  DROP POLICY IF EXISTS "Resumes viewable by owner, the job poster, and admins" ON storage.objects;
  CREATE POLICY "Resumes viewable by owner, the job poster, and admins" ON storage.objects
    FOR SELECT TO authenticated USING (
      bucket_id = 'resumes' AND (
        auth.uid()::text = (storage.foldername(name))[1]
        OR public.auth_is_super_admin()
        OR public.can_admin_object_owner(name)
        OR EXISTS (
          SELECT 1 FROM public.job_applications ja JOIN public.jobs j ON j.id = ja.job_id
          WHERE ja.resume_url = name AND j.poster_id = auth.uid())
      ));
  DROP POLICY IF EXISTS "Users and admins can update their resume" ON storage.objects;
  CREATE POLICY "Users and admins can update their resume" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'resumes' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.auth_is_super_admin()));
  DROP POLICY IF EXISTS "Users and admins can delete their resume" ON storage.objects;
  CREATE POLICY "Users and admins can delete their resume" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'resumes' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.auth_is_super_admin()));

  -- avatars / resources / campus-media writes: own folder (not suspended), Super Admin, or the owner's campus admin
  DROP POLICY IF EXISTS "Authenticated users can upload public storage objects" ON storage.objects;
  CREATE POLICY "Authenticated users can upload public storage objects" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id IN ('resources', 'avatars', 'campus-media')
      AND (public.auth_is_super_admin() OR ((storage.foldername(name))[1] = auth.uid()::text AND NOT public.auth_is_suspended()))
    );
  DROP POLICY IF EXISTS "Users and admins can update public storage objects" ON storage.objects;
  CREATE POLICY "Users and admins can update public storage objects" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id IN ('resources', 'avatars', 'campus-media')
           AND ((storage.foldername(name))[1] = auth.uid()::text OR public.auth_is_super_admin() OR public.can_admin_object_owner(name)))
    WITH CHECK (bucket_id IN ('resources', 'avatars', 'campus-media')
           AND (public.auth_is_super_admin() OR ((storage.foldername(name))[1] = auth.uid()::text AND NOT public.auth_is_suspended())));
  DROP POLICY IF EXISTS "Users and admins can delete public storage objects" ON storage.objects;
  CREATE POLICY "Users and admins can delete public storage objects" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id IN ('resources', 'avatars', 'campus-media')
           AND ((storage.foldername(name))[1] = auth.uid()::text OR public.auth_is_super_admin() OR public.can_admin_object_owner(name)));
  DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
  CREATE POLICY "Authenticated users can upload avatars" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND (public.auth_is_super_admin() OR (storage.foldername(name))[1] = auth.uid()::text));
  DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
  CREATE POLICY "Users can update own avatars" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'avatars' AND (public.auth_is_super_admin() OR (storage.foldername(name))[1] = auth.uid()::text OR public.can_admin_object_owner(name)));
  DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;
  CREATE POLICY "Users can delete own avatars" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'avatars' AND (public.auth_is_super_admin() OR (storage.foldername(name))[1] = auth.uid()::text OR public.can_admin_object_owner(name)));
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Not owner of storage.objects: storage policies NOT changed. Re-run this section as the postgres/owner role.';
END
$do$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ########## 20261030000000_optional_admin_mfa_enforcement.sql ##########
-- ============================================================================
-- LIORIS - OPTIONAL TWO-FACTOR ENFORCEMENT IN THE DATABASE (2026-10-30)
-- ============================================================================
-- Until now two-factor sign-in was only a client flag: the edge functions asked for AAL2 and the app
-- showed a challenge, but no RLS policy ever looked at it, so a stolen password for an admin who had
-- enrolled a factor still worked straight against the REST API.
--
-- This adds a SWITCH (default OFF, so nothing changes when you apply it):
--   platform_settings key 'admin_mfa_required' = {"enabled": true}
-- When ON, every admin/staff authority check (auth_is_super_admin, can_admin_campus - both already call
-- admin_aal2_ok() since migration 20261028000000) additionally needs
-- an AAL2 session - but ONLY for admins who actually have a verified TOTP factor. An admin who never
-- enrolled is not locked out; the app already walks admin/staff through enrolment at sign-in.
--
-- Turn it on once the admin roster has enrolled:
--   INSERT INTO public.platform_settings (key, value, description)
--   VALUES ('admin_mfa_required', '{"enabled": true}', 'Require AAL2 for enrolled admins')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
-- Turn it off:  UPDATE public.platform_settings SET value = '{"enabled": false}' WHERE key = 'admin_mfa_required';
-- Safe to re-run.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_aal2_ok()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_required boolean := false;
  v_enrolled boolean := false;
BEGIN
  BEGIN
    SELECT COALESCE((value ->> 'enabled')::boolean, false) INTO v_required
    FROM public.platform_settings WHERE key = 'admin_mfa_required';
  EXCEPTION WHEN OTHERS THEN
    RETURN true;
  END;
  IF NOT COALESCE(v_required, false) THEN RETURN true; END IF;
  IF COALESCE(auth.jwt() ->> 'aal', '') = 'aal2' THEN RETURN true; END IF;

  BEGIN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = $1 AND f.status::text = ''verified'')'
      INTO v_enrolled USING auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RETURN true;  -- cannot tell: fail open rather than lock the owner out
  END;
  RETURN NOT COALESCE(v_enrolled, false);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_aal2_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_aal2_ok() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
