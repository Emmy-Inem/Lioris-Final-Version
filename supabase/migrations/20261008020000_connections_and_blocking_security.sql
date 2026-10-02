-- ============================================================================
-- LIORIS - CONNECTIONS & BLOCKING SECURITY FIXES
-- ============================================================================
-- Found in a connections/blocking audit:
--
--   1. respondToConnectionRequest() (src/api/connections.ts) updates the
--      `connections` row by id with no server-side check that the caller is
--      the recipient. The old "Participants can update connection status"
--      policy allowed EITHER requester_id OR recipient_id to update the row,
--      so a requester could self-accept their own pending request and
--      bypass the recipient's consent entirely. Fixed by splitting the
--      UPDATE policy: only the recipient may transition a pending request
--      to accepted/declined. The requester's only way to walk away from a
--      request they sent is still DELETE (the existing "Participants can
--      delete connections" policy already covers that - connections.ts has
--      no update-based "cancel" path to preserve).
--
--   2. Blocking was never enforced server-side for 1:1 chat. `isUserBlocked`
--      is a client-side-only in-memory set of the current user's own
--      outgoing blocks; it never stopped a modified/bypassed client, or a
--      user who does not know they were blocked, from inserting into
--      chat_messages. Fixed by teaching the chat_messages INSERT policy to
--      reject a message into a 1:1 DM channel (chat_channels.is_direct_message)
--      when either participant has blocked the other. Group channels are
--      deliberately left alone - block semantics for group chat are a
--      separate, out-of-scope decision.
--
--   3. The "Users can create connection requests" INSERT policy never
--      consulted user_blocks, so a blocked relationship (either direction)
--      did not stop a new connection request. Fixed by adding a block check
--      to that policy's WITH CHECK.
--
--   5. `connections` only had UNIQUE (requester_id, recipient_id) - an
--      ORDERED pair. If A requests B and, before B responds, B also
--      requests A, two independent pending rows could coexist. Fixed two
--      ways: (a) a partial unique index on the unordered pair blocks a
--      second independent pending row outright, as a DB-level backstop, and
--      (b) sendConnectionRequest() (src/api/connections.ts) now detects an
--      existing reverse-direction pending request first and auto-accepts it
--      instead of racing the index - better UX than surfacing a 409.
--
-- Both the block checks (#2, #3) go through SECURITY DEFINER helper
-- functions, not inline sub-selects: a plain `EXISTS (SELECT 1 FROM
-- user_blocks WHERE blocker_id = recipient_id ...)` inside a WITH CHECK
-- runs as the inserting user, so it is itself filtered by user_blocks' own
-- "auth.uid() = blocker_id" SELECT policy - it could only ever see the
-- caller's OWN outgoing blocks, never a block placed on them by the other
-- party. A SECURITY DEFINER function bypasses that and sees both rows.
-- Same reasoning as public.is_channel_member() in supabase_fix_chat_rls.sql.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.connections') IS NULL THEN
    RAISE EXCEPTION 'public.connections missing. Apply supabase_schema.sql first.';
  END IF;
  IF to_regclass('public.user_blocks') IS NULL THEN
    RAISE EXCEPTION 'public.user_blocks missing. Apply supabase_schema.sql first.';
  END IF;
  IF to_regclass('public.chat_messages') IS NULL OR to_regclass('public.chat_channels') IS NULL THEN
    RAISE EXCEPTION 'Core chat tables missing. Apply supabase_schema.sql first.';
  END IF;
  IF to_regprocedure('public.is_channel_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.is_channel_member(uuid) missing. Apply supabase_fix_chat_rls.sql / supabase_schema.sql first.';
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- Helper: do these two users have a block between them, in either direction?
-- SECURITY DEFINER so it sees both sides regardless of which one is calling.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.users_have_block(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_blocks
        WHERE (blocker_id = p_user_a AND blocked_id = p_user_b)
           OR (blocker_id = p_user_b AND blocked_id = p_user_a)
    )
$$;

-- Supabase's `ALTER DEFAULT PRIVILEGES` grants anon/authenticated/service_role
-- EXECUTE on every new function in schema public automatically - REVOKE ...
-- FROM PUBLIC alone does not undo that. Revoke from anon and authenticated
-- explicitly too (same convention supabase_launch_hardening_2026.sql uses),
-- then grant back only to the roles that should actually call it.
REVOKE ALL ON FUNCTION public.users_have_block(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.users_have_block(UUID, UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Helper: is there a block between p_sender_id and the OTHER member of a 1:1
-- DM channel? Group channels (is_direct_message = false) always return
-- false here - block enforcement for group chat is out of scope.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dm_channel_has_block(p_channel_id UUID, p_sender_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.chat_channels cc
        JOIN public.chat_channel_members other
          ON other.channel_id = cc.id AND other.user_id <> p_sender_id
        WHERE cc.id = p_channel_id
          AND cc.is_direct_message = true
          AND public.users_have_block(p_sender_id, other.user_id)
    )
$$;

REVOKE ALL ON FUNCTION public.dm_channel_has_block(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dm_channel_has_block(UUID, UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Fix 1: only the recipient can accept/decline a pending connection request.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Participants can update connection status" ON connections;
DROP POLICY IF EXISTS "Recipient can respond to connection requests" ON connections;
CREATE POLICY "Recipient can respond to connection requests" ON connections
FOR UPDATE TO authenticated
USING (
    (auth.uid() = recipient_id AND status = 'pending')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
)
WITH CHECK (
    (auth.uid() = recipient_id AND status IN ('accepted', 'declined'))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ----------------------------------------------------------------------------
-- Fix 3: a blocked relationship (either direction) blocks a new connection
-- request outright.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create connection requests" ON connections;
CREATE POLICY "Users can create connection requests" ON connections FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = requester_id AND
    NOT (SELECT COALESCE(is_suspended, false) FROM profiles WHERE id = auth.uid()) AND
    NOT public.users_have_block(requester_id, recipient_id)
);

-- ----------------------------------------------------------------------------
-- Fix 5: no two independent pending rows for the same unordered pair. This is
-- the DB-level backstop; sendConnectionRequest() in src/api/connections.ts
-- avoids ever hitting it in the normal flow by auto-accepting an existing
-- reverse-direction pending request instead of inserting a duplicate.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_connections_unique_pending_pair;
CREATE UNIQUE INDEX idx_connections_unique_pending_pair
ON connections (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id))
WHERE status = 'pending';

-- ----------------------------------------------------------------------------
-- Fix 2: block messaging in a 1:1 DM channel when either side has blocked
-- the other. Group channels are intentionally untouched.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can only send messages as themselves to channels they belong to" ON chat_messages;
CREATE POLICY "Users can only send messages as themselves to channels they belong to"
ON chat_messages FOR INSERT TO authenticated
WITH CHECK (
    sender_id = auth.uid()
    AND public.is_channel_member(channel_id)
    AND NOT COALESCE((SELECT is_suspended FROM profiles WHERE id = auth.uid()), false)
    AND NOT public.dm_channel_has_block(channel_id, auth.uid())
);

-- ----------------------------------------------------------------------------
-- Fix 4 (support): a SECURITY DEFINER suggested-connections query. The plain
-- `profiles.select().limit(10)` listSuggestedConnections used to run had no
-- way to exclude a user who blocked the caller - user_blocks' SELECT policy
-- only shows the caller their own OUTGOING blocks, never an incoming one, so
-- that exclusion cannot be expressed as an ordinary filtered client query.
-- This RPC does the filtering (blocked either direction, muted, already
-- connected/pending) inside a single SECURITY DEFINER function instead.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_suggested_connections(p_limit INT DEFAULT 10)
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    role TEXT,
    department TEXT,
    level TEXT,
    avatar_url TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT p.id, p.full_name, p.role::text, p.department, p.level, p.avatar_url
    FROM profiles p
    WHERE auth.uid() IS NOT NULL
      AND p.id <> auth.uid()
      AND NOT COALESCE(p.is_suspended, false)
      AND NOT public.users_have_block(auth.uid(), p.id)
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
$$;

REVOKE ALL ON FUNCTION public.get_suggested_connections(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_suggested_connections(INT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
