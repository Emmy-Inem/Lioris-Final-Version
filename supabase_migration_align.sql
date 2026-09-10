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
