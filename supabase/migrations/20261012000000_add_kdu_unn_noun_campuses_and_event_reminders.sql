-- Migration: Add KolaDaisi University (KDU), University of Nigeria Nsukka (UNN),
-- National Open University of Nigeria (NOUN) campuses and event reminders functionality.

-- =====================================================================================================
-- 1. Campuses & Portal Links
-- =====================================================================================================

-- Upsert KDU, UNN, and NOUN in public.campuses
INSERT INTO public.campuses (code, name, short_name, location, primary_color, email_domains, website_url, is_active)
VALUES
  ('KDU', 'KolaDaisi University', 'KDU', 'Ibadan, Oyo', '#1E3A8A', ARRAY['koladaisiuniversity.edu.ng'], 'https://koladaisiuniversity.edu.ng/', true),
  ('UNN', 'University of Nigeria, Nsukka', 'UNN', 'Nsukka, Enugu', '#047857', ARRAY['unn.edu.ng'], 'https://unn.edu.ng/', true),
  ('NOUN', 'National Open University of Nigeria', 'NOUN', 'Abuja (National)', '#0284C7', ARRAY['noun.edu.ng'], 'https://nou.edu.ng/', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  location = EXCLUDED.location,
  primary_color = EXCLUDED.primary_color,
  email_domains = EXCLUDED.email_domains,
  website_url = EXCLUDED.website_url,
  is_active = true;

-- Seed Portal Links for KDU and NOUN
WITH seed (campus_code, title, url, category, icon, display_order) AS (
  VALUES
    ('KDU', 'KDU Student Portal', 'https://koladaisiuniversity.edu.ng/portal/', 'Academic', 'school-outline', 1),
    ('KDU', 'KDU LMS & e-Learning', 'https://lms.koladaisiuniversity.edu.ng/', 'Classes', 'laptop-outline', 2),
    ('KDU', 'KDU University Library', 'https://library.koladaisiuniversity.edu.ng/', 'Library', 'book-outline', 3),
    ('KDU', 'KDU Central University Portal', 'https://koladaisiuniversity.edu.ng/', 'Central Portal', 'globe-outline', 4),
    ('NOUN', 'NOUN Student Portal (PAS)', 'https://www.nouonline.net/', 'Academic', 'school-outline', 1),
    ('NOUN', 'NOUN e-Courseware Library', 'https://nou.edu.ng/courseware/', 'Library', 'book-outline', 2),
    ('NOUN', 'NOUN e-Learn Virtual Campus', 'https://mylearningspace.nou.edu.ng/', 'Classes', 'laptop-outline', 3),
    ('NOUN', 'NOUN Central University Website', 'https://nou.edu.ng/', 'Central Portal', 'globe-outline', 4)
)
INSERT INTO public.portal_links (campus_code, title, url, category, icon, is_active, display_order)
SELECT s.campus_code, s.title, s.url, s.category, s.icon, true, s.display_order
FROM seed s
WHERE NOT EXISTS (
  SELECT 1 FROM public.portal_links p
  WHERE p.campus_code = s.campus_code AND (lower(p.url) = lower(s.url) OR lower(p.title) = lower(s.title))
);

-- =====================================================================================================
-- 2. Event Reminders Backend
-- =====================================================================================================

CREATE TABLE IF NOT EXISTS public.event_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_reminders_user_event_uniq UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_reminders_user_id ON public.event_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_event_id ON public.event_reminders(event_id);

ALTER TABLE public.event_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_reminders_select_own" ON public.event_reminders;
CREATE POLICY "event_reminders_select_own" ON public.event_reminders
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "event_reminders_insert_own" ON public.event_reminders;
CREATE POLICY "event_reminders_insert_own" ON public.event_reminders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "event_reminders_delete_own" ON public.event_reminders;
CREATE POLICY "event_reminders_delete_own" ON public.event_reminders
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- RPC: toggle_event_reminder
CREATE OR REPLACE FUNCTION public.toggle_event_reminder(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated: sign in to set event reminders';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'not_found: event does not exist';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.event_reminders
    WHERE user_id = v_user_id AND event_id = p_event_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.event_reminders
    WHERE user_id = v_user_id AND event_id = p_event_id;
    RETURN jsonb_build_object('reminder_on', false, 'event_id', p_event_id);
  ELSE
    INSERT INTO public.event_reminders (user_id, event_id)
    VALUES (v_user_id, p_event_id);
    RETURN jsonb_build_object('reminder_on', true, 'event_id', p_event_id);
  END IF;
END $$;

-- RPC: get_my_event_reminders
CREATE OR REPLACE FUNCTION public.get_my_event_reminders()
RETURNS TABLE (event_id uuid, created_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT er.event_id, er.created_at
    FROM public.event_reminders er
    WHERE er.user_id = auth.uid()
    ORDER BY er.created_at DESC;
END $$;

GRANT SELECT, INSERT, DELETE ON public.event_reminders TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_event_reminder(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_event_reminders() TO authenticated;
