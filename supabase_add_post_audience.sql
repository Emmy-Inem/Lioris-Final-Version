-- ============================================================================
-- LIORIS - ADD posts.audience_scope
-- ============================================================================
-- src/api/types.ts models two orthogonal axes on a post:
--
--   visibilityScope  'global' | 'alumni' | 'staff' | 'student'   (audience)
--   scopeVisibility  'campus' | 'global' | 'private'             (institution)
--
-- The database only had visibility_scope_type = ('campus','global'), i.e. the
-- institution axis, and no column for audience. createPost() therefore wrote
-- the institution value ('campus') into the column the reader interprets as
-- audience, so every new post came back with visibilityScope='campus'.
-- filterPosts() then dropped it:
--
--     results.filter(p => p.visibilityScope === query.scope       -- 'student'
--                      || p.visibilityScope === 'global')
--
-- Net effect: a post saved correctly to the database and never appeared in
-- any feed.
--
-- This adds the missing audience axis. The institution axis stays where it
-- already worked: visibility_scope plus campus_code.
--
-- Safe to re-run.
-- ============================================================================

ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS audience_scope TEXT NOT NULL DEFAULT 'global';

DO $$
BEGIN
    ALTER TABLE posts
        ADD CONSTRAINT posts_audience_scope_check
        CHECK (audience_scope IN ('global', 'student', 'alumni', 'staff'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_posts_audience ON posts(audience_scope);

-- Existing rows were written before this column existed; 'global' (the
-- default) means "shown to every audience", which is the correct reading of
-- a post that carries no audience restriction.

NOTIFY pgrst, 'reload schema';
