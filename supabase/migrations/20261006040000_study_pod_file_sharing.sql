-- ============================================================================
-- LIORIS - STUDY POD FILE SHARING
-- ============================================================================
-- Gap: a pod "resource" post (study_group_posts, added in 20260925110000_study_pods_v2.sql)
-- could only carry a link_url, and that column has a CHECK requiring it to
-- start with https:// - so a member who wants to attach a real file (not a
-- pasted Drive/Dropbox link) has nowhere to put it: the private `resources`
-- bucket's uploadMediaFile() returns a bare storage PATH (signed on read, see
-- src/api/signedUrls.ts), which the link_url CHECK would reject outright.
--
-- This adds a dedicated `file_path` column (a storage path, never a URL - the
-- client resolves it to a short-lived signed URL when rendering, exactly like
-- any other `resources` bucket consumer) and threads it through
-- post_to_study_group / list_study_group_posts. A resource post now needs a
-- link OR a file (or both); discussion/question/announcement posts are
-- unaffected.
--
-- No storage policy change: "Authenticated users can upload public storage
-- objects" (storage.objects, see supabase_security_hardening_2026.sql) already
-- lets any non-suspended authenticated user upload to `resources/<their uid>/...`
-- with no pod-membership check - the same policy chat attachments already rely
-- on (ChatThread.tsx uploads to the same bucket the same way). Pod membership
-- is still enforced at the application layer by post_to_study_group() itself.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

DO $do$
BEGIN
  IF to_regclass('public.study_group_posts') IS NULL
     OR to_regprocedure('public.is_pod_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Dependency missing: apply 20260925110000_study_pods_v2.sql first.';
  END IF;
END
$do$;

ALTER TABLE public.study_group_posts
  ADD COLUMN IF NOT EXISTS file_path text;

ALTER TABLE public.study_group_posts DROP CONSTRAINT IF EXISTS study_group_posts_file_path_chk;
ALTER TABLE public.study_group_posts ADD CONSTRAINT study_group_posts_file_path_chk
  CHECK (file_path IS NULL OR char_length(file_path) <= 500);

-- Adding the file_path output column changes the OUT-parameter list of this
-- RETURNS TABLE function, which CREATE OR REPLACE cannot do - drop it first.
DROP FUNCTION IF EXISTS public.list_study_group_posts(uuid, uuid, integer, timestamptz);
CREATE OR REPLACE FUNCTION public.list_study_group_posts(
  p_group uuid, p_parent uuid DEFAULT NULL, p_limit integer DEFAULT 30, p_before timestamptz DEFAULT NULL
) RETURNS TABLE (
  id uuid, group_id uuid, author_id uuid, author_name text, author_avatar text, author_pod_role text,
  parent_id uuid, kind text, title text, body text, link_url text, file_path text, is_pinned boolean,
  is_resolved boolean, reply_count integer, created_at timestamptz, edited_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (public.is_pod_member(p_group) OR COALESCE(public.auth_profile_role() IN ('admin', 'staff'), false)) THEN
    RETURN;
  END IF;
  IF p_parent IS NULL THEN
    RETURN QUERY
    SELECT p.id, p.group_id, p.author_id, pr.full_name, pr.avatar_url, m.role, p.parent_id, p.kind, p.title, p.body,
           p.link_url, p.file_path, p.is_pinned, p.is_resolved, p.reply_count, p.created_at, p.edited_at
    FROM public.study_group_posts p
    JOIN public.profiles pr ON pr.id = p.author_id
    LEFT JOIN public.study_group_members m ON m.group_id = p.group_id AND m.user_id = p.author_id AND m.status = 'active'
    WHERE p.group_id = p_group AND p.parent_id IS NULL AND (p_before IS NULL OR p.created_at < p_before)
    ORDER BY (p.is_pinned AND p_before IS NULL) DESC, p.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 30), 100));
  ELSE
    RETURN QUERY
    SELECT p.id, p.group_id, p.author_id, pr.full_name, pr.avatar_url, m.role, p.parent_id, p.kind, p.title, p.body,
           p.link_url, p.file_path, p.is_pinned, p.is_resolved, p.reply_count, p.created_at, p.edited_at
    FROM public.study_group_posts p
    JOIN public.profiles pr ON pr.id = p.author_id
    LEFT JOIN public.study_group_members m ON m.group_id = p.group_id AND m.user_id = p.author_id AND m.status = 'active'
    WHERE p.group_id = p_group AND p.parent_id = p_parent
    ORDER BY p.created_at ASC
    LIMIT 200;
  END IF;
END $$;

-- Adding p_file_path is a new overload as far as Postgres is concerned (the
-- argument list, not just its defaults, is part of a function's identity) -
-- without this DROP, the old 6-arg function stays callable side by side with
-- the new one, and a caller passing fewer than 7 arguments becomes ambiguous
-- ("function ... is not unique").
DROP FUNCTION IF EXISTS public.post_to_study_group(uuid, text, text, text, text, uuid);
CREATE OR REPLACE FUNCTION public.post_to_study_group(
  p_group uuid, p_body text, p_kind text DEFAULT 'discussion', p_title text DEFAULT NULL,
  p_link text DEFAULT NULL, p_parent uuid DEFAULT NULL, p_file_path text DEFAULT NULL
) RETURNS public.study_group_posts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_me public.profiles%ROWTYPE;
  v_row public.study_group_posts;
  v_body text := btrim(COALESCE(p_body, ''));
  v_title text := NULLIF(btrim(COALESCE(p_title, '')), '');
  v_link text := NULLIF(btrim(COALESCE(p_link, '')), '');
  v_file_path text := NULLIF(btrim(COALESCE(p_file_path, '')), '');
  v_name text;
  v_parent public.study_group_posts;
  r record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;
  IF COALESCE(v_me.is_suspended, false) THEN RAISE EXCEPTION 'account_suspended'; END IF;
  IF NOT public.is_pod_member(p_group) THEN RAISE EXCEPTION 'not_allowed: join the pod to take part'; END IF;
  IF char_length(v_body) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'invalid_input: write between 1 and 4000 characters'; END IF;
  IF v_link IS NOT NULL AND (v_link !~* '^https?://' OR char_length(v_link) > 1000) THEN RAISE EXCEPTION 'invalid_input: the link must start with https://'; END IF;
  IF v_file_path IS NOT NULL AND char_length(v_file_path) > 500 THEN RAISE EXCEPTION 'invalid_input: the attached file reference is too long'; END IF;
  IF (SELECT count(*) FROM public.study_group_posts WHERE group_id = p_group AND author_id = v_uid AND created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'rate_limited: slow down a little';
  END IF;

  IF p_parent IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.study_group_posts WHERE id = p_parent AND group_id = p_group;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
    IF v_parent.parent_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_input: replies cannot be nested'; END IF;
    INSERT INTO public.study_group_posts (group_id, author_id, parent_id, kind, body, link_url)
    VALUES (p_group, v_uid, p_parent, 'discussion', v_body, v_link) RETURNING * INTO v_row;
    IF v_parent.author_id <> v_uid THEN
      SELECT name INTO v_name FROM public.study_groups WHERE id = p_group;
      PERFORM public.pod_notify(v_parent.author_id, v_uid, 'New reply in your pod',
        format('%s replied to your post in "%s".', COALESCE(v_me.full_name, 'Someone'), COALESCE(v_name, 'a study pod')), p_group);
    END IF;
    RETURN v_row;
  END IF;

  IF p_kind NOT IN ('discussion', 'question', 'announcement', 'resource') THEN RAISE EXCEPTION 'invalid_input: unknown post type'; END IF;
  IF p_kind = 'announcement' AND NOT public.can_moderate_pod(p_group) THEN RAISE EXCEPTION 'not_allowed: only the owner or a moderator can post announcements'; END IF;
  IF p_kind IN ('question', 'announcement', 'resource') AND v_title IS NULL THEN RAISE EXCEPTION 'invalid_input: add a short title'; END IF;
  IF p_kind = 'resource' AND v_link IS NULL AND v_file_path IS NULL THEN RAISE EXCEPTION 'invalid_input: add the link you are sharing, or attach a file'; END IF;
  IF v_title IS NOT NULL AND char_length(v_title) NOT BETWEEN 3 AND 140 THEN RAISE EXCEPTION 'invalid_input: the title needs 3 to 140 characters'; END IF;

  INSERT INTO public.study_group_posts (group_id, author_id, kind, title, body, link_url, file_path)
  VALUES (p_group, v_uid, p_kind, v_title, v_body, v_link, v_file_path) RETURNING * INTO v_row;

  IF p_kind = 'announcement' THEN
    SELECT name INTO v_name FROM public.study_groups WHERE id = p_group;
    FOR r IN SELECT user_id FROM public.study_group_members WHERE group_id = p_group AND status = 'active' AND user_id <> v_uid LOOP
      PERFORM public.pod_notify(r.user_id, v_uid, format('Announcement in %s', COALESCE(v_name, 'your pod')), COALESCE(v_title, left(v_body, 120)), p_group);
    END LOOP;
  END IF;
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION
  public.list_study_group_posts(uuid, uuid, integer, timestamptz),
  public.post_to_study_group(uuid, text, text, text, text, uuid, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.list_study_group_posts(uuid, uuid, integer, timestamptz),
  public.post_to_study_group(uuid, text, text, text, text, uuid, text)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
