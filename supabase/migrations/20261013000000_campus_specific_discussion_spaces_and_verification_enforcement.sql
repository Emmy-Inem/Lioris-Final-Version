-- ============================================================================
-- LIORIS - CAMPUS-SPECIFIC DISCUSSION SPACES, CAMPUS AMBASSADORS &
-- UNIVERSAL CONTENT UPLOAD VERIFICATION ENFORCEMENT
-- ============================================================================
-- 1. Campus-Specific Discussion Spaces:
--    Adds `campus_code` column to `public.forum_communities` with foreign key
--    to `campuses(code)`. Seeds tailored, authentic discussion spaces for each
--    campus (UNILAG, UI, FUNAAB, UNN, OAU, CU, KDU, NOUN) so when the global
--    feature is toggled off, spaces are strictly scoped to the student's campus.
--
-- 2. Campus Ambassadors Role & Permissions:
--    Adds `is_campus_ambassador` boolean flag to `public.profiles`.
--    Empowers Campus Ambassadors and Admins to propose/create campus-specific
--    discussion spaces. Hardens `prevent_profile_role_escalation()` so users
--    cannot self-assign ambassador status. Adds RPC `set_campus_ambassador_status()`.
--
-- 3. Universal Content Upload Verification Gate:
--    Defines `public.is_profile_verified(p_user_id uuid)` helper function.
--    Enforces that unverified personal accounts (non-.edu.ng personal emails
--    without an approved student ID) cannot upload or create any content across:
--    - posts / threads
--    - academic resources
--    - events
--    - marketplace listings
--    - study groups / pods
--    - discussion space proposals
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. PROFILES: ADD is_campus_ambassador & HARDEN TRIGGER
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_campus_ambassador BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_campus_ambassador ON public.profiles(is_campus_ambassador)
  WHERE is_campus_ambassador = TRUE;

-- Update trigger function to prevent unauthorized escalation of is_campus_ambassador
CREATE OR REPLACE FUNCTION prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_role VARCHAR(50);
    v_caller_campus VARCHAR(50);
BEGIN
    SELECT role, campus_code INTO v_caller_role, v_caller_campus 
    FROM public.profiles WHERE id = auth.uid();

    -- Allow Admin full authority over all profiles
    IF v_caller_role = 'admin' THEN
        RETURN NEW;
    END IF;

    -- Allow Campus Staff to update is_suspended and verification_status for users in their same campus or when staff has GLOBAL scope
    IF v_caller_role = 'staff' AND (v_caller_campus = OLD.campus_code OR v_caller_campus = 'GLOBAL' OR OLD.campus_code = 'GLOBAL') THEN
        NEW.role := OLD.role;
        NEW.campus_code := OLD.campus_code;
        NEW.is_campus_ambassador := OLD.is_campus_ambassador;
        RETURN NEW;
    END IF;

    -- For regular users / self updates: prevent mutating role, verification, suspension, trust_score, campus_code, is_campus_ambassador
    IF (NEW.role IS DISTINCT FROM OLD.role)
       OR (NEW.verification_status IS DISTINCT FROM OLD.verification_status)
       OR (NEW.is_suspended IS DISTINCT FROM OLD.is_suspended)
       OR (NEW.trust_score IS DISTINCT FROM OLD.trust_score)
       OR (NEW.campus_code IS DISTINCT FROM OLD.campus_code)
       OR (NEW.is_campus_ambassador IS DISTINCT FROM OLD.is_campus_ambassador) THEN
        NEW.role := OLD.role;
        NEW.verification_status := OLD.verification_status;
        NEW.is_suspended := OLD.is_suspended;
        NEW.trust_score := OLD.trust_score;
        NEW.campus_code := OLD.campus_code;
        NEW.is_campus_ambassador := OLD.is_campus_ambassador;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 2. FORUM COMMUNITIES: ADD campus_code COLUMN & INDEX
-- ----------------------------------------------------------------------------

ALTER TABLE public.forum_communities
  ADD COLUMN IF NOT EXISTS campus_code TEXT REFERENCES public.campuses(code) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_forum_communities_campus ON public.forum_communities(campus_code);

-- Existing global baseline spaces default to GLOBAL or NULL
UPDATE public.forum_communities
SET campus_code = 'GLOBAL'
WHERE campus_code IS NULL AND slug IN ('c/all', 'c/tech', 'c/academic', 'c/polls', 'c/housing', 'c/social', 'c/lost-found');

-- ----------------------------------------------------------------------------
-- 3. SEED CAMPUS-SPECIFIC DISCUSSION SPACES (UNILAG, UI, FUNAAB, UNN, OAU, CU, KDU, NOUN)
-- ----------------------------------------------------------------------------

INSERT INTO public.forum_communities (
  slug, label, category, campus_code, description, icon, banner_color, accent_color, moderator_badge, moderator_title, rules, approval_status
) VALUES
  -- UNILAG
  (
    'c/unilag-tech', 'Akoka Tech & Ventures', 'Akoka Tech', 'UNILAG',
    'Yaba and Akoka tech ecosystem, student startups, developer builds, GDSC UNILAG, and hackathons.',
    'code-slash', '#1E40AF', '#2563EB', 'Tech Rep', 'UNILAG Developer Guild',
    '["Share verifiable project links and code context.", "Respect fellow campus developers.", "Zero piracy or cheating on assessments."]'::jsonb,
    'approved'
  ),
  (
    'c/unilag-hostels', 'New Hall & Lagoon Life', 'New Hall & Hostels', 'UNILAG',
    'Hostel life in Moremi, Jaja, Eni Njoku, Mariere, and off-campus accommodation across Akoka and Bariga.',
    'home', '#2563EB', '#1D4ED8', 'Hall Rep', 'Hall Executives & DSA Porters',
    '["No fake agent ads or inspection fees.", "State exact hostel block and room info accurately.", "Be respectful of fellow residents."]'::jsonb,
    'approved'
  ),
  (
    'c/unilag-sug', 'UNILAG SUG & Senate', 'UNILAG SUG', 'UNILAG',
    'Student union governance, senate news, faculty congresses, and official student affairs announcements.',
    'megaphone', '#1E3A8A', '#1E40AF', 'Ambassador', 'UNILAG Campus Ambassadors & SUG Excos',
    '["Maintain constructive dialogue on campus matters.", "Verify announcements before circulating.", "Zero hate speech or defamation."]'::jsonb,
    'approved'
  ),

  -- UI
  (
    'c/ui-scholars', 'First & Best Scholars', 'UI Scholars', 'UI',
    'Academic excellence, faculty seminars, undergraduate research, postgraduate prep, and Kenneth Dike Library.',
    'school', '#047857', '#059669', 'Academic Rep', 'Faculty Council & Academic Ambassadors',
    '["Tag posts with department and course codes.", "Support peers with past question guides.", "Uphold University of Ibadan academic integrity."]'::jsonb,
    'approved'
  ),
  (
    'c/ui-heritage', 'UI Trenchard & Zik Hall', 'UI Campus Life', 'UI',
    'Campus culture, Trenchard Hall, Zik Hall, Tedder, Queen Idia, Kuti, and life around Agbowo & Bodija.',
    'home', '#065F46', '#047857', 'Hall Warden', 'Hall of Residence Committee',
    '["Support constructive hall camaraderie.", "No unverified security alarms.", "Keep accommodation ads transparent."]'::jsonb,
    'approved'
  ),
  (
    'c/ui-tech', 'UI Techies & Devs', 'UI Tech', 'UI',
    'Software engineering, UI/UX, AI, and developer meetups hosted by GDSC UI and student tech guilds.',
    'terminal', '#059669', '#10B981', 'Ambassador', 'UI Google Developer Student Club & Ambassador',
    '["Share code snippets and learning pathways.", "Encourage beginner programmers.", "No exam or test leakage."]'::jsonb,
    'approved'
  ),

  -- FUNAAB
  (
    'c/funaab-agro', 'FUNAAB Agro-Innovators', 'FUNAAB Agro', 'FUNAAB',
    'Agricultural technology, agronomy research, agribusiness ventures, and innovative bio-enterprises at Alabata.',
    'leaf', '#059669', '#10B981', 'Agro Lead', 'FUNAAB Agro Innovation Network',
    '["Discuss sustainable farm models and agricultural research.", "Verify research citations.", "Promote youth in agriculture."]'::jsonb,
    'approved'
  ),
  (
    'c/funaab-hostels', 'Camp & Harmony Living', 'FUNAAB Living', 'FUNAAB',
    'Hostel life in Camp Junction, Isolu, Mawuko, Oluwo, and on-campus hostel allocations.',
    'home', '#047857', '#059669', 'Welfare Rep', 'FUNAAB SUG Welfare Directorate',
    '["Help peers avoid extortionate housing agents.", "Post verified room vacancies.", "Promote community hygiene."]'::jsonb,
    'approved'
  ),
  (
    'c/funaab-tech', 'Alabata Tech Guild', 'Alabata Tech', 'FUNAAB',
    'Engineering, COLPHYS tech projects, campus software developers, and tech competitions.',
    'code-slash', '#065F46', '#059669', 'Ambassador', 'FUNAAB Campus Ambassadors & Dev Leads',
    '["Foster peer technical growth.", "Share free developer workshops.", "No commercial scams."]'::jsonb,
    'approved'
  ),

  -- UNN
  (
    'c/unn-lions', 'Lions & Lionesses Hub', 'UNN Lions', 'UNN',
    'The premier den for Nsukka and UNEC students. Campus fellowship, SUG events, and tradition.',
    'planet', '#B45309', '#D97706', 'Ambassador', 'UNN Campus Ambassadors & SUG',
    '["Restore the dignity of man with respectful discourse.", "Unite both Nsukka and Enugu campuses.", "No derogatory remarks."]'::jsonb,
    'approved'
  ),
  (
    'c/unn-roar-tech', 'Roar Tech & Code Guild', 'UNN Tech', 'UNN',
    'Engineering and Computing at Roar Nigeria Hub, hackathons, open source, and developer bootcamps.',
    'hardware-chip', '#92400E', '#B45309', 'Tech Lead', 'Roar Nigeria Innovation Guild',
    '["Include technical context in dev queries.", "Celebrate student software innovations.", "Zero academic malpractice."]'::jsonb,
    'approved'
  ),
  (
    'c/unn-franco', 'Franco & Hilltop Republic', 'UNN Living', 'UNN',
    'Hostel updates for Franco, Akpabio, Balewa, Bello, Mary Slessor, and Hilltop apartments.',
    'home', '#78350F', '#92400E', 'Hall Rep', 'UNN Hall Affairs Committee',
    '["Maintain hostel safety and peace.", "State rent charges transparently.", "Report hall maintenance needs promptly."]'::jsonb,
    'approved'
  ),

  -- OAU
  (
    'c/oau-intellectuals', 'Great Ife Intellectuals', 'Great Ife', 'OAU',
    'Academic discourse, faculty colloquiums, departmental symposiums, and Hezekiah Oluwasanmi Library.',
    'school', '#7C3AED', '#8B5CF6', 'Ambassador', 'OAU Campus Ambassadors & Academic Board',
    '["Great Ife articulacy and constructive reasoning.", "Cite academic references.", "Maintain academic ethics."]'::jsonb,
    'approved'
  ),
  (
    'c/oau-awo-halls', 'Awo & Angola Halls', 'OAU Living', 'OAU',
    'Hostel culture, Awo Hall, Angola, Mozambique, Fajuyi, Moremi, and student welfare across Ife.',
    'megaphone', '#6D28D9', '#7C3AED', 'Hall Rep', 'Hall Executive Council',
    '["Respect hostel traditions while keeping discourse civil.", "Share verified welfare updates.", "No unauthorized commercial spam."]'::jsonb,
    'approved'
  ),
  (
    'c/oau-tech', 'OAU Devs & Tech Union', 'OAU Tech', 'OAU',
    'Software engineering, product design, GDSC OAU, developer summits, and student startups.',
    'code-slash', '#5B21B6', '#6D28D9', 'Guild Rep', 'OAU Developer Guild & Ambassadors',
    '["Share source code respectfully.", "Encourage collaborative builds.", "No exam leaks."]'::jsonb,
    'approved'
  ),

  -- CU
  (
    'c/cu-hebron', 'Hebron Tech & Innovators', 'CU Tech', 'CU',
    'Software engineering, mobile apps, Hebron Startup Lab builds, and innovative campus technology.',
    'rocket', '#DC2626', '#EF4444', 'Tech Lead', 'CU Hebron Tech Network & Ambassadors',
    '["Maintain high professional standards.", "Celebrate creative technical solutions.", "Adhere strictly to honour code."]'::jsonb,
    'approved'
  ),
  (
    'c/cu-eagles', 'Eagles Academic Guild', 'CU Academics', 'CU',
    'Course revision, study groups, faculty announcements, and academic distinction discussions.',
    'school', '#B91C1C', '#DC2626', 'Ambassador', 'CU Campus Ambassadors & Academic Mentors',
    '["Course numbers in thread titles.", "Support peers through academic challenges.", "Academic excellence without compromise."]'::jsonb,
    'approved'
  ),
  (
    'c/cu-residence', 'CU Hall of Residence', 'CU Residence', 'CU',
    'Peter Hall, Esther Hall, Paul Hall, Lydia Hall, and community life on Covenant University campus.',
    'home', '#991B1B', '#B91C1C', 'Hall Steward', 'Student Leadership Council',
    '["Uphold core values of mutual respect.", "Keep discussions organized.", "Prompt reporting of facilities feedback."]'::jsonb,
    'approved'
  ),

  -- KDU
  (
    'c/kdu-scholars', 'KDU Scholars Network', 'KDU Scholars', 'KDU',
    'Academic symposiums, faculty circulars, departmental updates, and KolaDaisi University library.',
    'school', '#2563EB', '#3B82F6', 'Ambassador', 'KDU Campus Ambassadors',
    '["State departmental subject areas clearly.", "Help peers prepare for exams.", "Strict adherence to academic integrity."]'::jsonb,
    'approved'
  ),
  (
    'c/kdu-tech', 'KDU Tech & Code Circle', 'KDU Tech', 'KDU',
    'Computer science projects, programming labs, web development, and tech career exploration.',
    'code-slash', '#1D4ED8', '#2563EB', 'Dev Lead', 'KDU Developer Circle',
    '["Provide runnable code snippets.", "Ask constructive questions.", "Zero exam malpractice."]'::jsonb,
    'approved'
  ),
  (
    'c/kdu-life', 'KDU Campus & Hostels', 'KDU Living', 'KDU',
    'Hostel living, student cafeteria, social clubs, sports meets, and life around Ibadan-Oyo road.',
    'people', '#1E40AF', '#1D4ED8', 'Welfare Rep', 'KDU Student Welfare Council',
    '["Promote camaraderie and student wellness.", "Respect university rules.", "No unverified rumors."]'::jsonb,
    'approved'
  ),

  -- NOUN
  (
    'c/noun-study-circles', 'NOUN Virtual Study Circles', 'NOUN Circles', 'NOUN',
    'TMA submissions, e-exam preparation, past questions, and virtual study sessions across faculties.',
    'laptop', '#047857', '#10B981', 'Study Facilitator', 'NOUN Peer Study Leads & Ambassadors',
    '["Share genuine TMA review guides and exam strategies.", "Specify faculty and level.", "Zero commercial exam assistance."]'::jsonb,
    'approved'
  ),
  (
    'c/noun-centres', 'NOUN Study Centres Network', 'NOUN Centres', 'NOUN',
    'Updates for Lagos, Abuja Model, Ibadan, Enugu, Port Harcourt, and regional study centres.',
    'business', '#065F46', '#047857', 'Centre Coordinator', 'NOUN Regional Ambassador Network',
    '["Tag posts with your specific Study Centre.", "Share facilitation schedules accurately.", "Keep queries organized."]'::jsonb,
    'approved'
  ),
  (
    'c/noun-tech', 'NOUN Distance Techies', 'NOUN Tech', 'NOUN',
    'Remote programming, virtual laboratories, software engineering, and digital skills development.',
    'code-slash', '#059669', '#34D399', 'Ambassador', 'NOUN Digital Ambassador & Tech Circle',
    '["Share remote tech opportunities.", "Support distance students learning to code.", "Foster open-source collaboration."]'::jsonb,
    'approved'
  )
ON CONFLICT (slug) DO UPDATE SET
  campus_code = EXCLUDED.campus_code,
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  banner_color = EXCLUDED.banner_color,
  accent_color = EXCLUDED.accent_color,
  moderator_badge = EXCLUDED.moderator_badge,
  moderator_title = EXCLUDED.moderator_title,
  rules = EXCLUDED.rules,
  approval_status = EXCLUDED.approval_status;

-- ----------------------------------------------------------------------------
-- 4. VERIFICATION HELPER FUNCTION
-- ----------------------------------------------------------------------------
-- Authoritatively determines whether a user account is verified to upload content.
-- A user is verified if:
--   1. Role is admin or staff
--   2. verification_status is 'verified'
--   3. Email ends with .edu.ng and verification_status is not 'rejected'
--   4. User is an automated seed bot
-- AND account is not suspended.

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
-- 5. SECURE INSERT RLS POLICIES ACROSS ALL CONTENT CREATION TABLES
-- ----------------------------------------------------------------------------

-- Posts (Threads)
DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.posts;
DROP POLICY IF EXISTS "Verified users can create posts" ON public.posts;
CREATE POLICY "Verified users can create posts" ON public.posts
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = author_id AND
  public.is_profile_verified(auth.uid())
);

-- Resources (Past questions, lecture notes, handouts, textbooks)
DROP POLICY IF EXISTS "Users can upload resources" ON public.resources;
DROP POLICY IF EXISTS "Verified users can upload resources" ON public.resources;
CREATE POLICY "Verified users can upload resources" ON public.resources
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = uploader_id AND
  public.is_profile_verified(auth.uid())
);

-- Events (Campus events, seminars, reunions)
DROP POLICY IF EXISTS "Users can create events" ON public.events;
DROP POLICY IF EXISTS "Verified users can create events" ON public.events;
CREATE POLICY "Verified users can create events" ON public.events
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = creator_id AND
  status = 'pending_approval' AND
  public.is_profile_verified(auth.uid())
);

-- Marketplace Listings
DROP POLICY IF EXISTS "Students, staff and admin can create marketplace listings" ON public.marketplace_listings;
DROP POLICY IF EXISTS "Authenticated users can create marketplace listings" ON public.marketplace_listings;
DROP POLICY IF EXISTS "Verified students, staff and admin can create marketplace listings" ON public.marketplace_listings;
CREATE POLICY "Verified students, staff and admin can create marketplace listings" ON public.marketplace_listings
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = seller_id AND
  public.is_profile_verified(auth.uid()) AND
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('student', 'staff', 'admin'))
);

-- Study Groups (Pods)
DROP POLICY IF EXISTS "Users can create study groups" ON public.study_groups;
DROP POLICY IF EXISTS "Verified users can create study groups" ON public.study_groups;
CREATE POLICY "Verified users can create study groups" ON public.study_groups
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = creator_id AND
  public.is_profile_verified(auth.uid())
);

-- Forum Communities (Discussion Spaces) - Campus Ambassadors & Admins only
DROP POLICY IF EXISTS "Authenticated users can propose communities" ON public.forum_communities;
DROP POLICY IF EXISTS "Ambassadors and admins can propose communities" ON public.forum_communities;
CREATE POLICY "Ambassadors and admins can propose communities" ON public.forum_communities
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND
  approval_status = 'pending' AND
  public.is_profile_verified(auth.uid()) AND
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.is_campus_ambassador = TRUE OR p.role IN ('admin', 'staff'))
  )
);

-- ----------------------------------------------------------------------------
-- 6. RPC: set_campus_ambassador_status FOR ADMIN MANAGEMENT
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
BEGIN
    SELECT LOWER(COALESCE(p.role::text, '')) INTO v_caller_role
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF v_caller_role NOT IN ('admin', 'staff') AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    UPDATE public.profiles
    SET is_campus_ambassador = p_is_ambassador
    WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_campus_ambassador_status(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_campus_ambassador_status(UUID, BOOLEAN) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. UPDATE admin_get_user_profiles RPC TO INCLUDE is_campus_ambassador
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_get_user_profiles(TEXT, INT);

CREATE OR REPLACE FUNCTION public.admin_get_user_profiles(
    p_campus_code TEXT DEFAULT NULL,
    p_limit INT DEFAULT 1000
)
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    username TEXT,
    email TEXT,
    role TEXT,
    campus_code TEXT,
    department TEXT,
    student_id_number TEXT,
    verification_status TEXT,
    trust_score NUMERIC,
    is_suspended BOOLEAN,
    last_active_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    is_bot BOOLEAN,
    avatar_url TEXT,
    created_at TIMESTAMPTZ,
    admin_role TEXT,
    is_campus_ambassador BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_admin_role TEXT;
    v_caller_campus TEXT;
    v_effective_campus TEXT;
BEGIN
    SELECT LOWER(COALESCE(p.role::text, '')), LOWER(COALESCE(p.admin_role::text, '')), p.campus_code
    INTO v_caller_role, v_caller_admin_role, v_caller_campus
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF v_caller_role NOT IN ('admin', 'staff') AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    -- Campus Admin is strictly locked to their own campus:
    IF v_caller_role = 'admin' AND v_caller_admin_role = 'campus_admin' AND v_caller_campus IS NOT NULL AND v_caller_campus <> 'GLOBAL' THEN
        v_effective_campus := v_caller_campus;
    ELSIF p_campus_code IS NOT NULL AND p_campus_code <> 'ALL' THEN
        v_effective_campus := p_campus_code;
    ELSE
        v_effective_campus := NULL;
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.full_name::TEXT,
        p.username::TEXT,
        COALESCE(u.email::TEXT, p.email::TEXT) AS email,
        p.role::TEXT,
        p.campus_code::TEXT,
        p.department::TEXT,
        p.student_id_number::TEXT,
        p.verification_status::TEXT,
        p.trust_score,
        COALESCE(p.is_suspended, FALSE) AS is_suspended,
        p.last_active_at,
        p.last_login_at,
        COALESCE(p.is_bot, FALSE) AS is_bot,
        p.avatar_url::TEXT,
        p.created_at,
        p.admin_role::TEXT,
        COALESCE(p.is_campus_ambassador, FALSE) AS is_campus_ambassador
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE (v_effective_campus IS NULL OR p.campus_code = v_effective_campus)
    ORDER BY p.created_at DESC
    LIMIT LEAST(COALESCE(p_limit, 1000), 5000);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_profiles(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_profiles(TEXT, INT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
