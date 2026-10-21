-- ============================================================================
-- MINORS FLAG + GUARDIAN RECORD (2026-11-11)
-- ============================================================================
-- Idempotent, one transaction, safe on a live database: the only change to an existing table is a nullable
-- column without a default (catalog-only, no rewrite) plus privilege / trigger / policy changes.
--
--   1  profiles.date_of_birth (nullable) + public.age_years(date) / public.is_minor(uuid) helpers.
--      Age is NEVER stored or generated from now(): it is computed on read from the date of birth.
--   2  Date of birth is write-once for the member: UPDATE / INSERT on profiles become COLUMN-level
--      grants that leave date_of_birth out, and a trigger refuses client changes. The only writers are
--      set_my_date_of_birth() (first value only) and admin_correct_date_of_birth() (reason + audit row).
--   3  public.guardian_records (one current record per minor) with a consent status
--      (pending / confirmed / declined / revoked). RLS on; members see only their own row; admins use RPCs.
--   4  Sign-up trigger: a supplied date of birth under 13 refuses the account (and an invalid one too).
--      A member under 13 who adds a date of birth later is suspended with a clear reason.
--   5  Member RPCs: check_signup_dob, set_my_date_of_birth, get_my_minor_status, submit_guardian_details.
--      A member can re-submit guardian details but can never confirm their own consent.
--   6  Admin RPCs (campus admin for their campus, Super Admin everywhere), all audited:
--      admin_list_minors, admin_get_minor_guardian, admin_record_guardian_consent,
--      admin_correct_date_of_birth, admin_age_diagnostics (flags members with no date of birth yet).
--   7  Enforcement (server side; clients only mirror it):
--        * any member under 18: no marketplace listings, no giving campaigns, no open_giving_page();
--        * member under 18 WITHOUT confirmed guardian consent ("limited"): no job postings, direct
--          messages only with accepted connections, no connection requests FROM adults, hidden from other
--          members' profile reads and from get_suggested_connections() (admins / staff and other minors
--          are exempt).
--      A member with NO date of birth is treated as an adult for all of this.
--   8  Data lifecycle: export_my_data() and purge_user_data() replaced (CREATE OR REPLACE) so the
--      guardian record is exported / erased and the date of birth is cleared on erasure.
--
-- Helper functions that must answer questions about OTHER members live in the lioris_internal schema,
-- which PostgREST does not expose: callable from policies and triggers, but never as an RPC, so they
-- cannot be used to find out who is a minor. public.is_minor(uuid) answers only about the caller
-- (or someone the caller administers).
--
-- Guardian confirmation is ADMIN-RECORDED only. The repository has no e-mail sending mechanism of its
-- own (auth e-mails go through Supabase Auth's SMTP and cannot carry a custom message), so there is
-- no emailed-token flow and no token table.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.profiles') IS NULL OR to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'profiles / audit_logs missing. Apply the earlier migrations first.';
  END IF;
  IF to_regprocedure('public.auth_is_super_admin()') IS NULL OR to_regprocedure('public.can_admin_campus(text)') IS NULL THEN
    RAISE EXCEPTION 'auth_is_super_admin() / can_admin_campus(text) missing. Apply 20261028000000 first.';
  END IF;
END
$do$;

-- ============================================================================
-- 1. Schema for helpers that must not be callable over the REST API
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS lioris_internal;
REVOKE ALL ON SCHEMA lioris_internal FROM PUBLIC;
GRANT USAGE ON SCHEMA lioris_internal TO authenticated, service_role;

-- ============================================================================
-- 2. profiles.date_of_birth, age helpers
-- ============================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth date;

-- Whole years between a date of birth and today (server clock, UTC on Supabase). Pure function of its
-- input and the clock: never a generated column, never stored.
CREATE OR REPLACE FUNCTION public.age_years(dob date)
RETURNS integer
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$ SELECT CASE WHEN dob IS NULL THEN NULL ELSE date_part('year', age(current_date, dob))::integer END $$;
REVOKE ALL ON FUNCTION public.age_years(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.age_years(date) TO anon, authenticated, service_role;

-- Sign-up pre-check (the client calls it before supabase.auth.signUp so it can show a clear message;
-- the sign-up trigger below is the enforcement). Not SECURITY DEFINER: it reads nothing.
CREATE OR REPLACE FUNCTION public.check_signup_dob(p_dob date)
RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_dob IS NULL THEN 'missing'
    WHEN p_dob > current_date OR p_dob < current_date - interval '120 years' THEN 'invalid'
    WHEN public.age_years(p_dob) < 13 THEN 'under_13'
    WHEN public.age_years(p_dob) < 18 THEN 'minor'
    ELSE 'adult'
  END
$$;
REVOKE ALL ON FUNCTION public.check_signup_dob(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_signup_dob(date) TO anon, authenticated, service_role;

-- ============================================================================
-- 3. guardian_records
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.guardian_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minor_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  guardian_name text NOT NULL CHECK (char_length(btrim(guardian_name)) BETWEEN 2 AND 120),
  relationship text NOT NULL CHECK (relationship IN ('parent', 'legal_guardian', 'grandparent', 'other_relative', 'other')),
  guardian_email text CHECK (guardian_email IS NULL OR (char_length(guardian_email) <= 254 AND guardian_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  guardian_phone text CHECK (guardian_phone IS NULL OR guardian_phone ~ '^\+?[0-9][0-9 ()-]{5,19}$'),
  consent_status text NOT NULL DEFAULT 'pending' CHECK (consent_status IN ('pending', 'confirmed', 'declined', 'revoked')),
  consent_method text CHECK (consent_method IS NULL OR consent_method IN ('admin_recorded')),
  consent_note text CHECK (consent_note IS NULL OR char_length(consent_note) <= 500),
  consent_decided_at timestamptz,
  consent_decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guardian_contact_required CHECK (guardian_email IS NOT NULL OR guardian_phone IS NOT NULL)
);
-- consent_decided_by is an FK column: index it so deleting an admin's profile does not scan the table.
CREATE INDEX IF NOT EXISTS idx_guardian_records_decided_by ON public.guardian_records (consent_decided_by) WHERE consent_decided_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guardian_records_status ON public.guardian_records (consent_status);

ALTER TABLE public.guardian_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Minors read own guardian record" ON public.guardian_records;
CREATE POLICY "Minors read own guardian record" ON public.guardian_records
  FOR SELECT TO authenticated USING (minor_id = auth.uid());
-- Nobody writes this table directly: submit_guardian_details() and admin_record_guardian_consent() do.
-- The member can read their own row, minus the administrator's internal note and who decided.
REVOKE ALL ON public.guardian_records FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, minor_id, guardian_name, relationship, guardian_email, guardian_phone, consent_status,
              consent_decided_at, submitted_at, created_at, updated_at)
  ON public.guardian_records TO authenticated;
GRANT ALL ON public.guardian_records TO service_role;

-- ============================================================================
-- 4. Internal helpers (lioris_internal): answer questions about ANY member, so never exposed over REST
-- ============================================================================
CREATE OR REPLACE FUNCTION lioris_internal.is_minor_raw(p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT public.age_years(p.date_of_birth) < 18 FROM public.profiles p WHERE p.id = p_uid), false)
$$;

CREATE OR REPLACE FUNCTION lioris_internal.has_confirmed_consent(p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.guardian_records g WHERE g.minor_id = p_uid AND g.consent_status = 'confirmed')
$$;

-- "Limited" = under 18 and no confirmed guardian consent. NULL date of birth = adult = never limited.
CREATE OR REPLACE FUNCTION lioris_internal.is_limited_minor_raw(p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT lioris_internal.is_minor_raw(p_uid) AND NOT lioris_internal.has_confirmed_consent(p_uid)
$$;

CREATE OR REPLACE FUNCTION lioris_internal.is_staff_or_admin(p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT p.role::text IN ('admin', 'staff') FROM public.profiles p WHERE p.id = p_uid), false)
$$;

-- May the CALLER read / decide the guardian record and date of birth of p_minor? Super Admin: anyone.
-- Campus Admin (role admin, not staff): members of their own real campus only.
CREATE OR REPLACE FUNCTION lioris_internal.can_manage_minor(p_minor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.auth_is_super_admin()
      OR (
        COALESCE((SELECT c.role::text = 'admin' AND NOT COALESCE(c.is_suspended, false)
                    FROM public.profiles c WHERE c.id = auth.uid()), false)
        AND public.can_admin_campus((SELECT t.campus_code FROM public.profiles t WHERE t.id = p_minor))
      )
$$;

-- Does the viewer see limited minors at all? Other minors, staff / administrators and Super Admins do.
CREATE OR REPLACE FUNCTION lioris_internal.viewer_sees_minors()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT lioris_internal.is_minor_raw(auth.uid())
      OR lioris_internal.is_staff_or_admin(auth.uid())
      OR public.auth_is_super_admin()
$$;

-- Accepted connections either way, or a request the OTHER person sent to the viewer. A request the viewer
-- sent does not count: an adult cannot make a limited minor visible by requesting them.
CREATE OR REPLACE FUNCTION lioris_internal.connected_with_viewer(p_other uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.connections c
     WHERE (c.status = 'accepted'
            AND ((c.requester_id = auth.uid() AND c.recipient_id = p_other)
              OR (c.requester_id = p_other AND c.recipient_id = auth.uid())))
        OR (c.status = 'pending' AND c.requester_id = p_other AND c.recipient_id = auth.uid()))
$$;

-- True when a connection request must be refused: an adult (not staff / administrator) asking a limited minor.
-- The minor can still ask anyone; the adult cannot find the minor in the first place.
CREATE OR REPLACE FUNCTION lioris_internal.connection_request_blocked(p_requester uuid, p_recipient uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_requester IS DISTINCT FROM p_recipient
     AND lioris_internal.is_limited_minor_raw(p_recipient)
     AND NOT lioris_internal.is_minor_raw(p_requester)
     AND NOT lioris_internal.is_staff_or_admin(p_requester)
$$;

-- Direct messages: a limited minor and anybody else may only exchange messages when they are accepted
-- connections (or the other side is staff / an administrator).
CREATE OR REPLACE FUNCTION lioris_internal.minor_dm_allowed(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_a_limited boolean;
  v_b_limited boolean;
BEGIN
  IF p_a IS NULL OR p_b IS NULL OR p_a = p_b THEN RETURN true; END IF;
  v_a_limited := lioris_internal.is_limited_minor_raw(p_a);
  v_b_limited := lioris_internal.is_limited_minor_raw(p_b);
  IF NOT (v_a_limited OR v_b_limited) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.connections c
              WHERE c.status = 'accepted'
                AND ((c.requester_id = p_a AND c.recipient_id = p_b) OR (c.requester_id = p_b AND c.recipient_id = p_a))) THEN
    RETURN true;
  END IF;
  IF (v_a_limited AND lioris_internal.is_staff_or_admin(p_b)) OR (v_b_limited AND lioris_internal.is_staff_or_admin(p_a)) THEN
    RETURN true;
  END IF;
  RETURN false;
END
$$;

-- NULL = the sender may post in this channel; 'self' = the sender is the limited minor; 'other' = someone
-- else in the conversation is (the sender is told nothing about who).
CREATE OR REPLACE FUNCTION lioris_internal.dm_send_block(p_channel uuid, p_sender uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_other uuid;
BEGIN
  IF p_sender IS NULL OR NOT COALESCE((SELECT ch.is_direct_message FROM public.chat_channels ch WHERE ch.id = p_channel), false) THEN
    RETURN NULL;
  END IF;
  FOR v_other IN SELECT m.user_id FROM public.chat_channel_members m WHERE m.channel_id = p_channel AND m.user_id <> p_sender LOOP
    IF NOT lioris_internal.minor_dm_allowed(p_sender, v_other) THEN
      RETURN CASE WHEN lioris_internal.is_limited_minor_raw(p_sender) THEN 'self' ELSE 'other' END;
    END IF;
  END LOOP;
  RETURN NULL;
END
$$;

-- Same rule when somebody is ADDED to a direct-message channel: the pair (new member, channel creator).
CREATE OR REPLACE FUNCTION lioris_internal.dm_member_block(p_channel uuid, p_user uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dm boolean;
  v_creator uuid;
BEGIN
  SELECT COALESCE(ch.is_direct_message, false), ch.created_by INTO v_dm, v_creator
    FROM public.chat_channels ch WHERE ch.id = p_channel;
  IF NOT COALESCE(v_dm, false) OR v_creator IS NULL OR p_user IS NULL OR p_user = v_creator THEN RETURN NULL; END IF;
  IF lioris_internal.minor_dm_allowed(p_user, v_creator) THEN RETURN NULL; END IF;
  RETURN CASE WHEN lioris_internal.is_limited_minor_raw(auth.uid()) THEN 'self' ELSE 'other' END;
END
$$;

-- Everything above is callable by policies and triggers (they run as the member) but is not reachable
-- through PostgREST, which only exposes the public schema.
REVOKE ALL ON FUNCTION lioris_internal.is_minor_raw(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION lioris_internal.has_confirmed_consent(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION lioris_internal.is_limited_minor_raw(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION lioris_internal.is_staff_or_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION lioris_internal.can_manage_minor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION lioris_internal.viewer_sees_minors() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION lioris_internal.connected_with_viewer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION lioris_internal.connection_request_blocked(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION lioris_internal.minor_dm_allowed(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION lioris_internal.dm_send_block(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION lioris_internal.dm_member_block(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lioris_internal.is_minor_raw(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION lioris_internal.has_confirmed_consent(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION lioris_internal.is_limited_minor_raw(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION lioris_internal.is_staff_or_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION lioris_internal.can_manage_minor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION lioris_internal.viewer_sees_minors() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION lioris_internal.connected_with_viewer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION lioris_internal.connection_request_blocked(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION lioris_internal.minor_dm_allowed(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION lioris_internal.dm_send_block(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION lioris_internal.dm_member_block(uuid, uuid) TO authenticated, service_role;

-- public.is_minor(uuid): the helper the product asked for. A signed-in member only gets an answer about
-- themselves (or a member they administer); anyone else gets false, so it is not an oracle.
CREATE OR REPLACE FUNCTION public.is_minor(p_uid uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF p_uid IS NULL THEN RETURN false; END IF;
  IF v_caller IS NULL THEN
    IF COALESCE(auth.role(), '') = 'anon' THEN RETURN false; END IF;   -- signed out
  ELSIF v_caller <> p_uid AND NOT lioris_internal.can_manage_minor(p_uid) THEN
    RETURN false;
  END IF;
  RETURN lioris_internal.is_minor_raw(p_uid);
END
$$;
REVOKE ALL ON FUNCTION public.is_minor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_minor(uuid) TO authenticated, service_role;

-- ============================================================================
-- 5. Date of birth is write-once: column grants + trigger
-- ============================================================================
-- profiles had TABLE-level UPDATE / INSERT for authenticated (SELECT is already column-level). A column
-- REVOKE cannot carve one column out of a table grant, so convert both to explicit column lists that
-- contain every current column EXCEPT date_of_birth. Skipped when already converted (re-run safe).
DO $do$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position) INTO v_cols
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'profiles' AND c.column_name <> 'date_of_birth';
  IF has_table_privilege('authenticated', 'public.profiles', 'UPDATE') THEN
    REVOKE UPDATE ON public.profiles FROM authenticated;
    EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', v_cols);
  END IF;
  IF has_table_privilege('authenticated', 'public.profiles', 'INSERT') THEN
    REVOKE INSERT ON public.profiles FROM authenticated;
    EXECUTE format('GRANT INSERT (%s) ON public.profiles TO authenticated', v_cols);
  END IF;
END
$do$;

-- Backstop for the grants above (and for anything that reaches the table as another client role).
-- SECURITY INVOKER on purpose: current_user is the caller's role for a direct write, and the function
-- owner when the write comes from one of the SECURITY DEFINER functions below.
CREATE OR REPLACE FUNCTION lioris_internal.profiles_dob_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client boolean := current_user IN ('anon', 'authenticated');
  v_age integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.date_of_birth IS NOT NULL AND v_client THEN
      RAISE EXCEPTION 'DOB_LOCKED: Date of birth can only be recorded with set_my_date_of_birth().' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth AND v_client THEN
    RAISE EXCEPTION 'DOB_LOCKED: Your date of birth cannot be changed once it is recorded. Contact support to correct a mistake.' USING ERRCODE = '42501';
  END IF;

  IF NEW.date_of_birth IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth) THEN
    IF NEW.date_of_birth > current_date OR NEW.date_of_birth < current_date - interval '120 years' THEN
      RAISE EXCEPTION 'DOB_INVALID: That date of birth is not valid.' USING ERRCODE = '22023';
    END IF;
    v_age := public.age_years(NEW.date_of_birth);
    IF v_age < 13 AND NEW.role::text <> 'admin' THEN
      -- Under 13: the account is blocked with a reason the sign-in screen shows.
      NEW.is_suspended := true;
      NEW.suspension_reason := 'AGE_UNDER_13: Lioris is for people aged 13 and over. If your date of birth was entered by mistake, contact support to have it corrected.';
    ELSIF TG_OP = 'UPDATE' AND COALESCE(OLD.suspension_reason, '') LIKE 'AGE_UNDER_13:%' AND v_age >= 13 THEN
      -- An administrator corrected the date: lift the age block (and only that block).
      NEW.is_suspended := false;
      NEW.suspension_reason := NULL;
    END IF;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION lioris_internal.profiles_dob_guard() FROM PUBLIC, anon;

-- 'zz' so it fires after the other BEFORE triggers (the escalation guard resets is_suspended for a
-- member's own update; the age block must have the last word).
DROP TRIGGER IF EXISTS trg_zz_profiles_dob_guard ON public.profiles;
CREATE TRIGGER trg_zz_profiles_dob_guard
  BEFORE INSERT OR UPDATE OF date_of_birth ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION lioris_internal.profiles_dob_guard();

-- ============================================================================
-- 6. Sign-up trigger: refuse under 13 (copy of the 20261107 definition + the DOB block)
-- ============================================================================
-- Same function as 20261107000000 (role/campus derivation, age flag, username fallback loop, consent record,
-- duplicate e-mail survival) with the "MINORS:" blocks added.
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
    v_try int;
    v_dob_raw text;
    v_dob date;
BEGIN
    -- MINORS: a date of birth in the sign-up metadata is validated BEFORE anything is created. Under 13
    -- (or an impossible date) aborts the sign-up. No date at all is accepted (older app builds, admin-created
    -- accounts): the member is asked for it after sign-in and counts as an adult until they give it.
    v_dob_raw := NULLIF(btrim(NEW.raw_user_meta_data->>'date_of_birth'), '');
    IF v_dob_raw IS NOT NULL THEN
        IF v_dob_raw ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
            BEGIN
                v_dob := v_dob_raw::date;
            EXCEPTION WHEN OTHERS THEN
                v_dob := NULL;
            END;
        END IF;
        IF v_dob IS NULL OR v_dob > current_date OR v_dob < current_date - interval '120 years' THEN
            RAISE EXCEPTION 'DOB_INVALID: Enter your real date of birth to create an account.' USING ERRCODE = '22023';
        END IF;
        IF public.age_years(v_dob) < 13 THEN
            RAISE EXCEPTION 'AGE_UNDER_13: You must be at least 13 years old to create a Lioris account.' USING ERRCODE = 'P0001';
        END IF;
    END IF;

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

    BEGIN
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
    EXCEPTION WHEN unique_violation THEN
        -- A stale or differently-cased profile row already owns this e-mail (profiles_email_key).
        -- Sign-up must not fail because of it: create the profile with a placeholder address that
        -- cannot collide, and say so. (A row with this id may also have appeared concurrently.)
        RAISE WARNING 'handle_new_user_profile: e-mail already used by another profile row, using a placeholder for %', NEW.id;
        INSERT INTO public.profiles (id, email, full_name, role, campus_code, verification_status)
        VALUES (
            NEW.id,
            'pending+' || NEW.id::text || '@email-conflict.invalid',
            COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1)),
            v_role,
            v_campus,
            'unverified'::public.verification_status_type
        )
        ON CONFLICT (id) DO NOTHING;
    END;

    -- MINORS: store the validated date of birth (the profile may pre-exist from a backfill, hence UPDATE).
    IF v_dob IS NOT NULL THEN
        UPDATE public.profiles SET date_of_birth = v_dob WHERE id = NEW.id AND date_of_birth IS NULL;
    END IF;

    -- Username. A taken, reserved or malformed handle must never make sign-up itself fail, and must never leave
    -- the member with NO handle either (two people can pass the availability check at the same moment, and
    -- the unique index then rejects the second). The second person gets the handle plus a short number and is
    -- told on the next screen; they can change it in Settings.
    v_username := lower(trim(COALESCE(NEW.raw_user_meta_data->>'username', '')));
    IF v_username !~ '^[a-z0-9._]{3,24}$' OR public.is_reserved_username(v_username) THEN
        v_username := left(regexp_replace(lower(split_part(NEW.email, '@', 1)), '[^a-z0-9._]', '', 'g'), 18);
        IF length(v_username) < 3 OR public.is_reserved_username(v_username) THEN
            v_username := 'student';
        END IF;
    END IF;
    v_try := 0;
    LOOP
        BEGIN
            UPDATE public.profiles
               SET username = CASE WHEN v_try = 0 THEN v_username
                                   ELSE left(v_username, 19) || (1000 + floor(random() * 9000))::int END
             WHERE id = NEW.id;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            v_try := v_try + 1;
            IF v_try > 8 THEN
                EXIT; -- vanishingly unlikely; the member keeps no handle and is asked to pick one
            END IF;
        WHEN OTHERS THEN
            EXIT;
        END;
    END LOOP;

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

-- ============================================================================
-- 7. Member RPCs
-- ============================================================================
-- The member-facing status document, built once and shared by the RPCs below.
CREATE OR REPLACE FUNCTION lioris_internal.minor_status_json(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dob date;
  v_age integer;
  v_minor boolean;
  v_g public.guardian_records%ROWTYPE;
  v_status text;
  v_limited boolean;
BEGIN
  SELECT p.date_of_birth INTO v_dob FROM public.profiles p WHERE p.id = p_uid;
  v_age := public.age_years(v_dob);
  v_minor := COALESCE(v_age < 18, false);
  SELECT * INTO v_g FROM public.guardian_records g WHERE g.minor_id = p_uid;
  v_status := CASE WHEN NOT v_minor THEN 'not_required' WHEN v_g.id IS NULL THEN 'missing' ELSE v_g.consent_status END;
  v_limited := v_minor AND v_status <> 'confirmed';
  RETURN jsonb_build_object(
    'date_of_birth_set', v_dob IS NOT NULL,
    'age_years', v_age,
    'is_minor', v_minor,
    'is_under_13', COALESCE(v_age < 13, false),
    'consent_status', v_status,
    'is_limited', v_limited,
    'restrictions',
      CASE WHEN NOT v_minor THEN '[]'::jsonb
           WHEN v_limited THEN '["marketplace_listings", "giving", "job_postings", "direct_messages", "discoverability"]'::jsonb
           ELSE '["marketplace_listings", "giving"]'::jsonb END,
    'guardian',
      CASE WHEN NOT v_minor OR v_g.id IS NULL THEN NULL
           ELSE jsonb_build_object('name', v_g.guardian_name, 'relationship', v_g.relationship,
                                   'email', v_g.guardian_email, 'phone', v_g.guardian_phone,
                                   'submitted_at', v_g.submitted_at, 'decided_at', v_g.consent_decided_at) END
  );
END
$$;
REVOKE ALL ON FUNCTION lioris_internal.minor_status_json(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lioris_internal.minor_status_json(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_minor_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000'; END IF;
  RETURN lioris_internal.minor_status_json(auth.uid());
END
$$;
REVOKE ALL ON FUNCTION public.get_my_minor_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_minor_status() TO authenticated;

-- First (and only) time a member records their own date of birth. Existing members have NULL until they do.
CREATE OR REPLACE FUNCTION public.set_my_date_of_birth(p_dob date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current date;
  v_role text;
  v_age integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000'; END IF;
  IF p_dob IS NULL OR p_dob > current_date OR p_dob < current_date - interval '120 years' THEN
    RAISE EXCEPTION 'DOB_INVALID: Enter a real date of birth.' USING ERRCODE = '22023';
  END IF;

  SELECT p.date_of_birth, p.role::text INTO v_current, v_role FROM public.profiles p WHERE p.id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found.' USING ERRCODE = 'P0002'; END IF;
  IF v_current IS NOT NULL THEN
    RAISE EXCEPTION 'DOB_LOCKED: Your date of birth is already on record and cannot be changed. Contact support to correct a mistake.' USING ERRCODE = '42501';
  END IF;

  v_age := public.age_years(p_dob);
  IF v_age < 13 AND v_role = 'admin' THEN
    RAISE EXCEPTION 'DOB_INVALID: Administrator accounts must belong to an adult.' USING ERRCODE = '22023';
  END IF;

  -- The trigger suspends the account when the member is under 13.
  UPDATE public.profiles SET date_of_birth = p_dob WHERE id = v_uid;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, CASE WHEN v_age < 13 THEN 'underage_account_blocked' ELSE 'date_of_birth_recorded' END, 'user', v_uid,
          jsonb_build_object('summary', 'Member recorded their date of birth',
                             'ageBand', CASE WHEN v_age < 13 THEN 'under_13' WHEN v_age < 18 THEN '13_17' ELSE '18_plus' END,
                             'source', 'set_my_date_of_birth'));

  RETURN lioris_internal.minor_status_json(v_uid) || jsonb_build_object('blocked', v_age < 13);
END
$$;
REVOKE ALL ON FUNCTION public.set_my_date_of_birth(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_date_of_birth(date) TO authenticated;

-- A minor (13-17) records or re-submits their guardian's details. Changed details restart consent
-- (status back to pending); identical details change nothing. A member can never set the status themselves.
CREATE OR REPLACE FUNCTION public.submit_guardian_details(
  p_name text, p_relationship text, p_email text DEFAULT NULL, p_phone text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dob date;
  v_campus text;
  v_age integer;
  v_name text := btrim(COALESCE(p_name, ''));
  v_rel text := lower(btrim(COALESCE(p_relationship, '')));
  v_email text := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  v_phone text := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_old public.guardian_records%ROWTYPE;
  v_changed boolean := true;
  v_prev text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000'; END IF;
  SELECT p.date_of_birth, p.campus_code INTO v_dob, v_campus FROM public.profiles p WHERE p.id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found.' USING ERRCODE = 'P0002'; END IF;
  IF v_dob IS NULL THEN
    RAISE EXCEPTION 'GUARDIAN_NOT_NEEDED: Add your date of birth first.' USING ERRCODE = 'P0001';
  END IF;
  v_age := public.age_years(v_dob);
  IF v_age < 13 THEN
    RAISE EXCEPTION 'AGE_UNDER_13: You must be at least 13 years old to use Lioris.' USING ERRCODE = '42501';
  END IF;
  IF v_age >= 18 THEN
    RAISE EXCEPTION 'GUARDIAN_NOT_NEEDED: Guardian details are only needed for members under 18.' USING ERRCODE = 'P0001';
  END IF;

  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'GUARDIAN_INVALID: Enter your parent or guardian''s full name.' USING ERRCODE = '22023';
  END IF;
  IF v_rel NOT IN ('parent', 'legal_guardian', 'grandparent', 'other_relative', 'other') THEN
    RAISE EXCEPTION 'GUARDIAN_INVALID: Choose how this person is related to you.' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NULL AND v_phone IS NULL THEN
    RAISE EXCEPTION 'GUARDIAN_INVALID: Give an e-mail address or a phone number so we can reach your guardian.' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NOT NULL AND (char_length(v_email) > 254 OR v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') THEN
    RAISE EXCEPTION 'GUARDIAN_INVALID: That e-mail address does not look right.' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NOT NULL AND v_phone !~ '^\+?[0-9][0-9 ()-]{5,19}$' THEN
    RAISE EXCEPTION 'GUARDIAN_INVALID: That phone number does not look right (digits, spaces, + ( ) - only).' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(*) FROM public.audit_logs a
       WHERE a.actor_id = v_uid AND a.action = 'guardian_details_submitted' AND a.created_at > now() - interval '1 day') >= 10 THEN
    RAISE EXCEPTION 'Rate limit: too many guardian detail submissions - please try again tomorrow.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_old FROM public.guardian_records g WHERE g.minor_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.guardian_records (minor_id, guardian_name, relationship, guardian_email, guardian_phone)
    VALUES (v_uid, v_name, v_rel, v_email, v_phone);
    v_prev := 'missing';
  ELSE
    v_prev := v_old.consent_status;
    v_changed := v_old.guardian_name IS DISTINCT FROM v_name OR v_old.relationship IS DISTINCT FROM v_rel
              OR v_old.guardian_email IS DISTINCT FROM v_email OR v_old.guardian_phone IS DISTINCT FROM v_phone;
    IF v_changed THEN
      -- New details are a new person to ask: earlier consent no longer applies.
      UPDATE public.guardian_records
         SET guardian_name = v_name, relationship = v_rel, guardian_email = v_email, guardian_phone = v_phone,
             consent_status = 'pending', consent_method = NULL, consent_note = NULL,
             consent_decided_at = NULL, consent_decided_by = NULL,
             submitted_at = now(), updated_at = now()
       WHERE minor_id = v_uid;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'guardian_details_submitted', 'user', v_uid,
          jsonb_build_object('summary', 'Minor submitted guardian details', 'changed', v_changed,
                             'previousStatus', v_prev, 'targetCampus', v_campus, 'source', 'submit_guardian_details'));

  RETURN lioris_internal.minor_status_json(v_uid);
END
$$;
REVOKE ALL ON FUNCTION public.submit_guardian_details(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_guardian_details(text, text, text, text) TO authenticated;

-- ============================================================================
-- 8. Admin RPCs (campus admin: own campus; Super Admin: everywhere). Staff have no access.
-- ============================================================================
-- The caller's scope: NULL campus = every campus (Super Admin); otherwise their own real campus.
CREATE OR REPLACE FUNCTION lioris_internal.minor_admin_scope(p_campus text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_campus text;
  v_want text := NULLIF(upper(btrim(COALESCE(p_campus, ''))), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000'; END IF;
  IF public.auth_is_super_admin() THEN
    IF v_want IN ('ALL') THEN v_want := NULL; END IF;
    RETURN v_want;
  END IF;
  SELECT p.role::text, p.campus_code INTO v_role, v_campus FROM public.profiles p WHERE p.id = v_uid;
  IF v_role IS DISTINCT FROM 'admin' OR v_campus IS NULL OR v_campus = 'GLOBAL' OR NOT public.can_admin_campus(v_campus) THEN
    RAISE EXCEPTION 'Only a campus administrator or a Super Admin can manage guardian consent.' USING ERRCODE = '42501';
  END IF;
  IF v_want IS NOT NULL AND v_want <> 'ALL' AND v_want <> upper(v_campus) THEN
    RAISE EXCEPTION 'You can only manage members of your own campus.' USING ERRCODE = '42501';
  END IF;
  RETURN v_campus;
END
$$;
REVOKE ALL ON FUNCTION lioris_internal.minor_admin_scope(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lioris_internal.minor_admin_scope(text) TO service_role;

DROP FUNCTION IF EXISTS public.admin_list_minors(text, text, integer, integer);
CREATE FUNCTION public.admin_list_minors(
  p_status text DEFAULT 'pending', p_campus text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE (
  minor_id uuid, full_name text, campus_code text, role text, age_years integer, consent_status text,
  guardian_name text, guardian_relationship text, submitted_at timestamptz, consent_decided_at timestamptz,
  decided_by_name text, joined_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_status text := lower(btrim(COALESCE(p_status, 'pending')));
  v_campus text;
BEGIN
  IF v_status NOT IN ('pending', 'missing', 'confirmed', 'declined', 'revoked', 'under_13', 'all') THEN
    RAISE EXCEPTION 'Unknown status filter.' USING ERRCODE = '22023';
  END IF;
  v_campus := lioris_internal.minor_admin_scope(p_campus);

  RETURN QUERY
  SELECT p.id, p.full_name, p.campus_code, p.role::text, public.age_years(p.date_of_birth),
         CASE WHEN public.age_years(p.date_of_birth) < 13 THEN 'under_13' ELSE COALESCE(g.consent_status, 'missing') END,
         g.guardian_name, g.relationship, g.submitted_at, g.consent_decided_at, d.full_name, p.created_at
    FROM public.profiles p
    LEFT JOIN public.guardian_records g ON g.minor_id = p.id
    LEFT JOIN public.profiles d ON d.id = g.consent_decided_by
   WHERE p.date_of_birth IS NOT NULL
     AND public.age_years(p.date_of_birth) < 18
     AND (v_campus IS NULL OR p.campus_code = v_campus)
     AND CASE v_status
           WHEN 'under_13' THEN public.age_years(p.date_of_birth) < 13
           WHEN 'all' THEN true
           WHEN 'pending' THEN public.age_years(p.date_of_birth) >= 13 AND COALESCE(g.consent_status, 'missing') IN ('missing', 'pending')
           ELSE public.age_years(p.date_of_birth) >= 13 AND COALESCE(g.consent_status, 'missing') = v_status
         END
   ORDER BY COALESCE(g.submitted_at, p.created_at) ASC, p.id
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END
$$;
REVOKE ALL ON FUNCTION public.admin_list_minors(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_minors(text, text, integer, integer) TO authenticated;

-- One member's guardian record in full (contact details, internal note). Viewing it is audited.
CREATE OR REPLACE FUNCTION public.admin_get_minor_guardian(p_minor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.profiles%ROWTYPE;
  v_g public.guardian_records%ROWTYPE;
  v_decider text;
BEGIN
  PERFORM lioris_internal.minor_admin_scope(NULL);
  IF p_minor IS NULL OR NOT lioris_internal.can_manage_minor(p_minor) THEN
    RAISE EXCEPTION 'You can only manage members of your own campus.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_p FROM public.profiles WHERE id = p_minor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found.' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_g FROM public.guardian_records WHERE minor_id = p_minor;
  IF v_g.consent_decided_by IS NOT NULL THEN
    SELECT full_name INTO v_decider FROM public.profiles WHERE id = v_g.consent_decided_by;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'guardian_record_viewed', 'user', p_minor,
          jsonb_build_object('summary', 'Administrator opened a guardian record', 'targetCampus', v_p.campus_code,
                             'source', 'admin_get_minor_guardian'));

  RETURN jsonb_build_object(
    'minor', jsonb_build_object('id', v_p.id, 'full_name', v_p.full_name, 'campus_code', v_p.campus_code,
                                'role', v_p.role::text, 'date_of_birth', v_p.date_of_birth,
                                'age_years', public.age_years(v_p.date_of_birth)),
    'consent_status', CASE WHEN COALESCE(public.age_years(v_p.date_of_birth), 99) >= 18 THEN 'not_required'
                           WHEN v_g.id IS NULL THEN 'missing' ELSE v_g.consent_status END,
    'guardian', CASE WHEN v_g.id IS NULL THEN NULL ELSE jsonb_build_object(
        'name', v_g.guardian_name, 'relationship', v_g.relationship, 'email', v_g.guardian_email,
        'phone', v_g.guardian_phone, 'submitted_at', v_g.submitted_at, 'decided_at', v_g.consent_decided_at,
        'decided_by_name', v_decider, 'method', v_g.consent_method, 'note', v_g.consent_note) END
  );
END
$$;
REVOKE ALL ON FUNCTION public.admin_get_minor_guardian(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_minor_guardian(uuid) TO authenticated;

-- Record / confirm / decline / revoke consent (or reset to pending). If the member never submitted guardian
-- details, the administrator supplies them with the first decision. Writes an audit row (no personal
-- details in it: those stay in the guardian record).
CREATE OR REPLACE FUNCTION public.admin_record_guardian_consent(
  p_minor uuid, p_status text, p_note text,
  p_guardian_name text DEFAULT NULL, p_relationship text DEFAULT NULL,
  p_email text DEFAULT NULL, p_phone text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text := lower(btrim(COALESCE(p_status, '')));
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_name text := NULLIF(btrim(COALESCE(p_guardian_name, '')), '');
  v_rel text := NULLIF(lower(btrim(COALESCE(p_relationship, ''))), '');
  v_email text := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  v_phone text := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_p public.profiles%ROWTYPE;
  v_g public.guardian_records%ROWTYPE;
  v_age integer;
  v_prev text;
  v_ok boolean;
BEGIN
  PERFORM lioris_internal.minor_admin_scope(NULL);
  IF v_status NOT IN ('pending', 'confirmed', 'declined', 'revoked') THEN
    RAISE EXCEPTION 'CONSENT_INVALID: Status must be pending, confirmed, declined or revoked.' USING ERRCODE = '22023';
  END IF;
  IF v_status <> 'pending' AND (v_note IS NULL OR char_length(v_note) < 3) THEN
    RAISE EXCEPTION 'CONSENT_INVALID: Say how consent was verified (for example "phone call with parent, 11 Nov").' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'CONSENT_INVALID: The note is too long (500 characters at most).' USING ERRCODE = '22023';
  END IF;
  IF p_minor IS NULL OR p_minor = v_uid THEN
    RAISE EXCEPTION 'CONSENT_INVALID: You cannot record consent for your own account.' USING ERRCODE = '42501';
  END IF;
  IF NOT lioris_internal.can_manage_minor(p_minor) THEN
    RAISE EXCEPTION 'You can only manage members of your own campus.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_p FROM public.profiles WHERE id = p_minor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found.' USING ERRCODE = 'P0002'; END IF;
  v_age := public.age_years(v_p.date_of_birth);
  IF v_age IS NULL OR v_age >= 18 THEN
    RAISE EXCEPTION 'CONSENT_INVALID: This member is not recorded as under 18, so no guardian consent is needed.' USING ERRCODE = '22023';
  END IF;
  IF v_age < 13 THEN
    RAISE EXCEPTION 'AGE_UNDER_13: Members under 13 cannot use Lioris. Correct the date of birth first if it was entered by mistake.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_g FROM public.guardian_records WHERE minor_id = p_minor FOR UPDATE;
  IF NOT FOUND THEN
    IF v_name IS NULL OR v_rel IS NULL OR (v_email IS NULL AND v_phone IS NULL) THEN
      RAISE EXCEPTION 'GUARDIAN_INVALID: This member has not submitted guardian details. Enter the guardian''s name, relationship and an e-mail or phone number.' USING ERRCODE = '22023';
    END IF;
    IF v_rel NOT IN ('parent', 'legal_guardian', 'grandparent', 'other_relative', 'other') THEN
      RAISE EXCEPTION 'GUARDIAN_INVALID: Unknown relationship.' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
      RAISE EXCEPTION 'GUARDIAN_INVALID: The guardian''s name must be 2 to 120 characters.' USING ERRCODE = '22023';
    END IF;
    IF v_email IS NOT NULL AND (char_length(v_email) > 254 OR v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') THEN
      RAISE EXCEPTION 'GUARDIAN_INVALID: That e-mail address does not look right.' USING ERRCODE = '22023';
    END IF;
    IF v_phone IS NOT NULL AND v_phone !~ '^\+?[0-9][0-9 ()-]{5,19}$' THEN
      RAISE EXCEPTION 'GUARDIAN_INVALID: That phone number does not look right.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.guardian_records (minor_id, guardian_name, relationship, guardian_email, guardian_phone)
    VALUES (p_minor, v_name, v_rel, v_email, v_phone)
    RETURNING * INTO v_g;
    v_prev := 'missing';
  ELSE
    v_prev := v_g.consent_status;
  END IF;

  v_ok := CASE v_status
            WHEN 'confirmed' THEN v_prev IN ('missing', 'pending', 'declined', 'revoked')
            WHEN 'declined' THEN v_prev IN ('missing', 'pending')
            WHEN 'revoked' THEN v_prev = 'confirmed'
            WHEN 'pending' THEN v_prev IN ('declined', 'revoked')
          END;
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'CONSENT_INVALID: Consent is currently "%": it cannot be changed to "%".', v_prev, v_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.guardian_records
     SET consent_status = v_status,
         consent_method = CASE WHEN v_status = 'pending' THEN NULL ELSE 'admin_recorded' END,
         consent_note = CASE WHEN v_status = 'pending' THEN NULL ELSE v_note END,
         consent_decided_at = CASE WHEN v_status = 'pending' THEN NULL ELSE now() END,
         consent_decided_by = CASE WHEN v_status = 'pending' THEN NULL ELSE v_uid END,
         updated_at = now()
   WHERE minor_id = p_minor;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'guardian_consent_' || v_status, 'user', p_minor,
          jsonb_build_object('summary', 'Guardian consent ' || v_status, 'previousStatus', v_prev, 'newStatus', v_status,
                             'hasNote', v_note IS NOT NULL, 'targetCampus', v_p.campus_code, 'source', 'admin_record_guardian_consent'));

  RETURN lioris_internal.minor_status_json(p_minor);
END
$$;
REVOKE ALL ON FUNCTION public.admin_record_guardian_consent(uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_guardian_consent(uuid, text, text, text, text, text, text) TO authenticated;

-- The only way to change a recorded date of birth. A reason is mandatory and the change is audited
-- (ages, not dates, go in the audit row). Correcting to 18+ removes the now-pointless guardian record;
-- correcting an "under 13" mistake lifts the age block through the trigger.
CREATE OR REPLACE FUNCTION public.admin_correct_date_of_birth(p_user uuid, p_dob date, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_t public.profiles%ROWTYPE;
  v_old_age integer;
  v_new_age integer;
  v_removed boolean := false;
BEGIN
  PERFORM lioris_internal.minor_admin_scope(NULL);
  IF v_reason IS NULL OR char_length(v_reason) < 10 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'DOB_INVALID: Give a reason of 10 to 500 characters (what evidence was seen).' USING ERRCODE = '22023';
  END IF;
  IF p_dob IS NULL OR p_dob > current_date OR p_dob < current_date - interval '120 years' THEN
    RAISE EXCEPTION 'DOB_INVALID: Enter a real date of birth.' USING ERRCODE = '22023';
  END IF;
  IF p_user IS NULL OR p_user = v_uid THEN
    RAISE EXCEPTION 'DOB_INVALID: You cannot correct your own date of birth.' USING ERRCODE = '42501';
  END IF;
  IF NOT lioris_internal.can_manage_minor(p_user) THEN
    RAISE EXCEPTION 'You can only manage members of your own campus.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_t FROM public.profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found.' USING ERRCODE = 'P0002'; END IF;
  IF (v_t.role::text = 'admin' OR v_t.admin_role = 'super_admin') AND NOT public.auth_is_super_admin() THEN
    RAISE EXCEPTION 'Only a Super Admin can change an administrator''s date of birth.' USING ERRCODE = '42501';
  END IF;
  v_old_age := public.age_years(v_t.date_of_birth);
  v_new_age := public.age_years(p_dob);
  IF v_new_age < 13 AND v_t.role::text = 'admin' THEN
    RAISE EXCEPTION 'DOB_INVALID: Administrator accounts must belong to an adult.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles SET date_of_birth = p_dob WHERE id = p_user;
  IF v_new_age >= 18 THEN
    DELETE FROM public.guardian_records WHERE minor_id = p_user;
    v_removed := FOUND;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'date_of_birth_corrected', 'user', p_user,
          jsonb_build_object('summary', 'Administrator corrected a date of birth', 'reason', v_reason,
                             'hadDateOfBirth', v_t.date_of_birth IS NOT NULL, 'previousAge', v_old_age, 'newAge', v_new_age,
                             'guardianRecordRemoved', v_removed, 'targetCampus', v_t.campus_code,
                             'source', 'admin_correct_date_of_birth'));

  RETURN lioris_internal.minor_status_json(p_user);
END
$$;
REVOKE ALL ON FUNCTION public.admin_correct_date_of_birth(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_correct_date_of_birth(uuid, date, text) TO authenticated;

-- Diagnostics: counts, and the members who have NO date of birth yet (they are treated as adults until they add one).
CREATE OR REPLACE FUNCTION public.admin_age_diagnostics(p_campus text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campus text := lioris_internal.minor_admin_scope(p_campus);
  v_result jsonb;
BEGIN
  WITH m AS (
    SELECT p.id, p.full_name, p.role::text AS role, p.campus_code, p.created_at, p.date_of_birth,
           public.age_years(p.date_of_birth) AS age, COALESCE(g.consent_status, 'missing') AS consent
      FROM public.profiles p
      LEFT JOIN public.guardian_records g ON g.minor_id = p.id
     WHERE NOT COALESCE(p.is_bot, false) AND (v_campus IS NULL OR p.campus_code = v_campus)
  )
  SELECT jsonb_build_object(
    'scope', COALESCE(v_campus, 'ALL'),
    'members_total', (SELECT count(*) FROM m),
    'missing_date_of_birth', (SELECT count(*) FROM m WHERE date_of_birth IS NULL),
    'missing_date_of_birth_by_role',
      COALESCE((SELECT jsonb_object_agg(role, n) FROM (SELECT role, count(*) AS n FROM m WHERE date_of_birth IS NULL GROUP BY role) r), '{}'::jsonb),
    'minors_total', (SELECT count(*) FROM m WHERE age BETWEEN 13 AND 17),
    'minors_by_consent',
      COALESCE((SELECT jsonb_object_agg(consent, n) FROM (SELECT consent, count(*) AS n FROM m WHERE age BETWEEN 13 AND 17 GROUP BY consent) c), '{}'::jsonb),
    'under_13_blocked', (SELECT count(*) FROM m WHERE age < 13),
    'missing_date_of_birth_sample',
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'full_name', s.full_name, 'role', s.role,
                                                    'campus_code', s.campus_code, 'created_at', s.created_at) ORDER BY s.created_at)
                  FROM (SELECT * FROM m WHERE date_of_birth IS NULL ORDER BY created_at LIMIT 25) s), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END
$$;
REVOKE ALL ON FUNCTION public.admin_age_diagnostics(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_age_diagnostics(text) TO authenticated;

-- Retention: guardian details have no purpose once the member is an adult. Service role only; run it
-- from a scheduled job (not scheduled here: the cron extension is optional on this project).
CREATE OR REPLACE FUNCTION public.purge_guardian_records_for_adults(p_grace_days integer DEFAULT 30, p_limit integer DEFAULT 5000)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n bigint;
BEGIN
  DELETE FROM public.guardian_records g
   WHERE g.id IN (
     SELECT g2.id FROM public.guardian_records g2
       JOIN public.profiles p ON p.id = g2.minor_id
      WHERE p.date_of_birth IS NOT NULL
        AND p.date_of_birth <= current_date - (interval '18 years' + make_interval(days => GREATEST(COALESCE(p_grace_days, 30), 0)))
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 100000));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF to_regprocedure('public.log_retention_purge(text,bigint,jsonb)') IS NOT NULL THEN
    PERFORM public.log_retention_purge('guardian_records_adults', v_n);
  END IF;
  RETURN v_n;
END
$$;
REVOKE ALL ON FUNCTION public.purge_guardian_records_for_adults(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_guardian_records_for_adults(integer, integer) TO service_role;

-- ============================================================================
-- 9. Enforcement
-- ============================================================================
-- One trigger function gives a refused member a message they can act on (RLS alone only says "row-level
-- security"); the restrictive policies below repeat the rule as a backstop. Server-side callers (no JWT:
-- service role, SQL editor) are not restricted.
CREATE OR REPLACE FUNCTION lioris_internal.enforce_minor_restriction()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind text := TG_ARGV[0];
  v_uid uuid := auth.uid();
  v_block text;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  IF v_kind = 'marketplace' THEN
    IF lioris_internal.is_minor_raw(v_uid) THEN
      RAISE EXCEPTION 'MINOR_RESTRICTED: Members under 18 cannot create marketplace listings.' USING ERRCODE = '42501';
    END IF;
  ELSIF v_kind = 'giving' THEN
    IF lioris_internal.is_minor_raw(v_uid) THEN
      RAISE EXCEPTION 'MINOR_RESTRICTED: Members under 18 cannot start giving campaigns.' USING ERRCODE = '42501';
    END IF;
  ELSIF v_kind = 'jobs' THEN
    IF lioris_internal.is_limited_minor_raw(v_uid) THEN
      RAISE EXCEPTION 'MINOR_RESTRICTED: Posting jobs unlocks once a parent or guardian has confirmed consent for your account.' USING ERRCODE = '42501';
    END IF;
  ELSIF v_kind = 'dm_message' THEN
    v_block := lioris_internal.dm_send_block(NEW.channel_id, v_uid);
  ELSIF v_kind = 'dm_member' THEN
    v_block := lioris_internal.dm_member_block(NEW.channel_id, NEW.user_id);
  ELSIF v_kind = 'connection' THEN
    IF NEW.requester_id = v_uid AND lioris_internal.connection_request_blocked(NEW.requester_id, NEW.recipient_id) THEN
      RAISE EXCEPTION 'MINOR_RESTRICTED: You cannot send a connection request to this member right now.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_block = 'self' THEN
    RAISE EXCEPTION 'MINOR_RESTRICTED: Until a parent or guardian has confirmed consent for your account, you can only message people you are connected with.' USING ERRCODE = '42501';
  ELSIF v_block = 'other' THEN
    RAISE EXCEPTION 'MINOR_RESTRICTED: You cannot message this member right now.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION lioris_internal.enforce_minor_restriction() FROM PUBLIC, anon;

DO $enf$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('marketplace_listings',  'marketplace', 'trg_minor_restriction'),
      ('giving_campaigns',      'giving',      'trg_minor_restriction'),
      ('jobs',                  'jobs',        'trg_minor_restriction'),
      ('chat_messages',         'dm_message',  'trg_minor_restriction'),
      ('chat_channel_members',  'dm_member',   'trg_minor_restriction'),
      ('connections',           'connection',  'trg_minor_restriction')
    ) AS x(tbl, kind, trg)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.trg, r.tbl);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION lioris_internal.enforce_minor_restriction(%L)',
                   r.trg, r.tbl, r.kind);
  END LOOP;

  -- Backstop policies (RESTRICTIVE = ANDed with every existing permissive policy).
  IF to_regclass('public.marketplace_listings') IS NOT NULL THEN
    DROP POLICY IF EXISTS minor_restriction_insert ON public.marketplace_listings;
    CREATE POLICY minor_restriction_insert ON public.marketplace_listings AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK ((SELECT NOT lioris_internal.is_minor_raw(auth.uid())));
  END IF;
  IF to_regclass('public.giving_campaigns') IS NOT NULL THEN
    DROP POLICY IF EXISTS minor_restriction_insert ON public.giving_campaigns;
    CREATE POLICY minor_restriction_insert ON public.giving_campaigns AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK ((SELECT NOT lioris_internal.is_minor_raw(auth.uid())));
  END IF;
  IF to_regclass('public.jobs') IS NOT NULL THEN
    DROP POLICY IF EXISTS minor_restriction_insert ON public.jobs;
    CREATE POLICY minor_restriction_insert ON public.jobs AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK ((SELECT NOT lioris_internal.is_limited_minor_raw(auth.uid())));
  END IF;
  IF to_regclass('public.chat_messages') IS NOT NULL THEN
    DROP POLICY IF EXISTS minor_restriction_insert ON public.chat_messages;
    CREATE POLICY minor_restriction_insert ON public.chat_messages AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (lioris_internal.dm_send_block(channel_id, auth.uid()) IS NULL);
  END IF;
  IF to_regclass('public.chat_channel_members') IS NOT NULL THEN
    DROP POLICY IF EXISTS minor_restriction_insert ON public.chat_channel_members;
    CREATE POLICY minor_restriction_insert ON public.chat_channel_members AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (lioris_internal.dm_member_block(channel_id, user_id) IS NULL);
  END IF;
  IF to_regclass('public.connections') IS NOT NULL THEN
    DROP POLICY IF EXISTS minor_restriction_insert ON public.connections;
    CREATE POLICY minor_restriction_insert ON public.connections AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (NOT lioris_internal.connection_request_blocked(requester_id, recipient_id));
  END IF;
END
$enf$;

-- Profiles: a limited minor is invisible to adult members (every read path: people search, directory,
-- joins). Exempt: the minor themself, other minors, staff / administrators / Super Admins, and people the
-- minor is connected with (pending or accepted). Members with no date of birth are adults. Anonymous
-- visitors never see anyone under 18.
DROP POLICY IF EXISTS minors_hidden_from_adults ON public.profiles;
CREATE POLICY minors_hidden_from_adults ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    date_of_birth IS NULL
    OR public.age_years(date_of_birth) >= 18
    OR id = auth.uid()
    OR (SELECT lioris_internal.viewer_sees_minors())
    OR lioris_internal.has_confirmed_consent(id)
    OR lioris_internal.connected_with_viewer(id)
  );
DROP POLICY IF EXISTS minors_hidden_from_anon ON public.profiles;
CREATE POLICY minors_hidden_from_anon ON public.profiles AS RESTRICTIVE FOR SELECT TO anon
  USING (date_of_birth IS NULL OR public.age_years(date_of_birth) >= 18);

-- get_suggested_connections(): the 20261029 definition with ONE added condition (limited minors are not
-- suggested to adults). It is SECURITY DEFINER, so the profile policy above does not apply to it.
DO $sugg$
BEGIN
  IF to_regclass('public.connections') IS NOT NULL AND to_regclass('public.user_mutes') IS NOT NULL
     AND to_regprocedure('public.users_have_block(uuid,uuid)') IS NOT NULL THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.get_suggested_connections(p_limit INT DEFAULT 10)
      RETURNS TABLE (id UUID, full_name TEXT, role TEXT, department TEXT, level TEXT, avatar_url TEXT)
      LANGUAGE sql SECURITY DEFINER STABLE
      SET search_path = public
      AS $body$
        SELECT p.id, p.full_name, p.role::text, p.department, p.level, p.avatar_url
        FROM profiles p
        WHERE auth.uid() IS NOT NULL
          AND p.id <> auth.uid()
          AND p.role::text IN ('student', 'alumni')
          AND NOT COALESCE(p.is_bot, false)
          AND NOT COALESCE(p.is_suspended, false)
          AND (
            p.campus_code = 'GLOBAL'
            OR p.campus_code = public.campus_of(auth.uid())
          )
          AND NOT public.users_have_block(auth.uid(), p.id)
          AND (NOT lioris_internal.is_limited_minor_raw(p.id) OR lioris_internal.is_minor_raw(auth.uid()))
          AND NOT EXISTS (
              SELECT 1 FROM user_mutes um
              WHERE um.muter_id = auth.uid() AND um.muted_id = p.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM connections c
              WHERE c.status IN ('pending', 'accepted')
                AND (
                    (c.requester_id = auth.uid() AND c.recipient_id = p.id)
                    OR (c.requester_id = p.id AND c.recipient_id = auth.uid())
                )
          )
        ORDER BY random()
        LIMIT GREATEST(COALESCE(p_limit, 10), 0)
      $body$
    $f$;
    REVOKE ALL ON FUNCTION public.get_suggested_connections(INT) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_suggested_connections(INT) TO authenticated, service_role;
  END IF;
END
$sugg$;

-- open_giving_page(): the 20261106 definition with ONE added check (members under 18 cannot give).
CREATE OR REPLACE FUNCTION public.open_giving_page(p_campaign uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_available: Sign in to open a giving page.'; END IF;
  IF lioris_internal.is_minor_raw(auth.uid()) THEN
    RAISE EXCEPTION 'MINOR_RESTRICTED: Members under 18 cannot give through Lioris.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.donations_enabled() THEN
    RAISE EXCEPTION 'donations_disabled: Giving is not open yet.';
  END IF;
  SELECT * INTO v_campaign FROM public.giving_campaigns WHERE id = p_campaign;
  IF v_campaign IS NULL OR v_campaign.review_status <> 'approved' OR v_campaign.is_closed
     OR NOT (v_campaign.campus_code IS NULL OR v_campaign.campus_code = 'GLOBAL'
             OR v_campaign.campus_code = public.auth_campus_access()
             OR public.can_admin_campus(v_campaign.campus_code)) THEN
    RAISE EXCEPTION 'not_available: This campaign is not currently accepting gifts.';
  END IF;

  INSERT INTO public.giving_campaign_clicks (campaign_id, user_id) VALUES (p_campaign, auth.uid());
  RETURN v_campaign.giving_url;
END;
$$;

-- ============================================================================
-- 10. Data lifecycle: export + erasure cover the date of birth and the guardian record
-- ============================================================================
-- Same functions as 20261107000000 with the changes marked "MINORS:". The generic foreign-key discovery
-- in both already reaches guardian_records (minor_id ... ON DELETE CASCADE).
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
      -- MINORS: the member's own guardian record, without the administrator's internal note and who decided.
      WHEN 'guardian_records' THEN ARRAY['consent_note', 'consent_decided_by']
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
  v_hash text;
  v_deleted jsonb := '{}'::jsonb;
  v_anonymised jsonb := '{}'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_sets text[] := ARRAY[]::text[];
  v_col text;
  v_audit_n bigint := 0;
  v_proofs bigint := 0;
  v_uuid text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required.';
  END IF;
  v_uuid := p_user_id::text;
  v_hash := encode(sha256(convert_to(v_uuid, 'UTF8')), 'hex');

  SELECT role::text, email INTO v_role, v_email FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('user_id', p_user_id, 'profile_found', false,
                              'deleted', v_deleted, 'anonymised', v_anonymised,
                              'storage_prefix', v_uuid || '/');
  END IF;
  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Admin accounts cannot be purged; demote the account first.' USING ERRCODE = '42501';
  END IF;

  -- Consent evidence first: it is deleted by the generic loop below.
  IF to_regclass('public.consent_records') IS NOT NULL AND to_regclass('public.consent_proofs') IS NOT NULL THEN
    INSERT INTO public.consent_proofs (user_hash, consent_type, version, accepted_at)
    SELECT DISTINCT v_hash, c.consent_type, c.version, c.accepted_at
      FROM public.consent_records c WHERE c.user_id = p_user_id
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_proofs = ROW_COUNT;
  END IF;

  -- MINORS: guardian record first, explicitly (the foreign-key loop below would cascade it too), so the
  -- purge result names it. The date of birth is cleared with the other profile fields further down.
  IF to_regclass('public.guardian_records') IS NOT NULL THEN
    DELETE FROM public.guardian_records WHERE minor_id = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_deleted := v_deleted || jsonb_build_object('guardian_records.minor_id', v_n); END IF;
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

  -- User columns with no foreign key (nothing cascades them).
  FOR r IN
    SELECT t.tbl, t.col FROM (VALUES
      ('client_errors', 'user_id'),
      ('resource_takedown_requests', 'resource_uploader')
    ) AS t(tbl, col)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema = 'public' AND c.table_name = r.tbl
                  AND c.column_name = r.col AND c.is_nullable = 'YES') THEN
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I = $1', r.tbl, r.col, r.col) USING p_user_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_anonymised := v_anonymised || jsonb_build_object(r.tbl || '.' || r.col, v_n); END IF;
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
                                      'github_url', 'twitter_url', 'portfolio_url', 'resume_url',
                                      'company', 'job_title', 'location', 'industry', 'graduation_year',
                                      'suspension_reason', 'date_of_birth'])
  LOOP
    v_sets := v_sets || format('%I = NULL', v_col);
  END LOOP;
  EXECUTE format(
    'UPDATE public.profiles SET email = %L, full_name = %L, interests = ''{}''%s WHERE id = $1',
    'deleted+' || v_uuid || '@deleted.invalid', 'Deleted user',
    CASE WHEN array_length(v_sets, 1) IS NULL THEN '' ELSE ', ' || array_to_string(v_sets, ', ') END)
    USING p_user_id;

  -- audit_logs: keep the trail, drop the identity. Done AFTER the profile update so the rows the
  -- profile triggers just wrote are covered too.
  PERFORM set_config('lioris.audit_anonymise', 'on', true);
  UPDATE public.audit_logs a
     SET actor_id = CASE WHEN a.actor_id = p_user_id THEN NULL ELSE a.actor_id END,
         entity_id = CASE WHEN a.entity_id = p_user_id THEN NULL ELSE a.entity_id END,
         metadata = CASE
           WHEN a.metadata IS NULL THEN NULL
           WHEN jsonb_typeof(a.metadata) = 'object' THEN
             regexp_replace(a.metadata::text, v_uuid, v_hash, 'gi')::jsonb
             || CASE WHEN a.actor_id = p_user_id THEN jsonb_build_object('actorIdHash', v_hash) ELSE '{}'::jsonb END
             || CASE WHEN a.entity_id = p_user_id THEN jsonb_build_object('entityIdHash', v_hash) ELSE '{}'::jsonb END
             || CASE WHEN a.actor_id = p_user_id AND a.metadata ? 'actorName'
                     THEN jsonb_build_object('actorName', 'Deleted user') ELSE '{}'::jsonb END
           ELSE regexp_replace(a.metadata::text, v_uuid, v_hash, 'gi')::jsonb
         END
   WHERE a.actor_id = p_user_id
      OR a.entity_id = p_user_id
      OR a.metadata::text ILIKE '%' || v_uuid || '%';
  GET DIAGNOSTICS v_audit_n = ROW_COUNT;
  PERFORM set_config('lioris.audit_anonymise', 'off', true);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (NULL, 'user_data_purged', 'user', NULL,
          jsonb_build_object('deletedUserIdHash', v_hash, 'deleted', v_deleted, 'anonymised', v_anonymised,
                             'auditRowsAnonymised', v_audit_n, 'consentProofsArchived', v_proofs,
                             'source', 'purge_user_data'));

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'user_id_hash', v_hash,
    'profile_found', true,
    'purged_at', now(),
    'deleted', v_deleted,
    'anonymised', v_anonymised,
    'skipped_restrictive_fks', v_skipped,
    'audit_rows_anonymised', v_audit_n,
    'consent_proofs_archived', v_proofs,
    'profile_anonymised', true,
    'storage_prefix', v_uuid || '/',
    'note', 'Storage objects are NOT touched; delete them via the Storage API, then call auth.admin.deleteUser.'
  );
END
$$;

REVOKE ALL ON FUNCTION public.purge_user_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_user_data(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
