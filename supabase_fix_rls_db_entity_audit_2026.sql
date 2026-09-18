-- DB-entity RLS audit fixes (Coverage Ledger, 2026-09-18).
-- Every change below was found by running the policies as real roles inside
-- rolled-back transactions; see the ledger notes for the exact reproduction.

-- 1. chat_channel_members: any authenticated user could insert THEMSELVES into any
--    channel by id (auth.uid() = user_id branch) and then read its chat_messages.
--    Only existing members (or admins) may add members. New channels still work:
--    handle_new_chat_channel() enrolls the creator, who then adds the other party.
DROP POLICY IF EXISTS "Users can join or add members to channels" ON public.chat_channel_members;
CREATE POLICY "Members or admins can add members to channels"
  ON public.chat_channel_members FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_channel_member(channel_id) OR public.auth_profile_role() = 'admin')
    AND NOT COALESCE((SELECT is_suspended FROM public.profiles WHERE id = auth.uid()), false)
  );

-- 2. connections: the requester could accept their own request, and could re-point
--    recipient_id at themselves first. Lock both party columns; a requester-only actor
--    may only (re)set status to 'pending'.
CREATE OR REPLACE FUNCTION public.enforce_connection_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_role text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT role::text INTO v_role FROM profiles WHERE id = auth.uid();
    IF v_role IS DISTINCT FROM 'admin' THEN
      NEW.requester_id := OLD.requester_id;
      NEW.recipient_id := OLD.recipient_id;
      IF NEW.status IS DISTINCT FROM OLD.status
         AND auth.uid() = OLD.requester_id AND auth.uid() <> OLD.recipient_id
         AND COALESCE(NEW.status, '') <> 'pending' THEN
        NEW.status := OLD.status;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_connection_authority ON public.connections;
CREATE TRIGGER trg_enforce_connection_authority BEFORE UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_connection_authority();

-- 3. mentorships: same class of bug - the mentee could set their own request 'active'.
CREATE OR REPLACE FUNCTION public.enforce_mentorship_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_role text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT role::text INTO v_role FROM profiles WHERE id = auth.uid();
    IF v_role IS DISTINCT FROM 'admin' THEN
      NEW.student_id := OLD.student_id;
      NEW.mentor_id := OLD.mentor_id;
      IF NEW.status IS DISTINCT FROM OLD.status
         AND auth.uid() = OLD.student_id AND auth.uid() <> OLD.mentor_id
         AND NEW.status = 'active' THEN
        NEW.status := OLD.status;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_mentorship_authority ON public.mentorships;
CREATE TRIGGER trg_enforce_mentorship_authority BEFORE UPDATE ON public.mentorships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mentorship_authority();

-- 4. notifications: non-staff could send 'announcement' / 'system_announcement' typed
--    notifications to any user (official-looking spoof). Staff/admin are unaffected.
DROP POLICY IF EXISTS "Admins or authentic senders can create notifications" ON public.notifications;
CREATE POLICY "Admins or authentic senders can create notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = ANY (ARRAY['admin'::user_role_type, 'staff'::user_role_type]))
    OR (
      (auth.uid() = sender_id OR auth.uid() = recipient_id)
      AND NOT COALESCE((SELECT is_suspended FROM public.profiles WHERE id = auth.uid()), false)
      AND COALESCE(type, '') NOT IN ('announcement', 'system_announcement')
    )
  );

-- 5. events: (a) pending_approval events were readable by every user on the campus;
--    now only the creator and staff/admin can see them until approved.
DROP POLICY IF EXISTS "Events viewable by campus or global" ON public.events;
CREATE POLICY "Events viewable by campus or global"
  ON public.events FOR SELECT TO authenticated
  USING (
    creator_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles
               WHERE id = auth.uid() AND role = ANY (ARRAY['admin'::user_role_type, 'staff'::user_role_type]))
    OR (
      status <> 'pending_approval'::event_status_type
      AND (
        visibility_scope = 'global'::visibility_scope_type
        OR campus_code = 'GLOBAL'
        OR campus_code = (SELECT campus_code FROM public.profiles WHERE id = auth.uid())
      )
    )
  );

--    (b) creators could set is_spotlight / registered_count on their own events.
--    registered_count is maintained by sync_event_rsvps_count() (nested trigger,
--    pg_trigger_depth() > 1), so only top-level writes are reverted.
CREATE OR REPLACE FUNCTION public.enforce_event_privileged_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_role text; v_campus text;
BEGIN
  IF auth.uid() IS NOT NULL AND pg_trigger_depth() = 1 THEN
    SELECT role::text, campus_code INTO v_role, v_campus FROM profiles WHERE id = auth.uid();
    IF NOT (v_role = 'admin' OR (v_role = 'staff' AND v_campus = NEW.campus_code)) THEN
      IF TG_OP = 'INSERT' THEN
        NEW.is_spotlight := false;
        NEW.registered_count := 0;
      ELSE
        NEW.is_spotlight := OLD.is_spotlight;
        NEW.registered_count := OLD.registered_count;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_event_privileged_columns ON public.events;
CREATE TRIGGER trg_enforce_event_privileged_columns BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_privileged_columns();

-- 6. announcements: campus staff could publish to any other campus and to GLOBAL.
--    Staff may now only publish to their own campus; admins are unrestricted.
DROP POLICY IF EXISTS "Admins and staff can publish announcements" ON public.announcements;
CREATE POLICY "Admins and staff can publish announcements"
  ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'admin'::user_role_type
             OR (p.role = 'staff'::user_role_type AND announcements.campus_code = p.campus_code))
    )
  );
