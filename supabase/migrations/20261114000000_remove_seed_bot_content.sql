-- ============================================================================
-- REMOVE THE SEEDED "COMMUNITY BOT" CONTENT (2026-11)
-- ============================================================================
-- 20260926150000_seed_campus_community_bots.sql created 20 fake "verified" student/alumni accounts
-- (auth.users + public.profiles, ids 00000000-0000-4000-a000-...) and 20 forum posts they "wrote"
-- (public.posts, ids 00000000-0000-4000-b000-...). Product decision: none of that is real campus
-- activity and it must not appear to members. This migration removes everything those accounts
-- authored or were attached to, and retires the accounts themselves.
--
-- WHAT IT DOES (idempotent; guarded; one transaction)
--   * A "seed bot" is a profile that is is_bot = TRUE AND whose id matches the seed pattern
--     ^00000000-0000-4000-a000-<12 hex>$ AND whose role is student/alumni. Nothing else is touched:
--     no real account, no content authored by a real account.
--   * Deletes the seed bots' posts and, with them, everything hanging off those posts:
--       post_comments (incl. replies by REAL members on a seed thread - the thread they replied to
--       is fabricated and goes away, so its replies cannot stay), post_comment_likes, post_likes,
--       post_reposts, post_poll_votes, saved_items that bookmark a seed post.
--   * Deletes what the bots themselves authored or hold: comments, likes, reposts, poll votes, saved
--     items, discussion-space memberships (forum_community_members / _moderators), study-group
--     memberships, connections (either side), and notifications to/from a bot or whose link points
--     at a seed post.
--   * Does NOT delete the bot profiles or auth users (deleting an account cascades through ~70
--     tables). They are RETIRED instead: is_suspended = TRUE (so they drop out of every directory,
--     message search, broadcast and "verified" check), directory_discoverable = FALSE, and the auth
--     user is banned (banned_until = 'infinity') so no sign-in is possible. is_bot stays TRUE so the
--     admin analytics keep counting them as bots rather than members.
--   * Left alone on purpose: direct-message channels/messages a real member sent to a bot (real
--     member content, and the retired bot can no longer be messaged) and real members' block/mute
--     rows.
--   * Safe to apply twice (the second run finds nothing to delete and nothing to change) and safe on a
--     database that never had the seed (the bot set is empty, so it returns immediately). Every
--     optional table/column is checked with to_regclass / information_schema first.
--
-- If supabase_seed_campus_community_bots.sql (or the 20260926150000 migration) is ever re-applied it
-- recreates the seed rows; apply THIS migration again afterwards (it is the later migration, so a full
-- replay of supabase/migrations ends clean).
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

DO $do$
DECLARE
  v_bots   uuid[];
  v_posts  uuid[];
  v_posts_text text[];
  v_n      bigint;
  v_sql    text;
  v_has_disc boolean;
  v_has_ban  boolean;
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'seed-bot cleanup: public.profiles is missing, nothing to do';
    RETURN;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 1. The seed bots. The three conditions are ANDed on purpose: an is_bot flag alone, or an id alone,
  --    is not enough to be treated as seed content.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(array_agg(p.id), ARRAY[]::uuid[])
    INTO v_bots
    FROM public.profiles p
   WHERE COALESCE(p.is_bot, FALSE) = TRUE
     AND p.id::text ~ '^00000000-0000-4000-a000-[0-9a-f]{12}$'
     AND p.role::text IN ('student', 'alumni');

  IF cardinality(v_bots) = 0 THEN
    RAISE NOTICE 'seed-bot cleanup: no seed bot profiles found, nothing to do';
    RETURN;
  END IF;

  IF to_regclass('public.posts') IS NOT NULL THEN
    SELECT COALESCE(array_agg(po.id), ARRAY[]::uuid[]) INTO v_posts
      FROM public.posts po WHERE po.author_id = ANY (v_bots);
  ELSE
    v_posts := ARRAY[]::uuid[];
  END IF;
  SELECT COALESCE(array_agg(x::text), ARRAY[]::text[]) INTO v_posts_text FROM unnest(v_posts) AS x;

  -- ---------------------------------------------------------------------------
  -- 2. Notifications that mention seed content (before the posts go, while the ids are still known).
  -- ---------------------------------------------------------------------------
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications n
     WHERE n.recipient_id = ANY (v_bots)
        OR n.sender_id = ANY (v_bots)
        OR (cardinality(v_posts_text) > 0
            AND EXISTS (SELECT 1 FROM unnest(v_posts_text) AS pid WHERE n.action_url LIKE '%' || pid || '%'));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'seed-bot cleanup: % notification(s) removed', v_n;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 3. Saved items: bookmarks OF a seed post, and anything the bots saved.
  -- ---------------------------------------------------------------------------
  IF to_regclass('public.saved_items') IS NOT NULL THEN
    DELETE FROM public.saved_items s
     WHERE s.user_id = ANY (v_bots)
        OR (s.kind = 'post' AND s.item_id = ANY (v_posts_text));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'seed-bot cleanup: % saved item(s) removed', v_n;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 4. Post dependents, then the posts (explicit, so the counters/notify triggers see each delete and
  --    the counts below are reportable; the FKs would cascade anyway).
  -- ---------------------------------------------------------------------------
  IF to_regclass('public.post_comment_likes') IS NOT NULL AND to_regclass('public.post_comments') IS NOT NULL THEN
    DELETE FROM public.post_comment_likes l
     WHERE l.user_id = ANY (v_bots)
        OR l.comment_id IN (SELECT c.id FROM public.post_comments c
                             WHERE c.post_id = ANY (v_posts) OR c.author_id = ANY (v_bots));
  END IF;
  IF to_regclass('public.post_comments') IS NOT NULL THEN
    DELETE FROM public.post_comments c
     WHERE c.post_id = ANY (v_posts) OR c.author_id = ANY (v_bots);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'seed-bot cleanup: % comment(s) removed', v_n;
  END IF;
  IF to_regclass('public.post_likes') IS NOT NULL THEN
    DELETE FROM public.post_likes l WHERE l.post_id = ANY (v_posts) OR l.user_id = ANY (v_bots);
  END IF;
  IF to_regclass('public.post_reposts') IS NOT NULL THEN
    DELETE FROM public.post_reposts r WHERE r.post_id = ANY (v_posts) OR r.user_id = ANY (v_bots);
  END IF;
  IF to_regclass('public.post_poll_votes') IS NOT NULL THEN
    DELETE FROM public.post_poll_votes v WHERE v.post_id = ANY (v_posts) OR v.user_id = ANY (v_bots);
  END IF;
  IF to_regclass('public.posts') IS NOT NULL THEN
    DELETE FROM public.posts po WHERE po.id = ANY (v_posts);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'seed-bot cleanup: % seed post(s) removed', v_n;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 5. Memberships and relationships the bots hold (the posts' auto-join trigger enrolled them in spaces).
  -- ---------------------------------------------------------------------------
  IF to_regclass('public.forum_community_members') IS NOT NULL THEN
    DELETE FROM public.forum_community_members m WHERE m.user_id = ANY (v_bots);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'seed-bot cleanup: % space membership(s) removed', v_n;
  END IF;
  IF to_regclass('public.forum_community_moderators') IS NOT NULL THEN
    DELETE FROM public.forum_community_moderators m WHERE m.user_id = ANY (v_bots);
  END IF;
  IF to_regclass('public.study_group_members') IS NOT NULL THEN
    DELETE FROM public.study_group_members m WHERE m.user_id = ANY (v_bots);
  END IF;
  IF to_regclass('public.connections') IS NOT NULL THEN
    DELETE FROM public.connections c WHERE c.requester_id = ANY (v_bots) OR c.recipient_id = ANY (v_bots);
  END IF;

  -- ---------------------------------------------------------------------------
  -- 6. Retire the accounts (never delete them): suspended, undiscoverable, unable to sign in.
  -- ---------------------------------------------------------------------------
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'directory_discoverable')
    INTO v_has_disc;
  v_sql := 'UPDATE public.profiles SET is_suspended = TRUE, suspension_reason = ''Retired seed account'''
        || CASE WHEN v_has_disc THEN ', directory_discoverable = FALSE' ELSE '' END
        || ' WHERE id = ANY ($1) AND (is_suspended IS DISTINCT FROM TRUE'
        || CASE WHEN v_has_disc THEN ' OR directory_discoverable IS DISTINCT FROM FALSE' ELSE '' END
        || ')';
  EXECUTE v_sql USING v_bots;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'seed-bot cleanup: % bot profile(s) retired', v_n;

  SELECT to_regclass('auth.users') IS NOT NULL
         AND EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'banned_until')
         AND has_table_privilege('auth.users', 'UPDATE')
    INTO v_has_ban;
  IF v_has_ban THEN
    UPDATE auth.users u SET banned_until = 'infinity'::timestamptz
     WHERE u.id = ANY (v_bots) AND u.banned_until IS DISTINCT FROM 'infinity'::timestamptz;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'seed-bot cleanup: % auth user(s) banned', v_n;
  END IF;
END
$do$;

COMMIT;
