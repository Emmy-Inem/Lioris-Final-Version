-- ============================================================================
-- supabase_posts_features_2026.sql
-- ============================================================================
-- Reposts, drafts, scheduled posts, poll closing times and a unified
-- saved/bookmark store.
--
-- APPLY AFTER (in this order, all already applied in production):
--   supabase_schema.sql
--   supabase_security_hardening_2026.sql
--   supabase_launch_hardening_2026.sql
--
-- Sections:
--   1  public.post_reposts + RLS + counter triggers + reposts_count backfill
--   2  posts.status / posts.scheduled_at (+ constraint) and the recreated
--      posts SELECT policy so drafts/scheduled rows are author-only
--   3  publish_due_scheduled_posts() + optional pg_cron schedule
--   4  public.saved_items + RLS
--   5  Poll closing time (documentation only - it lives in posts.poll_data)
--   5B public.post_poll_votes: one row per voter, the tally in poll_data kept
--      by a trigger, isVotedByMe never stored again
--   6  purge_user_data() coverage check for the three new tables
--
-- Everything is idempotent and guarded with to_regclass / information_schema
-- so a missing optional object downgrades to a NOTICE instead of failing.
-- ============================================================================

BEGIN;

-- Hard prerequisite: without public.posts none of this makes sense.
DO $do$
BEGIN
  IF to_regclass('public.posts') IS NULL THEN
    RAISE EXCEPTION 'public.posts does not exist - run supabase_schema.sql first.';
  END IF;
END
$do$;

-- ============================================================================
-- SECTION 1. REPOSTS
-- ============================================================================
-- Until now a "repost" only bumped posts.reposts_count from the client, so
--   * "did I repost this?" was un-answerable (it lived in React state only),
--   * a repost never showed up on the reposter's own profile, and
--   * the counter drifted every time two devices raced.
-- A real join table fixes all three. user_id references auth.users (not
-- profiles) to match push_tokens/saved_items and so the row disappears with
-- the auth user even if the profile row is only anonymised.

CREATE TABLE IF NOT EXISTS public.post_reposts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_reposts_unique_per_user UNIQUE (post_id, user_id)
);

-- (user_id, created_at DESC) powers "posts I reposted, newest first" on the
-- profile; (post_id) powers the per-post count and the "did I repost" lookup.
CREATE INDEX IF NOT EXISTS idx_post_reposts_user_created ON public.post_reposts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_reposts_post         ON public.post_reposts (post_id);

ALTER TABLE public.post_reposts ENABLE ROW LEVEL SECURITY;

-- SELECT is open to every authenticated user: the client needs it both to
-- count reposts and to answer "did I repost this". A repost is a public act
-- (it republishes someone's post), so this leaks nothing the feed does not.
DROP POLICY IF EXISTS "Reposts are viewable by authenticated users" ON public.post_reposts;
CREATE POLICY "Reposts are viewable by authenticated users" ON public.post_reposts
  FOR SELECT TO authenticated USING (true);

-- Same shape as the post_likes INSERT policy: own row only, not suspended.
DROP POLICY IF EXISTS "Users can repost" ON public.post_reposts;
CREATE POLICY "Users can repost" ON public.post_reposts
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id AND
    NOT COALESCE((SELECT p.is_suspended FROM public.profiles p WHERE p.id = auth.uid()), false)
  );

DROP POLICY IF EXISTS "Users can undo their own repost" ON public.post_reposts;
CREATE POLICY "Users can undo their own repost" ON public.post_reposts
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id OR public.auth_profile_role() = 'admin'
  );

-- A repost row is never edited, only created and deleted: no UPDATE policy
-- (RLS default-denies), which also means the unique constraint cannot be
-- worked around by re-pointing an existing row at another post.

-- Counter sync. Same pattern (and the same SECURITY DEFINER + fixed
-- search_path hardening) as sync_post_likes_count() in supabase_schema.sql.
CREATE OR REPLACE FUNCTION public.sync_post_reposts_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
       SET reposts_count = COALESCE(reposts_count, 0) + 1
     WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
       SET reposts_count = GREATEST(0, COALESCE(reposts_count, 0) - 1)
     WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trigger_sync_post_reposts ON public.post_reposts;
CREATE TRIGGER trigger_sync_post_reposts
AFTER INSERT OR DELETE ON public.post_reposts
FOR EACH ROW EXECUTE FUNCTION public.sync_post_reposts_count();

-- One-off backfill. post_reposts starts empty, so this does not "restore"
-- anything: it NORMALISES posts.reposts_count down to the real number of
-- repost rows (0 for every existing post), throwing away the counts the old
-- client-side increment left behind. That is deliberate - those numbers were
-- not backed by anything and could never be undone by the user who made them.
-- Re-running the script re-computes the same value, so it stays idempotent.
UPDATE public.posts p
   SET reposts_count = (SELECT count(*)::int FROM public.post_reposts pr WHERE pr.post_id = p.id)
 WHERE COALESCE(p.reposts_count, 0)
       IS DISTINCT FROM (SELECT count(*)::int FROM public.post_reposts pr WHERE pr.post_id = p.id);

-- anon is revoked explicitly: Supabase's default privileges grant every new
-- public table to anon, and RLS alone would only make an anon read return zero
-- rows instead of refusing it outright (same treatment as push_tokens).
REVOKE ALL ON public.post_reposts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.post_reposts TO authenticated;
GRANT ALL ON public.post_reposts TO service_role;

-- ============================================================================
-- SECTION 2. DRAFTS AND SCHEDULED POSTS
-- ============================================================================
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'published';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

-- CHECK constraints: added only when absent (ADD CONSTRAINT has no IF NOT EXISTS).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.posts'::regclass AND conname = 'posts_status_check') THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_status_check CHECK (status IN ('published', 'draft', 'scheduled'));
  END IF;

  -- A scheduled post without a time would never publish and would stay
  -- invisible forever; a published/draft row must not carry a stale time.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.posts'::regclass AND conname = 'posts_scheduled_at_check') THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_scheduled_at_check
      CHECK (status <> 'scheduled' OR scheduled_at IS NOT NULL);
  END IF;
END
$do$;

-- Partial index: the two "my drafts" / "my scheduled" queries and the cron
-- sweep only ever look at the handful of non-published rows.
CREATE INDEX IF NOT EXISTS idx_posts_status_author
  ON public.posts (author_id, status, created_at DESC)
  WHERE status <> 'published';
CREATE INDEX IF NOT EXISTS idx_posts_due_scheduled
  ON public.posts (scheduled_at)
  WHERE status = 'scheduled';

-- --- The SELECT policy ------------------------------------------------------
-- THIS IS THE IMPORTANT PART. A draft or a scheduled post must be invisible to
-- everyone except its author (and admins/staff, who already see every post for
-- moderation). RLS cannot be "extended", so the existing policy from
-- supabase_schema.sql is recreated verbatim with the status condition ANDed
-- onto it - every campus/visibility condition below is copied unchanged from
-- "Posts viewable by campus or global" and must stay in sync with it.
DROP POLICY IF EXISTS "Posts viewable by campus or global" ON public.posts;
CREATE POLICY "Posts viewable by campus or global" ON public.posts
  FOR SELECT TO authenticated USING (
    (
      -- unchanged: the institution / audience rules
      visibility_scope = 'global' OR
      campus_code = 'GLOBAL' OR
      campus_code = (SELECT campus_code FROM public.profiles WHERE id = auth.uid()) OR
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
    )
    AND
    (
      -- new: unpublished rows are author-only (admins/staff keep moderation reach)
      COALESCE(status, 'published') = 'published' OR
      author_id = auth.uid() OR
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
    )
  );

-- No new UPDATE policy is needed: "Authors, admins and staff can update posts"
-- already lets an author flip their own row's status (publish a draft,
-- reschedule), which is exactly what the client-side fallback below relies on.
-- trg_enforce_post_pin_authority is a BEFORE UPDATE trigger on is_pinned only
-- and is unaffected. trg_rate_limit_posts is BEFORE INSERT, so saving a draft
-- and later publishing it costs one unit of the 20-posts-per-hour budget, not
-- two - drafts deliberately count at creation time.

-- ============================================================================
-- SECTION 3. PUBLISHING DUE SCHEDULED POSTS
-- ============================================================================
-- created_at is moved to now() so a post scheduled a week ago lands at the top
-- of the feed rather than a week down it (the feed orders by created_at).
CREATE OR REPLACE FUNCTION public.publish_due_scheduled_posts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  -- service_role / cron / SQL editor only. auth.uid() is NULL for those.
  IF auth.uid() IS NOT NULL
     AND COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'publish_due_scheduled_posts is restricted to service_role.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.posts
     SET status = 'published',
         created_at = now()
   WHERE status = 'scheduled'
     AND scheduled_at IS NOT NULL
     AND scheduled_at <= now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;

REVOKE ALL ON FUNCTION public.publish_due_scheduled_posts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_due_scheduled_posts() TO service_role;

-- Every 5 minutes - only when pg_cron is installed. Idempotent: an existing
-- job of the same name is unscheduled first. pg_cron is NOT enabled on
-- production today, so until it is the client-side fallback in
-- src/api/posts.ts is what actually publishes due posts (see the .md).
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed: lioris_publish_scheduled_posts NOT scheduled (see supabase_posts_features_2026.md)';
    RETURN;
  END IF;

  BEGIN
    EXECUTE format('SELECT cron.unschedule(%L)', 'lioris_publish_scheduled_posts');
  EXCEPTION WHEN OTHERS THEN
    NULL;                                    -- no previous job of that name
  END;

  BEGIN
    EXECUTE format('SELECT cron.schedule(%L, %L, %L)',
                   'lioris_publish_scheduled_posts', '*/5 * * * *',
                   'SELECT public.publish_due_scheduled_posts()');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not schedule lioris_publish_scheduled_posts: % (schedule it manually)', SQLERRM;
  END;
END
$do$;

-- ============================================================================
-- SECTION 4. SAVED ITEMS (one bookmark store for every kind of item)
-- ============================================================================
-- Replaces src/utils/resourceBookmarks.ts's per-device localStorage list, which
-- only knew about resources and was lost on every new device / cache clear.
-- item_id is text, not uuid: resources and jobs can be bundled fixtures with
-- non-uuid ids, and the table must not reject them.
CREATE TABLE IF NOT EXISTS public.saved_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('post', 'resource', 'event', 'job')),
  item_id    text NOT NULL,
  -- Denormalised so the Saved screen renders without joining four tables (and
  -- still shows something sensible when the original item is gone).
  title      text,
  subtitle   text,
  image_url  text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_items_unique_per_user UNIQUE (user_id, kind, item_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_items_user_kind_created
  ON public.saved_items (user_id, kind, created_at DESC);

ALTER TABLE public.saved_items ENABLE ROW LEVEL SECURITY;

-- Owner-only for all four verbs. What someone saved is private: there is
-- deliberately no admin read policy here.
DROP POLICY IF EXISTS "Users can read their own saved items" ON public.saved_items;
CREATE POLICY "Users can read their own saved items" ON public.saved_items
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can save items" ON public.saved_items;
CREATE POLICY "Users can save items" ON public.saved_items
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own saved items" ON public.saved_items;
CREATE POLICY "Users can update their own saved items" ON public.saved_items
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unsave items" ON public.saved_items;
CREATE POLICY "Users can unsave items" ON public.saved_items
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.saved_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_items TO authenticated;
GRANT ALL ON public.saved_items TO service_role;

-- ============================================================================
-- SECTION 5. POLL CLOSING TIME
-- ============================================================================
-- No new column. Polls are one JSONB blob in posts.poll_data, written and read
-- as a whole by src/api/posts.ts (`poll_data: payload.poll`, `poll: row.poll_data`),
-- so the closing time lives inside it as an ISO string:
--
--   {"question": "...",
--    "options": [{"id": "...", "label": "...", "votes": 0}],
--    "totalVotes": 0,
--    "closesAt": "2026-10-01T09:00:00.000Z"}   -- absent on legacy polls = never closes
--
-- `isClosed` is derived client-side from closesAt and is never persisted.
-- A separate posts.poll_closes_at column would have to be kept in sync with
-- the blob for no gain: nothing server-side queries polls by closing time, and
-- the votes themselves now live in their own table (section 5B). The closing
-- time IS enforced server-side - trg_poll_vote_guard below reads it out of this
-- blob and refuses a vote once it has passed.
--
-- This statement only normalises the shape of existing rows (adds nothing when
-- there are no polls) and is safe to re-run.
UPDATE public.posts
   SET poll_data = poll_data || jsonb_build_object('totalVotes', COALESCE((poll_data ->> 'totalVotes')::int, 0))
 WHERE poll_data IS NOT NULL
   AND jsonb_typeof(poll_data) = 'object'
   AND NOT (poll_data ? 'totalVotes');

-- ============================================================================
-- SECTION 5B. PER-VOTER POLL VOTES
-- ============================================================================
-- Votes used to live entirely inside the poll_data blob, including the
-- `isVotedByMe` flag - which is per-VIEWER information stored in a row every
-- viewer reads. The result: whoever voted last, everybody saw that person's
-- selection as their own, and one user changing their vote changed it on
-- everyone's screen. "Change your vote" is unshippable on top of that.
--
-- One row per voter per poll. Changing a vote is an UPDATE of option_id, so a
-- user can never hold two votes on the same poll (the unique constraint says
-- so, not the client).
CREATE TABLE IF NOT EXISTS public.post_poll_votes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  -- Matches an id inside poll_data.options[]; text, because option ids are
  -- client-generated strings ('opt-1'), not uuids.
  option_id  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_poll_votes_one_per_user UNIQUE (post_id, user_id)
);

-- (post_id) powers the tally recount; the unique constraint already indexes
-- (post_id, user_id) for the "what did I vote?" lookup.
CREATE INDEX IF NOT EXISTS idx_post_poll_votes_post ON public.post_poll_votes (post_id);
CREATE INDEX IF NOT EXISTS idx_post_poll_votes_user ON public.post_poll_votes (user_id);

ALTER TABLE public.post_poll_votes ENABLE ROW LEVEL SECURITY;

-- SELECT is open to authenticated users: the client needs it to compute
-- tallies and to answer "which option did I pick". A poll vote is not secret
-- (the totals are public either way).
DROP POLICY IF EXISTS "Poll votes are viewable by authenticated users" ON public.post_poll_votes;
CREATE POLICY "Poll votes are viewable by authenticated users" ON public.post_poll_votes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can cast their own poll vote" ON public.post_poll_votes;
CREATE POLICY "Users can cast their own poll vote" ON public.post_poll_votes
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id AND
    NOT COALESCE((SELECT p.is_suspended FROM public.profiles p WHERE p.id = auth.uid()), false)
  );

-- USING and WITH CHECK both pin the row to the caller, so a vote cannot be
-- re-pointed at another user, and a suspended user cannot change their vote
-- either.
DROP POLICY IF EXISTS "Users can change their own poll vote" ON public.post_poll_votes;
CREATE POLICY "Users can change their own poll vote" ON public.post_poll_votes
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id AND
    NOT COALESCE((SELECT p.is_suspended FROM public.profiles p WHERE p.id = auth.uid()), false)
  )
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can withdraw their own poll vote" ON public.post_poll_votes;
CREATE POLICY "Users can withdraw their own poll vote" ON public.post_poll_votes
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id OR public.auth_profile_role() = 'admin'
  );

REVOKE ALL ON public.post_poll_votes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_poll_votes TO authenticated;
GRANT ALL ON public.post_poll_votes TO service_role;

-- --- The tally --------------------------------------------------------------
-- poll_data keeps carrying the per-option `votes` and `totalVotes` numbers so
-- every existing reader keeps working, but they are now DERIVED: recomputed
-- from post_poll_votes by a trigger instead of written by the client. That is
-- what makes drift impossible. `isVotedByMe` is stripped out at the same time -
-- it is per-viewer and must never live in a shared row again.
CREATE OR REPLACE FUNCTION public.recount_poll_votes(p_post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.posts p
     SET poll_data = jsonb_set(
           jsonb_set(
             p.poll_data,
             '{options}',
             COALESCE((
               SELECT jsonb_agg(
                        (t.opt - 'isVotedByMe') ||
                        jsonb_build_object('votes', (
                          SELECT count(*)::int FROM public.post_poll_votes v
                           WHERE v.post_id = p.id AND v.option_id = t.opt ->> 'id'
                        ))
                        ORDER BY t.ord)
                 FROM jsonb_array_elements(p.poll_data -> 'options') WITH ORDINALITY AS t(opt, ord)
             ), '[]'::jsonb)),
           '{totalVotes}',
           to_jsonb((SELECT count(*)::int FROM public.post_poll_votes v WHERE v.post_id = p.id)))
   WHERE p.id = p_post_id
     AND p.poll_data IS NOT NULL
     AND jsonb_typeof(p.poll_data) = 'object'
     AND jsonb_typeof(p.poll_data -> 'options') = 'array';
$$;

REVOKE ALL ON FUNCTION public.recount_poll_votes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recount_poll_votes(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_poll_vote_tally()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.recount_poll_votes(COALESCE(NEW.post_id, OLD.post_id));
  -- An UPDATE that moved the vote to a different post would leave the old
  -- poll's tally stale; the unique key makes that pointless, but it costs
  -- nothing to be correct.
  IF TG_OP = 'UPDATE' AND NEW.post_id IS DISTINCT FROM OLD.post_id THEN
    PERFORM public.recount_poll_votes(OLD.post_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS trigger_sync_poll_votes ON public.post_poll_votes;
CREATE TRIGGER trigger_sync_poll_votes
AFTER INSERT OR UPDATE OR DELETE ON public.post_poll_votes
FOR EACH ROW EXECUTE FUNCTION public.sync_poll_vote_tally();

-- --- Vote guard -------------------------------------------------------------
-- Refuses a vote on a poll that does not exist, on an option that is not in
-- the poll, or after closesAt has passed. DELETE is deliberately NOT guarded:
-- blocking it would make purge_user_data() (right to erasure) fail on any user
-- who ever voted in a poll that has since closed.
CREATE OR REPLACE FUNCTION public.enforce_poll_vote_validity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_poll jsonb;
BEGIN
  SELECT poll_data INTO v_poll FROM public.posts WHERE id = NEW.post_id;

  IF v_poll IS NULL OR jsonb_typeof(v_poll -> 'options') <> 'array' THEN
    RAISE EXCEPTION 'That post does not have a poll.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_poll -> 'options') o
                  WHERE o ->> 'id' = NEW.option_id) THEN
    RAISE EXCEPTION 'That poll option does not exist.' USING ERRCODE = 'P0001';
  END IF;

  IF (v_poll ? 'closesAt')
     AND (v_poll ->> 'closesAt') IS NOT NULL
     AND (v_poll ->> 'closesAt')::timestamptz <= now() THEN
    RAISE EXCEPTION 'Voting on this poll has closed.' USING ERRCODE = 'P0001';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_poll_vote_guard ON public.post_poll_votes;
CREATE TRIGGER trg_poll_vote_guard
BEFORE INSERT OR UPDATE ON public.post_poll_votes
FOR EACH ROW EXECUTE FUNCTION public.enforce_poll_vote_validity();

-- --- isVotedByMe can never be stored again ----------------------------------
-- Belt and braces for the bug this section exists to kill: even a stale client
-- that still writes the old blob shape has the per-viewer flag stripped out
-- before the row hits disk.
CREATE OR REPLACE FUNCTION public.strip_poll_is_voted_by_me()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.poll_data IS NOT NULL
     AND jsonb_typeof(NEW.poll_data) = 'object'
     AND jsonb_typeof(NEW.poll_data -> 'options') = 'array' THEN
    NEW.poll_data := jsonb_set(
      NEW.poll_data,
      '{options}',
      COALESCE((SELECT jsonb_agg((t.opt - 'isVotedByMe') ORDER BY t.ord)
                  FROM jsonb_array_elements(NEW.poll_data -> 'options') WITH ORDINALITY AS t(opt, ord)),
               '[]'::jsonb));
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_strip_poll_is_voted_by_me ON public.posts;
CREATE TRIGGER trg_strip_poll_is_voted_by_me
BEFORE INSERT OR UPDATE OF poll_data ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.strip_poll_is_voted_by_me();

-- Migration of what already exists. The `isVotedByMe: true` flags sitting in
-- production blobs cannot be attributed to any user - the old code never
-- recorded WHO voted - so no post_poll_votes rows are invented from them. The
-- per-option totals are left exactly as they are; they simply stop being
-- attached to anybody. Practical effect: a pre-existing poll keeps its numbers,
-- nobody is shown as having voted, and the first real vote cast through the new
-- table triggers a recount that replaces those legacy totals with the true
-- count. This is called out in supabase_posts_features_2026.md.
UPDATE public.posts p
   SET poll_data = jsonb_set(
         p.poll_data,
         '{options}',
         COALESCE((SELECT jsonb_agg((t.opt - 'isVotedByMe') ORDER BY t.ord)
                     FROM jsonb_array_elements(p.poll_data -> 'options') WITH ORDINALITY AS t(opt, ord)),
                  '[]'::jsonb))
 WHERE p.poll_data IS NOT NULL
   AND jsonb_typeof(p.poll_data) = 'object'
   AND jsonb_typeof(p.poll_data -> 'options') = 'array'
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.poll_data -> 'options') o WHERE o ? 'isVotedByMe');

-- Realtime: a vote changes posts.poll_data, and posts is already published, so
-- the tally reaches subscribers without publishing the vote rows themselves.

-- ============================================================================
-- SECTION 6. purge_user_data() COVERAGE
-- ============================================================================
-- purge_user_data() (supabase_security_hardening_2026.sql) discovers the tables
-- it must clear by walking single-column foreign keys that point at
-- public.profiles or auth.users, and hard-deletes the ones with ON DELETE
-- CASCADE. post_reposts.user_id and saved_items.user_id are exactly that, so
-- both are picked up automatically with no change to the function. This block
-- VERIFIES that rather than assuming it, and fails the migration loudly if a
-- future edit to either table breaks the assumption.
DO $do$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  t text;
BEGIN
  IF to_regprocedure('public.purge_user_data(uuid)') IS NULL THEN
    RAISE NOTICE 'purge_user_data(uuid) not present - skipping the erasure coverage check.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['post_reposts', 'saved_items', 'post_poll_votes'] LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_constraint c
        JOIN pg_class cl      ON cl.oid = c.conrelid AND cl.relkind = 'r'
        JOIN pg_namespace n   ON n.oid = cl.relnamespace AND n.nspname = 'public'
        JOIN pg_attribute a   ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.contype = 'f'
         AND array_length(c.conkey, 1) = 1
         AND cl.relname = t
         AND a.attname = 'user_id'
         AND c.confdeltype = 'c'
         AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
    ) THEN
      v_missing := v_missing || t;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'purge_user_data() would NOT clear: % - give the table a single-column user_id FK to auth.users ON DELETE CASCADE, or delete from it explicitly inside purge_user_data().',
      array_to_string(v_missing, ', ');
  END IF;
END
$do$;

-- ============================================================================
-- SECTION 7. REALTIME
-- ============================================================================
-- posts is already published to supabase_realtime (supabase_schema.sql section
-- 1119); post_reposts joins it so a repost count updates live. saved_items is
-- deliberately left out - it is private, per-user, and nothing subscribes to it.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                      WHERE pubname = 'supabase_realtime'
                        AND schemaname = 'public' AND tablename = 'post_reposts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.post_reposts;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add post_reposts to supabase_realtime: %', SQLERRM;
END
$do$;

COMMIT;
