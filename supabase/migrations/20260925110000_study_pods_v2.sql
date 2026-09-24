-- Study pods v2: a pod becomes a small workspace, not just a name with a Join button.
--
-- Before: study_groups + study_group_members only. "Discussion" sent people to the general forum, so
-- opening a pod showed nothing pod-specific; the member list was readable by everybody (including
-- private pods) and anyone could insert themselves as a member with no capacity or approval check.
--
-- Now a pod has roles (owner / moderator / member), join requests for private pods, its own discussion
-- (questions, announcements, resources, replies), scheduled study sessions with RSVPs and unread counts.
-- Pods are discovered through list_study_groups() (campus wall + private details hidden from non-members);
-- everything that changes state goes through a SECURITY DEFINER function.

-- =====================================================================================================
-- 0. campus-scope dependency
-- =====================================================================================================
-- Study-pod discovery is campus-scoped. Some production databases received
-- these helpers through the earlier manual campus-access rollout, but that
-- file is not part of the Supabase CLI migration chain. Define the dependency
-- here as well so this migration works on a clean schema and on environments
-- where the manual rollout was never applied.
CREATE OR REPLACE FUNCTION public.campus_wall_enabled()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT (value->>'enabled')::boolean
     FROM public.platform_settings
     WHERE key = 'campus_wall'),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_campus_access()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN NOT public.campus_wall_enabled() THEN p.campus_code
    WHEN p.role IN ('admin', 'staff') THEN p.campus_code
    WHEN p.verification_status = 'verified' THEN p.campus_code
    ELSE NULL
  END
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.campus_wall_enabled() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_campus_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campus_wall_enabled() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.auth_campus_access() TO authenticated, anon, service_role;

-- =====================================================================================================
-- 1. columns
-- =====================================================================================================
ALTER TABLE public.study_groups
  ADD COLUMN IF NOT EXISTS level            text,
  ADD COLUMN IF NOT EXISTS department       text,
  ADD COLUMN IF NOT EXISTS topics           text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS schedule_note    text,
  ADD COLUMN IF NOT EXISTS goal             text,
  ADD COLUMN IF NOT EXISTS is_archived      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.study_groups DROP CONSTRAINT IF EXISTS study_groups_limits_chk;
ALTER TABLE public.study_groups ADD CONSTRAINT study_groups_limits_chk CHECK (
  char_length(btrim(name)) BETWEEN 3 AND 80
  AND (course_code IS NULL OR char_length(course_code) <= 24)
  AND (description IS NULL OR char_length(description) <= 600)
  AND (level IS NULL OR char_length(level) <= 24)
  AND (department IS NULL OR char_length(department) <= 80)
  AND (schedule_note IS NULL OR char_length(schedule_note) <= 120)
  AND (goal IS NULL OR char_length(goal) <= 300)
  AND cardinality(topics) <= 8
  AND (max_members IS NULL OR max_members BETWEEN 2 AND 300)
) NOT VALID;

ALTER TABLE public.study_group_members
  ADD COLUMN IF NOT EXISTS role              text NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_read_at      timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS requested_message text;

ALTER TABLE public.study_group_members DROP CONSTRAINT IF EXISTS study_group_members_role_chk;
ALTER TABLE public.study_group_members ADD CONSTRAINT study_group_members_role_chk CHECK (role IN ('owner', 'moderator', 'member'));
ALTER TABLE public.study_group_members DROP CONSTRAINT IF EXISTS study_group_members_status_chk;
ALTER TABLE public.study_group_members ADD CONSTRAINT study_group_members_status_chk CHECK (status IN ('active', 'pending', 'banned'));
ALTER TABLE public.study_group_members DROP CONSTRAINT IF EXISTS study_group_members_msg_chk;
ALTER TABLE public.study_group_members ADD CONSTRAINT study_group_members_msg_chk CHECK (requested_message IS NULL OR char_length(requested_message) <= 300);

-- Creators are owners (and always members).
INSERT INTO public.study_group_members (group_id, user_id, role, status)
SELECT g.id, g.creator_id, 'owner', 'active' FROM public.study_groups g
ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'owner', status = 'active';

CREATE INDEX IF NOT EXISTS idx_sgm_group_status ON public.study_group_members (group_id, status);
CREATE INDEX IF NOT EXISTS idx_sgm_user ON public.study_group_members (user_id);
-- One owner per pod.
CREATE UNIQUE INDEX IF NOT EXISTS study_group_one_owner ON public.study_group_members (group_id) WHERE role = 'owner';

-- =====================================================================================================
-- 2. new tables
-- =====================================================================================================
CREATE TABLE IF NOT EXISTS public.study_group_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES public.study_group_posts(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'discussion' CHECK (kind IN ('discussion', 'question', 'announcement', 'resource')),
  title       text CHECK (title IS NULL OR char_length(btrim(title)) BETWEEN 3 AND 140),
  body        text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  link_url    text CHECK (link_url IS NULL OR (link_url ~* '^https?://' AND char_length(link_url) <= 1000)),
  is_pinned   boolean NOT NULL DEFAULT false,
  is_resolved boolean NOT NULL DEFAULT false,
  reply_count integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  edited_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_sgp_group ON public.study_group_posts (group_id, created_at DESC) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_sgp_parent ON public.study_group_posts (parent_id, created_at);

CREATE TABLE IF NOT EXISTS public.study_group_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  created_by       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title            text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  scheduled_at     timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 15 AND 480),
  mode             text NOT NULL DEFAULT 'online' CHECK (mode IN ('online', 'in_person')),
  location         text CHECK (location IS NULL OR char_length(location) <= 300),
  agenda           text CHECK (agenda IS NULL OR char_length(agenda) <= 600),
  status           text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'done')),
  reminder_sent_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sgs_group ON public.study_group_sessions (group_id, scheduled_at);

CREATE TABLE IF NOT EXISTS public.study_group_session_rsvps (
  session_id uuid NOT NULL REFERENCES public.study_group_sessions(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

-- Keep reply_count and the pod's last_activity_at in step with posts.
CREATE OR REPLACE FUNCTION public.study_group_posts_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_id IS NOT NULL THEN
      UPDATE public.study_group_posts SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
    END IF;
    UPDATE public.study_groups SET last_activity_at = now() WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.parent_id IS NOT NULL THEN
      UPDATE public.study_group_posts SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.parent_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_sgp_after_write ON public.study_group_posts;
CREATE TRIGGER trg_sgp_after_write AFTER INSERT OR DELETE ON public.study_group_posts
  FOR EACH ROW EXECUTE FUNCTION public.study_group_posts_after_write();

-- =====================================================================================================
-- 3. helpers + RLS
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.is_pod_member(p_group uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.study_group_members m
                 WHERE m.group_id = p_group AND m.user_id = auth.uid() AND m.status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.pod_role(p_group uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.role FROM public.study_group_members m
  WHERE m.group_id = p_group AND m.user_id = auth.uid() AND m.status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.can_moderate_pod(p_group uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.pod_role(p_group) IN ('owner', 'moderator'), false)
         OR COALESCE(public.auth_profile_role() = 'admin', false);
$$;

CREATE OR REPLACE FUNCTION public.pod_notify(p_recipient uuid, p_sender uuid, p_title text, p_body text, p_group uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_recipient IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
  VALUES (p_recipient, p_sender, left(p_title, 140), left(p_body, 400), 'system', '/study-groups/' || p_group::text, false);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pod_notify failed: %', SQLERRM;
END $$;
REVOKE ALL ON FUNCTION public.pod_notify(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.study_group_posts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_group_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_group_session_rsvps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.study_group_posts, public.study_group_sessions, public.study_group_session_rsvps FROM anon;

-- study_groups: only members see a pod row directly; everyone else discovers pods via list_study_groups().
DROP POLICY IF EXISTS "Study groups viewable by campus or global" ON public.study_groups;
DROP POLICY IF EXISTS "Users can create study groups" ON public.study_groups;
DROP POLICY IF EXISTS "Creators, admins and staff can update study groups" ON public.study_groups;
DROP POLICY IF EXISTS "study_groups_select_members" ON public.study_groups;
CREATE POLICY "study_groups_select_members" ON public.study_groups FOR SELECT TO authenticated
  USING (public.is_pod_member(id) OR creator_id = auth.uid() OR public.auth_profile_role() IN ('admin', 'staff'));
DROP POLICY IF EXISTS "study_groups_admin_write" ON public.study_groups;
CREATE POLICY "study_groups_admin_write" ON public.study_groups FOR ALL TO authenticated
  USING (public.auth_profile_role() = 'admin') WITH CHECK (public.auth_profile_role() = 'admin');

-- study_group_members: readable by fellow members (and staff/admin); written only by the functions below.
DROP POLICY IF EXISTS "Study group members viewable by authenticated users" ON public.study_group_members;
DROP POLICY IF EXISTS "Users can join study groups" ON public.study_group_members;
DROP POLICY IF EXISTS "Users can leave study groups" ON public.study_group_members;
DROP POLICY IF EXISTS "sgm_select" ON public.study_group_members;
CREATE POLICY "sgm_select" ON public.study_group_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_pod_member(group_id) OR public.auth_profile_role() IN ('admin', 'staff'));
DROP POLICY IF EXISTS "sgm_admin_write" ON public.study_group_members;
CREATE POLICY "sgm_admin_write" ON public.study_group_members FOR ALL TO authenticated
  USING (public.auth_profile_role() = 'admin') WITH CHECK (public.auth_profile_role() = 'admin');

DROP POLICY IF EXISTS "sgp_select" ON public.study_group_posts;
CREATE POLICY "sgp_select" ON public.study_group_posts FOR SELECT TO authenticated
  USING (public.is_pod_member(group_id) OR public.auth_profile_role() IN ('admin', 'staff'));
DROP POLICY IF EXISTS "sgp_delete" ON public.study_group_posts;
CREATE POLICY "sgp_delete" ON public.study_group_posts FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.can_moderate_pod(group_id));

DROP POLICY IF EXISTS "sgs_select" ON public.study_group_sessions;
CREATE POLICY "sgs_select" ON public.study_group_sessions FOR SELECT TO authenticated
  USING (public.is_pod_member(group_id) OR public.auth_profile_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS "sgr_select" ON public.study_group_session_rsvps;
CREATE POLICY "sgr_select" ON public.study_group_session_rsvps FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.study_group_posts, public.study_group_sessions, public.study_group_session_rsvps TO authenticated;
GRANT DELETE ON public.study_group_posts TO authenticated;

-- =====================================================================================================
-- 4. discovery / reading
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.list_study_groups(
  p_campus text DEFAULT NULL, p_q text DEFAULT NULL, p_id uuid DEFAULT NULL, p_mine_only boolean DEFAULT false
) RETURNS TABLE (
  id uuid, name text, course_code text, description text, is_private boolean, campus_code text,
  level text, department text, topics text[], schedule_note text, goal text, meeting_link text,
  max_members integer, member_count integer, pending_count integer,
  creator_id uuid, creator_name text, my_status text, my_role text, unread_count integer,
  next_session_at timestamptz, last_activity_at timestamptz, created_at timestamptz, is_archived boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH viewer AS (
    SELECT auth.uid() AS uid,
           public.auth_campus_access() AS campus,
           public.auth_profile_role() IN ('admin', 'staff') AS privileged
  )
  SELECT
    g.id, g.name, g.course_code, g.description, g.is_private, g.campus_code,
    g.level, g.department, g.topics, g.schedule_note, g.goal,
    CASE WHEN m.status = 'active' THEN g.meeting_link END,
    g.max_members,
    (SELECT count(*)::integer FROM public.study_group_members x WHERE x.group_id = g.id AND x.status = 'active'),
    CASE WHEN m.role IN ('owner', 'moderator')
         THEN (SELECT count(*)::integer FROM public.study_group_members x WHERE x.group_id = g.id AND x.status = 'pending')
         ELSE 0 END,
    g.creator_id,
    (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = g.creator_id),
    m.status, CASE WHEN m.status = 'active' THEN m.role END,
    CASE WHEN m.status = 'active'
         THEN (SELECT count(*)::integer FROM public.study_group_posts p
                WHERE p.group_id = g.id AND p.created_at > m.last_read_at AND p.author_id <> (SELECT uid FROM viewer))
         ELSE 0 END,
    (SELECT min(s.scheduled_at) FROM public.study_group_sessions s
      WHERE s.group_id = g.id AND s.status = 'scheduled' AND s.scheduled_at > now() AND m.status = 'active'),
    g.last_activity_at, g.created_at, g.is_archived
  FROM public.study_groups g
  CROSS JOIN viewer v
  LEFT JOIN public.study_group_members m ON m.group_id = g.id AND m.user_id = v.uid
  WHERE v.uid IS NOT NULL
    AND (p_id IS NULL OR g.id = p_id)
    AND (NOT COALESCE(p_mine_only, false) OR m.status = 'active')
    AND COALESCE(m.status, '') <> 'banned'
    AND (NOT g.is_archived OR m.status = 'active')
    AND (
      m.status = 'active'
      OR (v.privileged AND (p_campus IS NULL OR upper(p_campus) = 'ALL' OR g.campus_code = upper(p_campus)))
      OR g.campus_code = 'GLOBAL'
      OR (v.campus IS NOT NULL AND g.campus_code = v.campus AND (p_campus IS NULL OR upper(p_campus) IN ('ALL', v.campus)))
    )
    AND (p_q IS NULL OR btrim(p_q) = ''
         OR g.name ILIKE '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
         OR g.course_code ILIKE '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
         OR g.description ILIKE '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ORDER BY (m.status = 'active') DESC NULLS LAST, g.last_activity_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.list_study_group_members(p_id uuid)
RETURNS TABLE (user_id uuid, full_name text, avatar_url text, department text, role text, status text, joined_at timestamptz, requested_message text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.user_id, p.full_name, p.avatar_url, p.department, m.role, m.status, m.joined_at, m.requested_message
  FROM public.study_group_members m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.group_id = p_id
    AND (public.is_pod_member(p_id) OR public.auth_profile_role() = 'admin')
    AND (m.status = 'active' OR public.can_moderate_pod(p_id))
  ORDER BY (m.status = 'pending') DESC, CASE m.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, m.joined_at
  LIMIT 400;
$$;

CREATE OR REPLACE FUNCTION public.list_study_group_posts(
  p_group uuid, p_parent uuid DEFAULT NULL, p_limit integer DEFAULT 30, p_before timestamptz DEFAULT NULL
) RETURNS TABLE (
  id uuid, group_id uuid, author_id uuid, author_name text, author_avatar text, author_pod_role text,
  parent_id uuid, kind text, title text, body text, link_url text, is_pinned boolean, is_resolved boolean,
  reply_count integer, created_at timestamptz, edited_at timestamptz
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
           p.link_url, p.is_pinned, p.is_resolved, p.reply_count, p.created_at, p.edited_at
    FROM public.study_group_posts p
    JOIN public.profiles pr ON pr.id = p.author_id
    LEFT JOIN public.study_group_members m ON m.group_id = p.group_id AND m.user_id = p.author_id AND m.status = 'active'
    WHERE p.group_id = p_group AND p.parent_id IS NULL AND (p_before IS NULL OR p.created_at < p_before)
    ORDER BY (p.is_pinned AND p_before IS NULL) DESC, p.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 30), 100));
  ELSE
    RETURN QUERY
    SELECT p.id, p.group_id, p.author_id, pr.full_name, pr.avatar_url, m.role, p.parent_id, p.kind, p.title, p.body,
           p.link_url, p.is_pinned, p.is_resolved, p.reply_count, p.created_at, p.edited_at
    FROM public.study_group_posts p
    JOIN public.profiles pr ON pr.id = p.author_id
    LEFT JOIN public.study_group_members m ON m.group_id = p.group_id AND m.user_id = p.author_id AND m.status = 'active'
    WHERE p.group_id = p_group AND p.parent_id = p_parent
    ORDER BY p.created_at ASC
    LIMIT 200;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.list_study_group_sessions(p_group uuid)
RETURNS TABLE (
  id uuid, group_id uuid, title text, scheduled_at timestamptz, duration_minutes integer, mode text,
  location text, agenda text, status text, created_by uuid, creator_name text, going_count integer, i_am_going boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.group_id, s.title, s.scheduled_at, s.duration_minutes, s.mode, s.location, s.agenda, s.status,
         s.created_by, (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = s.created_by),
         (SELECT count(*)::integer FROM public.study_group_session_rsvps r WHERE r.session_id = s.id),
         EXISTS (SELECT 1 FROM public.study_group_session_rsvps r WHERE r.session_id = s.id AND r.user_id = auth.uid())
  FROM public.study_group_sessions s
  WHERE s.group_id = p_group
    AND (public.is_pod_member(p_group) OR public.auth_profile_role() IN ('admin', 'staff'))
    AND s.status <> 'cancelled'
    AND s.scheduled_at > now() - interval '30 days'
  ORDER BY s.scheduled_at
  LIMIT 100;
$$;

-- =====================================================================================================
-- 5. actions
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.create_study_group(
  p_name text, p_course_code text DEFAULT NULL, p_description text DEFAULT NULL, p_is_private boolean DEFAULT false,
  p_level text DEFAULT NULL, p_department text DEFAULT NULL, p_topics text[] DEFAULT '{}',
  p_meeting_link text DEFAULT NULL, p_schedule_note text DEFAULT NULL, p_goal text DEFAULT NULL,
  p_max_members integer DEFAULT 20, p_campus text DEFAULT NULL
) RETURNS public.study_groups
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_me   public.profiles%ROWTYPE;
  v_camp text;
  v_row  public.study_groups;
  v_topics text[];
  v_link text := NULLIF(btrim(COALESCE(p_meeting_link, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR COALESCE(v_me.is_suspended, false) THEN RAISE EXCEPTION 'account_suspended'; END IF;
  IF v_me.verification_status::text <> 'verified' AND v_me.role::text NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'not_verified: verify your student account to create a study pod';
  END IF;
  IF char_length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 3 AND 80 THEN RAISE EXCEPTION 'invalid_input: the pod name needs 3 to 80 characters'; END IF;
  IF p_description IS NOT NULL AND char_length(p_description) > 600 THEN RAISE EXCEPTION 'invalid_input: description is too long (600 characters max)'; END IF;
  IF v_link IS NOT NULL AND v_link !~* '^https?://' THEN RAISE EXCEPTION 'invalid_input: the meeting link must start with https://'; END IF;
  IF p_max_members IS NULL OR p_max_members NOT BETWEEN 2 AND 300 THEN RAISE EXCEPTION 'invalid_input: pod size must be between 2 and 300'; END IF;
  v_topics := public.normalise_tags(p_topics, 30);
  IF cardinality(v_topics) > 8 THEN RAISE EXCEPTION 'invalid_input: at most 8 topics'; END IF;

  v_camp := CASE WHEN v_me.role::text = 'admin' AND NULLIF(btrim(COALESCE(p_campus, '')), '') IS NOT NULL THEN upper(btrim(p_campus))
                 ELSE COALESCE(v_me.campus_code, 'GLOBAL') END;

  INSERT INTO public.study_groups
    (creator_id, campus_code, name, course_code, description, meeting_link, max_members, is_private,
     level, department, topics, schedule_note, goal)
  VALUES
    (v_uid, v_camp, btrim(p_name), upper(NULLIF(btrim(COALESCE(p_course_code, '')), '')),
     NULLIF(btrim(COALESCE(p_description, '')), ''), v_link, p_max_members, COALESCE(p_is_private, false),
     NULLIF(btrim(COALESCE(p_level, '')), ''), NULLIF(btrim(COALESCE(p_department, '')), ''), v_topics,
     NULLIF(btrim(COALESCE(p_schedule_note, '')), ''), NULLIF(btrim(COALESCE(p_goal, '')), ''))
  RETURNING * INTO v_row;
  INSERT INTO public.study_group_members (group_id, user_id, role, status) VALUES (v_row.id, v_uid, 'owner', 'active');
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.update_study_group(
  p_id uuid, p_name text, p_course_code text DEFAULT NULL, p_description text DEFAULT NULL, p_is_private boolean DEFAULT false,
  p_level text DEFAULT NULL, p_department text DEFAULT NULL, p_topics text[] DEFAULT '{}',
  p_meeting_link text DEFAULT NULL, p_schedule_note text DEFAULT NULL, p_goal text DEFAULT NULL, p_max_members integer DEFAULT 20
) RETURNS public.study_groups
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.study_groups;
  v_link text := NULLIF(btrim(COALESCE(p_meeting_link, '')), '');
  v_topics text[];
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (COALESCE(public.pod_role(p_id) = 'owner', false) OR COALESCE(public.auth_profile_role() = 'admin', false)) THEN
    RAISE EXCEPTION 'not_allowed: only the owner can edit this pod';
  END IF;
  IF char_length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 3 AND 80 THEN RAISE EXCEPTION 'invalid_input: the pod name needs 3 to 80 characters'; END IF;
  IF p_description IS NOT NULL AND char_length(p_description) > 600 THEN RAISE EXCEPTION 'invalid_input: description is too long (600 characters max)'; END IF;
  IF v_link IS NOT NULL AND v_link !~* '^https?://' THEN RAISE EXCEPTION 'invalid_input: the meeting link must start with https://'; END IF;
  SELECT count(*) INTO v_count FROM public.study_group_members WHERE group_id = p_id AND status = 'active';
  IF p_max_members IS NULL OR p_max_members NOT BETWEEN GREATEST(2, v_count) AND 300 THEN
    RAISE EXCEPTION 'invalid_input: pod size must be between % and 300 (it already has % members)', GREATEST(2, v_count), v_count;
  END IF;
  v_topics := public.normalise_tags(p_topics, 30);
  IF cardinality(v_topics) > 8 THEN RAISE EXCEPTION 'invalid_input: at most 8 topics'; END IF;
  UPDATE public.study_groups SET
    name = btrim(p_name), course_code = upper(NULLIF(btrim(COALESCE(p_course_code, '')), '')),
    description = NULLIF(btrim(COALESCE(p_description, '')), ''), is_private = COALESCE(p_is_private, false),
    level = NULLIF(btrim(COALESCE(p_level, '')), ''), department = NULLIF(btrim(COALESCE(p_department, '')), ''),
    topics = v_topics, meeting_link = v_link, schedule_note = NULLIF(btrim(COALESCE(p_schedule_note, '')), ''),
    goal = NULLIF(btrim(COALESCE(p_goal, '')), ''), max_members = p_max_members, updated_at = now()
  WHERE id = p_id RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN v_row;
END $$;

-- Join (public pod) or ask to join (private pod). Returns 'active' or 'pending'.
CREATE OR REPLACE FUNCTION public.join_study_group(p_id uuid, p_message text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_me  public.profiles%ROWTYPE;
  v_g   public.study_groups;
  v_m   public.study_group_members;
  v_count integer;
  v_status text;
  v_msg text := NULLIF(btrim(COALESCE(p_message, '')), '');
  r record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR COALESCE(v_me.is_suspended, false) THEN RAISE EXCEPTION 'account_suspended'; END IF;
  IF v_msg IS NOT NULL AND char_length(v_msg) > 300 THEN RAISE EXCEPTION 'invalid_input: message too long (300 characters max)'; END IF;
  SELECT * INTO v_g FROM public.study_groups WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_g.is_archived THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (v_g.campus_code = 'GLOBAL' OR v_g.campus_code = public.auth_campus_access() OR v_me.role::text IN ('admin', 'staff')) THEN
    RAISE EXCEPTION 'not_allowed: this pod belongs to another campus';
  END IF;

  SELECT * INTO v_m FROM public.study_group_members WHERE group_id = p_id AND user_id = v_uid;
  IF FOUND THEN
    IF v_m.status = 'banned' THEN RAISE EXCEPTION 'not_allowed: you cannot join this pod'; END IF;
    RETURN v_m.status;
  END IF;

  SELECT count(*) INTO v_count FROM public.study_group_members WHERE group_id = p_id AND status = 'active';
  IF v_count >= COALESCE(v_g.max_members, 20) THEN RAISE EXCEPTION 'pod_full'; END IF;

  v_status := CASE WHEN v_g.is_private THEN 'pending' ELSE 'active' END;
  INSERT INTO public.study_group_members (group_id, user_id, role, status, requested_message, last_read_at)
  VALUES (p_id, v_uid, 'member', v_status, v_msg, now());

  IF v_status = 'pending' THEN
    FOR r IN SELECT user_id FROM public.study_group_members WHERE group_id = p_id AND status = 'active' AND role IN ('owner', 'moderator') LOOP
      PERFORM public.pod_notify(r.user_id, v_uid, 'New join request',
        format('%s asked to join "%s".', COALESCE(v_me.full_name, 'Someone'), v_g.name), p_id);
    END LOOP;
  ELSE
    PERFORM public.pod_notify(v_g.creator_id, v_uid, 'New pod member',
      format('%s joined "%s".', COALESCE(v_me.full_name, 'Someone'), v_g.name), p_id);
  END IF;
  RETURN v_status;
END $$;

CREATE OR REPLACE FUNCTION public.leave_study_group(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_m   public.study_group_members;
  v_next uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_m FROM public.study_group_members WHERE group_id = p_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_m.status = 'banned' THEN RETURN; END IF;  -- a ban must not be undone by "leaving"

  IF v_m.status = 'active' AND v_m.role = 'owner' THEN
    SELECT user_id INTO v_next FROM public.study_group_members
     WHERE group_id = p_id AND user_id <> v_uid AND status = 'active'
     ORDER BY (role = 'moderator') DESC, joined_at LIMIT 1;
    IF v_next IS NULL THEN
      DELETE FROM public.study_groups WHERE id = p_id;   -- last member out: the pod ends
      RETURN;
    END IF;
    DELETE FROM public.study_group_members WHERE group_id = p_id AND user_id = v_uid;
    UPDATE public.study_group_members SET role = 'owner' WHERE group_id = p_id AND user_id = v_next;
    UPDATE public.study_groups SET creator_id = v_next, updated_at = now() WHERE id = p_id;
    PERFORM public.pod_notify(v_next, v_uid, 'You are now the pod owner', 'The previous owner left, so you now run this study pod.', p_id);
    RETURN;
  END IF;
  DELETE FROM public.study_group_members WHERE group_id = p_id AND user_id = v_uid;
END $$;

CREATE OR REPLACE FUNCTION public.respond_study_group_join(p_id uuid, p_user uuid, p_approve boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g public.study_groups;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.can_moderate_pod(p_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  SELECT * INTO v_g FROM public.study_groups WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.study_group_members WHERE group_id = p_id AND user_id = p_user AND status = 'pending') THEN
    RAISE EXCEPTION 'wrong_state: there is no pending request from that person';
  END IF;
  IF p_approve THEN
    SELECT count(*) INTO v_count FROM public.study_group_members WHERE group_id = p_id AND status = 'active';
    IF v_count >= COALESCE(v_g.max_members, 20) THEN RAISE EXCEPTION 'pod_full'; END IF;
    UPDATE public.study_group_members SET status = 'active', joined_at = now(), last_read_at = now(), requested_message = NULL
     WHERE group_id = p_id AND user_id = p_user;
    PERFORM public.pod_notify(p_user, auth.uid(), 'Request approved', format('You can now join the conversation in "%s".', v_g.name), p_id);
  ELSE
    DELETE FROM public.study_group_members WHERE group_id = p_id AND user_id = p_user AND status = 'pending';
    PERFORM public.pod_notify(p_user, auth.uid(), 'Request declined', format('Your request to join "%s" was not accepted.', v_g.name), p_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.remove_study_group_member(p_id uuid, p_user uuid, p_ban boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor text := public.pod_role(p_id);
  v_target public.study_group_members;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.can_moderate_pod(p_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION 'invalid_input: use "Leave pod" to leave'; END IF;
  SELECT * INTO v_target FROM public.study_group_members WHERE group_id = p_id AND user_id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_target.role = 'owner' THEN RAISE EXCEPTION 'not_allowed: the owner cannot be removed'; END IF;
  IF v_target.role = 'moderator' AND COALESCE(v_actor, '') <> 'owner' AND COALESCE(public.auth_profile_role() <> 'admin', true) THEN
    RAISE EXCEPTION 'not_allowed: only the owner can remove a moderator';
  END IF;
  SELECT name INTO v_name FROM public.study_groups WHERE id = p_id;
  IF COALESCE(p_ban, false) THEN
    UPDATE public.study_group_members SET status = 'banned', role = 'member' WHERE group_id = p_id AND user_id = p_user;
  ELSE
    DELETE FROM public.study_group_members WHERE group_id = p_id AND user_id = p_user;
  END IF;
  PERFORM public.pod_notify(p_user, auth.uid(), 'Removed from study pod', format('You were removed from "%s".', COALESCE(v_name, 'a study pod')), p_id);
END $$;

-- Owner only: 'moderator', 'member', or 'owner' (hands the pod over and demotes the caller to moderator).
CREATE OR REPLACE FUNCTION public.set_study_group_member_role(p_id uuid, p_user uuid, p_role text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF COALESCE(public.pod_role(p_id), '') <> 'owner' THEN RAISE EXCEPTION 'not_allowed: only the owner can change roles'; END IF;
  IF p_role NOT IN ('moderator', 'member', 'owner') THEN RAISE EXCEPTION 'invalid_input: unknown role'; END IF;
  IF p_user = v_uid THEN RAISE EXCEPTION 'invalid_input: you already own this pod'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.study_group_members WHERE group_id = p_id AND user_id = p_user AND status = 'active') THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF p_role = 'owner' THEN
    UPDATE public.study_group_members SET role = 'moderator' WHERE group_id = p_id AND user_id = v_uid;
    UPDATE public.study_group_members SET role = 'owner' WHERE group_id = p_id AND user_id = p_user;
    UPDATE public.study_groups SET creator_id = p_user, updated_at = now() WHERE id = p_id;
    PERFORM public.pod_notify(p_user, v_uid, 'You are now the pod owner', 'The previous owner handed this study pod over to you.', p_id);
  ELSE
    UPDATE public.study_group_members SET role = p_role WHERE group_id = p_id AND user_id = p_user;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.post_to_study_group(
  p_group uuid, p_body text, p_kind text DEFAULT 'discussion', p_title text DEFAULT NULL,
  p_link text DEFAULT NULL, p_parent uuid DEFAULT NULL
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
  IF p_kind = 'resource' AND v_link IS NULL THEN RAISE EXCEPTION 'invalid_input: add the link you are sharing'; END IF;
  IF v_title IS NOT NULL AND char_length(v_title) NOT BETWEEN 3 AND 140 THEN RAISE EXCEPTION 'invalid_input: the title needs 3 to 140 characters'; END IF;

  INSERT INTO public.study_group_posts (group_id, author_id, kind, title, body, link_url)
  VALUES (p_group, v_uid, p_kind, v_title, v_body, v_link) RETURNING * INTO v_row;

  IF p_kind = 'announcement' THEN
    SELECT name INTO v_name FROM public.study_groups WHERE id = p_group;
    FOR r IN SELECT user_id FROM public.study_group_members WHERE group_id = p_group AND status = 'active' AND user_id <> v_uid LOOP
      PERFORM public.pod_notify(r.user_id, v_uid, format('Announcement in %s', COALESCE(v_name, 'your pod')), COALESCE(v_title, left(v_body, 120)), p_group);
    END LOOP;
  END IF;
  RETURN v_row;
END $$;

-- pin / unpin (owner or moderator); resolve / unresolve (question author or owner/moderator)
CREATE OR REPLACE FUNCTION public.moderate_study_group_post(p_post uuid, p_action text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p public.study_group_posts;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_p FROM public.study_group_posts WHERE id = p_post;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF p_action IN ('pin', 'unpin') THEN
    IF NOT public.can_moderate_pod(v_p.group_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
    IF v_p.parent_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_input: only top-level posts can be pinned'; END IF;
    IF p_action = 'pin' AND (SELECT count(*) FROM public.study_group_posts WHERE group_id = v_p.group_id AND is_pinned) >= 3 THEN
      RAISE EXCEPTION 'invalid_input: unpin a post first (3 pinned posts max)';
    END IF;
    UPDATE public.study_group_posts SET is_pinned = (p_action = 'pin') WHERE id = p_post;
  ELSIF p_action IN ('resolve', 'unresolve') THEN
    IF v_p.kind <> 'question' THEN RAISE EXCEPTION 'invalid_input: only questions can be marked resolved'; END IF;
    IF NOT (v_p.author_id = auth.uid() OR public.can_moderate_pod(v_p.group_id)) THEN RAISE EXCEPTION 'not_allowed'; END IF;
    UPDATE public.study_group_posts SET is_resolved = (p_action = 'resolve') WHERE id = p_post;
  ELSE
    RAISE EXCEPTION 'invalid_input: unknown action';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.schedule_study_group_session(
  p_group uuid, p_title text, p_scheduled_at timestamptz, p_duration integer DEFAULT 60,
  p_mode text DEFAULT 'online', p_location text DEFAULT NULL, p_agenda text DEFAULT NULL
) RETURNS public.study_group_sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.study_group_sessions;
  v_g public.study_groups;
  v_loc text := NULLIF(btrim(COALESCE(p_location, '')), '');
  v_agenda text := NULLIF(btrim(COALESCE(p_agenda, '')), '');
  r record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.can_moderate_pod(p_group) THEN RAISE EXCEPTION 'not_allowed: only the owner or a moderator can schedule sessions'; END IF;
  SELECT * INTO v_g FROM public.study_groups WHERE id = p_group;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 3 AND 120 THEN RAISE EXCEPTION 'invalid_input: the title needs 3 to 120 characters'; END IF;
  IF p_scheduled_at IS NULL OR p_scheduled_at < now() + interval '5 minutes' THEN RAISE EXCEPTION 'invalid_input: pick a time in the future'; END IF;
  IF p_scheduled_at > now() + interval '180 days' THEN RAISE EXCEPTION 'invalid_input: sessions can be planned up to 180 days ahead'; END IF;
  IF p_duration NOT BETWEEN 15 AND 480 THEN RAISE EXCEPTION 'invalid_input: duration must be 15 to 480 minutes'; END IF;
  IF p_mode NOT IN ('online', 'in_person') THEN RAISE EXCEPTION 'invalid_input: unknown session type'; END IF;
  IF v_loc IS NOT NULL AND char_length(v_loc) > 300 THEN RAISE EXCEPTION 'invalid_input: location is too long'; END IF;
  IF p_mode = 'online' AND v_loc IS NULL THEN v_loc := v_g.meeting_link; END IF;
  IF p_mode = 'in_person' AND v_loc IS NULL THEN RAISE EXCEPTION 'invalid_input: say where you will meet'; END IF;
  IF v_agenda IS NOT NULL AND char_length(v_agenda) > 600 THEN RAISE EXCEPTION 'invalid_input: agenda is too long (600 characters max)'; END IF;
  IF (SELECT count(*) FROM public.study_group_sessions WHERE group_id = p_group AND status = 'scheduled' AND scheduled_at > now()) >= 20 THEN
    RAISE EXCEPTION 'too_many_sessions: cancel an upcoming session first';
  END IF;

  INSERT INTO public.study_group_sessions (group_id, created_by, title, scheduled_at, duration_minutes, mode, location, agenda)
  VALUES (p_group, v_uid, btrim(p_title), p_scheduled_at, p_duration, p_mode, v_loc, v_agenda) RETURNING * INTO v_row;
  INSERT INTO public.study_group_session_rsvps (session_id, user_id) VALUES (v_row.id, v_uid) ON CONFLICT DO NOTHING;
  UPDATE public.study_groups SET last_activity_at = now() WHERE id = p_group;
  FOR r IN SELECT user_id FROM public.study_group_members WHERE group_id = p_group AND status = 'active' AND user_id <> v_uid LOOP
    PERFORM public.pod_notify(r.user_id, v_uid, 'New study session',
      format('"%s" is on %s in %s.', btrim(p_title), to_char(p_scheduled_at AT TIME ZONE 'Africa/Lagos', 'Dy DD Mon "at" HH24:MI'), v_g.name), p_group);
  END LOOP;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_study_group_session(p_session uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_s public.study_group_sessions;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_s FROM public.study_group_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (v_s.created_by = auth.uid() OR public.can_moderate_pod(v_s.group_id)) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF v_s.status <> 'scheduled' THEN RAISE EXCEPTION 'wrong_state: this session is already closed'; END IF;
  UPDATE public.study_group_sessions SET status = 'cancelled' WHERE id = p_session;
  FOR r IN SELECT user_id FROM public.study_group_session_rsvps WHERE session_id = p_session AND user_id <> auth.uid() LOOP
    PERFORM public.pod_notify(r.user_id, auth.uid(), 'Study session cancelled',
      format('"%s" on %s was cancelled.', v_s.title, to_char(v_s.scheduled_at AT TIME ZONE 'Africa/Lagos', 'Dy DD Mon "at" HH24:MI')), v_s.group_id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.rsvp_study_group_session(p_session uuid, p_going boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_s public.study_group_sessions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_s FROM public.study_group_sessions WHERE id = p_session;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_pod_member(v_s.group_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF v_s.status <> 'scheduled' OR v_s.scheduled_at < now() THEN RAISE EXCEPTION 'wrong_state: this session is over'; END IF;
  IF p_going THEN
    INSERT INTO public.study_group_session_rsvps (session_id, user_id) VALUES (p_session, auth.uid()) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.study_group_session_rsvps WHERE session_id = p_session AND user_id = auth.uid();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mark_study_group_read(p_group uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.study_group_members SET last_read_at = now()
  WHERE group_id = p_group AND user_id = auth.uid() AND status = 'active';
$$;

-- =====================================================================================================
-- 5b. reporting: a pod post goes into the same moderation queue as forum posts
-- =====================================================================================================
-- (the new enum value is only used at run time by the function below, never in this transaction)
ALTER TYPE public.moderation_item_type ADD VALUE IF NOT EXISTS 'pod_post';

CREATE OR REPLACE FUNCTION public.report_study_group_post(p_post uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.study_group_posts;
  v_campus text;
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_p FROM public.study_group_posts WHERE id = p_post;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_pod_member(v_p.group_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF v_p.author_id = v_uid THEN RAISE EXCEPTION 'invalid_input: you cannot report your own post'; END IF;
  IF char_length(v_reason) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'invalid_input: say briefly what is wrong (3 to 500 characters)'; END IF;
  IF EXISTS (SELECT 1 FROM public.moderation_queue
             WHERE reporter_id = v_uid AND item_id = p_post AND item_type::text = 'pod_post' AND status::text = 'pending') THEN
    RAISE EXCEPTION 'already_reported: you already reported this post';
  END IF;
  SELECT campus_code INTO v_campus FROM public.study_groups WHERE id = v_p.group_id;
  INSERT INTO public.moderation_queue (item_type, item_id, reporter_id, campus_code, reason, status)
  VALUES ('pod_post'::public.moderation_item_type, p_post, v_uid, COALESCE(v_campus, 'GLOBAL'), v_reason, 'pending'::public.moderation_status_type);
END $$;

-- Campus staff who work the moderation queue can remove a reported pod post on their own campus.
DROP POLICY IF EXISTS "sgp_delete_staff" ON public.study_group_posts;
CREATE POLICY "sgp_delete_staff" ON public.study_group_posts FOR DELETE TO authenticated
  USING (
    public.auth_profile_role() = 'staff'
    AND EXISTS (SELECT 1 FROM public.study_groups g JOIN public.profiles p ON p.id = auth.uid()
                WHERE g.id = study_group_posts.group_id AND p.campus_code = g.campus_code)
  );

-- =====================================================================================================
-- 6. reminders (1 hour before each session, to the people who said they are going)
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.send_study_pod_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  u record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.group_id, s.title, s.scheduled_at, g.name AS group_name
    FROM public.study_group_sessions s JOIN public.study_groups g ON g.id = s.group_id
    WHERE s.status = 'scheduled' AND s.reminder_sent_at IS NULL
      AND s.scheduled_at > now() AND s.scheduled_at <= now() + interval '70 minutes'
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    FOR u IN SELECT user_id FROM public.study_group_session_rsvps WHERE session_id = r.id LOOP
      PERFORM public.pod_notify(u.user_id, NULL, 'Study session starting soon',
        format('"%s" (%s) starts at %s.', r.title, r.group_name, to_char(r.scheduled_at AT TIME ZONE 'Africa/Lagos', 'HH24:MI')), r.group_id);
    END LOOP;
    UPDATE public.study_group_sessions SET reminder_sent_at = now() WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.send_study_pod_reminders() FROM PUBLIC, anon, authenticated;

DO $do$
BEGIN
  BEGIN
    PERFORM cron.unschedule('lioris_study_pod_reminders');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  PERFORM cron.schedule('lioris_study_pod_reminders', '*/10 * * * *', 'SELECT public.send_study_pod_reminders()');
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not schedule study pod reminders: %', SQLERRM;
END
$do$;

-- =====================================================================================================
-- 7. grants
-- =====================================================================================================
REVOKE ALL ON FUNCTION
  public.is_pod_member(uuid), public.pod_role(uuid), public.can_moderate_pod(uuid),
  public.list_study_groups(text, text, uuid, boolean), public.list_study_group_members(uuid),
  public.list_study_group_posts(uuid, uuid, integer, timestamptz), public.list_study_group_sessions(uuid),
  public.create_study_group(text, text, text, boolean, text, text, text[], text, text, text, integer, text),
  public.update_study_group(uuid, text, text, text, boolean, text, text, text[], text, text, text, integer),
  public.join_study_group(uuid, text), public.leave_study_group(uuid),
  public.respond_study_group_join(uuid, uuid, boolean), public.remove_study_group_member(uuid, uuid, boolean),
  public.set_study_group_member_role(uuid, uuid, text),
  public.post_to_study_group(uuid, text, text, text, text, uuid), public.moderate_study_group_post(uuid, text),
  public.schedule_study_group_session(uuid, text, timestamptz, integer, text, text, text),
  public.cancel_study_group_session(uuid), public.rsvp_study_group_session(uuid, boolean),
  public.mark_study_group_read(uuid), public.report_study_group_post(uuid, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.is_pod_member(uuid), public.pod_role(uuid), public.can_moderate_pod(uuid),
  public.list_study_groups(text, text, uuid, boolean), public.list_study_group_members(uuid),
  public.list_study_group_posts(uuid, uuid, integer, timestamptz), public.list_study_group_sessions(uuid),
  public.create_study_group(text, text, text, boolean, text, text, text[], text, text, text, integer, text),
  public.update_study_group(uuid, text, text, text, boolean, text, text, text[], text, text, text, integer),
  public.join_study_group(uuid, text), public.leave_study_group(uuid),
  public.respond_study_group_join(uuid, uuid, boolean), public.remove_study_group_member(uuid, uuid, boolean),
  public.set_study_group_member_role(uuid, uuid, text),
  public.post_to_study_group(uuid, text, text, text, text, uuid), public.moderate_study_group_post(uuid, text),
  public.schedule_study_group_session(uuid, text, timestamptz, integer, text, text, text),
  public.cancel_study_group_session(uuid), public.rsvp_study_group_session(uuid, boolean),
  public.mark_study_group_read(uuid), public.report_study_group_post(uuid, text)
TO authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['study_group_posts', 'study_group_sessions', 'study_group_members'] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
    END;
  END LOOP;
END $$;
