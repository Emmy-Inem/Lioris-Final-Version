-- ============================================================================
-- LIORIS - FIX INFINITE RECURSION IN CHAT RLS POLICIES
-- ============================================================================
-- Symptom:
--   GET /rest/v1/chat_channels -> 500
--   42P17: infinite recursion detected in policy for relation
--          "chat_channel_members"
--   Messaging was completely dead: channels, members and messages all failed.
--
-- Cause:
--   The SELECT policy ON chat_channel_members sub-queried chat_channel_members:
--     EXISTS (SELECT 1 FROM chat_channel_members m
--             WHERE m.channel_id = chat_channel_members.channel_id
--               AND m.user_id = auth.uid())
--   Evaluating it required reading the table, which re-entered the same
--   policy. chat_channels and chat_messages both test membership through that
--   table, so all three collapsed together.
--
-- Fix:
--   Resolve membership through a SECURITY DEFINER function, which runs as the
--   owner and bypasses RLS - the same approach used for profiles in
--   supabase_fix_profiles_rls.sql.
--
-- Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_channel_member(p_channel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.chat_channel_members
        WHERE channel_id = p_channel_id AND user_id = auth.uid()
    )
$$;

REVOKE ALL ON FUNCTION public.is_channel_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_channel_member(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- chat_channel_members: the source of the recursion.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Channel members viewable by channel participants" ON chat_channel_members;
CREATE POLICY "Channel members viewable by channel participants"
ON chat_channel_members FOR SELECT TO authenticated
USING (
    -- Your own membership row never needs a lookup.
    user_id = auth.uid()
    OR public.is_channel_member(channel_id)
    OR public.auth_profile_role() = 'admin'
);

DROP POLICY IF EXISTS "Users can join or add members to channels" ON chat_channel_members;
CREATE POLICY "Users can join or add members to channels"
ON chat_channel_members FOR INSERT TO authenticated
WITH CHECK (
    (
        auth.uid() = user_id
        OR public.is_channel_member(channel_id)
        OR public.auth_profile_role() = 'admin'
    )
    AND NOT COALESCE((SELECT is_suspended FROM profiles WHERE id = auth.uid()), false)
);

-- ---------------------------------------------------------------------------
-- chat_channels / chat_messages: same membership test, now via the function.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view channels they belong to" ON chat_channels;
CREATE POLICY "Users can view channels they belong to"
ON chat_channels FOR SELECT TO authenticated
USING (
    public.is_channel_member(id)
    OR public.auth_profile_role() = 'admin'
);

DROP POLICY IF EXISTS "Admins can manage chat channels" ON chat_channels;
CREATE POLICY "Admins can manage chat channels"
ON chat_channels FOR ALL TO authenticated
USING (public.auth_profile_role() = 'admin')
WITH CHECK (public.auth_profile_role() = 'admin');

DROP POLICY IF EXISTS "Chat messages viewable only by channel members" ON chat_messages;
CREATE POLICY "Chat messages viewable only by channel members"
ON chat_messages FOR SELECT TO authenticated
USING (
    public.is_channel_member(channel_id)
    OR public.auth_profile_role() = 'admin'
);

DROP POLICY IF EXISTS "Users can only send messages as themselves to channels they belong to" ON chat_messages;
CREATE POLICY "Users can only send messages as themselves to channels they belong to"
ON chat_messages FOR INSERT TO authenticated
WITH CHECK (
    sender_id = auth.uid()
    AND public.is_channel_member(channel_id)
    AND NOT COALESCE((SELECT is_suspended FROM profiles WHERE id = auth.uid()), false)
);

NOTIFY pgrst, 'reload schema';
