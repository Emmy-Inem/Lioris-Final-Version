-- ============================================================================
-- LIORIS - CAMPUS ACCESS & DEVICES FIXES
-- ============================================================================
-- One gap found in a campus-access / device-management audit that needs a
-- database change (the others were client-only: dead code removal, map/
-- institutions list cleanup, a Google Maps URL fix, and Settings copy -
-- see src/api/campusMap.ts, src/components/CampusMapModal.tsx,
-- src/components/SettingsScreenBase.tsx).
--
-- Gap: an admin had no way to act on a compromised user's push_tokens
-- (supabase_launch_hardening_2026.sql section 1) short of the service role -
-- only the owning user and service_role could SELECT/DELETE those rows. That
-- is correct for ordinary use (a push token is a bearer credential, see that
-- migration's comment), but it means an admin investigating a compromised
-- account could not see or clear the device registrations pushing
-- notifications to it. This adds admin SELECT and DELETE policies, mirroring
-- the "Admins have full access" / "Admins can delete ..." shape already used
-- for support_tickets, verifications, moderation_queue, waitlist_entries and
-- chat_channel_members in 20260922155000_admin_support.sql. Admins still
-- cannot INSERT/UPDATE another user's push token (no legitimate reason to;
-- those stay owner + service_role only).
--
-- This is deliberately scoped to push_tokens, not a new session table: real
-- "kill a user's live session everywhere" is handled server-side by the new
-- admin-force-signout edge function (supabase/functions/admin-force-signout),
-- which calls supabase.auth.admin.signOut(userId, 'global') - that needs the
-- service-role key and cannot be expressed as an RLS policy.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.push_tokens') IS NULL THEN
    RAISE EXCEPTION 'public.push_tokens missing. Apply supabase_launch_hardening_2026.sql first.';
  END IF;
  IF to_regprocedure('public.auth_profile_role()') IS NULL THEN
    RAISE EXCEPTION 'public.auth_profile_role() missing. Apply supabase_security_hardening_2026.sql first.';
  END IF;
END
$do$;

-- Admins can see any user's device/push-token registrations (support &
-- security investigations - "whose device is this notification coming from").
DROP POLICY IF EXISTS "Admins can read all push tokens" ON public.push_tokens;
CREATE POLICY "Admins can read all push tokens"
  ON public.push_tokens FOR SELECT TO authenticated
  USING (public.auth_profile_role() = 'admin');

-- Admins can revoke (delete) any user's push-token registrations - e.g. to
-- stop notifications reaching a device during a compromise investigation.
-- This does not end the user's signed-in session; admin-force-signout does.
DROP POLICY IF EXISTS "Admins can delete any push token" ON public.push_tokens;
CREATE POLICY "Admins can delete any push token"
  ON public.push_tokens FOR DELETE TO authenticated
  USING (public.auth_profile_role() = 'admin');

NOTIFY pgrst, 'reload schema';

COMMIT;
