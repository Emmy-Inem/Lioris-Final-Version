-- ============================================================================
-- LIORIS - EVENTS ADMIN POLICY & AUDIT FIX 2026
-- ============================================================================

-- 1. Ensure Admins have full access to manage all events across all campuses
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'events' AND policyname = 'Admins have full access to events'
    ) THEN
        CREATE POLICY "Admins have full access to events" ON events
            FOR ALL TO authenticated
            USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
            WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
    END IF;
END $$;

-- 2. Ensure Admins have full access to manage event attendees
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'event_attendees' AND policyname = 'Admins have full access to event attendees'
    ) THEN
        CREATE POLICY "Admins have full access to event attendees" ON event_attendees
            FOR ALL TO authenticated
            USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
            WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
    END IF;
END $$;

-- 3. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
