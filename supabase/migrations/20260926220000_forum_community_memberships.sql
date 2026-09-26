-- Discussion Forums Memberships and Real Member Counts
-- Allows students and campus members to join and leave discussion spaces,
-- track members per forum, and filter their feed by joined forums.

CREATE TABLE IF NOT EXISTS public.forum_community_members (
    community_id UUID NOT NULL REFERENCES public.forum_communities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_forum_community_members_user ON public.forum_community_members(user_id);
CREATE INDEX IF NOT EXISTS idx_forum_community_members_comm ON public.forum_community_members(community_id);

ALTER TABLE public.forum_community_members ENABLE ROW LEVEL SECURITY;

-- Anyone can see who is in a community or count members
DROP POLICY IF EXISTS "Memberships are visible to all authenticated" ON public.forum_community_members;
CREATE POLICY "Memberships are visible to all authenticated" ON public.forum_community_members
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Memberships are visible to anon" ON public.forum_community_members;
CREATE POLICY "Memberships are visible to anon" ON public.forum_community_members
    FOR SELECT TO anon USING (true);

-- User can join for themselves
DROP POLICY IF EXISTS "Users can join communities" ON public.forum_community_members;
CREATE POLICY "Users can join communities" ON public.forum_community_members
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- User can leave or admin can remove
DROP POLICY IF EXISTS "Users can leave communities" ON public.forum_community_members;
CREATE POLICY "Users can leave communities" ON public.forum_community_members
    FOR DELETE TO authenticated
    USING (
        auth.uid() = user_id OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role::text = 'admin')
    );

-- Fast RPC to get member counts and thread counts for all communities
CREATE OR REPLACE FUNCTION public.get_forum_communities_stats()
RETURNS TABLE (
    community_id UUID,
    members_count BIGINT,
    posts_count BIGINT
) AS $$
    SELECT
        fc.id AS community_id,
        COALESCE(COUNT(DISTINCT fcm.user_id), 0)::BIGINT AS members_count,
        COALESCE(COUNT(DISTINCT p.id), 0)::BIGINT AS posts_count
    FROM public.forum_communities fc
    LEFT JOIN public.forum_community_members fcm ON fcm.community_id = fc.id
    LEFT JOIN public.posts p ON p.category = fc.category
    GROUP BY fc.id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.get_forum_communities_stats() TO authenticated, anon;
