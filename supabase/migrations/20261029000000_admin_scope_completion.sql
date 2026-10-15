-- ============================================================================
-- LIORIS - ADMIN SCOPE COMPLETION (2026-10-29)  -  follows 20261028000000_audit_remediation.sql
-- ============================================================================
-- 20261028 rewrote the policies that mattered most. The audit found 89 more policies on 40 tables
-- that still treat ANY role='admin' (and in many cases any staff member) as platform-wide. Rewriting
-- 89 policies by hand would be error-prone, so this migration adds a RESTRICTIVE layer instead:
-- a restrictive policy is ANDed with whatever permissive policies exist, so the old "admin can do
-- anything" branches stay in place but can no longer reach outside the caller's own campus.
--
-- Who is affected: only "scoped privileged" callers - role admin or staff who are NOT Super Admins.
-- Students, alumni and Super Admins evaluate to "not blocked" and behave exactly as before.
--
--   * campus-owned tables (posts, events, announcements, jobs, marketplace, ...): a Campus Admin/staff
--     can read, change and create rows of their OWN campus (plus GLOBAL/global-visibility rows to read,
--     and rows they authored). Nothing else.
--   * child tables (comments, attendees, applications, study-group members, ...): follow the parent row.
--   * platform data (push tokens, client errors, consent records, waitlist, user blocks, partnerships):
--     Super Admin only (owners keep their own rows).
--   * support tickets / mentorships: scoped by the member's campus.
--   * storage: verification documents, resumes, avatars and uploads were readable/writable by ANY admin;
--     now Super Admin or the admin of the OWNER's campus. campus-media is no longer readable across
--     campuses just because the reader is verified somewhere.
--   * Role Permissions that were decorative are enforced for forum posts/comments, marketplace listings
--     and direct messages.
--
-- Deliberately NOT scoped (membership governs them, scoping would hide a member's own cross-campus DMs):
--   chat_channels, chat_channel_members, chat_messages, chat_channel_archives.
--   audit_logs, profiles, verifications, resources, campuses were handled in 20261028.
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Helpers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campus_of(p_user uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT p.campus_code FROM public.profiles p WHERE p.id = p_user; $$;
REVOKE ALL ON FUNCTION public.campus_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campus_of(uuid) TO authenticated, service_role;

-- True for an admin or staff member who is not a Super Admin. Everyone else (students, alumni,
-- Super Admins, the service role) is "not scoped".
CREATE OR REPLACE FUNCTION public.is_scoped_privileged()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT p.role::text IN ('admin', 'staff') FROM public.profiles p WHERE p.id = auth.uid()), false)
     AND NOT public.auth_is_super_admin();
$$;
REVOKE ALL ON FUNCTION public.is_scoped_privileged() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_scoped_privileged() TO authenticated, service_role;

-- May a scoped admin/staff READ a row? Only their own campus, GLOBAL/NULL rows, global-visibility
-- rows, or rows they own.
CREATE OR REPLACE FUNCTION public.scoped_priv_blocked_read(p_campus text, p_owner uuid, p_global boolean)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT NOT COALESCE(p_owner = auth.uid(), false)
     AND NOT COALESCE(p_global, false)
     AND NOT (p_campus IS NULL OR p_campus = 'GLOBAL')
     AND p_campus IS DISTINCT FROM public.auth_profile_campus();
$$;
REVOKE ALL ON FUNCTION public.scoped_priv_blocked_read(text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scoped_priv_blocked_read(text, uuid, boolean) TO authenticated, service_role;

-- Folder owner of a storage object name ("<uuid>/file"), NULL when the first segment is not a uuid.
CREATE OR REPLACE FUNCTION public.storage_owner_campus(p_name text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid;
BEGIN
  BEGIN
    v_uid := NULLIF(split_part(p_name, '/', 1), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  RETURN (SELECT p.campus_code FROM public.profiles p WHERE p.id = v_uid);
END;
$$;
REVOKE ALL ON FUNCTION public.storage_owner_campus(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_owner_campus(text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Campus-owned tables: restrictive read / insert / update / delete
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  t           text;
  v_owner     text;
  v_global    text;
  v_cols      text[];
  v_read_only text[] := ARRAY['analytics_events', 'moderation_queue'];  -- members file these themselves; no insert rule
  c           text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'analytics_events', 'announcements', 'events', 'forum_communities', 'giving_campaigns', 'jobs',
    'marketplace_listings', 'moderation_queue', 'portal_links', 'posts', 'study_groups'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    SELECT array_agg(column_name::text) INTO v_cols
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t;
    IF NOT ('campus_code' = ANY (v_cols)) THEN CONTINUE; END IF;

    v_owner := 'NULL::uuid';
    FOREACH c IN ARRAY ARRAY['author_id', 'creator_id', 'seller_id', 'poster_id', 'uploader_id', 'user_id'] LOOP
      IF c = ANY (v_cols) THEN v_owner := quote_ident(c); EXIT; END IF;
    END LOOP;
    v_global := CASE WHEN 'visibility_scope' = ANY (v_cols) THEN '(visibility_scope = ''global'')' ELSE 'false' END;

    EXECUTE format('DROP POLICY IF EXISTS scope_privileged_select ON public.%I', t);
    EXECUTE format($f$CREATE POLICY scope_privileged_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated
      USING ((SELECT NOT public.is_scoped_privileged()) OR NOT public.scoped_priv_blocked_read(campus_code, %s, %s))$f$,
      t, v_owner, v_global);

    EXECUTE format('DROP POLICY IF EXISTS scope_privileged_update ON public.%I', t);
    EXECUTE format($f$CREATE POLICY scope_privileged_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
      USING ((SELECT NOT public.is_scoped_privileged()) OR COALESCE(%s = auth.uid(), false) OR campus_code = (SELECT public.auth_profile_campus()))
      WITH CHECK ((SELECT NOT public.is_scoped_privileged()) OR COALESCE(%s = auth.uid(), false) OR campus_code = (SELECT public.auth_profile_campus()))$f$,
      t, v_owner, v_owner);

    EXECUTE format('DROP POLICY IF EXISTS scope_privileged_delete ON public.%I', t);
    EXECUTE format($f$CREATE POLICY scope_privileged_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
      USING ((SELECT NOT public.is_scoped_privileged()) OR COALESCE(%s = auth.uid(), false) OR campus_code = (SELECT public.auth_profile_campus()))$f$,
      t, v_owner);

    EXECUTE format('DROP POLICY IF EXISTS scope_privileged_insert ON public.%I', t);
    IF NOT (t = ANY (v_read_only)) THEN
      EXECUTE format($f$CREATE POLICY scope_privileged_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK ((SELECT NOT public.is_scoped_privileged()) OR campus_code = (SELECT public.auth_profile_campus()))$f$, t);
    END IF;
  END LOOP;
END
$do$;

-- ----------------------------------------------------------------------------
-- 3. Child tables follow their parent row (the parent's own RLS decides what the caller can see)
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  r record;
  v_cols text[];
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('post_comments',              'posts',             'post_id',      'author_id'),
      ('event_attendees',            'events',            'event_id',     'user_id'),
      ('event_waitlist',             'events',            'event_id',     'user_id'),
      ('study_group_members',        'study_groups',      'group_id',     'user_id'),
      ('study_group_posts',          'study_groups',      'group_id',     'author_id'),
      ('study_group_sessions',       'study_groups',      'group_id',     'created_by'),
      ('job_applications',           'jobs',              'job_id',       'applicant_id'),
      ('job_questions',              'jobs',              'job_id',       NULL),
      ('forum_community_moderators', 'forum_communities', 'community_id', 'user_id'),
      ('forum_community_members',    'forum_communities', 'community_id', 'user_id')
    ) AS x(child, parent, fk, owner)
  LOOP
    IF to_regclass('public.' || r.child) IS NULL OR to_regclass('public.' || r.parent) IS NULL THEN CONTINUE; END IF;
    SELECT array_agg(column_name::text) INTO v_cols FROM information_schema.columns WHERE table_schema = 'public' AND table_name = r.child;
    IF NOT (r.fk = ANY (v_cols)) THEN CONTINUE; END IF;

    EXECUTE format('DROP POLICY IF EXISTS scope_privileged_child ON public.%I', r.child);
    EXECUTE format($f$CREATE POLICY scope_privileged_child ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
      USING ((SELECT NOT public.is_scoped_privileged())
             %s
             OR EXISTS (SELECT 1 FROM public.%I par WHERE par.id = %I.%I))
      WITH CHECK ((SELECT NOT public.is_scoped_privileged())
             %s
             OR EXISTS (SELECT 1 FROM public.%I par WHERE par.id = %I.%I))$f$,
      r.child,
      CASE WHEN r.owner IS NOT NULL AND r.owner = ANY (v_cols) THEN format('OR %I = auth.uid()', r.owner) ELSE '' END,
      r.parent, r.child, r.fk,
      CASE WHEN r.owner IS NOT NULL AND r.owner = ANY (v_cols) THEN format('OR %I = auth.uid()', r.owner) ELSE '' END,
      r.parent, r.child, r.fk);
  END LOOP;
END
$do$;

-- ----------------------------------------------------------------------------
-- 4. Member-keyed tables: scoped by the MEMBER's campus
-- ----------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.support_tickets') IS NOT NULL THEN
    DROP POLICY IF EXISTS scope_privileged_member ON public.support_tickets;
    CREATE POLICY scope_privileged_member ON public.support_tickets AS RESTRICTIVE FOR ALL TO authenticated
      USING ((SELECT NOT public.is_scoped_privileged()) OR user_id = auth.uid() OR public.can_admin_campus(public.campus_of(user_id)))
      WITH CHECK ((SELECT NOT public.is_scoped_privileged()) OR user_id = auth.uid() OR public.can_admin_campus(public.campus_of(user_id)));
  END IF;
  IF to_regclass('public.mentorships') IS NOT NULL THEN
    DROP POLICY IF EXISTS scope_privileged_member ON public.mentorships;
    CREATE POLICY scope_privileged_member ON public.mentorships AS RESTRICTIVE FOR ALL TO authenticated
      USING ((SELECT NOT public.is_scoped_privileged()) OR student_id = auth.uid() OR mentor_id = auth.uid() OR public.can_admin_campus(public.campus_of(student_id)))
      WITH CHECK ((SELECT NOT public.is_scoped_privileged()) OR student_id = auth.uid() OR mentor_id = auth.uid() OR public.can_admin_campus(public.campus_of(student_id)));
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 5. Platform data: Super Admin only (owners keep their own rows)
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  r record;
  v_cols text[];
  v_owner text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('push_tokens', 'user_id'), ('client_errors', 'user_id'), ('consent_records', 'user_id'),
      ('waitlist_entries', NULL), ('user_blocks', 'blocker_id'), ('event_partnerships', NULL)
    ) AS x(tbl, owner)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN CONTINUE; END IF;
    SELECT array_agg(column_name::text) INTO v_cols FROM information_schema.columns WHERE table_schema = 'public' AND table_name = r.tbl;
    v_owner := CASE WHEN r.owner IS NOT NULL AND r.owner = ANY (v_cols) THEN format(' OR %I = auth.uid()', r.owner) ELSE '' END;
    EXECUTE format('DROP POLICY IF EXISTS scope_super_only ON public.%I', r.tbl);
    EXECUTE format($f$CREATE POLICY scope_super_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
      USING ((SELECT NOT public.is_scoped_privileged())%s) WITH CHECK ((SELECT NOT public.is_scoped_privileged())%s)$f$,
      r.tbl, v_owner, v_owner);
  END LOOP;
END
$do$;

-- ----------------------------------------------------------------------------
-- 6. Role Permissions that were decorative (only keys whose seeded default matches shipped behaviour)
-- ----------------------------------------------------------------------------
DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('posts', 'can_post_forum'), ('post_comments', 'can_comment_forum'),
      ('marketplace_listings', 'can_list_marketplace'), ('chat_messages', 'can_send_messages')
    ) AS x(tbl, perm)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS role_permission_insert ON public.%I', r.tbl);
    EXECUTE format($f$CREATE POLICY role_permission_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (public.has_role_permission(%L))$f$, r.tbl, r.perm);
  END LOOP;
END
$do$;

-- ----------------------------------------------------------------------------
-- 7. Storage: verification documents, resumes, avatars, uploads, campus-media
-- ----------------------------------------------------------------------------
-- Does the object belong to somebody the caller may administer?
CREATE OR REPLACE FUNCTION public.can_admin_object_owner(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.can_admin_campus(public.storage_owner_campus(p_name)); $$;
REVOKE ALL ON FUNCTION public.can_admin_object_owner(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_admin_object_owner(text) TO authenticated, service_role;

-- Does a stored media reference (bare path or legacy public URL) point at this object?
CREATE OR REPLACE FUNCTION public.media_ref_matches(p_ref text, p_name text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_ref IS NOT NULL AND p_name IS NOT NULL AND (
    p_ref = p_name OR right(split_part(p_ref, '?', 1), length(p_name) + 1) = '/' || p_name
  );
$$;

-- May the caller read a campus-media object?
--   own upload > Super Admin > admin of the uploader's campus > uploader is a member of the reader's
--   (wall-verified) campus or of GLOBAL > the object is attached to content the reader may see
--   (global-visibility post/event, GLOBAL listing, approved campaign, a chat they belong to).
CREATE OR REPLACE FUNCTION public.can_read_media_object(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_owner  text;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF split_part(p_name, '/', 1) = v_uid::text THEN RETURN true; END IF;
  IF public.auth_is_super_admin() THEN RETURN true; END IF;

  v_owner := public.storage_owner_campus(p_name);
  IF v_owner IS NOT NULL THEN
    IF public.can_admin_campus(v_owner) THEN RETURN true; END IF;
    IF v_owner = 'GLOBAL' THEN RETURN true; END IF;
    IF v_owner = public.auth_campus_access() THEN RETURN true; END IF;
  END IF;

  -- Cross-campus references the reader is legitimately allowed to see.
  IF EXISTS (SELECT 1 FROM public.posts p
             WHERE (p.visibility_scope = 'global' OR p.campus_code IS NULL OR p.campus_code = 'GLOBAL')
               AND (p.status IS NULL OR p.status::text = 'published')
               AND (public.media_ref_matches(p.image_url, p_name) OR public.media_ref_matches(p.video_url, p_name)
                    OR EXISTS (SELECT 1 FROM unnest(COALESCE(p.image_urls, ARRAY[]::text[])) u WHERE public.media_ref_matches(u, p_name)))) THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.events e
             WHERE (e.visibility_scope = 'global' OR e.campus_code IS NULL OR e.campus_code = 'GLOBAL')
               AND public.media_ref_matches(e.banner_url, p_name)) THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.marketplace_listings m
             WHERE (m.campus_code IS NULL OR m.campus_code = 'GLOBAL')
               AND (public.media_ref_matches(m.image_url, p_name) OR public.media_ref_matches(m.image_path, p_name)
                    OR EXISTS (SELECT 1 FROM unnest(COALESCE(m.image_paths, ARRAY[]::text[])) u WHERE public.media_ref_matches(u, p_name)))) THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.giving_campaigns g WHERE public.media_ref_matches(g.cover_image_url, p_name)) THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.chat_messages cm
             JOIN public.chat_channel_members mem ON mem.channel_id = cm.channel_id
             WHERE mem.user_id = v_uid AND public.media_ref_matches(cm.media_url, p_name)) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.can_read_media_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_media_object(text) TO authenticated, service_role;

DO $do$
BEGIN
  -- campus-media: no longer "any verified member of any campus"
  DROP POLICY IF EXISTS "Campus media viewable by verified members" ON storage.objects;
  DROP POLICY IF EXISTS "Campus media viewable by entitled members" ON storage.objects;
  CREATE POLICY "Campus media viewable by entitled members" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'campus-media' AND public.can_read_media_object(name));

  -- verification documents: owner, Super Admin, or the admin of the OWNER's campus (was: any admin)
  DROP POLICY IF EXISTS "Verifications viewable only by owner and admins" ON storage.objects;
  DROP POLICY IF EXISTS "Verifications viewable by campus staff" ON storage.objects;
  DROP POLICY IF EXISTS "Verification documents viewable by owner and campus reviewers" ON storage.objects;
  CREATE POLICY "Verification documents viewable by owner and campus reviewers" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'verifications'
      AND ((storage.foldername(name))[1] = auth.uid()::text OR public.auth_is_super_admin() OR public.can_admin_object_owner(name))
    );
  DROP POLICY IF EXISTS "Users and admins can update their verification documents" ON storage.objects;
  CREATE POLICY "Users and admins can update their verification documents" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'verifications' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.auth_is_super_admin()));
  DROP POLICY IF EXISTS "Users and admins can delete their verification documents" ON storage.objects;
  CREATE POLICY "Users and admins can delete their verification documents" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'verifications' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.auth_is_super_admin()));

  -- resumes: owner, the job poster, Super Admin, admin of the applicant's campus
  DROP POLICY IF EXISTS "Resumes viewable by owner, the job poster, and admins" ON storage.objects;
  CREATE POLICY "Resumes viewable by owner, the job poster, and admins" ON storage.objects
    FOR SELECT TO authenticated USING (
      bucket_id = 'resumes' AND (
        auth.uid()::text = (storage.foldername(name))[1]
        OR public.auth_is_super_admin()
        OR public.can_admin_object_owner(name)
        OR EXISTS (
          SELECT 1 FROM public.job_applications ja JOIN public.jobs j ON j.id = ja.job_id
          WHERE ja.resume_url = name AND j.poster_id = auth.uid())
      ));
  DROP POLICY IF EXISTS "Users and admins can update their resume" ON storage.objects;
  CREATE POLICY "Users and admins can update their resume" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'resumes' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.auth_is_super_admin()));
  DROP POLICY IF EXISTS "Users and admins can delete their resume" ON storage.objects;
  CREATE POLICY "Users and admins can delete their resume" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'resumes' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.auth_is_super_admin()));

  -- avatars / resources / campus-media writes: own folder (not suspended), Super Admin, or the owner's campus admin
  DROP POLICY IF EXISTS "Authenticated users can upload public storage objects" ON storage.objects;
  CREATE POLICY "Authenticated users can upload public storage objects" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id IN ('resources', 'avatars', 'campus-media')
      AND (public.auth_is_super_admin() OR ((storage.foldername(name))[1] = auth.uid()::text AND NOT public.auth_is_suspended()))
    );
  DROP POLICY IF EXISTS "Users and admins can update public storage objects" ON storage.objects;
  CREATE POLICY "Users and admins can update public storage objects" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id IN ('resources', 'avatars', 'campus-media')
           AND ((storage.foldername(name))[1] = auth.uid()::text OR public.auth_is_super_admin() OR public.can_admin_object_owner(name)))
    WITH CHECK (bucket_id IN ('resources', 'avatars', 'campus-media')
           AND (public.auth_is_super_admin() OR ((storage.foldername(name))[1] = auth.uid()::text AND NOT public.auth_is_suspended())));
  DROP POLICY IF EXISTS "Users and admins can delete public storage objects" ON storage.objects;
  CREATE POLICY "Users and admins can delete public storage objects" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id IN ('resources', 'avatars', 'campus-media')
           AND ((storage.foldername(name))[1] = auth.uid()::text OR public.auth_is_super_admin() OR public.can_admin_object_owner(name)));
  DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
  CREATE POLICY "Authenticated users can upload avatars" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND (public.auth_is_super_admin() OR (storage.foldername(name))[1] = auth.uid()::text));
  DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
  CREATE POLICY "Users can update own avatars" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'avatars' AND (public.auth_is_super_admin() OR (storage.foldername(name))[1] = auth.uid()::text OR public.can_admin_object_owner(name)));
  DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;
  CREATE POLICY "Users can delete own avatars" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'avatars' AND (public.auth_is_super_admin() OR (storage.foldername(name))[1] = auth.uid()::text OR public.can_admin_object_owner(name)));
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Not owner of storage.objects: storage policies NOT changed. Re-run this section as the postgres/owner role.';
END
$do$;

-- ============================================================================
-- "People you may know" stays on the caller's campus (plus GLOBAL members) and only suggests students and
-- alumni. It used to pick random profiles from EVERY campus, including staff and admins, so a student was
-- shown (and could send requests to) strangers from other universities.
-- ============================================================================
DO $sugg$
BEGIN
  IF to_regclass('public.connections') IS NOT NULL AND to_regclass('public.user_mutes') IS NOT NULL
     AND to_regprocedure('public.users_have_block(uuid,uuid)') IS NOT NULL THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.get_suggested_connections(p_limit INT DEFAULT 10)
      RETURNS TABLE (id UUID, full_name TEXT, role TEXT, department TEXT, level TEXT, avatar_url TEXT)
      LANGUAGE sql SECURITY DEFINER STABLE
      SET search_path = public
      AS $body$
        SELECT p.id, p.full_name, p.role::text, p.department, p.level, p.avatar_url
        FROM profiles p
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
      $body$
    $f$;
    REVOKE ALL ON FUNCTION public.get_suggested_connections(INT) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_suggested_connections(INT) TO authenticated, service_role;
  END IF;
END
$sugg$;

-- ============================================================================
-- Authors of GLOBAL content keep their name and avatar for students on other campuses.
-- Since profiles became campus-scoped, a UNILAG student reading a global post written at UI saw
-- "Campus Student" with no picture or verified badge (the author row was invisible to them). Only members who
-- have actually published to the global audience (or commented on such a post) become readable, only through the
-- columns already granted to students (no e-mail, student id, push token...), and not to campus admins/staff,
-- whose reach stays campus-bound.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_global_content_author(p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.posts p
           WHERE p.author_id = p_uid
             AND p.status = 'published'
             AND (p.visibility_scope = 'global' OR p.campus_code = 'GLOBAL')
         )
      OR EXISTS (
           SELECT 1 FROM public.post_comments c
           JOIN public.posts p ON p.id = c.post_id
           WHERE c.author_id = p_uid
             AND p.status = 'published'
             AND (p.visibility_scope = 'global' OR p.campus_code = 'GLOBAL')
         );
$$;
REVOKE ALL ON FUNCTION public.is_global_content_author(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_global_content_author(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members read authors of global content" ON public.profiles;
CREATE POLICY "Members read authors of global content" ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT NOT public.is_scoped_privileged()) AND public.is_global_content_author(id));

NOTIFY pgrst, 'reload schema';

COMMIT;
