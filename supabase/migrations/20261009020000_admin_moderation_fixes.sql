-- ============================================================================
-- LIORIS - ADMIN MODERATION FIXES
-- ============================================================================
-- Found in a read-only audit of the admin moderation surface:
--
--   1. Two admins could double-process the same report in the Reports queue
--      (resolveReport() updated `moderation_queue` by id only, no guard on
--      the row still being `pending`). That gap is closed entirely in
--      application code (src/api/moderation.ts now adds
--      `.eq('status', 'pending')` to the UPDATE and treats 0 rows affected
--      as "already handled") - a single UPDATE's WHERE clause is itself the
--      atomic check-and-set under Postgres's normal read-committed rules, so
--      no new function or policy is needed for that part.
--
--   2. Reported chat messages could not actually be removed through the
--      takedown flow (ModerationQueue.tsx's handleConfirmTakedown had a
--      branch for every other content type but `message`). The chat_messages
--      "Senders and admins can delete messages" DELETE policy already lets
--      an admin remove any message, but there was no single, auditable entry
--      point for it - a plain client-side `.delete()` call from
--      deleteMessageAsAdmin() would work via RLS, but gives a non-admin a
--      generic RLS failure rather than a clear "not allowed", and gives the
--      caller no clean "not found" signal either. This migration adds a
--      narrow SECURITY DEFINER RPC for that one operation, matching the
--      convention other admin-only single-purpose actions in this schema
--      already use (e.g. suspend_user_account, resolve_takedown_request).
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.chat_messages') IS NULL THEN
    RAISE EXCEPTION 'public.chat_messages missing. Apply supabase_schema.sql first.';
  END IF;
  IF to_regprocedure('public.auth_profile_role()') IS NULL THEN
    RAISE EXCEPTION 'public.auth_profile_role() missing. Apply supabase_schema.sql first.';
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- admin_delete_chat_message: hard-deletes one chat message. Admin-only -
-- raises a clear, distinguishable error for a non-admin caller or a message
-- that is already gone, instead of a bare RLS "0 rows affected" success.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_chat_message(p_message_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF public.auth_profile_role() <> 'admin' THEN
    RAISE EXCEPTION 'not_allowed: admin-only action';
  END IF;

  DELETE FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: message does not exist';
  END IF;
END
$$;

-- Supabase's `ALTER DEFAULT PRIVILEGES` grants anon/authenticated/service_role
-- EXECUTE on every new function in schema public automatically - REVOKE ...
-- FROM PUBLIC alone does not undo that. Revoke from anon and authenticated
-- explicitly too (same convention supabase_launch_hardening_2026.sql and
-- 20261008020000_connections_and_blocking_security.sql use), then grant back
-- only to the roles that should actually call it. The function itself still
-- re-checks admin-only on every call - this grant only lets a signed-in
-- caller reach that check at all.
REVOKE ALL ON FUNCTION public.admin_delete_chat_message(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_chat_message(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
