-- LIORIS manual SQL, part 19 of 19: 20261115000000_security_audit_round6.sql
-- Paste this whole file into the Supabase SQL editor and Run. Parts must be run in order; the guard below
-- stops this part if an earlier one is missing. Safe to run twice.
SET lock_timeout = '8s';
SET statement_timeout = '180s';

CREATE TABLE IF NOT EXISTS public._manual_migration_log (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._manual_migration_log ENABLE ROW LEVEL SECURITY;


-- ########## 20261115000000_security_audit_round6.sql ##########
-- ============================================================================================================
-- 20261115000000_security_audit_round6.sql
--
-- Round-6 database audit. Every item below was reproduced with a failing check in
-- tools/sql-harness/security-round6.mjs BEFORE it was fixed.
--
--   1  Visibility regressions. 20261022000000 re-created the plain "viewable by campus or global" SELECT
--      policies and silently dropped earlier protections that no later migration restored:
--        * posts: drafts, scheduled posts and staff-only audience posts were readable by the whole campus, and
--          the campus wall was ignored (an unverified account that merely CLAIMS a campus at sign-up read all
--          of it);
--        * jobs: postings still waiting for review were readable by the whole campus;
--        * marketplace: admin-removed (is_removed) listings were readable by the whole campus, and the campus
--          wall was ignored;
--        * study_groups: private pods, their meeting links and goals were readable straight from the table
--          (the pod design says only members read the row; everyone else goes through list_study_groups());
--      Also: pending_approval events were readable by every campus member AND by signed-out visitors;
--      job_questions were readable by anyone; likes, reposts, poll votes and comment likes were readable /
--      writable for posts the caller cannot see. Fixed with RESTRICTIVE policies, which AND with whatever
--      permissive policies exist, so a later re-creation of the old permissive policies cannot reopen the hole.
--   2  Counters and timestamps a member could forge on their own rows: post_comments.likes_count,
--      posts.reposts_count, created_at in the future (pins a row to the top of every feed); the moderation
--      flags posts.is_flagged and marketplace_listings.is_removed / takedown_reason (an author could undo a
--      takedown).
--   3  chat_channels could be created "by" somebody else, which auto-enrolled that person in a channel the
--      attacker named (inbox spam / phishing, minors included).
--   4  Minors: the limited-minor messaging rule only covered 1:1 channels. A group channel with two people
--      (is_direct_message = false) let any adult message a limited minor and vice versa. Members under 18
--      could also be promoted to staff / administrator / Campus Ambassador.
--   5  TRUNCATE / TRIGGER / REFERENCES were still granted to anon and authenticated on every public table
--      (TRUNCATE ignores row-level security). Revoked, and default privileges tightened.
--   6  storage.objects: object names containing "." / ".." path segments are refused.
--   7  public_profiles view gets security_invoker.
--   8  Edge-function audit items: admin_store_link_check / admin_save_partnership campus scope + suspended
--      actor, refund_rate_limit(), purge_user_data() erases the notification send log, rate-limit keys,
--      notifications the member sent and a takedown claimant's contact details, export_my_data() includes
--      analytics rows, giving clicks and client errors, lioris_actor_is_super() requires a confirmed e-mail.
--
-- Idempotent (CREATE OR REPLACE / DROP ... IF EXISTS). No table rewrite: only policies, triggers, functions
-- and privileges change. Safe to run in one transaction with lock_timeout.
-- ============================================================================================================
BEGIN;
DO $chain$ BEGIN IF NOT EXISTS (SELECT 1 FROM public._manual_migration_log WHERE version = '20261114000000') THEN RAISE EXCEPTION 'Stopped: migration 20261114000000 has not been applied. Fix it and re-run this whole file.'; END IF; END $chain$;

DO $do$
BEGIN
  IF to_regprocedure('public.auth_campus_access()') IS NULL
     OR to_regprocedure('public.auth_profile_role()') IS NULL
     OR to_regprocedure('public.guard_counter_columns()') IS NULL
     OR to_regprocedure('public.auth_is_super_admin()') IS NULL
     OR to_regprocedure('lioris_internal.is_minor_raw(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Earlier migrations are missing (auth_campus_access / guard_counter_columns / lioris_internal). Apply them first.';
  END IF;
END
$do$;

-- ============================================================================================================
-- 1. Visibility
-- ============================================================================================================
-- posts: published + audience + campus wall. The author and campus staff / admins keep their reach (the
-- scope_privileged_* restrictive policies still confine staff / admins to their own campus).
DROP POLICY IF EXISTS round6_posts_select ON public.posts;
CREATE POLICY round6_posts_select ON public.posts AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    OR COALESCE((SELECT public.auth_profile_role() IN ('admin', 'staff')), false)
    OR (
      COALESCE(status, 'published') = 'published'
      AND (audience_scope IS NULL OR audience_scope = 'global'
           OR audience_scope = (SELECT public.auth_profile_role()))
      AND (visibility_scope = 'global' OR campus_code IS NULL OR campus_code = 'GLOBAL'
           OR campus_code = (SELECT public.auth_campus_access()))
    )
  );

-- jobs: approved postings only (poster and staff / admins excepted).
DROP POLICY IF EXISTS round6_jobs_select ON public.jobs;
CREATE POLICY round6_jobs_select ON public.jobs AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    poster_id = auth.uid()
    OR COALESCE((SELECT public.auth_profile_role() IN ('admin', 'staff')), false)
    OR COALESCE(is_approved, false)
  );

-- marketplace: a listing an administrator took down stays down; campus wall.
DROP POLICY IF EXISTS round6_marketplace_select ON public.marketplace_listings;
CREATE POLICY round6_marketplace_select ON public.marketplace_listings AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    seller_id = auth.uid()
    OR COALESCE((SELECT public.auth_profile_role() IN ('admin', 'staff')), false)
    OR (
      NOT COALESCE(is_removed, false)
      AND (campus_code = 'GLOBAL' OR campus_code = (SELECT public.auth_campus_access()))
    )
  );

-- study_groups: only members (and staff / admins) read the row; everyone else discovers pods through
-- list_study_groups(), which withholds the meeting link from non-members. The policy below is the
-- 20261022000000 regression that undid that.
DROP POLICY IF EXISTS "Study groups viewable by campus or global" ON public.study_groups;

-- events: a submission still waiting for approval is visible to its creator and to staff / admins only.
DROP POLICY IF EXISTS round6_events_select ON public.events;
CREATE POLICY round6_events_select ON public.events AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    creator_id = auth.uid()
    OR COALESCE((SELECT public.auth_profile_role() IN ('admin', 'staff')), false)
    OR status IS DISTINCT FROM 'pending_approval'
  );
DROP POLICY IF EXISTS round6_events_select_anon ON public.events;
CREATE POLICY round6_events_select_anon ON public.events AS RESTRICTIVE FOR SELECT TO anon
  USING (status IS DISTINCT FROM 'pending_approval');

-- job_questions: readable with the job, not by the world.
DROP POLICY IF EXISTS "Job questions are readable by anyone" ON public.job_questions;
DROP POLICY IF EXISTS round6_job_questions_select ON public.job_questions;
CREATE POLICY round6_job_questions_select ON public.job_questions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_questions.job_id));

-- Child rows are readable / writable only when the parent is visible to the caller (the sub-select runs
-- under the caller's own row-level security).
DROP POLICY IF EXISTS round6_post_likes_select ON public.post_likes;
CREATE POLICY round6_post_likes_select ON public.post_likes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_likes.post_id));
DROP POLICY IF EXISTS round6_post_likes_insert ON public.post_likes;
CREATE POLICY round6_post_likes_insert ON public.post_likes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_likes.post_id));

DROP POLICY IF EXISTS round6_post_reposts_select ON public.post_reposts;
CREATE POLICY round6_post_reposts_select ON public.post_reposts AS RESTRICTIVE FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_reposts.post_id));
DROP POLICY IF EXISTS round6_post_reposts_insert ON public.post_reposts;
CREATE POLICY round6_post_reposts_insert ON public.post_reposts AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_reposts.post_id));

DROP POLICY IF EXISTS round6_post_poll_votes_select ON public.post_poll_votes;
CREATE POLICY round6_post_poll_votes_select ON public.post_poll_votes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_poll_votes.post_id));

DROP POLICY IF EXISTS round6_post_comment_likes_select ON public.post_comment_likes;
CREATE POLICY round6_post_comment_likes_select ON public.post_comment_likes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.post_comments c WHERE c.id = post_comment_likes.comment_id));
DROP POLICY IF EXISTS round6_post_comment_likes_insert ON public.post_comment_likes;
CREATE POLICY round6_post_comment_likes_insert ON public.post_comment_likes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.post_comments c WHERE c.id = post_comment_likes.comment_id));

DROP POLICY IF EXISTS round6_event_reminders_insert ON public.event_reminders;
CREATE POLICY round6_event_reminders_insert ON public.event_reminders AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_reminders.event_id));

DROP POLICY IF EXISTS round6_forum_members_insert ON public.forum_community_members;
CREATE POLICY round6_forum_members_insert ON public.forum_community_members AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.forum_communities c WHERE c.id = forum_community_members.community_id));

-- get_suggested_connections(): the 20261111000000 definition with the search path pinned to include pg_temp.
CREATE OR REPLACE FUNCTION public.get_suggested_connections(p_limit integer DEFAULT 10)
RETURNS TABLE(id uuid, full_name text, role text, department text, level text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.full_name, p.role::text, p.department, p.level, p.avatar_url
    FROM public.profiles p
   WHERE auth.uid() IS NOT NULL
     AND p.id <> auth.uid()
     AND p.role::text IN ('student', 'alumni')
     AND NOT COALESCE(p.is_bot, false)
     AND NOT COALESCE(p.is_suspended, false)
     AND (
       p.campus_code = 'GLOBAL'
       OR p.campus_code = public.campus_of(auth.uid())
     )
     AND NOT public.users_have_block(auth.uid(), p.id)
     AND (NOT lioris_internal.is_limited_minor_raw(p.id) OR lioris_internal.is_minor_raw(auth.uid()))
     AND NOT EXISTS (SELECT 1 FROM public.user_mutes um WHERE um.muter_id = auth.uid() AND um.muted_id = p.id)
     AND NOT EXISTS (
       SELECT 1 FROM public.connections c
        WHERE c.status IN ('pending', 'accepted')
          AND ((c.requester_id = auth.uid() AND c.recipient_id = p.id)
            OR (c.requester_id = p.id AND c.recipient_id = auth.uid())))
   ORDER BY random()
   LIMIT GREATEST(COALESCE(p_limit, 10), 0)
$$;
REVOKE ALL ON FUNCTION public.get_suggested_connections(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_suggested_connections(integer) TO authenticated, service_role;

-- ============================================================================================================
-- 2. Counters, timestamps and moderation flags a member must not write
-- ============================================================================================================
DROP TRIGGER IF EXISTS trg_guard_counters ON public.posts;
CREATE TRIGGER trg_guard_counters BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_counter_columns('likes_count', 'comments_count', 'reposts_count');

DROP TRIGGER IF EXISTS trg_guard_counters ON public.post_comments;
CREATE TRIGGER trg_guard_counters BEFORE INSERT OR UPDATE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.guard_counter_columns('likes_count');

-- A client cannot post-date a row (the feeds order by created_at, so a date years ahead pins it to the top).
CREATE OR REPLACE FUNCTION public.clamp_client_created_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;
  IF NEW.created_at IS NOT NULL AND NEW.created_at > now() THEN NEW.created_at := now(); END IF;
  RETURN NEW;
END
$$;

DO $clamp$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['posts', 'post_comments', 'jobs', 'marketplace_listings', 'resources', 'events']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_zz_clamp_created_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_zz_clamp_created_at BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.clamp_client_created_at()', t);
  END LOOP;
END
$clamp$;

-- Moderation flags are written by staff / administrators and by SECURITY DEFINER code, never by the author.
CREATE OR REPLACE FUNCTION public.guard_moderation_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;
  IF public.auth_is_super_admin() OR COALESCE(public.auth_profile_role() IN ('admin', 'staff'), false) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'posts' THEN
    IF TG_OP = 'INSERT' THEN NEW.is_flagged := false; ELSE NEW.is_flagged := OLD.is_flagged; END IF;
  ELSIF TG_TABLE_NAME = 'marketplace_listings' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_removed := false; NEW.takedown_reason := NULL;
    ELSE
      NEW.is_removed := OLD.is_removed; NEW.takedown_reason := OLD.takedown_reason;
    END IF;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_guard_moderation_flags ON public.posts;
CREATE TRIGGER trg_guard_moderation_flags BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_moderation_flags();
DROP TRIGGER IF EXISTS trg_guard_moderation_flags ON public.marketplace_listings;
CREATE TRIGGER trg_guard_moderation_flags BEFORE INSERT OR UPDATE ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.guard_moderation_flags();

-- ============================================================================================================
-- 3. Chat: a channel is created by the member who inserts it
-- ============================================================================================================
DROP POLICY IF EXISTS round6_chat_channels_creator ON public.chat_channels;
CREATE POLICY round6_chat_channels_creator ON public.chat_channels AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR (SELECT public.auth_is_super_admin()));

-- ============================================================================================================
-- 4. Minors
-- ============================================================================================================
-- The pair rule (accepted connection, or the other side is staff / an administrator) now also covers
-- user-created GROUP channels. Channels with no creator (system / campus channels) stay open.
CREATE OR REPLACE FUNCTION lioris_internal.dm_send_block(p_channel uuid, p_sender uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_other uuid;
  v_dm boolean;
  v_creator uuid;
  v_found boolean;
  v_limited boolean;
BEGIN
  IF p_sender IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(ch.is_direct_message, false), ch.created_by, true
    INTO v_dm, v_creator, v_found
    FROM public.chat_channels ch WHERE ch.id = p_channel;
  IF NOT COALESCE(v_found, false) THEN RETURN NULL; END IF;
  IF NOT v_dm AND v_creator IS NULL THEN RETURN NULL; END IF;
  v_limited := lioris_internal.is_limited_minor_raw(p_sender);
  FOR v_other IN
    SELECT m.user_id
      FROM public.chat_channel_members m
      LEFT JOIN public.profiles pr ON pr.id = m.user_id
     WHERE m.channel_id = p_channel AND m.user_id <> p_sender
       AND (v_dm OR v_limited OR (pr.date_of_birth IS NOT NULL AND public.age_years(pr.date_of_birth) < 18))
  LOOP
    IF NOT lioris_internal.minor_dm_allowed(p_sender, v_other) THEN
      RETURN CASE WHEN v_limited THEN 'self' ELSE 'other' END;
    END IF;
  END LOOP;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION lioris_internal.dm_member_block(p_channel uuid, p_user uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dm boolean;
  v_creator uuid;
  v_found boolean;
  v_other uuid;
  v_user_limited boolean;
  v_block boolean := false;
BEGIN
  SELECT COALESCE(ch.is_direct_message, false), ch.created_by, true
    INTO v_dm, v_creator, v_found
    FROM public.chat_channels ch WHERE ch.id = p_channel;
  IF NOT COALESCE(v_found, false) OR p_user IS NULL OR v_creator IS NULL THEN RETURN NULL; END IF;

  IF v_dm THEN
    IF p_user = v_creator THEN RETURN NULL; END IF;
    v_block := NOT lioris_internal.minor_dm_allowed(p_user, v_creator);
  ELSE
    v_user_limited := lioris_internal.is_limited_minor_raw(p_user);
    FOR v_other IN
      SELECT m.user_id
        FROM public.chat_channel_members m
        LEFT JOIN public.profiles pr ON pr.id = m.user_id
       WHERE m.channel_id = p_channel AND m.user_id <> p_user
         AND (v_user_limited OR (pr.date_of_birth IS NOT NULL AND public.age_years(pr.date_of_birth) < 18))
    LOOP
      IF NOT lioris_internal.minor_dm_allowed(p_user, v_other) THEN v_block := true; EXIT; END IF;
    END LOOP;
  END IF;

  IF NOT v_block THEN RETURN NULL; END IF;
  RETURN CASE WHEN lioris_internal.is_limited_minor_raw(auth.uid()) THEN 'self' ELSE 'other' END;
END
$$;

REVOKE ALL ON FUNCTION lioris_internal.dm_send_block(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION lioris_internal.dm_member_block(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lioris_internal.dm_send_block(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION lioris_internal.dm_member_block(uuid, uuid) TO authenticated, service_role;

-- Members under 18 hold no staff / administrator / Campus Ambassador role.
CREATE OR REPLACE FUNCTION lioris_internal.refuse_minor_privileged_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role::text IN ('admin', 'staff')
     AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role)
     AND NEW.date_of_birth IS NOT NULL AND public.age_years(NEW.date_of_birth) < 18 THEN
    RAISE EXCEPTION 'MINOR_RESTRICTED: Members under 18 cannot hold a staff or administrator role.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION lioris_internal.refuse_minor_privileged_role() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS trg_zz_refuse_minor_privileged_role ON public.profiles;
CREATE TRIGGER trg_zz_refuse_minor_privileged_role BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION lioris_internal.refuse_minor_privileged_role();

-- Campus Ambassador appointment: the 20261113000000 definition plus a refusal for minors, bots and deactivated accounts.
CREATE OR REPLACE FUNCTION public.set_campus_ambassador_status(p_user_id uuid, p_is_ambassador boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_campus text;
  v_target public.profiles%ROWTYPE;
  v_super boolean;
BEGIN
  IF v_actor IS NULL AND auth.role() <> 'service_role' THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_actor = p_user_id THEN RAISE EXCEPTION 'conflict_of_interest: ambassadors cannot change their own appointment'; END IF;

  v_super := auth.role() = 'service_role' OR public.auth_is_super_admin();
  IF NOT v_super THEN
    SELECT LOWER(COALESCE(role::text, '')), NULLIF(campus_code, '')
      INTO v_actor_role, v_actor_campus FROM public.profiles WHERE id = v_actor;
    IF v_actor_role NOT IN ('admin', 'staff') THEN RAISE EXCEPTION 'admin_required'; END IF;
    IF v_actor_campus IS NULL OR v_actor_campus = 'GLOBAL' THEN RAISE EXCEPTION 'campus_assignment_required'; END IF;
    IF NOT public.has_role_permission('can_manage_roles') THEN
      RAISE EXCEPTION 'permission_denied: campus role management is disabled';
    END IF;
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_target.campus_code IS NULL OR v_target.campus_code = 'GLOBAL'
     OR NOT EXISTS (
       SELECT 1 FROM public.campuses c
        WHERE c.code = v_target.campus_code AND c.is_active = true
     ) THEN
    RAISE EXCEPTION 'invalid_target_campus: a Campus Ambassador must belong to an active campus';
  END IF;
  IF NOT v_super AND v_target.campus_code IS DISTINCT FROM v_actor_campus THEN
    RAISE EXCEPTION 'unauthorized_campus_scope: you can only manage ambassadors in your own campus';
  END IF;
  IF p_is_ambassador AND (v_target.role::text <> 'student' OR COALESCE(v_target.is_suspended, false)) THEN
    RAISE EXCEPTION 'invalid_target: only active student accounts can be appointed';
  END IF;
  IF p_is_ambassador AND (lioris_internal.is_minor_raw(p_user_id) OR COALESCE(v_target.is_bot, false)
                          OR v_target.deactivated_at IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_target: members under 18, bot and deactivated accounts cannot be appointed';
  END IF;
  IF NOT p_is_ambassador AND NOT (
    v_target.role::text = 'admin' AND v_target.admin_role = 'campus_admin' AND COALESCE(v_target.is_campus_ambassador, false)
  ) THEN
    RAISE EXCEPTION 'invalid_target: that account is not an active Campus Ambassador';
  END IF;

  IF p_is_ambassador THEN
    UPDATE public.profiles
       SET role = 'admin', admin_role = 'campus_admin', is_campus_ambassador = true,
           verification_status = 'verified', onboarding_complete = true, updated_at = now()
     WHERE id = p_user_id;
  ELSE
    UPDATE public.profiles
       SET role = 'student', admin_role = NULL, is_campus_ambassador = false, updated_at = now()
     WHERE id = p_user_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_actor, 'campus_ambassador_updated', 'user', p_user_id,
          jsonb_build_object('summary', CASE WHEN p_is_ambassador THEN 'Campus Ambassador appointed with campus-admin authority' ELSE 'Campus Ambassador authority revoked' END,
                             'targetCampus', v_target.campus_code, 'campusAuthority', p_is_ambassador));
END;
$$;

REVOKE ALL ON FUNCTION public.set_campus_ambassador_status(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_campus_ambassador_status(uuid, boolean) TO authenticated, service_role;

-- ============================================================================================================
-- 5. Privileges: TRUNCATE ignores row-level security, TRIGGER / REFERENCES have no business with clients
-- ============================================================================================================
DO $priv$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM anon, authenticated', r.relname);
  END LOOP;
  BEGIN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'could not alter default privileges (not the owner): skipped';
  END;
END
$priv$;

-- ============================================================================================================
-- 6. storage.objects: no "." / ".." path segments in object names
-- ============================================================================================================
DO $stor$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS round6_no_dot_segments_insert ON storage.objects;
  CREATE POLICY round6_no_dot_segments_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (name !~ '(^|/)\.{1,2}(/|$)');
  DROP POLICY IF EXISTS round6_no_dot_segments_update ON storage.objects;
  CREATE POLICY round6_no_dot_segments_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (true) WITH CHECK (name !~ '(^|/)\.{1,2}(/|$)');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'storage.objects policies not changed (not the owner)';
END
$stor$;

-- ============================================================================================================
-- 7. Views
-- ============================================================================================================
DO $view$
BEGIN
  IF to_regclass('public.public_profiles') IS NOT NULL THEN
    ALTER VIEW public.public_profiles SET (security_invoker = true);
  END IF;
END
$view$;

-- ============================================================================================================
-- 8. Edge-function audit items
-- ============================================================================================================
-- 8a. lioris_actor_is_super: the root e-mail only counts with a CONFIRMED auth e-mail (as auth_is_super_admin()).
CREATE OR REPLACE FUNCTION public.lioris_actor_is_super(p_actor uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT p.role::text = 'admin'
       AND NOT COALESCE(p.is_suspended, false)
       AND (p.admin_role = 'super_admin'
            OR EXISTS (SELECT 1 FROM auth.users u
                        WHERE u.id = p.id AND u.email_confirmed_at IS NOT NULL
                          AND lower(COALESCE(u.email, '')) = 'inememmanuel@gmail.com'))
    FROM public.profiles p WHERE p.id = p_actor
  ), false);
$$;
REVOKE ALL ON FUNCTION public.lioris_actor_is_super(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lioris_actor_is_super(uuid) TO service_role;

-- 8b. admin_store_link_check / admin_save_partnership: the actor must administer the EVENT'S campus (GLOBAL / NULL
--     campus = Super Admin only) and not be suspended.
CREATE OR REPLACE FUNCTION public.admin_store_link_check(p_event uuid, p_actor uuid, p_result jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_campus text;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT e.campus_code INTO v_campus FROM public.events e WHERE e.id = p_event;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: event does not exist.'; END IF;
  IF NOT public.lioris_actor_can_admin_campus(p_actor, v_campus) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  UPDATE public.event_payment_details SET link_check = p_result, link_checked_at = now() WHERE event_id = p_event;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found: This event has no payment details yet.'; END IF;
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_actor, 'event_link_checked', 'event', p_event,
          jsonb_build_object('summary', format('Checked payment link (%s)', p_result ->> 'status'), 'linkHost', p_result ->> 'final_host',
                             'targetIdRaw', p_event::text, 'actorRole', 'admin'));
END $$;
REVOKE ALL ON FUNCTION public.admin_store_link_check(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_store_link_check(uuid, uuid, jsonb) TO service_role;

-- admin_save_partnership: the 20260925140000 definition plus the event-campus scope check.
CREATE OR REPLACE FUNCTION public.admin_save_partnership(
  p_event uuid, p_actor uuid, p_status text, p_organiser_name text, p_organiser_contact text,
  p_fee numeric, p_dispute_days integer, p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  pt public.event_partnerships%ROWTYPE;
  v_title text;
  v_campus text;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor AND role::text = 'admin' AND COALESCE(is_suspended, false) = false) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  SELECT title, campus_code INTO v_title, v_campus FROM public.events WHERE id = p_event AND ticket_type = 'paid';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  -- The actor must administer the EVENT'S campus (GLOBAL / NULL campus = Super Admin only).
  IF NOT public.lioris_actor_can_admin_campus(p_actor, v_campus) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF p_status NOT IN ('none', 'proposed', 'agreed', 'ended') THEN RAISE EXCEPTION 'invalid_input: unknown partnership status.'; END IF;
  IF p_status = 'agreed' AND (p_fee IS NULL OR NULLIF(btrim(COALESCE(p_organiser_name, '')), '') IS NULL OR NULLIF(btrim(COALESCE(p_organiser_contact, '')), '') IS NULL) THEN
    RAISE EXCEPTION 'agreement_incomplete: An agreed partnership needs the organiser''s name, a contact and the fee per paying attendee.';
  END IF;
  INSERT INTO public.event_partnerships AS t (event_id, status, organiser_name, organiser_contact, fee_per_paying_attendee, dispute_window_days, agreed_at, agreed_by, notes, updated_by, updated_at)
  VALUES (p_event, p_status, NULLIF(btrim(COALESCE(p_organiser_name, '')), ''), NULLIF(btrim(COALESCE(p_organiser_contact, '')), ''),
          p_fee, COALESCE(p_dispute_days, 7), CASE WHEN p_status = 'agreed' THEN now() END, CASE WHEN p_status = 'agreed' THEN p_actor END,
          NULLIF(btrim(COALESCE(p_notes, '')), ''), p_actor, now())
  ON CONFLICT (event_id) DO UPDATE SET
    status = EXCLUDED.status, organiser_name = EXCLUDED.organiser_name, organiser_contact = EXCLUDED.organiser_contact,
    fee_per_paying_attendee = EXCLUDED.fee_per_paying_attendee, dispute_window_days = EXCLUDED.dispute_window_days,
    agreed_at = CASE WHEN EXCLUDED.status = 'agreed' THEN COALESCE(t.agreed_at, now()) ELSE t.agreed_at END,
    agreed_by = CASE WHEN EXCLUDED.status = 'agreed' THEN COALESCE(t.agreed_by, p_actor) ELSE t.agreed_by END,
    notes = EXCLUDED.notes, updated_by = p_actor, updated_at = now()
  RETURNING * INTO pt;
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_actor, 'event_partnership_updated', 'event', p_event,
          jsonb_build_object('summary', format('Partnership for "%s" set to %s', v_title, pt.status), 'fee', pt.fee_per_paying_attendee,
                             'targetIdRaw', p_event::text, 'actorRole', 'admin'));
  RETURN to_jsonb(pt);
END $$;
REVOKE ALL ON FUNCTION public.admin_save_partnership(uuid, uuid, text, text, text, numeric, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_partnership(uuid, uuid, text, text, text, numeric, integer, text) TO service_role;

-- 8c. refund_rate_limit: give back one unit of a consume_rate_limit_ex() key (floor 0), atomically.
CREATE OR REPLACE FUNCTION public.refund_rate_limit(p_key text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' OR length(p_key) > 256 THEN
    RAISE EXCEPTION 'invalid rate limit key';
  END IF;
  UPDATE public.api_rate_limits SET count = GREATEST(count - 1, 0) WHERE key = p_key RETURNING count INTO v_count;
  RETURN COALESCE(v_count, 0);
END
$$;
REVOKE ALL ON FUNCTION public.refund_rate_limit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_rate_limit(text) TO service_role;

-- export_my_data: the 20261111000000 definition plus analytics events, giving clicks and client errors.
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_data jsonb := '{}'::jsonb;
  v_truncated jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_where text;
  v_strip text[];
  v_cnt bigint;
  r record;
  c_cap constant int := 20000;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
  END IF;

  FOR r IN
    SELECT cl.relname::text AS tbl,
           array_agg(DISTINCT a.attname::text ORDER BY a.attname::text) AS cols
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid AND cl.relkind = 'r'
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND array_length(c.conkey, 1) = 1
       AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
       AND cl.relname <> 'audit_logs'
       AND (
            (c.confdeltype = 'c' AND NOT (cl.relname = 'user_blocks' AND a.attname = 'blocked_id'))
         OR (cl.relname = 'moderation_queue' AND a.attname = 'reporter_id')
         OR (cl.relname = 'forum_communities' AND a.attname = 'created_by')
         OR (cl.relname = 'chat_channels' AND a.attname = 'created_by')
         OR (cl.relname IN ('analytics_events', 'giving_campaign_clicks') AND a.attname = 'user_id')
       )
     GROUP BY cl.relname
     ORDER BY cl.relname
  LOOP
    SELECT string_agg(format('%I = $1', col), ' OR ') INTO v_where FROM unnest(r.cols) AS col;
    v_strip := CASE r.tbl
      WHEN 'verifications' THEN ARRAY['id_card_front_url', 'id_card_back_url', 'selfie_url', 'reviewed_by']
      WHEN 'support_tickets' THEN ARRAY['admin_notes', 'resolved_by']
      -- MINORS: the member's own guardian record, without the administrator's internal note and who decided.
      WHEN 'guardian_records' THEN ARRAY['consent_note', 'consent_decided_by']
      ELSE ARRAY[]::text[]
    END;

    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', r.tbl, v_where) INTO v_cnt USING v_uid;
    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t) - $2), ''[]''::jsonb) FROM (SELECT * FROM public.%I WHERE %s LIMIT %s) t',
      r.tbl, v_where, c_cap)
      INTO v_rows USING v_uid, v_strip;

    v_data := v_data || jsonb_build_object(r.tbl, v_rows);
    IF v_cnt > c_cap THEN
      v_truncated := v_truncated || jsonb_build_object(r.tbl, v_cnt);
    END IF;
  END LOOP;

  -- Actions the user performed (admin/staff) and actions taken on the account.
  v_data := v_data || jsonb_build_object(
    'audit_logs_performed_by_you',
    COALESCE((SELECT jsonb_agg(jsonb_build_object('action', a.action, 'entity_type', a.entity_type,
                                                  'entity_id', a.entity_id, 'created_at', a.created_at)
                               ORDER BY a.created_at DESC)
                FROM (SELECT * FROM public.audit_logs WHERE actor_id = v_uid
                       ORDER BY created_at DESC LIMIT 5000) a), '[]'::jsonb),
    'audit_logs_about_your_account',
    COALESCE((SELECT jsonb_agg(jsonb_build_object('action', a.action, 'created_at', a.created_at)
                               ORDER BY a.created_at DESC)
                FROM (SELECT * FROM public.audit_logs
                       WHERE entity_id = v_uid AND actor_id IS DISTINCT FROM v_uid
                       ORDER BY created_at DESC LIMIT 5000) a), '[]'::jsonb)
  );

  -- Client error reports carry the member's id but no foreign key.
  IF to_regclass('public.client_errors') IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_rows
      FROM (SELECT * FROM public.client_errors WHERE user_id = v_uid ORDER BY created_at DESC LIMIT c_cap) t;
    v_data := v_data || jsonb_build_object('client_errors', v_rows);
  END IF;

  -- Uploaded files: metadata only (paths, sizes), never content.
  BEGIN
    IF to_regclass('storage.objects') IS NOT NULL THEN
      EXECUTE $q$
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'bucket', o.bucket_id, 'path', o.name,
                 'size_bytes', o.metadata->>'size', 'mime_type', o.metadata->>'mimetype',
                 'created_at', o.created_at)), '[]'::jsonb)
          FROM (SELECT * FROM storage.objects
                 WHERE (storage.foldername(name))[1] = $1::text LIMIT 20000) o
      $q$ INTO v_rows USING v_uid;
      v_data := v_data || jsonb_build_object('storage_objects', v_rows);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_data := v_data || jsonb_build_object('storage_objects', '[]'::jsonb);
  END;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'data_export_requested', 'user', v_uid,
          jsonb_build_object('summary', 'User exported their personal data', 'source', 'export_my_data'));

  RETURN jsonb_build_object(
    'schema_version', 1,
    'exported_at', now(),
    'user_id', v_uid,
    'data', v_data,
    'truncated_tables', v_truncated
  );
END
$$;
REVOKE ALL ON FUNCTION public.export_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;

-- purge_user_data: the 20261111000000 definition plus the identity-bearing rows listed in the block marked below.
CREATE OR REPLACE FUNCTION public.purge_user_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_n bigint;
  v_role text;
  v_email text;
  v_hash text;
  v_deleted jsonb := '{}'::jsonb;
  v_anonymised jsonb := '{}'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_sets text[] := ARRAY[]::text[];
  v_col text;
  v_audit_n bigint := 0;
  v_proofs bigint := 0;
  v_uuid text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required.';
  END IF;
  v_uuid := p_user_id::text;
  v_hash := encode(sha256(convert_to(v_uuid, 'UTF8')), 'hex');

  SELECT role::text, email INTO v_role, v_email FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('user_id', p_user_id, 'profile_found', false,
                              'deleted', v_deleted, 'anonymised', v_anonymised,
                              'storage_prefix', v_uuid || '/');
  END IF;
  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Admin accounts cannot be purged; demote the account first.' USING ERRCODE = '42501';
  END IF;

  -- Consent evidence first: it is deleted by the generic loop below.
  IF to_regclass('public.consent_records') IS NOT NULL AND to_regclass('public.consent_proofs') IS NOT NULL THEN
    INSERT INTO public.consent_proofs (user_hash, consent_type, version, accepted_at)
    SELECT DISTINCT v_hash, c.consent_type, c.version, c.accepted_at
      FROM public.consent_records c WHERE c.user_id = p_user_id
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_proofs = ROW_COUNT;
  END IF;

  -- MINORS: guardian record first, explicitly (the foreign-key loop below would cascade it too), so the
  -- purge result names it. The date of birth is cleared with the other profile fields further down.
  IF to_regclass('public.guardian_records') IS NOT NULL THEN
    DELETE FROM public.guardian_records WHERE minor_id = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_deleted := v_deleted || jsonb_build_object('guardian_records.minor_id', v_n); END IF;
  END IF;

  -- Rows that carry the member's identity in a column the generic loop below would only NULL / that has no
  -- foreign key: a takedown claimant's contact details, notifications the member sent (their name is in the
  -- text), the notification send log and the rate-limit counters keyed by their id.
  IF to_regclass('public.resource_takedown_requests') IS NOT NULL THEN
    UPDATE public.resource_takedown_requests
       SET claimant_name = 'Deleted user', claimant_email = 'deleted@deleted.invalid', claimant_role = NULL
     WHERE reporter_id = p_user_id
        OR (v_email IS NOT NULL AND lower(claimant_email) = lower(v_email));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_anonymised := v_anonymised || jsonb_build_object('resource_takedown_requests.claimant', v_n); END IF;
  END IF;
  DELETE FROM public.notifications WHERE sender_id = p_user_id AND recipient_id <> p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_deleted := v_deleted || jsonb_build_object('notifications.sender_id', v_n); END IF;
  IF to_regclass('public.notification_send_log') IS NOT NULL THEN
    DELETE FROM public.notification_send_log WHERE sender_id = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_deleted := v_deleted || jsonb_build_object('notification_send_log.sender_id', v_n); END IF;
  END IF;
  IF to_regclass('public.api_rate_limits') IS NOT NULL THEN
    DELETE FROM public.api_rate_limits WHERE right(key, length(v_uuid) + 1) = ':' || v_uuid;
  END IF;

  FOR r IN
    SELECT DISTINCT cl.relname::text AS tbl, a.attname::text AS col, c.confdeltype AS del
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid AND cl.relkind = 'r'
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND array_length(c.conkey, 1) = 1
       AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
       AND cl.relname NOT IN ('audit_logs', 'profiles')
     ORDER BY 1, 2
  LOOP
    IF r.del = 'c' THEN
      EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.tbl, r.col) USING p_user_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_deleted := v_deleted || jsonb_build_object(r.tbl || '.' || r.col, v_n); END IF;
    ELSIF r.del = 'n' THEN
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I = $1', r.tbl, r.col, r.col) USING p_user_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_anonymised := v_anonymised || jsonb_build_object(r.tbl || '.' || r.col, v_n); END IF;
    ELSE
      v_skipped := v_skipped || to_jsonb(r.tbl || '.' || r.col);
    END IF;
  END LOOP;

  -- User columns with no foreign key (nothing cascades them).
  FOR r IN
    SELECT t.tbl, t.col FROM (VALUES
      ('client_errors', 'user_id'),
      ('resource_takedown_requests', 'resource_uploader')
    ) AS t(tbl, col)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema = 'public' AND c.table_name = r.tbl
                  AND c.column_name = r.col AND c.is_nullable = 'YES') THEN
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I = $1', r.tbl, r.col, r.col) USING p_user_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_anonymised := v_anonymised || jsonb_build_object(r.tbl || '.' || r.col, v_n); END IF;
    END IF;
  END LOOP;

  -- Rows keyed by e-mail instead of user id.
  IF v_email IS NOT NULL THEN
    IF to_regclass('public.waitlist_entries') IS NOT NULL THEN
      DELETE FROM public.waitlist_entries WHERE lower(email) = lower(v_email);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_deleted := v_deleted || jsonb_build_object('waitlist_entries.email', v_n); END IF;
    END IF;
    IF to_regclass('public.auth_rate_limits') IS NOT NULL THEN
      DELETE FROM public.auth_rate_limits WHERE identifier = lower(btrim(v_email));
    END IF;
  END IF;

  -- Anonymise the profile row (removed for good by auth.admin.deleteUser).
  FOR v_col IN
    SELECT c.column_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = 'profiles' AND c.is_nullable = 'YES'
       AND c.column_name = ANY (ARRAY['username', 'bio', 'avatar_url', 'banner_url', 'student_id_number',
                                      'push_token', 'department', 'faculty', 'level', 'matric_number',
                                      'phone', 'phone_number', 'website', 'website_url', 'linkedin_url',
                                      'github_url', 'twitter_url', 'portfolio_url', 'resume_url',
                                      'company', 'job_title', 'location', 'industry', 'graduation_year',
                                      'suspension_reason', 'date_of_birth'])
  LOOP
    v_sets := v_sets || format('%I = NULL', v_col);
  END LOOP;
  EXECUTE format(
    'UPDATE public.profiles SET email = %L, full_name = %L, interests = ''{}''%s WHERE id = $1',
    'deleted+' || v_uuid || '@deleted.invalid', 'Deleted user',
    CASE WHEN array_length(v_sets, 1) IS NULL THEN '' ELSE ', ' || array_to_string(v_sets, ', ') END)
    USING p_user_id;

  -- audit_logs: keep the trail, drop the identity. Done AFTER the profile update so the rows the
  -- profile triggers just wrote are covered too.
  PERFORM set_config('lioris.audit_anonymise', 'on', true);
  UPDATE public.audit_logs a
     SET actor_id = CASE WHEN a.actor_id = p_user_id THEN NULL ELSE a.actor_id END,
         entity_id = CASE WHEN a.entity_id = p_user_id THEN NULL ELSE a.entity_id END,
         metadata = CASE
           WHEN a.metadata IS NULL THEN NULL
           WHEN jsonb_typeof(a.metadata) = 'object' THEN
             regexp_replace(a.metadata::text, v_uuid, v_hash, 'gi')::jsonb
             || CASE WHEN a.actor_id = p_user_id THEN jsonb_build_object('actorIdHash', v_hash) ELSE '{}'::jsonb END
             || CASE WHEN a.entity_id = p_user_id THEN jsonb_build_object('entityIdHash', v_hash) ELSE '{}'::jsonb END
             || CASE WHEN a.actor_id = p_user_id AND a.metadata ? 'actorName'
                     THEN jsonb_build_object('actorName', 'Deleted user') ELSE '{}'::jsonb END
           ELSE regexp_replace(a.metadata::text, v_uuid, v_hash, 'gi')::jsonb
         END
   WHERE a.actor_id = p_user_id
      OR a.entity_id = p_user_id
      OR a.metadata::text ILIKE '%' || v_uuid || '%';
  GET DIAGNOSTICS v_audit_n = ROW_COUNT;
  PERFORM set_config('lioris.audit_anonymise', 'off', true);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (NULL, 'user_data_purged', 'user', NULL,
          jsonb_build_object('deletedUserIdHash', v_hash, 'deleted', v_deleted, 'anonymised', v_anonymised,
                             'auditRowsAnonymised', v_audit_n, 'consentProofsArchived', v_proofs,
                             'source', 'purge_user_data'));

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'user_id_hash', v_hash,
    'profile_found', true,
    'purged_at', now(),
    'deleted', v_deleted,
    'anonymised', v_anonymised,
    'skipped_restrictive_fks', v_skipped,
    'audit_rows_anonymised', v_audit_n,
    'consent_proofs_archived', v_proofs,
    'profile_anonymised', true,
    'storage_prefix', v_uuid || '/',
    'note', 'Storage objects are NOT touched; delete them via the Storage API, then call auth.admin.deleteUser.'
  );
END
$$;
REVOKE ALL ON FUNCTION public.purge_user_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_user_data(uuid) TO service_role;

INSERT INTO public._manual_migration_log (version) VALUES ('20261115000000') ON CONFLICT (version) DO NOTHING;
COMMIT;

RESET lock_timeout;
RESET statement_timeout;
