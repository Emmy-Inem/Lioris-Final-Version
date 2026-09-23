-- Make forum moderator assignment atomic and idempotent. The client previously
-- inserted directly into the join table; duplicate taps surfaced as failures
-- and policy/relationship errors could leave the admin UI looking unchanged.

CREATE INDEX IF NOT EXISTS idx_forum_community_moderators_user_id
  ON public.forum_community_moderators(user_id);

CREATE OR REPLACE FUNCTION public.assign_forum_community_moderator(
  p_community_id UUID,
  p_user_id UUID
) RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.forum_communities fc
    WHERE fc.id = p_community_id
      AND (
        fc.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = 'admin'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Only the community owner or an administrator can add moderators';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id) THEN
    RAISE EXCEPTION 'The selected user no longer exists';
  END IF;

  INSERT INTO public.forum_community_moderators (community_id, user_id, added_by)
  VALUES (p_community_id, p_user_id, auth.uid())
  ON CONFLICT (community_id, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.unassign_forum_community_moderator(
  p_community_id UUID,
  p_user_id UUID
) RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.forum_communities fc
    WHERE fc.id = p_community_id
      AND (
        fc.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = 'admin'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Only the community owner or an administrator can remove moderators';
  END IF;

  DELETE FROM public.forum_community_moderators
  WHERE community_id = p_community_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.assign_forum_community_moderator(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unassign_forum_community_moderator(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_forum_community_moderator(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unassign_forum_community_moderator(UUID, UUID) TO authenticated;
