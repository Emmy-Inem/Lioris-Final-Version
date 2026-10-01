-- ============================================================================
-- LIORIS - FORUM FIXES: membership enforcement, comment replies, multi-image
-- ============================================================================
-- Bundles the schema side of four forum bug fixes:
--
--   1. Community membership was purely cosmetic (forum_community_members only
--      drove the feed's "Joined" vs "Explore" tabs; the posts INSERT policy
--      never checked it, and nothing ever populated it from a real post).
--      DESIGN DECISION: rather than blocking a post into a community the
--      author hasn't joined (a bigger UX change - a new "join first" error
--      the composer would have to handle, when PublishThreadModal has always
--      let a poster pick ANY approved community), this auto-joins the author
--      to a community the first time they successfully post into it:
--      trg_auto_join_community_on_post, AFTER INSERT ON posts, resolves
--      forum_communities by NEW.category (the same text match
--      get_forum_communities_stats() already uses - posts has no
--      community_id/channel_id column) and inserts into
--      forum_community_members, ON CONFLICT DO NOTHING. This makes "Joined"
--      communities, member counts, and the mute/content-feed logic that
--      already depends on membership honest, with zero added posting
--      friction. The posts INSERT RLS policy itself is intentionally left
--      unchanged (auth.uid() = author_id + not-suspended only).
--
--   2. post_comments gets a nullable parent_comment_id (self-referencing,
--      ON DELETE SET NULL) so a reply can link to the exact comment it
--      replies to instead of PostDetailScreen's old "@name " text-prefix
--      hack. The existing "Authors, admins and staff can update comments"
--      UPDATE policy already covers editing a comment's content - no RLS
--      change needed there, see src/api/posts.ts's updatePostComment.
--
--   3. posts gets a new image_urls text[] column (up to 4 images) alongside
--      the existing singular image_url. DESIGN DECISION on the migration
--      path: image_url is kept and still written (the first image) so every
--      existing reader of that column - old app builds, the notifications/
--      feed code that only ever read image_url - keeps working unchanged;
--      image_urls is the new, additive source of truth for the gallery and
--      is only populated going forward. The read path
--      (src/api/posts.ts#mapPostRow) prefers image_urls and falls back to
--      wrapping image_url in a 1-element array for old rows, so nothing has
--      to backfill.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.posts') IS NULL
     OR to_regclass('public.post_comments') IS NULL
     OR to_regclass('public.forum_communities') IS NULL
     OR to_regclass('public.forum_community_members') IS NULL THEN
    RAISE EXCEPTION 'Dependency missing: apply supabase_schema.sql and 20260926220000_forum_community_memberships.sql first.';
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 1. Auto-join a post's author to the community they just posted into.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_join_community_on_post()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_community_id UUID;
BEGIN
    IF NEW.category IS NULL OR NEW.category = '' OR NEW.author_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_community_id
    FROM public.forum_communities
    WHERE category = NEW.category AND approval_status = 'approved'
    LIMIT 1;

    IF v_community_id IS NOT NULL THEN
        INSERT INTO public.forum_community_members (community_id, user_id)
        VALUES (v_community_id, NEW.author_id)
        ON CONFLICT (community_id, user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_join_community_on_post ON public.posts;
CREATE TRIGGER trg_auto_join_community_on_post
AFTER INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.auto_join_community_on_post();

-- ----------------------------------------------------------------------------
-- 2. Real reply links on comments (replaces the "@name " text-prefix hack).
-- ----------------------------------------------------------------------------
ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES public.post_comments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON public.post_comments(parent_comment_id);

-- ----------------------------------------------------------------------------
-- 3. Up to 4 images per post. image_url is kept for backward compatibility
--    (see the header note above) and is still written as the first image.
-- ----------------------------------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS image_urls TEXT[];

NOTIFY pgrst, 'reload schema';

COMMIT;
