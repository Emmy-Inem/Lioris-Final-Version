-- LIORIS manual SQL, part 6 of 18: 20261102000000_second_pass_audit_fixes.sql
-- Paste this whole file into the Supabase SQL editor and Run. Parts must be run in order; the guard below
-- stops this part if an earlier one is missing. Safe to run twice.
SET lock_timeout = '8s';
SET statement_timeout = '180s';

CREATE TABLE IF NOT EXISTS public._manual_migration_log (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._manual_migration_log ENABLE ROW LEVEL SECURITY;


-- ########## 20261102000000_second_pass_audit_fixes.sql ##########
BEGIN;
DO $chain$ BEGIN IF NOT EXISTS (SELECT 1 FROM public._manual_migration_log WHERE version = '20261101000000') THEN RAISE EXCEPTION 'Stopped: migration 20261101000000 has not been applied. Fix it and re-run this whole file.'; END IF; END $chain$;
-- =============================================================================
-- Second-pass audit fixes (2026-11-02)
-- Issues 1–12 from the second-pass deep-dive audit
-- =============================================================================

-- ---------------------------------------------------------------------------
-- HELPER FUNCTIONS FOR BLOCK ENFORCEMENT (needed by WebRTC and policies)
-- ---------------------------------------------------------------------------

-- Helper: do two users have any block between them?
CREATE OR REPLACE FUNCTION public.users_have_block(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = p_user_a AND blocked_id = p_user_b)
       OR (blocker_id = p_user_b AND blocked_id = p_user_a)
  );
$$;

-- Helper: does a DM channel have an active block between any two members?
CREATE OR REPLACE FUNCTION public.dm_channel_has_block(p_channel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.chat_channel_members a
      JOIN public.chat_channel_members b
        ON a.channel_id = b.channel_id
       AND a.user_id   <> b.user_id
      JOIN public.user_blocks ub
        ON (ub.blocker_id = a.user_id AND ub.blocked_id = b.user_id)
        OR (ub.blocker_id = b.user_id AND ub.blocked_id = a.user_id)
     WHERE a.channel_id = p_channel_id
  );
$$;

-- ---------------------------------------------------------------------------
-- ISSUE 1: notifications INSERT policy – allow all authenticated senders
-- (staff fan-out, peer mentions, marketplace, connections all need this)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "notifications_insert_policy" ON public.notifications;
DROP POLICY IF EXISTS "Admins or authentic senders can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert notifications for themselves" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;

CREATE POLICY "notifications_insert_authenticated"
  ON public.notifications
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND recipient_id IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- ISSUE 2: request_mentorship RPC & mentorships_text_limits_chk
-- Accept both full https:// URLs and bare storage paths (mentorship_docs/...)
-- ---------------------------------------------------------------------------
ALTER TABLE public.mentorships
  DROP CONSTRAINT IF EXISTS mentorships_text_limits_chk;

ALTER TABLE public.mentorships
  ADD CONSTRAINT mentorships_text_limits_chk CHECK (
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
        (document_url ~* '^https?://' OR document_url ~* '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)+$')
        AND char_length(document_url) <= 1000
      )
    )
  );

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
  IF NOT public.is_profile_verified(v_uid) THEN RAISE EXCEPTION 'verification_required: verify your campus account before requesting a mentor'; END IF;
  IF NOT public.has_role_permission('can_access_mentorship') THEN RAISE EXCEPTION 'not_allowed: mentorship requests are currently disabled for your role'; END IF;
  IF p_mentor_id IS NULL OR p_mentor_id = v_uid THEN RAISE EXCEPTION 'invalid_input: choose another person as your mentor'; END IF;

  IF char_length(v_track) < 2 OR char_length(v_track) > 80 THEN RAISE EXCEPTION 'invalid_input: choose what you want help with'; END IF;
  IF v_pitch IS NULL OR char_length(v_pitch) < 20 THEN RAISE EXCEPTION 'invalid_input: tell the mentor a little about yourself (at least 20 characters)'; END IF;
  IF char_length(v_pitch) > 1500 THEN RAISE EXCEPTION 'invalid_input: your introduction is too long (1500 characters max)'; END IF;
  IF p_goals IS NOT NULL AND char_length(p_goals) > 1500 THEN RAISE EXCEPTION 'invalid_input: goals are too long (1500 characters max)'; END IF;
  IF p_plan_outline IS NOT NULL AND char_length(p_plan_outline) > 2000 THEN RAISE EXCEPTION 'invalid_input: the plan is too long (2000 characters max)'; END IF;
  
  -- Accept https:// URLs as well as storage paths (e.g. mentorship_docs/... or resources/...)
  IF p_document_url IS NOT NULL AND p_document_url <> ''
     AND p_document_url !~* '^https?://'
     AND p_document_url !~* '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)+$' THEN
    RAISE EXCEPTION 'invalid_input: the attached document link is not valid';
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
     NULLIF(btrim(COALESCE(p_plan_outline, '')), ''),
     NULLIF(btrim(COALESCE(p_document_url, '')), ''), NULLIF(btrim(COALESCE(p_document_name, '')), ''))
  RETURNING * INTO v_row;

  PERFORM public.mentorship_notify(
    p_mentor_id,
    'Mentorship proposal from ' || COALESCE(NULLIF(btrim(v_me.full_name), ''), 'a student'),
    v_pitch,
    '/mentorship-space/' || v_row.id::text
  );

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- ISSUE 3: notify_new_chat_message trigger – strip internal signal prefixes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_new_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender_name text;
  v_preview     text;
  v_member_id   uuid;
  v_signal_type text;
BEGIN
  IF NEW.sender_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(btrim(full_name), ''), 'Someone')
    INTO v_sender_name
    FROM public.profiles
   WHERE id = NEW.sender_id;

  -- Compute preview: filter out raw signal JSON and call invite text
  IF NEW.content IS NOT NULL AND NEW.content LIKE '__LIORIS_CALL_SIGNAL__:%' THEN
    v_signal_type := split_part(NEW.content, ':', 2);
    IF v_signal_type LIKE '%video%' THEN
      v_preview := '📹 Incoming video call';
    ELSE
      v_preview := '📞 Incoming voice call';
    END IF;
  ELSIF NEW.content IS NOT NULL AND NEW.content LIKE '%[CALL_INVITE]%' THEN
    IF NEW.content LIKE '%Video%' THEN
      v_preview := '📹 Incoming video call';
    ELSE
      v_preview := '📞 Incoming voice call';
    END IF;
  ELSIF NEW.content IS NOT NULL AND NEW.content LIKE '[ATTACHMENT]{%' THEN
    BEGIN
      v_preview := '📎 Sent an attachment: ' || COALESCE(
        (substring(NEW.content FROM '\{.*\}'))::jsonb->>'file_name',
        (substring(NEW.content FROM '\{.*\}'))::jsonb->>'name',
        'a file'
      );
    EXCEPTION WHEN OTHERS THEN
      v_preview := '📎 Sent an attachment';
    END;
  ELSE
    v_preview := left(btrim(COALESCE(NEW.content, '')), 120);
    IF v_preview = '' AND NEW.media_url IS NOT NULL THEN
      v_preview := '📎 Sent an attachment';
    END IF;
  END IF;

  FOR v_member_id IN
    SELECT m.user_id
      FROM public.chat_channel_members m
     WHERE m.channel_id = NEW.channel_id
       AND m.user_id <> NEW.sender_id
       AND NOT EXISTS (
         SELECT 1 FROM public.user_mutes um
         WHERE um.muter_id = m.user_id AND um.muted_id = NEW.sender_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.notifications n
         WHERE n.recipient_id = m.user_id
           AND n.action_url = '/messages/' || NEW.channel_id::text
           AND COALESCE(n.is_read, false) = false
           AND n.created_at > now() - interval '2 minutes'
       )
  LOOP
    INSERT INTO public.notifications (recipient_id, sender_id, title, body, type, action_url, is_read)
    VALUES (
      v_member_id,
      NEW.sender_id,
      'New message from ' || v_sender_name,
      v_preview,
      'message',
      '/messages/' || NEW.channel_id::text,
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_chat_message ON public.chat_messages;
CREATE TRIGGER trg_notify_new_chat_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_chat_message();

-- ---------------------------------------------------------------------------
-- ISSUE 4: reserve_marketplace_listing – require verified profile
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_marketplace_listing(
  p_listing_id UUID,
  p_message    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_buyer   UUID := auth.uid();
  v_listing public.marketplace_listings%ROWTYPE;
BEGIN
  IF v_buyer IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_profile_verified(v_buyer) THEN
    RAISE EXCEPTION 'verification_required: only verified users can reserve marketplace listings';
  END IF;

  SELECT * INTO v_listing
    FROM public.marketplace_listings
   WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing_not_found';
  END IF;

  IF v_listing.seller_id = v_buyer THEN
    RAISE EXCEPTION 'cannot_reserve_own_listing';
  END IF;

  IF v_listing.status <> 'available' THEN
    RAISE EXCEPTION 'listing_not_available: current status is %', v_listing.status;
  END IF;

  UPDATE public.marketplace_listings
     SET status = 'reserved', reserved_by = v_buyer, updated_at = now()
   WHERE id = p_listing_id;

  -- Notify seller
  INSERT INTO public.notifications (
    recipient_id, sender_id, title, body, type, action_url, is_read
  ) VALUES (
    v_listing.seller_id,
    v_buyer,
    'Reservation Request',
    COALESCE(p_message, 'Someone is interested in your listing.'),
    'system',
    '/marketplace-mine',
    false
  )
  ON CONFLICT DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- ISSUE 5: rsvp_study_group_session – allow RSVPs for in-progress sessions
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rsvp_study_group_session(uuid, boolean);
CREATE OR REPLACE FUNCTION public.rsvp_study_group_session(
  p_session UUID,
  p_going   BOOLEAN DEFAULT TRUE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_s    public.study_group_sessions%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_s FROM public.study_group_sessions WHERE id = p_session;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;

  -- Session is over only when scheduled_at + duration has passed
  IF v_s.scheduled_at + (COALESCE(v_s.duration_minutes, 60) * INTERVAL '1 minute') < now() THEN
    RAISE EXCEPTION 'wrong_state: this session has already ended';
  END IF;

  IF v_s.status = 'cancelled' THEN
    RAISE EXCEPTION 'wrong_state: this session was cancelled';
  END IF;

  IF p_going THEN
    INSERT INTO public.study_group_rsvps (session_id, user_id, created_at)
    VALUES (p_session, v_user, now())
    ON CONFLICT (session_id, user_id) DO NOTHING;
  ELSE
    DELETE FROM public.study_group_rsvps
     WHERE session_id = p_session AND user_id = v_user;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- ISSUE 6: chat_channel_members INSERT – block adding a blocked user to a DM
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "chat_channel_members_insert_policy" ON public.chat_channel_members;
DROP POLICY IF EXISTS "Members can join public channels" ON public.chat_channel_members;
DROP POLICY IF EXISTS "chat_channel_members_insert" ON public.chat_channel_members;

CREATE POLICY "chat_channel_members_insert"
  ON public.chat_channel_members
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.chat_channels
        WHERE id = channel_id AND created_by = auth.uid()
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks
      WHERE (blocker_id = auth.uid() AND blocked_id = user_id)
         OR (blocker_id = user_id AND blocked_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- ISSUE 7: can_access_webrtc_topic – add block + active mentorship checks
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_webrtc_topic(p_topic TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user     UUID := auth.uid();
  v_parts    TEXT[];
  v_type     TEXT;
  v_ref_id   UUID;
BEGIN
  IF v_user IS NULL THEN RETURN FALSE; END IF;

  v_parts := string_to_array(p_topic, ':');
  v_type  := v_parts[2];
  BEGIN v_ref_id := v_parts[3]::UUID; EXCEPTION WHEN others THEN RETURN FALSE; END;

  IF v_type = 'dm' OR v_type = 'channel' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.chat_channel_members m
      WHERE m.channel_id = v_ref_id
        AND m.user_id    = v_user
    )
    AND NOT public.dm_channel_has_block(v_ref_id);

  ELSIF v_type = 'mentorship' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.mentorships ms
      WHERE ms.id = v_ref_id
        AND ms.status = 'active'
        AND (ms.student_id = v_user OR ms.mentor_id = v_user)
        AND NOT public.users_have_block(ms.student_id, ms.mentor_id)
    );
  END IF;

  RETURN FALSE;
END;
$$;

-- ---------------------------------------------------------------------------
-- ISSUE 8: mentor_profiles_write_own – require is_profile_verified
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "mentor_profiles_write_own" ON public.mentor_profiles;
DROP POLICY IF EXISTS "Users can write their own mentor profile" ON public.mentor_profiles;

CREATE POLICY "mentor_profiles_write_own"
  ON public.mentor_profiles
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_profile_verified(auth.uid())
  );
INSERT INTO public._manual_migration_log (version) VALUES ('20261102000000') ON CONFLICT (version) DO NOTHING;
COMMIT;
