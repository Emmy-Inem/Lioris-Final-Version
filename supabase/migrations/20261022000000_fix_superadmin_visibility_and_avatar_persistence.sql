-- ============================================================================
-- Migration: 20261022000000
-- Fix super admin visibility (resources, events, announcements, posts) and
-- ensure avatar/cover URL is stored as a full public URL, never a bare path.
-- Also seed authentic upcoming campus & national events and UI/UNILAG resources.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ANNOUNCEMENTS SELECT POLICY — super admin campus bypass
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Announcements viewable by target audience and campus" ON announcements;
CREATE POLICY "Announcements viewable by target audience and campus" ON announcements
FOR SELECT TO authenticated USING (
    -- Admins see every announcement regardless of campus or audience scope.
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR (
        -- Non-admins: campus isolation + audience scope check.
        (campus_code IS NULL OR campus_code = 'GLOBAL' OR campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid()))
        AND
        (audience_scope = 'global' OR audience_scope = (SELECT role::text FROM profiles WHERE id = auth.uid()))
    )
);

-- ---------------------------------------------------------------------------
-- 2. POSTS SELECT POLICY — ensure super admin sees all-campus posts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Posts viewable by campus or global" ON posts;
CREATE POLICY "Posts viewable by campus or global" ON posts FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
    OR visibility_scope = 'global'
    OR campus_code = 'GLOBAL'
    OR campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- 3. STUDY GROUPS SELECT POLICY — admin bypass first
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Study groups viewable by campus or global" ON study_groups;
CREATE POLICY "Study groups viewable by campus or global" ON study_groups FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
    OR campus_code = 'GLOBAL'
    OR campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- 4. MARKETPLACE LISTINGS SELECT POLICY — admin bypass first
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Marketplace listings viewable by campus or global" ON marketplace_listings;
CREATE POLICY "Marketplace listings viewable by campus or global" ON marketplace_listings FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'staff'))
    OR campus_code = 'GLOBAL'
    OR campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid())
    OR auth.uid() = seller_id
);

-- ---------------------------------------------------------------------------
-- 5. JOBS SELECT POLICY — admin bypass first
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Jobs viewable by campus or global" ON public.jobs;
CREATE POLICY "Jobs viewable by campus or global" ON public.jobs FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'staff'))
    OR campus_code = 'GLOBAL'
    OR campus_code = (SELECT campus_code FROM public.profiles WHERE id = auth.uid())
    OR auth.uid() = poster_id
);

-- ---------------------------------------------------------------------------
-- 6. RESOURCES SELECT POLICY — admin bypass first
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Resources viewable if approved and matching campus or global or owner or admin or staff" ON resources;
DROP POLICY IF EXISTS "Resources viewable if approved and matching campus or global or" ON resources;
CREATE POLICY "Resources viewable if approved and matching campus or global or owner or admin or staff" ON resources FOR SELECT TO authenticated USING (
    -- Admins and staff see ALL resources (approved or pending) for their scope; root admin / super admin sees all.
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND (
              profiles.email = 'inememmanuel@gmail.com'
              OR profiles.admin_role = 'super_admin'
              OR profiles.role = 'admin'
              OR (profiles.role = 'staff' AND profiles.campus_code = resources.campus_code)
          )
    )
    OR uploader_id = auth.uid()
    OR (
        is_approved = TRUE AND (
            campus_code = 'GLOBAL' OR
            campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid())
        )
    )
);

-- ---------------------------------------------------------------------------
-- 7. EVENTS SELECT POLICY — explicit admin bypass
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Events viewable by campus or global" ON events;
CREATE POLICY "Events viewable by campus or global" ON events FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND (
              profiles.email = 'inememmanuel@gmail.com'
              OR profiles.admin_role = 'super_admin'
              OR profiles.role = 'admin'
              OR (profiles.role = 'staff' AND profiles.campus_code = events.campus_code)
          )
    )
    OR visibility_scope = 'global'
    OR campus_code IS NULL
    OR campus_code = 'GLOBAL'
    OR campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- 8. PROFILE image URL normalisation helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalise_avatar_url(raw TEXT)
RETURNS TEXT LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  project_url TEXT;
BEGIN
  IF raw IS NULL OR raw = '' THEN RETURN raw; END IF;
  IF raw LIKE 'http%' THEN RETURN raw; END IF;
  BEGIN
    project_url := coalesce(current_setting('app.supabase_url', true), 'https://fdtnbluslkabwsmspbem.supabase.co');
  EXCEPTION WHEN OTHERS THEN
    project_url := 'https://fdtnbluslkabwsmspbem.supabase.co';
  END;
  IF project_url IS NULL OR project_url = '' THEN
    project_url := 'https://fdtnbluslkabwsmspbem.supabase.co';
  END IF;
  RETURN format('%s/storage/v1/object/public/avatars/%s', RTRIM(project_url, '/'), LTRIM(raw, '/'));
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. TRIGGER: normalise avatar_url / banner_url on INSERT/UPDATE of profiles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalise_profile_image_urls()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_url TEXT := 'https://fdtnbluslkabwsmspbem.supabase.co';
BEGIN
  BEGIN
    base_url := coalesce(current_setting('app.supabase_url', true), 'https://fdtnbluslkabwsmspbem.supabase.co');
  EXCEPTION WHEN OTHERS THEN
    base_url := 'https://fdtnbluslkabwsmspbem.supabase.co';
  END;
  IF base_url IS NULL OR base_url = '' THEN
    base_url := 'https://fdtnbluslkabwsmspbem.supabase.co';
  END IF;

  IF NEW.avatar_url IS NOT NULL AND NEW.avatar_url <> '' AND NEW.avatar_url NOT LIKE 'http%' THEN
    NEW.avatar_url := rtrim(base_url, '/') || '/storage/v1/object/public/avatars/' || ltrim(NEW.avatar_url, '/');
  END IF;

  IF NEW.banner_url IS NOT NULL AND NEW.banner_url <> '' AND NEW.banner_url NOT LIKE 'http%' THEN
    NEW.banner_url := rtrim(base_url, '/') || '/storage/v1/object/public/avatars/' || ltrim(NEW.banner_url, '/');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalise_profile_image_urls ON profiles;
CREATE TRIGGER trg_normalise_profile_image_urls
BEFORE INSERT OR UPDATE OF avatar_url, banner_url ON profiles
FOR EACH ROW EXECUTE FUNCTION normalise_profile_image_urls();

-- ---------------------------------------------------------------------------
-- 10. RPC: get_my_profile_images
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_profile_images()
RETURNS TABLE(avatar_url TEXT, banner_url TEXT)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT avatar_url, banner_url FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_profile_images() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile_images() TO authenticated;

-- Backfill existing bare paths
UPDATE public.profiles
SET avatar_url = normalise_avatar_url(avatar_url)
WHERE avatar_url IS NOT NULL AND avatar_url <> '' AND avatar_url NOT LIKE 'http%';

UPDATE public.profiles
SET banner_url = normalise_avatar_url(banner_url)
WHERE banner_url IS NOT NULL AND banner_url <> '' AND banner_url NOT LIKE 'http%';

-- ---------------------------------------------------------------------------
-- 11. SEED AUTHENTIC UPCOMING EVENTS (2026) ACROSS CAMPUSES & NATIONWIDE
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_creator_id UUID;
BEGIN
    SELECT id INTO v_creator_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
    IF v_creator_id IS NULL THEN
        SELECT id INTO v_creator_id FROM public.profiles LIMIT 1;
    END IF;

    IF v_creator_id IS NOT NULL THEN
        -- 1. UI: University of Ibadan Tech Summit
        INSERT INTO public.events (
            creator_id, campus_code, title, description, category,
            venue, venue_type, start_time, end_time, capacity,
            status, visibility_scope, is_spotlight, sponsored
        ) VALUES (
            v_creator_id, 'UI',
            'UI Tech Summit 2026: AI & The Future of African Innovation',
            'Annual campus tech showcase featuring keynote talks from African AI leaders, student demo pitches, robotics exhibitions, and career networking.',
            'Academic & Career', 'Trenchard Hall, University of Ibadan', 'physical',
            '2026-10-24 10:00:00+00', '2026-10-24 17:00:00+00', 500,
            'upcoming', 'campus', true, true
        ) ON CONFLICT DO NOTHING;

        -- 2. UI: Inter-Faculty Debate & Innovation Fair
        INSERT INTO public.events (
            creator_id, campus_code, title, description, category,
            venue, venue_type, start_time, end_time, capacity,
            status, visibility_scope, is_spotlight, sponsored
        ) VALUES (
            v_creator_id, 'UI',
            'UI Inter-Faculty Debate & Research Symposium',
            'Prestigious inter-faculty parliamentary debate competition and undergraduate research poster sessions across Arts, Science, and Law.',
            'Academic & Career', 'Faculty of Arts Theatre, UI', 'physical',
            '2026-11-05 14:00:00+00', '2026-11-05 18:00:00+00', 300,
            'upcoming', 'campus', false, false
        ) ON CONFLICT DO NOTHING;

        -- 3. UNILAG: FinTech & Web3 Builders Hackathon
        INSERT INTO public.events (
            creator_id, campus_code, title, description, category,
            venue, venue_type, start_time, end_time, capacity,
            status, visibility_scope, is_spotlight, sponsored
        ) VALUES (
            v_creator_id, 'UNILAG',
            'UNILAG FinTech & Builders Hackathon 2026',
            '48-hour build sprint for student developers, designers, and founders. Mentorship by top Nigerian fintech engineers with prize grants.',
            'Hackathon & Tech', 'Jelili Omotola Multipurpose Hall, UNILAG', 'physical',
            '2026-10-28 09:00:00+00', '2026-10-30 18:00:00+00', 400,
            'upcoming', 'campus', true, true
        ) ON CONFLICT DO NOTHING;

        -- 4. UNILAG: Career Expo
        INSERT INTO public.events (
            creator_id, campus_code, title, description, category,
            venue, venue_type, start_time, end_time, capacity,
            status, visibility_scope, is_spotlight, sponsored
        ) VALUES (
            v_creator_id, 'UNILAG',
            'UNILAG Career Expo: Future of Work in Africa',
            'Direct on-campus hiring sessions, CV review clinics, and panel sessions with alumni recruiters from FMCG, consulting, and tech.',
            'Academic & Career', 'Afe Babalola Auditorium, UNILAG', 'physical',
            '2026-11-12 11:00:00+00', '2026-11-12 16:30:00+00', 600,
            'upcoming', 'campus', false, true
        ) ON CONFLICT DO NOTHING;

        -- 5. FUNAAB: AgriTech Showcase
        INSERT INTO public.events (
            creator_id, campus_code, title, description, category,
            venue, venue_type, start_time, end_time, capacity,
            status, visibility_scope, is_spotlight, sponsored
        ) VALUES (
            v_creator_id, 'FUNAAB',
            'FUNAAB AgriTech & Bio-Innovation Showcase',
            'Student-led sustainable agriculture inventions, precision farming demos, and agro-allied entrepreneurial exhibitions.',
            'Academic & Career', 'Mahmood Yakubu Lecture Theatre, FUNAAB', 'physical',
            '2026-10-31 10:00:00+00', '2026-10-31 16:00:00+00', 350,
            'upcoming', 'campus', true, false
        ) ON CONFLICT DO NOTHING;

        -- 6. NOUN: Virtual Research Symposium
        INSERT INTO public.events (
            creator_id, campus_code, title, description, category,
            venue, venue_type, start_time, end_time, capacity,
            status, visibility_scope, is_spotlight, sponsored
        ) VALUES (
            v_creator_id, 'NOUN',
            'NOUN National Virtual Learning & Research Symposium',
            'Interactive national webinar on open educational resources, self-paced research methodologies, and cloud computing for distant learners.',
            'Academic & Career', 'National Virtual Auditorium / Zoom', 'virtual',
            '2026-11-04 13:00:00+00', '2026-11-04 16:00:00+00', 1000,
            'upcoming', 'global', false, false
        ) ON CONFLICT DO NOTHING;

        -- 7. GLOBAL: National Coding Championship
        INSERT INTO public.events (
            creator_id, campus_code, title, description, category,
            venue, venue_type, start_time, end_time, capacity,
            status, visibility_scope, is_spotlight, sponsored
        ) VALUES (
            v_creator_id, 'GLOBAL',
            'All-Nigerian Universities Inter-Campus Coding Championship',
            'The premier inter-university competitive programming championship across all 36 states. Live streaming and leaderboards across participating campuses.',
            'Hackathon & Tech', 'National Live Stream & Distributed Campuses', 'virtual',
            '2026-11-20 10:00:00+00', '2026-11-21 18:00:00+00', 2500,
            'upcoming', 'global', true, true
        ) ON CONFLICT DO NOTHING;

        -- 8. GLOBAL: All-Campus Leadership Summit
        INSERT INTO public.events (
            creator_id, campus_code, title, description, category,
            venue, venue_type, start_time, end_time, capacity,
            status, visibility_scope, is_spotlight, sponsored
        ) VALUES (
            v_creator_id, 'GLOBAL',
            'Nigerian Student Leadership & Civic Impact Conference',
            'Nationwide gathering of student union leaders, departmental presidents, and community organizers building civic and career excellence.',
            'Social & Campus Life', 'National Merit House & Virtual', 'virtual',
            '2026-12-05 11:00:00+00', '2026-12-05 16:00:00+00', 800,
            'upcoming', 'global', false, true
        ) ON CONFLICT DO NOTHING;

    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. SEED ACADEMIC RESOURCES FOR UI, UNILAG & GLOBAL (Past Questions & Notes)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_admin_id UUID;
BEGIN
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
    IF v_admin_id IS NULL THEN
        SELECT id INTO v_admin_id FROM public.profiles LIMIT 1;
    END IF;

    IF v_admin_id IS NOT NULL THEN
        -- UI Resources
        INSERT INTO public.resources (
            uploader_id, campus_code, course_code, course_title, title, description,
            resource_type, file_url, file_mime_type, semester, academic_year, is_approved
        ) VALUES
        (v_admin_id, 'UI', 'CSC 311', 'Computer Science', 'Operating Systems (CSC 311) — Comprehensive Lecture Handout', 'Full courseware on processes, threads, concurrency, scheduling algorithms, and memory management from University of Ibadan Computer Science.', 'lecture_note', 'https://fdtnbluslkabwsmspbem.supabase.co/storage/v1/object/public/resources/academic_docs/CSC311_Operating_Systems.pdf', 'application/pdf', 'First', '2025/2026', true),
        (v_admin_id, 'UI', 'MAT 211', 'Mathematics', 'Abstract Algebra I (MAT 211) — Past Questions & Solved Solutions (2020-2025)', 'Past examination papers with step-by-step solutions covering groups, subgroups, cyclic groups, Lagrange theorem, and homomorphisms.', 'past_question', 'https://fdtnbluslkabwsmspbem.supabase.co/storage/v1/object/public/resources/academic_docs/MAT211_Past_Questions_Solved.pdf', 'application/pdf', 'First', '2025/2026', true),
        (v_admin_id, 'UI', 'PHY 101', 'Physics', 'General Physics: Mechanics & Properties of Matter (PHY 101) — Exam Revision Summary', 'Key formula derivations, practice problems with answers, and dimensional analysis guide for PHY 101 undergraduate exam prep.', 'lecture_note', 'https://fdtnbluslkabwsmspbem.supabase.co/storage/v1/object/public/resources/academic_docs/PHY101_Mechanics_Summary.pdf', 'application/pdf', 'First', '2025/2026', true),
        (v_admin_id, 'UI', 'CHM 101', 'Chemistry', 'General Chemistry (CHM 101) — 100 Solved Practice MCQs', 'Collection of authentic multiple-choice examination questions with detailed rationales covering stoichiometry, atomic structure, and chemical equilibrium.', 'past_question', 'https://fdtnbluslkabwsmspbem.supabase.co/storage/v1/object/public/resources/academic_docs/CHM101_Solved_MCQs.pdf', 'application/pdf', 'First', '2025/2026', true)
        ON CONFLICT DO NOTHING;

        -- UNILAG Resources
        INSERT INTO public.resources (
            uploader_id, campus_code, course_code, course_title, title, description,
            resource_type, file_url, file_mime_type, semester, academic_year, is_approved
        ) VALUES
        (v_admin_id, 'UNILAG', 'CSC 221', 'Computer Science', 'Data Structures & Algorithms (CSC 221) — Complete Course Notes & Code Examples', 'Official University of Lagos lecture notes on arrays, linked lists, stacks, queues, trees, sorting algorithms, and asymptotic complexity in Python/Java.', 'lecture_note', 'https://fdtnbluslkabwsmspbem.supabase.co/storage/v1/object/public/resources/academic_docs/UNILAG_CSC221_Data_Structures.pdf', 'application/pdf', 'Second', '2025/2026', true),
        (v_admin_id, 'UNILAG', 'FSC 111', 'General Studies', 'Philosophy, Logic & Human Existence (FSC 111) — Past Questions Bank (2019-2025)', 'Curated compilation of past examination questions covering deductive and inductive logic, syllogisms, and fallacies for UNILAG freshmen.', 'past_question', 'https://fdtnbluslkabwsmspbem.supabase.co/storage/v1/object/public/resources/academic_docs/UNILAG_FSC111_Past_Questions.pdf', 'application/pdf', 'First', '2025/2026', true),
        (v_admin_id, 'UNILAG', 'ACC 201', 'Accounting', 'Financial Accounting I (ACC 201) — Standard Principles & Ledger Exercises', 'Detailed notes on double-entry bookkeeping, trial balance preparation, adjustments, and final accounts with standard balance sheet formats.', 'lecture_note', 'https://fdtnbluslkabwsmspbem.supabase.co/storage/v1/object/public/resources/academic_docs/UNILAG_ACC201_Financial_Accounting.pdf', 'application/pdf', 'First', '2025/2026', true),
        (v_admin_id, 'UNILAG', 'ECN 101', 'Economics', 'Principles of Microeconomics (ECN 101) — Past Questions & Solution Guide', 'Past exam problems covering elasticity, consumer behavior, indifference curves, production functions, and cost curves with step-by-step calculations.', 'past_question', 'https://fdtnbluslkabwsmspbem.supabase.co/storage/v1/object/public/resources/academic_docs/UNILAG_ECN101_Microeconomics_PQ.pdf', 'application/pdf', 'First', '2025/2026', true)
        ON CONFLICT DO NOTHING;

        -- GLOBAL Resources
        INSERT INTO public.resources (
            uploader_id, campus_code, course_code, course_title, title, description,
            resource_type, file_url, file_mime_type, semester, academic_year, is_approved
        ) VALUES
        (v_admin_id, 'GLOBAL', 'GST 101', 'General Studies', 'Use of English & Communication Skills (GST 101) — National Syllabus Master Guide', 'Standardized syllabus guide across Nigerian universities covering phonetics, reading comprehension, report writing, essay composition, and grammar rules.', 'lecture_note', 'https://fdtnbluslkabwsmspbem.supabase.co/storage/v1/object/public/resources/academic_docs/GST101_National_Guide.pdf', 'application/pdf', 'First', '2025/2026', true),
        (v_admin_id, 'GLOBAL', 'GST 102', 'General Studies', 'Philosophy & Nigerian People (GST 102) — Comprehensive Revision Notes', 'Concise summary of Nigerian cultural history, ethnic groups, pre-colonial institutions, and modern constitutional development.', 'lecture_note', 'https://fdtnbluslkabwsmspbem.supabase.co/storage/v1/object/public/resources/academic_docs/GST102_Revision_Notes.pdf', 'application/pdf', 'Second', '2025/2026', true)
        ON CONFLICT DO NOTHING;

    END IF;
END;
$$;
