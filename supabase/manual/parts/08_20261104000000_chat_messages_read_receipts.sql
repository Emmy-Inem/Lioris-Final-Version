-- LIORIS manual SQL, part 8 of 18: 20261104000000_chat_messages_read_receipts.sql
-- Paste this whole file into the Supabase SQL editor and Run. Parts must be run in order; the guard below
-- stops this part if an earlier one is missing. Safe to run twice.
SET lock_timeout = '8s';
SET statement_timeout = '180s';

CREATE TABLE IF NOT EXISTS public._manual_migration_log (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._manual_migration_log ENABLE ROW LEVEL SECURITY;


-- ########## 20261104000000_chat_messages_read_receipts.sql ##########
BEGIN;
DO $chain$ BEGIN IF NOT EXISTS (SELECT 1 FROM public._manual_migration_log WHERE version = '20261103000000') THEN RAISE EXCEPTION 'Stopped: migration 20261103000000 has not been applied. Fix it and re-run this whole file.'; END IF; END $chain$;
-- Migration: Allow channel members to mark messages as read while preventing tampering with message content or sender.

CREATE OR REPLACE FUNCTION public.restrict_chat_message_recipient_update()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.uid() IS DISTINCT FROM OLD.sender_id THEN
        IF NEW.content IS DISTINCT FROM OLD.content
            OR NEW.media_url IS DISTINCT FROM OLD.media_url
            OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
            OR NEW.channel_id IS DISTINCT FROM OLD.channel_id
            OR NEW.created_at IS DISTINCT FROM OLD.created_at
        THEN
            RAISE EXCEPTION 'Only the message sender may change this field';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

DROP TRIGGER IF EXISTS tr_restrict_chat_message_recipient_update ON public.chat_messages;
CREATE TRIGGER tr_restrict_chat_message_recipient_update
    BEFORE UPDATE ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.restrict_chat_message_recipient_update();

DROP POLICY IF EXISTS "Senders and admins can update message status" ON public.chat_messages;
DROP POLICY IF EXISTS "Senders and channel members can update message status" ON public.chat_messages;

CREATE POLICY "Senders and channel members can update message status" ON public.chat_messages
    FOR UPDATE TO authenticated
    USING (
        (auth.uid() = sender_id)
        OR public.is_channel_member(channel_id)
        OR (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role_type))
    );
INSERT INTO public._manual_migration_log (version) VALUES ('20261104000000') ON CONFLICT (version) DO NOTHING;
COMMIT;
