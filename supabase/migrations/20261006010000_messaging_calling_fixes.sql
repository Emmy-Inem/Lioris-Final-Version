-- ============================================================================
-- LIORIS - MESSAGING & CALLING FIXES
-- ============================================================================
-- Found in a messaging/calling audit:
--
--   1. Chat photo/document attachments always failed - ChatThread uploaded to
--      the private `resources` bucket, which hands back a storage PATH, and
--      sendMessage() ran that path through assertSafeHttpUrl() (meant for
--      genuinely external links), which always threw. Application-code only
--      (src/api/messaging.ts, src/components/ChatThread.tsx) - no schema
--      change required.
--
--   2. Calling had no incoming-call signal outside the exact chat screen -
--      startCallInChat() never wrote a `notifications` row, and nothing
--      listened for a call invite app-wide. Application-code only
--      (src/api/calling.ts, src/components/IncomingCallListener.tsx,
--      app/_layout.tsx) - reuses the existing `notifications` table and the
--      'message' NotificationType, no schema change required.
--
--   3. The call's "Share/Copy Link" button copied a public Jitsi Meet URL,
--      even though calls run on native WebRTC signalled over a private
--      Supabase Realtime channel - Jitsi was never actually part of the
--      call. Application-code only (src/api/calling.ts,
--      src/components/CallModal.tsx) - no schema change required.
--
--   4. Calling had no block check - a blocked user could still call you.
--      Application-code only (src/api/calling.ts, reusing the existing
--      isUserBlocked() from src/api/connections.ts) - no schema change
--      required.
--
--   5. No per-message delete - only whole-conversation archive existed
--      (chat_channel_archives, supabase_fix_audit_2026.sql). Adds
--      chat_message_deletes(message_id, user_id) below: a join table
--      mirroring chat_channel_archives / user_mutes exactly (owner-only RLS,
--      no column added to the hot chat_messages table), so a user can hide a
--      single message from their own view without touching the other
--      participant's copy of it. src/api/messaging.ts:deleteMessageForMe()
--      and ChatThread.tsx's long-press "Delete for me" action are the client
--      side of this.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.chat_messages') IS NULL OR to_regclass('public.chat_channels') IS NULL THEN
    RAISE EXCEPTION 'Core chat tables missing. Apply supabase_schema.sql first.';
  END IF;
  IF to_regprocedure('public.is_channel_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.is_channel_member(uuid) missing. Apply supabase_fix_chat_rls.sql / supabase_schema.sql first.';
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- chat_message_deletes: "Delete for me" on a single message.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_message_deletes (
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_deletes_user ON public.chat_message_deletes(user_id);

ALTER TABLE public.chat_message_deletes ENABLE ROW LEVEL SECURITY;

-- A user may see only their own "deleted for me" rows.
DROP POLICY IF EXISTS "Users can view their own message-delete state" ON public.chat_message_deletes;
CREATE POLICY "Users can view their own message-delete state"
  ON public.chat_message_deletes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- A user may hide a message for themselves only if they are (or were) a
-- member of its channel - reuses the existing is_channel_member() helper
-- (same one chat_channel_archives's INSERT policy uses), so no recursive
-- sub-query on chat_channel_members is introduced here.
DROP POLICY IF EXISTS "Channel members can delete a message for themselves" ON public.chat_message_deletes;
CREATE POLICY "Channel members can delete a message for themselves"
  ON public.chat_message_deletes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_channel_member((SELECT channel_id FROM public.chat_messages WHERE id = message_id))
  );

-- Undoing a delete-for-me is just removing your own row.
DROP POLICY IF EXISTS "Users can restore their own deleted-for-me message" ON public.chat_message_deletes;
CREATE POLICY "Users can restore their own deleted-for-me message"
  ON public.chat_message_deletes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.chat_message_deletes FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.chat_message_deletes TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
