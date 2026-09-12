-- ============================================================================
-- LIORIS - SCHEMA ALIGNMENT MIGRATION
-- ============================================================================
-- WHY THIS EXISTS
-- ---------------
-- The deployed Supabase database drifted away from supabase_schema.sql (the
-- schema the app is actually written against). The live database has only 11
-- tables where the client needs 27, and 4 of those 11 (posts, post_comments,
-- resources, audit_logs) are earlier, narrower versions missing columns and
-- foreign keys the client depends on.
--
-- Concrete symptoms this fixes:
--   1. Sign-in fell back to an offline demo session, because the
--      confirm_user_email() RPC does not exist -> "Email not confirmed".
--   2. Every feed query returned nothing. listFeedPosts() embeds
--      `post_likes(user_id)`, and with no post_likes table PostgREST failed
--      the ENTIRE query (PGRST200), not just the embed.
--   3. Creating a post always failed: "Could not find the 'campus_code'
--      column of 'posts' in the schema cache" (PGRST204).
--
-- ============================================================================
-- HOW TO RUN  (Supabase Dashboard -> SQL Editor)
-- ============================================================================
--   STEP 1  Run "STEP 1" below, on its own.
--   STEP 2  Run supabase_schema.sql in full. It is idempotent
--           (CREATE TABLE IF NOT EXISTS + DO-block guarded types), so it is
--           safe to run repeatedly. This creates the 23 missing tables, the
--           RLS policies, the triggers, and confirm_user_email().
--   STEP 3  Run "STEP 3" below to seed the one missing campus and verify.
--
-- Order matters: STEP 3 writes to `campuses`, which does not exist until
-- STEP 2 has run.
--
-- Tables deliberately left untouched: user_profiles, campus_events,
-- conversations, messages, event_rsvps, reports, institutions. These are
-- legacy and unused by the client. They are empty and harmless; drop them by
-- hand only once you have confirmed nothing else depends on them.
-- ============================================================================


-- ============================================================================
-- STEP 1 - Remove the 4 stale tables so STEP 2 can recreate them correctly.
-- ============================================================================
-- Each table is dropped ONLY if it is empty. If any of them contains rows it
-- is left alone and a warning is raised instead, so this can never silently
-- destroy data.

DO $$
DECLARE
    stale_table  TEXT;
    row_count    BIGINT;
    dropped      TEXT[] := '{}';
    kept         TEXT[] := '{}';
BEGIN
    -- post_comments first: it has a foreign key to posts.
    FOREACH stale_table IN ARRAY ARRAY['post_comments', 'posts', 'resources', 'audit_logs']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = stale_table
        ) THEN
            CONTINUE;  -- nothing there; STEP 2 will simply create it
        END IF;

        EXECUTE format('SELECT count(*) FROM public.%I', stale_table) INTO row_count;

        IF row_count = 0 THEN
            EXECUTE format('DROP TABLE public.%I CASCADE', stale_table);
            dropped := dropped || stale_table;
        ELSE
            kept := kept || format('%s (%s rows)', stale_table, row_count);
        END IF;
    END LOOP;

    IF array_length(dropped, 1) IS NOT NULL THEN
        RAISE NOTICE 'Dropped empty stale tables, ready to be recreated: %',
            array_to_string(dropped, ', ');
    ELSE
        RAISE NOTICE 'No stale tables needed dropping.';
    END IF;

    IF array_length(kept, 1) IS NOT NULL THEN
        RAISE WARNING 'NOT dropped because they contain data: %. Migrate these by hand, then re-run STEP 1.',
            array_to_string(kept, ', ');
    END IF;
END $$;


-- ============================================================================
-- >>> NOW RUN supabase_schema.sql IN FULL, THEN CONTINUE BELOW. <<<
-- ============================================================================


-- ============================================================================
-- STEP 3 - Seed the missing campus, then verify.
-- ============================================================================
-- supabase_schema.sql already seeds GLOBAL, UNILAG, UI, UNN, OAU and CU, but
-- not FUNAAB - which src/api/institutions.ts lists as a launch institution and
-- the admin campus filter offers. posts.campus_code and resources.campus_code
-- are NOT NULL REFERENCES campuses(code), so a missing row here means FUNAAB
-- users cannot post at all.
--
-- Column note: `campuses` has no `domain` column, and short_name is NOT NULL.
-- Email-domain -> campus mapping lives in the client
-- (src/api/institutions.ts), not in this table.

INSERT INTO campuses (code, name, short_name, location, primary_color)
VALUES ('FUNAAB', 'Federal University of Agriculture, Abeokuta', 'FUNAAB', 'Abeokuta, Ogun', '#059669')
ON CONFLICT (code) DO NOTHING;


-- ============================================================================
-- STEP 4 - audience_scope on an already-existing `posts` table, and the new
-- forum_communities table (proposing a Community, not a post, is what needs
-- root-admin approval - see ForumsModerationTab and src/api/communities.ts).
-- ============================================================================
-- supabase_schema.sql's CREATE TABLE IF NOT EXISTS only adds audience_scope on
-- a brand new table; a `posts` table left over from before this column
-- existed never gets it, and src/api/posts.ts createPost always writes to it.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS audience_scope TEXT DEFAULT 'global';

CREATE TABLE IF NOT EXISTS forum_communities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT 'chatbubbles-outline',
    banner_color TEXT NOT NULL DEFAULT '#3B82F6',
    accent_color TEXT NOT NULL DEFAULT '#2563EB',
    moderator_badge TEXT,
    moderator_title TEXT,
    rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forum_communities_status ON forum_communities(approval_status);

ALTER TABLE forum_communities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Communities viewable when approved or own or admin" ON forum_communities;
CREATE POLICY "Communities viewable when approved or own or admin" ON forum_communities FOR SELECT TO authenticated USING (
    approval_status = 'approved' OR
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
-- approval_status = 'pending' is enforced here, not just client-side in
-- src/api/communities.ts - every proposal, including a root admin's own,
-- must go through the separate admin-only UPDATE policy above to go live.
-- (Re-running this DROP+CREATE is exactly how an already-applied, looser
-- version of this policy on a live database gets tightened.)
DROP POLICY IF EXISTS "Authenticated users can propose communities" ON forum_communities;
CREATE POLICY "Authenticated users can propose communities" ON forum_communities FOR INSERT TO authenticated WITH CHECK (
    created_by = auth.uid() AND
    approval_status = 'pending' AND
    NOT (SELECT COALESCE(is_suspended, false) FROM profiles WHERE id = auth.uid())
);
DROP POLICY IF EXISTS "Admins moderate communities" ON forum_communities;
CREATE POLICY "Admins moderate communities" ON forum_communities FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
DROP POLICY IF EXISTS "Admins or creator can delete pending communities" ON forum_communities;
CREATE POLICY "Admins or creator can delete pending communities" ON forum_communities FOR DELETE TO authenticated USING (
    (created_by = auth.uid() AND approval_status = 'pending') OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

INSERT INTO forum_communities (slug, label, category, description, icon, banner_color, accent_color, moderator_badge, moderator_title, rules, approval_status)
VALUES
    ('c/tech', 'Tech & Code Hub', 'Tech Hub', 'Software engineering, AI projects, hackathons, debugging queries, and developer tooling.', 'code-slash', '#6366F1', '#4F46E5', 'Developer Guild Lead', 'Department Tech Reps & GDSC Leads', '["Provide code context, error logs, or reproducible snippets.","Respect peer developers of all experience levels.","No unauthorized course test/exam solution leaks."]'::jsonb, 'approved'),
    ('c/academic', 'Academic & Courses', 'Academic', 'Course registration, lecture notes, syllabus revision, past questions, and departmental discussions.', 'school', '#059669', '#047857', 'Academic Board', 'Department Representatives & Course TAs', '["Include course codes in thread titles (e.g. [CSC 301]).","Verify exam dates and senate timetables before announcing.","Strict academic integrity rules apply."]'::jsonb, 'approved'),
    ('c/polls', 'Polls & Votes', 'Polls', 'Student union surveys, canteen ratings, and real-time student opinion referendums.', 'stats-chart', '#8B5CF6', '#7C3AED', 'Electoral Commission', 'Student Union Government (SUG) Secretariat', '["Keep poll questions clear, balanced, and constructive.","One poll per topic to avoid voter fatigue and split results.","Zero manipulation, multi-voting, or vote brigading."]'::jsonb, 'approved'),
    ('c/housing', 'Hostel & Housing', 'Housing', 'Hall of residence allocations, off-campus apartments, roommate matching, and maintenance updates.', 'home', '#EA580C', '#C2410C', 'Hall Committee', 'Hall Wardens & Student Hall Executives', '["Never pay agent inspection fees or deposits upfront.","Provide exact hostel/apartment location and verified rental costs.","Report misleading accommodation ads immediately."]'::jsonb, 'approved'),
    ('c/social', 'Life & Sports', 'Social', 'Hostel football leagues, dinner awards, cultural days, music festivals, and student clubs.', 'football', '#EC4899', '#DB2777', 'Directorate of Socials', 'Student Union Social & Sports Directors', '["Celebrate rivalries with respect and sportsmanship.","State event venue, ticket fees (if any), and timing clearly.","No personal harassment or bullying of fellow students."]'::jsonb, 'approved'),
    ('c/lost-found', 'Lost & Found', 'Lost & Found', 'Find lost student ID cards, flash drives, wallets, glasses, backpacks, and lecture notes.', 'search', '#0284C7', '#0369A1', 'Security Desk', 'Campus Marshal Helpdesk & Student Affairs', '["Turn in valuable items (laptops, wallets) to Hall Porters or DSA.","Do not display full bank card numbers or BVN/NIN in photos.","Claimants must show student identification upon pickup."]'::jsonb, 'approved')
ON CONFLICT (slug) DO NOTHING;


-- ---------------------------------------------------------------------------
-- Verification. Every row should read OK.
-- ---------------------------------------------------------------------------
SELECT 'posts.campus_code column' AS check_name,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = 'public'
                           AND table_name = 'posts'
                           AND column_name = 'campus_code')
            THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'forum_communities table',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema = 'public' AND table_name = 'forum_communities')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'post_likes table',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema = 'public' AND table_name = 'post_likes')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'profiles table',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema = 'public' AND table_name = 'profiles')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'confirm_user_email() function',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p
                         JOIN pg_namespace n ON n.oid = p.pronamespace
                         WHERE n.nspname = 'public' AND p.proname = 'confirm_user_email')
            THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'campuses seeded (expect 7)',
       CASE WHEN (SELECT count(*) FROM campuses) >= 7
            THEN 'OK (' || (SELECT count(*) FROM campuses)::text || ')'
            ELSE 'ONLY ' || (SELECT count(*) FROM campuses)::text END
UNION ALL
SELECT 'table count (expect 27+)',
       CASE WHEN (SELECT count(*) FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_type = 'BASE TABLE') >= 27
            THEN 'OK' ELSE 'INCOMPLETE' END;
