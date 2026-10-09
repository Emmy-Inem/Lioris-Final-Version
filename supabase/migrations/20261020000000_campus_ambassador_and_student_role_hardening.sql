-- ============================================================================
-- LIORIS - CAMPUS AMBASSADOR ADMIN & STUDENT ROLE HARDENING
-- ============================================================================
-- 1. Campus Ambassador Administration:
--    - Hardens `public.set_campus_ambassador_status(p_user_id, p_is_ambassador)`.
--    - Super Admin retains unrestricted global authority across all campuses.
--    - Campus Admins are strictly scoped to students in their own campus node.
--    - Rejects appointing suspended users or non-students (staff/alumni/admin).
--    - Raises explicit, descriptive error codes.
--
-- 2. Student Verification & Study Pods:
--    - Ensures `public.is_profile_verified(p_user_id)` is available across environments.
--    - Updates `public.create_study_group` to use `public.is_profile_verified(v_uid)`
--      so students with verified institutional `.edu.ng` emails are not blocked.
--
-- 3. Student Mentorship Document Attachments & Constraints:
--    - Updates `mentorships_text_limits_chk` to allow Supabase storage paths
--      alongside `https://` URLs.
--    - Updates `public.request_mentorship` to accept Supabase storage paths
--      (`<uuid>/<filename>`) alongside `https://` URLs for document attachments.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. HARDEN set_campus_ambassador_status RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_campus_ambassador_status(
    p_user_id UUID,
    p_is_ambassador BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_admin_role TEXT;
    v_caller_campus TEXT;
    v_caller_email TEXT;
    v_target_role TEXT;
    v_target_campus TEXT;
    v_target_suspended BOOLEAN;
    v_is_super_admin BOOLEAN;
BEGIN
    IF auth.uid() IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    -- Fetch caller info
    SELECT LOWER(COALESCE(p.role::text, '')),
           COALESCE(p.admin_role, ''),
           COALESCE(p.campus_code, ''),
           LOWER(COALESCE(p.email, ''))
    INTO v_caller_role, v_caller_admin_role, v_caller_campus, v_caller_email
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF v_caller_role NOT IN ('admin', 'staff') AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    v_is_super_admin := (v_caller_admin_role = 'super_admin')
                        OR (v_caller_email = 'inememmanuel@gmail.com')
                        OR (auth.role() = 'service_role');

    -- Fetch target user info
    SELECT LOWER(COALESCE(p.role::text, '')),
           COALESCE(p.campus_code, ''),
           COALESCE(p.is_suspended, FALSE)
    INTO v_target_role, v_target_campus, v_target_suspended
    FROM public.profiles p
    WHERE p.id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;

    -- Target must be a student (or non-admin/non-staff)
    IF v_target_role <> 'student' THEN
        RAISE EXCEPTION 'invalid_target_role: Only student accounts can be appointed as Campus Ambassadors';
    END IF;

    -- Suspended users cannot be appointed
    IF p_is_ambassador AND v_target_suspended THEN
        RAISE EXCEPTION 'cannot_appoint_suspended_user: Suspended students cannot be appointed as Campus Ambassadors';
    END IF;

    -- Campus Admin / Staff scope check: must belong to the caller's campus node
    IF NOT v_is_super_admin THEN
        IF v_caller_campus IS NOT NULL AND v_caller_campus <> 'GLOBAL' AND v_caller_campus <> '' THEN
            IF v_target_campus <> v_caller_campus THEN
                RAISE EXCEPTION 'unauthorized_campus_scope: Campus admins can only manage ambassadors within their own campus';
            END IF;
        END IF;
    END IF;

    UPDATE public.profiles
    SET is_campus_ambassador = p_is_ambassador
    WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_campus_ambassador_status(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_campus_ambassador_status(UUID, BOOLEAN) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. ENSURE is_profile_verified FUNCTION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_profile_verified(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND (
        p.role::text IN ('admin', 'staff')
        OR p.verification_status::text = 'verified'
        OR (p.email ~* '\.edu\.ng$' AND p.verification_status::text <> 'rejected')
        OR COALESCE(p.is_bot, FALSE) = TRUE
      )
      AND COALESCE(p.is_suspended, FALSE) = FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.is_profile_verified(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_profile_verified(UUID) TO authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- 3. UPDATE create_study_group VERIFICATION CHECK
-- ----------------------------------------------------------------------------
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
  v_topics text[] := COALESCE(p_topics, '{}');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR COALESCE(v_me.is_suspended, false) THEN RAISE EXCEPTION 'account_suspended'; END IF;

  -- Allow verified students OR verified institutional (.edu.ng) students
  IF NOT public.is_profile_verified(v_uid) THEN
    RAISE EXCEPTION 'verification_required: please verify your student status to host a study group';
  END IF;

  IF p_name IS NULL OR length(btrim(p_name)) < 3 THEN
    RAISE EXCEPTION 'invalid_input: group name must be at least 3 characters';
  END IF;
  IF length(p_name) > 80 THEN
    RAISE EXCEPTION 'invalid_input: group name cannot exceed 80 characters';
  END IF;

  IF p_max_members IS NOT NULL AND (p_max_members < 2 OR p_max_members > 100) THEN
    RAISE EXCEPTION 'invalid_input: max members must be between 2 and 100';
  END IF;

  v_camp := CASE WHEN v_me.role::text = 'admin' AND NULLIF(btrim(COALESCE(p_campus, '')), '') IS NOT NULL THEN upper(btrim(p_campus))
                 ELSE COALESCE(v_me.campus_code, 'GLOBAL') END;

  INSERT INTO public.study_groups
    (creator_id, campus_code, name, course_code, description, meeting_link, max_members, is_private,
     level, department, topics, schedule_note, goal)
  VALUES
    (v_uid, v_camp, btrim(p_name), upper(NULLIF(btrim(COALESCE(p_course_code, '')), '')),
     NULLIF(btrim(COALESCE(p_description, '')), ''), NULLIF(btrim(COALESCE(p_meeting_link, '')), ''),
     COALESCE(p_max_members, 20), COALESCE(p_is_private, false),
     NULLIF(btrim(COALESCE(p_level, '')), ''), NULLIF(btrim(COALESCE(p_department, '')), ''), v_topics,
     NULLIF(btrim(COALESCE(p_schedule_note, '')), ''), NULLIF(btrim(COALESCE(p_goal, '')), ''))
  RETURNING * INTO v_row;
  INSERT INTO public.study_group_members (group_id, user_id, role, status) VALUES (v_row.id, v_uid, 'owner', 'active');
  RETURN v_row;
END $$;

-- ----------------------------------------------------------------------------
-- 4. UPDATE mentorships_text_limits_chk CONSTRAINT
-- ----------------------------------------------------------------------------
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
  AND (
    document_url IS NULL
    OR (
      (document_url ~* '^https?://' OR document_url ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9_.-]+$')
      AND char_length(document_url) <= 1000
    )
  )
);

-- ----------------------------------------------------------------------------
-- 5. UPDATE request_mentorship FOR STORAGE PATH DOCUMENT ATTACHMENTS
-- ----------------------------------------------------------------------------
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
  v_doc    text := NULLIF(btrim(COALESCE(p_document_url, '')), '');
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

  -- Accept both https:// URLs and Supabase storage paths (UUID/filename)
  IF v_doc IS NOT NULL THEN
    IF v_doc !~* '^https?://'
       AND v_doc !~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9_.-]+$' THEN
      RAISE EXCEPTION 'invalid_input: the attached document link is not valid';
    END IF;
  END IF;

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
     NULLIF(btrim(COALESCE(p_plan_outline, '')), ''), v_doc,
     NULLIF(btrim(COALESCE(p_document_name, '')), ''))
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

COMMIT;
