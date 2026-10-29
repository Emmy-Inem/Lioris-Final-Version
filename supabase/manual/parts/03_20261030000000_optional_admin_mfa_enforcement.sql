-- LIORIS manual SQL, part 3 of 18: 20261030000000_optional_admin_mfa_enforcement.sql
-- Paste this whole file into the Supabase SQL editor and Run. Parts must be run in order; the guard below
-- stops this part if an earlier one is missing. Safe to run twice.
SET lock_timeout = '8s';
SET statement_timeout = '180s';

CREATE TABLE IF NOT EXISTS public._manual_migration_log (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._manual_migration_log ENABLE ROW LEVEL SECURITY;


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
DO $chain$ BEGIN IF NOT EXISTS (SELECT 1 FROM public._manual_migration_log WHERE version = '20261029000000') THEN RAISE EXCEPTION 'Stopped: migration 20261029000000 has not been applied. Fix it and re-run this whole file.'; END IF; END $chain$;

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

INSERT INTO public._manual_migration_log (version) VALUES ('20261030000000') ON CONFLICT (version) DO NOTHING;
COMMIT;
