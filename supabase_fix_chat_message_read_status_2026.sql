-- Fix P2: unread DM counts never clear.
--
-- Root cause: chat_messages' UPDATE policy ("Senders and admins can update
-- message status") only allows a message's SENDER (or an admin) to update
-- it. But markConversationAsRead() (src/api/messaging.ts) needs the
-- RECIPIENT to flip is_read=true on the OTHER person's messages when they
-- open a thread. RLS silently blocked every one of those updates, so
-- is_read never changed and the unread badge never cleared, even across
-- refreshes.
--
-- Fix: broaden the UPDATE policy to also allow channel members (not just
-- the sender), but add a trigger that locks every column except is_read
-- when the updater is not the message's own sender -- so a recipient can
-- only toggle read status, never edit/reassign someone else's message.

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

ALTER POLICY "Senders and admins can update message status" ON public.chat_messages
    USING (
        (auth.uid() = sender_id)
        OR is_channel_member(channel_id)
        OR (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role_type))
    );
