-- Mentorship v2: a real mentor <-> mentee programme instead of a single table.
--
-- Before: `mentorships` held a request with its proposal serialised into `focus_area` as JSON, the
-- client wrote/updated rows directly, a mentor had no profile (availability, capacity), there were no
-- sessions, goals, shared notes, feedback or way to finish/withdraw, and mentors were "anyone verified".
--
-- Now:
--   mentor_profiles       what a mentor offers: headline, expertise, availability, capacity, accepting flag
--   mentorships           the relationship (structured columns; status machine; one open request per pair)
--   mentorship_sessions   proposed / confirmed / completed sessions (video, chat, in person)
--   mentorship_goals      shared milestones
--   mentorship_updates    shared progress journal (works even when Direct Messages is switched off)
--   mentorship_feedback   the mentee's rating of the mentor, shown on the mentor's card
--
-- Every state change goes through a SECURITY DEFINER function that validates the caller, the current
-- state and capacity, writes the row and notifies the other person in one transaction. Clients can no
-- longer INSERT/UPDATE/DELETE the mentorship tables directly.

-- =====================================================================================================
-- 0. helpers
-- =====================================================================================================
-- Trim, cap length, drop blanks and case-insensitive duplicates ("Software", "software " -> one tag).
CREATE OR REPLACE FUNCTION public.normalise_tags(p_tags text[], p_max_len integer DEFAULT 40)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(x ORDER BY lower(x)), '{}')
  FROM (
    SELECT DISTINCT ON (lower(x)) x
    FROM (SELECT left(btrim(e), p_max_len) AS x FROM unnest(COALESCE(p_tags, '{}')) AS e) a
    WHERE x <> ''
    ORDER BY lower(x), x
  ) b;
$$;

CREATE OR REPLACE FUNCTION public.is_mentorship_participant(p_mentorship uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mentorships m
    WHERE m.id = p_mentorship
      AND (m.student_id = auth.uid() OR m.mentor_id = auth.uid())
  ) OR COALESCE(public.auth_profile_role() = 'admin', false);
$$;

CREATE OR REPLACE FUNCTION public.mentorship_notify(
  p_recipient uuid, p_sender uuid, p_title text, p_body text, p_action_url text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_recipient IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
  VALUES (p_recipient, p_sender, left(p_title, 140), left(p_body, 400), 'system', p_action_url, false);
EXCEPTION WHEN OTHERS THEN
  -- A notification must never make the business action itself fail.
  RAISE WARNING 'mentorship_notify failed: %', SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public.mentorship_notify(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;

-- =====================================================================================================
-- 1. mentor_profiles
-- =====================================================================================================
CREATE TABLE IF NOT EXISTS public.mentor_profiles (
  user_id          uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  headline         text CHECK (headline IS NULL OR char_length(headline) <= 120),
  about            text CHECK (about IS NULL OR char_length(about) <= 1200),
  job_title        text CHECK (job_title IS NULL OR char_length(job_title) <= 80),
  company          text CHECK (company IS NULL OR char_length(company) <= 80),
  years_experience integer CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 60),
  expertise        text[] NOT NULL DEFAULT '{}' CHECK (cardinality(expertise) <= 12),
  industries       text[] NOT NULL DEFAULT '{}' CHECK (cardinality(industries) <= 6),
  session_modes    text[] NOT NULL DEFAULT ARRAY['video','chat'] CHECK (session_modes <@ ARRAY['video','chat','in_person']),
  availability     jsonb  NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(availability) = 'object' AND pg_column_size(availability) < 2000),
  linkedin_url     text CHECK (linkedin_url IS NULL OR linkedin_url ~* '^https://'),
  is_accepting     boolean NOT NULL DEFAULT true,
  max_mentees      integer NOT NULL DEFAULT 3 CHECK (max_mentees BETWEEN 1 AND 20),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Tidy tags and free text, keep updated_at honest.
CREATE OR REPLACE FUNCTION public.mentor_profiles_normalise()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.expertise  := public.normalise_tags(NEW.expertise, 40);
  NEW.industries := public.normalise_tags(NEW.industries, 40);
  NEW.headline     := NULLIF(btrim(NEW.headline), '');
  NEW.about        := NULLIF(btrim(NEW.about), '');
  NEW.job_title    := NULLIF(btrim(NEW.job_title), '');
  NEW.company      := NULLIF(btrim(NEW.company), '');
  NEW.linkedin_url := NULLIF(btrim(NEW.linkedin_url), '');
  NEW.updated_at   := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_mentor_profiles_normalise ON public.mentor_profiles;
CREATE TRIGGER trg_mentor_profiles_normalise BEFORE INSERT OR UPDATE ON public.mentor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.mentor_profiles_normalise();

ALTER TABLE public.mentor_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mentor_profiles FROM anon;

DROP POLICY IF EXISTS "mentor_profiles_select" ON public.mentor_profiles;
CREATE POLICY "mentor_profiles_select" ON public.mentor_profiles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.auth_profile_role() IN ('admin', 'staff')
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = mentor_profiles.user_id
                 AND p.verification_status = 'verified'
                 AND NOT COALESCE(p.is_suspended, false))
  );

DROP POLICY IF EXISTS "mentor_profiles_write_own" ON public.mentor_profiles;
CREATE POLICY "mentor_profiles_write_own" ON public.mentor_profiles FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.auth_profile_role() IN ('alumni', 'staff', 'admin'))
  WITH CHECK (
    user_id = auth.uid()
    AND public.auth_profile_role() IN ('alumni', 'staff', 'admin')
    AND NOT COALESCE((SELECT is_suspended FROM public.profiles WHERE id = auth.uid()), false)
  );

-- =====================================================================================================
-- 2. mentorships: structured columns, real statuses, one open request per pair
-- =====================================================================================================
ALTER TABLE public.mentorships
  ADD COLUMN IF NOT EXISTS track            text,
  ADD COLUMN IF NOT EXISTS level            text,
  ADD COLUMN IF NOT EXISTS pitch            text,
  ADD COLUMN IF NOT EXISTS goals            text,
  ADD COLUMN IF NOT EXISTS cadence          text,
  ADD COLUMN IF NOT EXISTS plan_outline     text,
  ADD COLUMN IF NOT EXISTS document_url     text,
  ADD COLUMN IF NOT EXISTS document_name    text,
  ADD COLUMN IF NOT EXISTS decline_reason   text,
  ADD COLUMN IF NOT EXISTS end_reason       text,
  ADD COLUMN IF NOT EXISTS started_at       timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at         timestamptz,
  ADD COLUMN IF NOT EXISTS ended_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();

-- Move the JSON that used to live in focus_area into the new columns.
DO $$
DECLARE
  r record;
  j jsonb;
BEGIN
  FOR r IN SELECT id, focus_area FROM public.mentorships WHERE track IS NULL AND focus_area IS NOT NULL LOOP
    j := NULL;
    IF left(btrim(r.focus_area), 1) = '{' THEN
      BEGIN
        j := r.focus_area::jsonb;
      EXCEPTION WHEN OTHERS THEN
        j := NULL;
      END;
    END IF;
    IF j IS NOT NULL THEN
      UPDATE public.mentorships SET
        track         = left(NULLIF(j->>'track', ''), 80),
        level         = left(NULLIF(j->>'level', ''), 20),
        pitch         = left(NULLIF(j->>'pitch', ''), 1500),
        goals         = left(NULLIF(j->>'goals', ''), 1500),
        cadence       = left(NULLIF(j->>'cadence', ''), 80),
        plan_outline  = left(NULLIF(j->>'planOutline', ''), 2000),
        document_url  = CASE WHEN (j->>'documentUrl') ~* '^https://' THEN left(j->>'documentUrl', 1000) END,
        document_name = left(NULLIF(j->>'documentName', ''), 160)
      WHERE id = r.id;
    ELSE
      UPDATE public.mentorships SET track = left(r.focus_area, 80) WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

UPDATE public.mentorships SET track = COALESCE(track, 'Career Guidance') WHERE track IS NULL;
UPDATE public.mentorships SET started_at = COALESCE(started_at, updated_at, created_at) WHERE status IN ('active', 'completed') AND started_at IS NULL;
UPDATE public.mentorships SET last_activity_at = COALESCE(updated_at, created_at);

ALTER TABLE public.mentorships DROP CONSTRAINT IF EXISTS mentorships_status_chk;
ALTER TABLE public.mentorships ADD CONSTRAINT mentorships_status_chk
  CHECK (status IN ('pending', 'active', 'completed', 'declined', 'withdrawn', 'ended'));

ALTER TABLE public.mentorships DROP CONSTRAINT IF EXISTS mentorships_text_limits_chk;
ALTER TABLE public.mentorships ADD CONSTRAINT mentorships_text_limits_chk CHECK (
  (track IS NULL OR char_length(track) <= 80)
  AND (level IS NULL OR char_length(level) <= 20)
  AND (pitch IS NULL OR char_length(pitch) <= 1500)
  AND (goals IS NULL OR char_length(goals) <= 1500)
  AND (cadence IS NULL OR char_length(cadence) <= 80)
  AND (plan_outline IS NULL OR char_length(plan_outline) <= 2000)
  AND (document_name IS NULL OR char_length(document_name) <= 160)
  AND (decline_reason IS NULL OR char_length(decline_reason) <= 500)
  AND (end_reason IS NULL OR char_length(end_reason) <= 500)
  AND (document_url IS NULL OR (document_url ~* '^https://' AND char_length(document_url) <= 1000))
) NOT VALID;
ALTER TABLE public.mentorships VALIDATE CONSTRAINT mentorships_text_limits_chk;

CREATE UNIQUE INDEX IF NOT EXISTS mentorships_one_open_per_pair
  ON public.mentorships (student_id, mentor_id) WHERE status IN ('pending', 'active');
CREATE INDEX IF NOT EXISTS idx_mentorships_mentor_status ON public.mentorships (mentor_id, status);

-- The client used to INSERT/UPDATE/DELETE these rows itself. Everything now goes through the functions
-- below, so the direct-write policies are removed (RLS with no policy = denied). Admins keep full access.
DROP POLICY IF EXISTS "Students can request mentorship" ON public.mentorships;
DROP POLICY IF EXISTS "Mentors and students can update mentorship status" ON public.mentorships;
DROP POLICY IF EXISTS "Participants can cancel mentorship" ON public.mentorships;
DROP POLICY IF EXISTS "Admins manage mentorships" ON public.mentorships;
CREATE POLICY "Admins manage mentorships" ON public.mentorships FOR ALL TO authenticated
  USING (public.auth_profile_role() = 'admin')
  WITH CHECK (public.auth_profile_role() = 'admin');

-- =====================================================================================================
-- 3. sessions / goals / updates / feedback
-- =====================================================================================================
CREATE TABLE IF NOT EXISTS public.mentorship_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentorship_id        uuid NOT NULL REFERENCES public.mentorships(id) ON DELETE CASCADE,
  proposed_by          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scheduled_at         timestamptz NOT NULL,
  duration_minutes     integer NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 10 AND 240),
  mode                 text NOT NULL DEFAULT 'video' CHECK (mode IN ('video', 'chat', 'in_person')),
  location             text CHECK (location IS NULL OR char_length(location) <= 200),
  agenda               text CHECK (agenda IS NULL OR char_length(agenda) <= 600),
  status               text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'declined', 'cancelled', 'completed')),
  decision_note        text CHECK (decision_note IS NULL OR char_length(decision_note) <= 300),
  outcome_notes        text CHECK (outcome_notes IS NULL OR char_length(outcome_notes) <= 2000),
  reminder_24h_sent_at timestamptz,
  reminder_1h_sent_at  timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mentorship_sessions_m ON public.mentorship_sessions (mentorship_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_mentorship_sessions_due ON public.mentorship_sessions (scheduled_at) WHERE status = 'confirmed';

CREATE TABLE IF NOT EXISTS public.mentorship_goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentorship_id uuid NOT NULL REFERENCES public.mentorships(id) ON DELETE CASCADE,
  title         text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  due_date      date,
  is_done       boolean NOT NULL DEFAULT false,
  done_at       timestamptz,
  created_by    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mentorship_goals_m ON public.mentorship_goals (mentorship_id, created_at);

CREATE TABLE IF NOT EXISTS public.mentorship_updates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentorship_id uuid NOT NULL REFERENCES public.mentorships(id) ON DELETE CASCADE,
  author_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind          text NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'progress', 'resource')),
  body          text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  link_url      text CHECK (link_url IS NULL OR (link_url ~* '^https://' AND char_length(link_url) <= 1000)),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mentorship_updates_m ON public.mentorship_updates (mentorship_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.mentorship_feedback (
  mentorship_id uuid NOT NULL REFERENCES public.mentorships(id) ON DELETE CASCADE,
  from_user     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating        integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       text CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mentorship_id, from_user)
);
CREATE INDEX IF NOT EXISTS idx_mentorship_feedback_to ON public.mentorship_feedback (to_user);

-- Goals: participants manage them while the mentorship is active. Lock the parent and creator, stamp
-- done_at, and cap the list so a workspace stays readable.
CREATE OR REPLACE FUNCTION public.mentorship_goals_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (SELECT count(*) FROM public.mentorship_goals WHERE mentorship_id = NEW.mentorship_id) >= 12 THEN
      RAISE EXCEPTION 'too_many_goals: a mentorship can have at most 12 goals';
    END IF;
    NEW.title := btrim(NEW.title);
    IF NEW.is_done THEN NEW.done_at := now(); END IF;
  ELSE
    NEW.mentorship_id := OLD.mentorship_id;
    NEW.created_by := OLD.created_by;
    NEW.title := btrim(NEW.title);
    IF NEW.is_done AND NOT OLD.is_done THEN NEW.done_at := now();
    ELSIF NOT NEW.is_done THEN NEW.done_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_mentorship_goals_guard ON public.mentorship_goals;
CREATE TRIGGER trg_mentorship_goals_guard BEFORE INSERT OR UPDATE ON public.mentorship_goals
  FOR EACH ROW EXECUTE FUNCTION public.mentorship_goals_guard();

ALTER TABLE public.mentorship_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentorship_goals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentorship_updates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentorship_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mentorship_sessions, public.mentorship_goals, public.mentorship_updates, public.mentorship_feedback FROM anon;

DROP POLICY IF EXISTS "mentorship_sessions_select" ON public.mentorship_sessions;
CREATE POLICY "mentorship_sessions_select" ON public.mentorship_sessions FOR SELECT TO authenticated
  USING (public.is_mentorship_participant(mentorship_id));

DROP POLICY IF EXISTS "mentorship_updates_select" ON public.mentorship_updates;
CREATE POLICY "mentorship_updates_select" ON public.mentorship_updates FOR SELECT TO authenticated
  USING (public.is_mentorship_participant(mentorship_id));
DROP POLICY IF EXISTS "mentorship_updates_delete_own" ON public.mentorship_updates;
CREATE POLICY "mentorship_updates_delete_own" ON public.mentorship_updates FOR DELETE TO authenticated
  USING (author_id = auth.uid());

DROP POLICY IF EXISTS "mentorship_feedback_select" ON public.mentorship_feedback;
CREATE POLICY "mentorship_feedback_select" ON public.mentorship_feedback FOR SELECT TO authenticated
  USING (from_user = auth.uid() OR to_user = auth.uid() OR public.auth_profile_role() = 'admin');

DROP POLICY IF EXISTS "mentorship_goals_select" ON public.mentorship_goals;
CREATE POLICY "mentorship_goals_select" ON public.mentorship_goals FOR SELECT TO authenticated
  USING (public.is_mentorship_participant(mentorship_id));
DROP POLICY IF EXISTS "mentorship_goals_insert" ON public.mentorship_goals;
CREATE POLICY "mentorship_goals_insert" ON public.mentorship_goals FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.mentorships m
                WHERE m.id = mentorship_id AND m.status = 'active'
                  AND (m.student_id = auth.uid() OR m.mentor_id = auth.uid()))
  );
DROP POLICY IF EXISTS "mentorship_goals_update" ON public.mentorship_goals;
CREATE POLICY "mentorship_goals_update" ON public.mentorship_goals FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mentorships m
                 WHERE m.id = mentorship_id AND m.status = 'active'
                   AND (m.student_id = auth.uid() OR m.mentor_id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.mentorships m
                 WHERE m.id = mentorship_id AND m.status = 'active'
                   AND (m.student_id = auth.uid() OR m.mentor_id = auth.uid())));
DROP POLICY IF EXISTS "mentorship_goals_delete" ON public.mentorship_goals;
CREATE POLICY "mentorship_goals_delete" ON public.mentorship_goals FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.mentorships m
            WHERE m.id = mentorship_id AND m.status = 'active'
              AND (m.mentor_id = auth.uid() OR created_by = auth.uid()))
  );

GRANT SELECT ON public.mentor_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.mentor_profiles TO authenticated;
GRANT SELECT ON public.mentorship_sessions, public.mentorship_updates, public.mentorship_feedback TO authenticated;
GRANT DELETE ON public.mentorship_updates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentorship_goals TO authenticated;

-- =====================================================================================================
-- 4. state changes (all SECURITY DEFINER; callable only by signed-in users)
-- =====================================================================================================

-- 4.1 Student asks a mentor.
CREATE OR REPLACE FUNCTION public.request_mentorship(
  p_mentor_id     uuid,
  p_track         text,
  p_level         text DEFAULT NULL,
  p_pitch         text DEFAULT NULL,
  p_goals         text DEFAULT NULL,
  p_cadence       text DEFAULT NULL,
  p_plan_outline  text DEFAULT NULL,
  p_document_url  text DEFAULT NULL,
  p_document_name text DEFAULT NULL
) RETURNS public.mentorships
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_me     public.profiles%ROWTYPE;
  v_mentor public.profiles%ROWTYPE;
  v_prof   public.mentor_profiles%ROWTYPE;
  v_active integer;
  v_pending integer;
  v_row    public.mentorships;
  v_track  text := btrim(COALESCE(p_track, ''));
  v_pitch  text := NULLIF(btrim(COALESCE(p_pitch, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR COALESCE(v_me.is_suspended, false) THEN RAISE EXCEPTION 'account_suspended'; END IF;
  IF v_me.role::text NOT IN ('student', 'admin') THEN RAISE EXCEPTION 'not_allowed: only students can request a mentor'; END IF;
  IF p_mentor_id IS NULL OR p_mentor_id = v_uid THEN RAISE EXCEPTION 'invalid_input: choose another person as your mentor'; END IF;

  IF char_length(v_track) < 2 OR char_length(v_track) > 80 THEN RAISE EXCEPTION 'invalid_input: choose what you want help with'; END IF;
  IF v_pitch IS NULL OR char_length(v_pitch) < 20 THEN RAISE EXCEPTION 'invalid_input: tell the mentor a little about yourself (at least 20 characters)'; END IF;
  IF char_length(v_pitch) > 1500 THEN RAISE EXCEPTION 'invalid_input: your introduction is too long (1500 characters max)'; END IF;
  IF p_goals IS NOT NULL AND char_length(p_goals) > 1500 THEN RAISE EXCEPTION 'invalid_input: goals are too long (1500 characters max)'; END IF;
  IF p_plan_outline IS NOT NULL AND char_length(p_plan_outline) > 2000 THEN RAISE EXCEPTION 'invalid_input: the plan is too long (2000 characters max)'; END IF;
  IF p_document_url IS NOT NULL AND p_document_url <> '' AND p_document_url !~* '^https://' THEN RAISE EXCEPTION 'invalid_input: the attached document link is not valid'; END IF;

  SELECT * INTO v_mentor FROM public.profiles WHERE id = p_mentor_id;
  IF NOT FOUND OR COALESCE(v_mentor.is_suspended, false)
     OR v_mentor.role::text NOT IN ('alumni', 'staff', 'admin')
     OR (v_mentor.verification_status::text <> 'verified' AND v_mentor.role::text <> 'admin') THEN
    RAISE EXCEPTION 'mentor_unavailable';
  END IF;
  SELECT * INTO v_prof FROM public.mentor_profiles WHERE user_id = p_mentor_id;
  IF NOT FOUND OR NOT v_prof.is_accepting THEN RAISE EXCEPTION 'mentor_unavailable'; END IF;

  SELECT count(*) INTO v_active FROM public.mentorships WHERE mentor_id = p_mentor_id AND status = 'active';
  IF v_active >= v_prof.max_mentees THEN RAISE EXCEPTION 'mentor_full'; END IF;

  IF EXISTS (SELECT 1 FROM public.mentorships WHERE student_id = v_uid AND mentor_id = p_mentor_id AND status IN ('pending', 'active')) THEN
    RAISE EXCEPTION 'already_requested';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mentorships
             WHERE student_id = v_uid AND mentor_id = p_mentor_id AND status = 'declined'
               AND COALESCE(ended_at, updated_at, created_at) > now() - interval '7 days') THEN
    RAISE EXCEPTION 'cooldown';
  END IF;
  SELECT count(*) INTO v_pending FROM public.mentorships WHERE student_id = v_uid AND status = 'pending';
  IF v_pending >= 5 THEN RAISE EXCEPTION 'too_many_pending'; END IF;

  INSERT INTO public.mentorships
    (student_id, mentor_id, status, focus_area, track, level, pitch, goals, cadence, plan_outline, document_url, document_name)
  VALUES
    (v_uid, p_mentor_id, 'pending', v_track, v_track,
     NULLIF(btrim(COALESCE(p_level, '')), ''), v_pitch,
     NULLIF(btrim(COALESCE(p_goals, '')), ''), NULLIF(btrim(COALESCE(p_cadence, '')), ''),
     NULLIF(btrim(COALESCE(p_plan_outline, '')), ''),
     NULLIF(btrim(COALESCE(p_document_url, '')), ''), NULLIF(btrim(COALESCE(p_document_name, '')), ''))
  RETURNING * INTO v_row;

  PERFORM public.mentorship_notify(
    p_mentor_id, v_uid, 'New mentorship request',
    format('%s asked you to mentor them in %s.', COALESCE(v_me.full_name, 'A student'), v_track),
    '/mentorship/' || v_row.id::text);
  RETURN v_row;
END $$;

-- 4.2 Mentor accepts or declines.
CREATE OR REPLACE FUNCTION public.respond_mentorship(p_id uuid, p_action text, p_message text DEFAULT NULL)
RETURNS public.mentorships
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_row   public.mentorships;
  v_me    public.profiles%ROWTYPE;
  v_prof  public.mentor_profiles%ROWTYPE;
  v_active integer;
  v_msg   text := NULLIF(btrim(COALESCE(p_message, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_action NOT IN ('accept', 'decline') THEN RAISE EXCEPTION 'invalid_input: unknown action'; END IF;
  IF v_msg IS NOT NULL AND char_length(v_msg) > 500 THEN RAISE EXCEPTION 'invalid_input: message too long (500 characters max)'; END IF;

  SELECT * INTO v_row FROM public.mentorships WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_row.mentor_id <> v_uid THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'wrong_state: this request has already been answered'; END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;

  IF p_action = 'accept' THEN
    SELECT * INTO v_prof FROM public.mentor_profiles WHERE user_id = v_uid;
    SELECT count(*) INTO v_active FROM public.mentorships WHERE mentor_id = v_uid AND status = 'active';
    IF v_active >= COALESCE(v_prof.max_mentees, 3) THEN RAISE EXCEPTION 'mentor_full'; END IF;
    UPDATE public.mentorships
       SET status = 'active', started_at = now(), last_activity_at = now(), updated_at = now()
     WHERE id = p_id RETURNING * INTO v_row;
    IF v_msg IS NOT NULL THEN
      INSERT INTO public.mentorship_updates (mentorship_id, author_id, kind, body) VALUES (p_id, v_uid, 'note', v_msg);
    END IF;
    PERFORM public.mentorship_notify(v_row.student_id, v_uid, 'Mentorship accepted',
      format('%s accepted your request. Open your mentorship space to plan your first session.', COALESCE(v_me.full_name, 'Your mentor')),
      '/mentorship/' || p_id::text);
  ELSE
    UPDATE public.mentorships
       SET status = 'declined', decline_reason = v_msg, ended_at = now(), ended_by = v_uid, last_activity_at = now(), updated_at = now()
     WHERE id = p_id RETURNING * INTO v_row;
    PERFORM public.mentorship_notify(v_row.student_id, v_uid, 'Mentorship request declined',
      format('%s cannot take on a new mentee right now.%s', COALESCE(v_me.full_name, 'The mentor'),
             CASE WHEN v_msg IS NOT NULL THEN ' They said: ' || v_msg ELSE '' END),
      '/mentorship/' || p_id::text);
  END IF;
  RETURN v_row;
END $$;

-- 4.3 Withdraw a pending request, finish a mentorship, or stop early.
CREATE OR REPLACE FUNCTION public.end_mentorship(p_id uuid, p_action text, p_reason text DEFAULT NULL)
RETURNS public.mentorships
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.mentorships;
  v_me  public.profiles%ROWTYPE;
  v_other uuid;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_action NOT IN ('withdraw', 'end', 'complete') THEN RAISE EXCEPTION 'invalid_input: unknown action'; END IF;
  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN RAISE EXCEPTION 'invalid_input: reason too long (500 characters max)'; END IF;

  SELECT * INTO v_row FROM public.mentorships WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_uid NOT IN (v_row.student_id, v_row.mentor_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  v_other := CASE WHEN v_uid = v_row.student_id THEN v_row.mentor_id ELSE v_row.student_id END;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;

  IF p_action = 'withdraw' THEN
    IF v_uid <> v_row.student_id THEN RAISE EXCEPTION 'not_allowed: only the student can withdraw a request'; END IF;
    IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'wrong_state: only a pending request can be withdrawn'; END IF;
    UPDATE public.mentorships SET status = 'withdrawn', ended_at = now(), ended_by = v_uid, last_activity_at = now(), updated_at = now()
     WHERE id = p_id RETURNING * INTO v_row;
    PERFORM public.mentorship_notify(v_other, v_uid, 'Mentorship request withdrawn',
      format('%s withdrew their mentorship request.', COALESCE(v_me.full_name, 'The student')), '/mentorship/' || p_id::text);
  ELSE
    IF v_row.status <> 'active' THEN RAISE EXCEPTION 'wrong_state: this mentorship is not active'; END IF;
    UPDATE public.mentorships
       SET status = CASE WHEN p_action = 'complete' THEN 'completed' ELSE 'ended' END,
           end_reason = v_reason, ended_at = now(), ended_by = v_uid, last_activity_at = now(), updated_at = now()
     WHERE id = p_id RETURNING * INTO v_row;
    -- Nothing should stay scheduled once it is over.
    UPDATE public.mentorship_sessions SET status = 'cancelled', updated_at = now()
     WHERE mentorship_id = p_id AND status IN ('proposed', 'confirmed');
    PERFORM public.mentorship_notify(v_other, v_uid,
      CASE WHEN p_action = 'complete' THEN 'Mentorship completed' ELSE 'Mentorship ended' END,
      format('%s %s your mentorship.%s', COALESCE(v_me.full_name, 'Your partner'),
             CASE WHEN p_action = 'complete' THEN 'marked as complete' ELSE 'ended' END,
             CASE WHEN v_reason IS NOT NULL THEN ' Note: ' || v_reason ELSE '' END),
      '/mentorship/' || p_id::text);
  END IF;
  RETURN v_row;
END $$;

-- 4.4 Sessions.
CREATE OR REPLACE FUNCTION public.propose_mentorship_session(
  p_id uuid, p_scheduled_at timestamptz, p_duration integer DEFAULT 30,
  p_mode text DEFAULT 'video', p_location text DEFAULT NULL, p_agenda text DEFAULT NULL
) RETURNS public.mentorship_sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_m   public.mentorships;
  v_me  public.profiles%ROWTYPE;
  v_other uuid;
  v_row public.mentorship_sessions;
  v_loc text := NULLIF(btrim(COALESCE(p_location, '')), '');
  v_agenda text := NULLIF(btrim(COALESCE(p_agenda, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_m FROM public.mentorships WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_uid NOT IN (v_m.student_id, v_m.mentor_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF v_m.status <> 'active' THEN RAISE EXCEPTION 'wrong_state: sessions can only be planned in an active mentorship'; END IF;
  IF p_scheduled_at IS NULL OR p_scheduled_at < now() + interval '10 minutes' THEN RAISE EXCEPTION 'invalid_input: pick a time in the future'; END IF;
  IF p_scheduled_at > now() + interval '120 days' THEN RAISE EXCEPTION 'invalid_input: sessions can be planned up to 120 days ahead'; END IF;
  IF p_duration IS NULL OR p_duration NOT BETWEEN 10 AND 240 THEN RAISE EXCEPTION 'invalid_input: duration must be 10 to 240 minutes'; END IF;
  IF p_mode NOT IN ('video', 'chat', 'in_person') THEN RAISE EXCEPTION 'invalid_input: unknown session type'; END IF;
  IF p_mode = 'in_person' AND v_loc IS NULL THEN RAISE EXCEPTION 'invalid_input: say where you will meet'; END IF;
  IF v_loc IS NOT NULL AND char_length(v_loc) > 200 THEN RAISE EXCEPTION 'invalid_input: location is too long'; END IF;
  IF v_agenda IS NOT NULL AND char_length(v_agenda) > 600 THEN RAISE EXCEPTION 'invalid_input: agenda is too long (600 characters max)'; END IF;
  IF (SELECT count(*) FROM public.mentorship_sessions
       WHERE mentorship_id = p_id AND status IN ('proposed', 'confirmed') AND scheduled_at > now()) >= 5 THEN
    RAISE EXCEPTION 'too_many_sessions: finish or cancel an upcoming session first';
  END IF;

  v_other := CASE WHEN v_uid = v_m.student_id THEN v_m.mentor_id ELSE v_m.student_id END;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.mentorship_sessions (mentorship_id, proposed_by, scheduled_at, duration_minutes, mode, location, agenda)
  VALUES (p_id, v_uid, p_scheduled_at, p_duration, p_mode, v_loc, v_agenda) RETURNING * INTO v_row;
  UPDATE public.mentorships SET last_activity_at = now() WHERE id = p_id;
  PERFORM public.mentorship_notify(v_other, v_uid, 'New session proposed',
    format('%s proposed a %s-minute session on %s. Confirm or suggest another time.',
           COALESCE(v_me.full_name, 'Your partner'), p_duration, to_char(p_scheduled_at AT TIME ZONE 'Africa/Lagos', 'Dy DD Mon "at" HH24:MI')),
    '/mentorship/' || p_id::text);
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.respond_mentorship_session(p_session uuid, p_action text, p_note text DEFAULT NULL)
RETURNS public.mentorship_sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_s   public.mentorship_sessions;
  v_m   public.mentorships;
  v_me  public.profiles%ROWTYPE;
  v_other uuid;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_action NOT IN ('confirm', 'decline', 'cancel', 'complete') THEN RAISE EXCEPTION 'invalid_input: unknown action'; END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 2000 THEN RAISE EXCEPTION 'invalid_input: note too long'; END IF;

  SELECT * INTO v_s FROM public.mentorship_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT * INTO v_m FROM public.mentorships WHERE id = v_s.mentorship_id;
  IF v_uid NOT IN (v_m.student_id, v_m.mentor_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  v_other := CASE WHEN v_uid = v_m.student_id THEN v_m.mentor_id ELSE v_m.student_id END;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;

  IF p_action IN ('confirm', 'decline') THEN
    IF v_s.status <> 'proposed' THEN RAISE EXCEPTION 'wrong_state: this session was already answered'; END IF;
    IF v_uid = v_s.proposed_by THEN RAISE EXCEPTION 'not_allowed: the other person has to answer your proposal'; END IF;
    IF v_m.status <> 'active' THEN RAISE EXCEPTION 'wrong_state: this mentorship is not active'; END IF;
    IF p_action = 'confirm' AND v_s.scheduled_at < now() THEN RAISE EXCEPTION 'wrong_state: that time has already passed'; END IF;
    UPDATE public.mentorship_sessions
       SET status = CASE WHEN p_action = 'confirm' THEN 'confirmed' ELSE 'declined' END,
           decision_note = LEFT(v_note, 300), updated_at = now()
     WHERE id = p_session RETURNING * INTO v_s;
  ELSIF p_action = 'cancel' THEN
    IF v_s.status NOT IN ('proposed', 'confirmed') THEN RAISE EXCEPTION 'wrong_state: this session can no longer be cancelled'; END IF;
    UPDATE public.mentorship_sessions SET status = 'cancelled', decision_note = LEFT(v_note, 300), updated_at = now()
     WHERE id = p_session RETURNING * INTO v_s;
  ELSE
    IF v_s.status <> 'confirmed' THEN RAISE EXCEPTION 'wrong_state: only a confirmed session can be marked done'; END IF;
    IF v_s.scheduled_at > now() THEN RAISE EXCEPTION 'too_early: the session has not started yet'; END IF;
    UPDATE public.mentorship_sessions SET status = 'completed', outcome_notes = v_note, updated_at = now()
     WHERE id = p_session RETURNING * INTO v_s;
  END IF;

  UPDATE public.mentorships SET last_activity_at = now() WHERE id = v_s.mentorship_id;
  PERFORM public.mentorship_notify(v_other, v_uid,
    CASE p_action WHEN 'confirm' THEN 'Session confirmed' WHEN 'decline' THEN 'Session declined'
                  WHEN 'cancel' THEN 'Session cancelled' ELSE 'Session marked done' END,
    format('%s %s the session on %s.', COALESCE(v_me.full_name, 'Your partner'),
           CASE p_action WHEN 'confirm' THEN 'confirmed' WHEN 'decline' THEN 'declined' WHEN 'cancel' THEN 'cancelled' ELSE 'marked as done' END,
           to_char(v_s.scheduled_at AT TIME ZONE 'Africa/Lagos', 'Dy DD Mon "at" HH24:MI')),
    '/mentorship/' || v_s.mentorship_id::text);
  RETURN v_s;
END $$;

-- 4.5 Shared journal.
CREATE OR REPLACE FUNCTION public.post_mentorship_update(
  p_id uuid, p_body text, p_kind text DEFAULT 'note', p_link text DEFAULT NULL
) RETURNS public.mentorship_updates
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_m   public.mentorships;
  v_me  public.profiles%ROWTYPE;
  v_row public.mentorship_updates;
  v_body text := btrim(COALESCE(p_body, ''));
  v_link text := NULLIF(btrim(COALESCE(p_link, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_m FROM public.mentorships WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_uid NOT IN (v_m.student_id, v_m.mentor_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF v_m.status <> 'active' THEN RAISE EXCEPTION 'wrong_state: this mentorship is not active'; END IF;
  IF p_kind NOT IN ('note', 'progress', 'resource') THEN RAISE EXCEPTION 'invalid_input: unknown update type'; END IF;
  IF char_length(v_body) < 1 OR char_length(v_body) > 2000 THEN RAISE EXCEPTION 'invalid_input: write between 1 and 2000 characters'; END IF;
  IF v_link IS NOT NULL AND (v_link !~* '^https://' OR char_length(v_link) > 1000) THEN RAISE EXCEPTION 'invalid_input: the link must start with https://'; END IF;
  IF (SELECT count(*) FROM public.mentorship_updates WHERE mentorship_id = p_id AND author_id = v_uid AND created_at > now() - interval '1 day') >= 40 THEN
    RAISE EXCEPTION 'rate_limited: too many updates today';
  END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.mentorship_updates (mentorship_id, author_id, kind, body, link_url)
  VALUES (p_id, v_uid, p_kind, v_body, v_link) RETURNING * INTO v_row;
  UPDATE public.mentorships SET last_activity_at = now() WHERE id = p_id;
  -- Do not spam: notify only if the other person has no unread update from this thread already.
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.recipient_id = CASE WHEN v_uid = v_m.student_id THEN v_m.mentor_id ELSE v_m.student_id END
      AND n.action_url = '/mentorship/' || p_id::text AND n.title = 'New mentorship update'
      AND NOT n.is_read AND n.created_at > now() - interval '6 hours') THEN
    PERFORM public.mentorship_notify(
      CASE WHEN v_uid = v_m.student_id THEN v_m.mentor_id ELSE v_m.student_id END, v_uid,
      'New mentorship update', format('%s posted in your mentorship space.', COALESCE(v_me.full_name, 'Your partner')),
      '/mentorship/' || p_id::text);
  END IF;
  RETURN v_row;
END $$;

-- 4.6 Feedback once a mentorship is over.
CREATE OR REPLACE FUNCTION public.submit_mentorship_feedback(p_id uuid, p_rating integer, p_comment text DEFAULT NULL)
RETURNS public.mentorship_feedback
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_m   public.mentorships;
  v_row public.mentorship_feedback;
  v_me  public.profiles%ROWTYPE;
  v_other uuid;
  v_comment text := NULLIF(btrim(COALESCE(p_comment, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_m FROM public.mentorships WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_uid NOT IN (v_m.student_id, v_m.mentor_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF v_m.status NOT IN ('completed', 'ended') THEN RAISE EXCEPTION 'wrong_state: feedback opens when the mentorship is over'; END IF;
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'invalid_input: rating must be 1 to 5'; END IF;
  IF v_comment IS NOT NULL AND char_length(v_comment) > 1000 THEN RAISE EXCEPTION 'invalid_input: comment too long (1000 characters max)'; END IF;
  v_other := CASE WHEN v_uid = v_m.student_id THEN v_m.mentor_id ELSE v_m.student_id END;
  INSERT INTO public.mentorship_feedback (mentorship_id, from_user, to_user, rating, comment)
  VALUES (p_id, v_uid, v_other, p_rating, v_comment)
  ON CONFLICT (mentorship_id, from_user) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment
  RETURNING * INTO v_row;
  IF v_uid = v_m.student_id THEN
    SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;
    PERFORM public.mentorship_notify(v_other, v_uid, 'You received mentee feedback',
      format('%s rated your mentorship %s/5.', COALESCE(v_me.full_name, 'Your mentee'), p_rating), '/mentorship/' || p_id::text);
  END IF;
  RETURN v_row;
END $$;

-- =====================================================================================================
-- 5. mentor directory (search + stats + match score) - the only way students discover mentors
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.mentor_directory(
  p_q text DEFAULT NULL,
  p_expertise text DEFAULT NULL,
  p_campus text DEFAULT NULL,
  p_only_accepting boolean DEFAULT true,
  p_limit integer DEFAULT 60
) RETURNS TABLE (
  user_id uuid, full_name text, avatar_url text, department text, campus_code text, role text,
  headline text, about text, job_title text, company text, years_experience integer,
  expertise text[], industries text[], session_modes text[], availability jsonb, linkedin_url text,
  is_accepting boolean, max_mentees integer, active_mentees integer, open_slots integer,
  completed_count integer, avg_rating numeric, rating_count integer, match_score integer, my_request_status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_q    text := NULLIF(btrim(COALESCE(p_q, '')), '');
  v_exp  text := NULLIF(btrim(COALESCE(p_expertise, '')), '');
  v_like text;
  v_elike text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_exp IS NOT NULL AND lower(v_exp) IN ('all fields', 'all') THEN v_exp := NULL; END IF;
  v_like  := CASE WHEN v_q  IS NULL THEN NULL ELSE '%' || replace(replace(replace(v_q,  '\', '\\'), '%', '\%'), '_', '\_') || '%' END;
  v_elike := CASE WHEN v_exp IS NULL THEN NULL ELSE '%' || replace(replace(replace(v_exp, '\', '\\'), '%', '\%'), '_', '\_') || '%' END;

  RETURN QUERY
  WITH me AS (
    SELECT lower(COALESCE(p.department, '')) AS dept, p.campus_code AS campus,
           COALESCE((SELECT array_agg(lower(i)) FROM unnest(COALESCE(p.interests, '{}')) i), '{}') AS interests
    FROM public.profiles p WHERE p.id = v_uid
  ),
  base AS (
    SELECT mp.*, p.full_name AS p_name, p.avatar_url AS p_avatar, p.department AS p_dept,
           p.campus_code AS p_campus, p.role::text AS p_role
    FROM public.mentor_profiles mp
    JOIN public.profiles p ON p.id = mp.user_id
    WHERE mp.user_id <> v_uid
      AND (p.verification_status::text = 'verified' OR p.role::text = 'admin')
      AND NOT COALESCE(p.is_suspended, false)
      AND (NOT p_only_accepting OR mp.is_accepting)
      AND (p_campus IS NULL OR upper(p_campus) = 'ALL' OR upper(p.campus_code) = upper(p_campus) OR p.campus_code = 'GLOBAL')
      AND (v_like IS NULL
           OR p.full_name ILIKE v_like OR mp.headline ILIKE v_like OR mp.company ILIKE v_like OR mp.job_title ILIKE v_like
           OR EXISTS (SELECT 1 FROM unnest(mp.expertise) e WHERE e ILIKE v_like))
      AND (v_elike IS NULL
           OR EXISTS (SELECT 1 FROM unnest(mp.expertise || mp.industries) e WHERE e ILIKE v_elike)
           OR p.department ILIKE v_elike OR mp.headline ILIKE v_elike)
  )
  SELECT b.user_id, b.p_name, b.p_avatar, b.p_dept, b.p_campus, b.p_role,
         b.headline, b.about, b.job_title, b.company, b.years_experience,
         b.expertise, b.industries, b.session_modes, b.availability, b.linkedin_url,
         b.is_accepting, b.max_mentees,
         s.active_n::integer, GREATEST(b.max_mentees - s.active_n, 0)::integer,
         s.done_n::integer, r.avg_r, r.n::integer,
         (3 * (SELECT count(*) FROM unnest(b.expertise) e, me
                WHERE lower(e) = ANY (me.interests) OR EXISTS (SELECT 1 FROM unnest(me.interests) i WHERE lower(e) LIKE '%' || i || '%' AND char_length(i) > 2))
          + CASE WHEN (SELECT dept FROM me) <> '' AND lower(COALESCE(b.p_dept, '')) = (SELECT dept FROM me) THEN 2 ELSE 0 END
          + CASE WHEN b.p_campus = (SELECT campus FROM me) THEN 1 ELSE 0 END)::integer,
         (SELECT m2.status FROM public.mentorships m2
           WHERE m2.student_id = v_uid AND m2.mentor_id = b.user_id AND m2.status IN ('pending', 'active')
           ORDER BY m2.created_at DESC LIMIT 1)
  FROM base b
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE m.status = 'active') AS active_n,
           count(*) FILTER (WHERE m.status = 'completed') AS done_n
    FROM public.mentorships m WHERE m.mentor_id = b.user_id) s ON true
  LEFT JOIN LATERAL (
    SELECT round(avg(f.rating)::numeric, 1) AS avg_r, count(*) AS n
    FROM public.mentorship_feedback f JOIN public.mentorships m ON m.id = f.mentorship_id
    WHERE f.to_user = b.user_id AND f.from_user = m.student_id) r ON true
  ORDER BY (GREATEST(b.max_mentees - s.active_n, 0) > 0 AND b.is_accepting) DESC, 24 DESC, r.avg_r DESC NULLS LAST, b.p_name
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 60), 100));
END $$;

-- =====================================================================================================
-- 5b. reading (names come from here because profiles RLS hides people from other campuses)
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.list_my_mentorships(p_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid, student_id uuid, mentor_id uuid, status text, track text, level text, pitch text, goals text,
  cadence text, plan_outline text, document_url text, document_name text, decline_reason text, end_reason text,
  started_at timestamptz, ended_at timestamptz, last_activity_at timestamptz, created_at timestamptz,
  student_name text, student_avatar text, student_department text,
  mentor_name text, mentor_avatar text, mentor_headline text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.student_id, m.mentor_id, m.status, m.track, m.level, m.pitch, m.goals, m.cadence, m.plan_outline,
         m.document_url, m.document_name, m.decline_reason, m.end_reason, m.started_at, m.ended_at,
         m.last_activity_at, m.created_at,
         sp.full_name, sp.avatar_url, sp.department,
         mp.full_name, mp.avatar_url, mpr.headline
  FROM public.mentorships m
  LEFT JOIN public.profiles sp ON sp.id = m.student_id
  LEFT JOIN public.profiles mp ON mp.id = m.mentor_id
  LEFT JOIN public.mentor_profiles mpr ON mpr.user_id = m.mentor_id
  WHERE (m.student_id = auth.uid() OR m.mentor_id = auth.uid()
         OR (p_id IS NOT NULL AND public.auth_profile_role() = 'admin'))
    AND (p_id IS NULL OR m.id = p_id)
  ORDER BY m.last_activity_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.list_mentorship_updates(p_id uuid, p_limit integer DEFAULT 60)
RETURNS TABLE (id uuid, mentorship_id uuid, author_id uuid, author_name text, kind text, body text, link_url text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.mentorship_id, u.author_id, pr.full_name, u.kind, u.body, u.link_url, u.created_at
  FROM public.mentorship_updates u
  LEFT JOIN public.profiles pr ON pr.id = u.author_id
  WHERE u.mentorship_id = p_id AND public.is_mentorship_participant(p_id)
  ORDER BY u.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 60), 200));
$$;

CREATE OR REPLACE FUNCTION public.list_my_mentor_reviews()
RETURNS TABLE (mentorship_id uuid, rating integer, comment text, created_at timestamptz, from_name text, track text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT f.mentorship_id, f.rating, f.comment, f.created_at, pr.full_name, m.track
  FROM public.mentorship_feedback f
  JOIN public.mentorships m ON m.id = f.mentorship_id
  LEFT JOIN public.profiles pr ON pr.id = f.from_user
  WHERE f.to_user = auth.uid() AND f.from_user = m.student_id
  ORDER BY f.created_at DESC
  LIMIT 50;
$$;

-- =====================================================================================================
-- 6. background jobs: expire unanswered requests, remind about sessions
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.expire_stale_mentorship_requests()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT id, student_id, mentor_id FROM public.mentorships
    WHERE status = 'pending' AND created_at < now() - interval '21 days'
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.mentorships
       SET status = 'declined', decline_reason = 'No response within 21 days', ended_at = now(), updated_at = now()
     WHERE id = r.id;
    PERFORM public.mentorship_notify(r.student_id, NULL, 'Mentorship request expired',
      'Your mentor did not reply within 21 days, so the request was closed. You are free to ask someone else.', '/mentorship/' || r.id::text);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.expire_stale_mentorship_requests() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_mentorship_session_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  n integer := 0;
  v_when text;
BEGIN
  FOR r IN
    SELECT s.id, s.scheduled_at, s.reminder_24h_sent_at, s.reminder_1h_sent_at, m.id AS mentorship_id, m.student_id, m.mentor_id,
           (s.scheduled_at <= now() + interval '70 minutes') AS is_hour
    FROM public.mentorship_sessions s JOIN public.mentorships m ON m.id = s.mentorship_id
    WHERE s.status = 'confirmed' AND m.status = 'active' AND s.scheduled_at > now()
      AND ((s.scheduled_at <= now() + interval '24 hours' AND s.reminder_24h_sent_at IS NULL AND s.scheduled_at > now() + interval '70 minutes')
        OR (s.scheduled_at <= now() + interval '70 minutes' AND s.reminder_1h_sent_at IS NULL))
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    v_when := to_char(r.scheduled_at AT TIME ZONE 'Africa/Lagos', 'Dy DD Mon "at" HH24:MI');
    PERFORM public.mentorship_notify(r.student_id, NULL, CASE WHEN r.is_hour THEN 'Session starting soon' ELSE 'Upcoming session' END,
      format('Your mentorship session is %s.', v_when), '/mentorship/' || r.mentorship_id::text);
    PERFORM public.mentorship_notify(r.mentor_id, NULL, CASE WHEN r.is_hour THEN 'Session starting soon' ELSE 'Upcoming session' END,
      format('Your mentorship session is %s.', v_when), '/mentorship/' || r.mentorship_id::text);
    IF r.is_hour THEN
      UPDATE public.mentorship_sessions SET reminder_1h_sent_at = now(), reminder_24h_sent_at = COALESCE(reminder_24h_sent_at, now()) WHERE id = r.id;
    ELSE
      UPDATE public.mentorship_sessions SET reminder_24h_sent_at = now() WHERE id = r.id;
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.send_mentorship_session_reminders() FROM PUBLIC, anon, authenticated;

DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('lioris_expire_mentorship_requests', '13 4 * * *',  'SELECT public.expire_stale_mentorship_requests()'),
      ('lioris_mentorship_reminders',       '*/10 * * * *', 'SELECT public.send_mentorship_session_reminders()')
    ) AS j(name, schedule, cmd)
  LOOP
    BEGIN
      BEGIN
        PERFORM cron.unschedule(r.name);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
      PERFORM cron.schedule(r.name, r.schedule, r.cmd);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not schedule cron job %: %', r.name, SQLERRM;
    END;
  END LOOP;
END
$do$;

-- =====================================================================================================
-- 7. grants
-- =====================================================================================================
REVOKE ALL ON FUNCTION
  public.request_mentorship(uuid, text, text, text, text, text, text, text, text),
  public.respond_mentorship(uuid, text, text),
  public.end_mentorship(uuid, text, text),
  public.propose_mentorship_session(uuid, timestamptz, integer, text, text, text),
  public.respond_mentorship_session(uuid, text, text),
  public.post_mentorship_update(uuid, text, text, text),
  public.submit_mentorship_feedback(uuid, integer, text),
  public.mentor_directory(text, text, text, boolean, integer),
  public.is_mentorship_participant(uuid),
  public.list_my_mentorships(uuid),
  public.list_mentorship_updates(uuid, integer),
  public.list_my_mentor_reviews()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.request_mentorship(uuid, text, text, text, text, text, text, text, text),
  public.respond_mentorship(uuid, text, text),
  public.end_mentorship(uuid, text, text),
  public.propose_mentorship_session(uuid, timestamptz, integer, text, text, text),
  public.respond_mentorship_session(uuid, text, text),
  public.post_mentorship_update(uuid, text, text, text),
  public.submit_mentorship_feedback(uuid, integer, text),
  public.mentor_directory(text, text, text, boolean, integer),
  public.is_mentorship_participant(uuid),
  public.list_my_mentorships(uuid),
  public.list_mentorship_updates(uuid, integer),
  public.list_my_mentor_reviews()
TO authenticated;

-- Live updates for the mentorship space.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mentorship_sessions', 'mentorship_updates', 'mentorship_goals'] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
    END;
  END LOOP;
END $$;
