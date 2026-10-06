-- Migration: Add Enugu State University of Science and Technology (ESUT),
-- Portal Links, Discussion Spaces, Seed Resources, Resource Campus Isolation & RLS Security Hardening

-- =====================================================================================================
-- 1. Campuses: Add ESUT (Enugu State University of Science and Technology)
-- =====================================================================================================

INSERT INTO public.campuses (code, name, short_name, location, primary_color, email_domains, website_url, is_active)
VALUES
  ('ESUT', 'Enugu State University of Science and Technology', 'ESUT', 'Agbani, Enugu', '#0D9488', ARRAY['esut.edu.ng'], 'https://esut.edu.ng/', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  location = EXCLUDED.location,
  primary_color = EXCLUDED.primary_color,
  email_domains = EXCLUDED.email_domains,
  website_url = EXCLUDED.website_url,
  is_active = true;

-- =====================================================================================================
-- 2. Seed Official Portal Links for ESUT
-- =====================================================================================================

WITH seed_portals (campus_code, title, url, category, icon, display_order) AS (
  VALUES
    ('ESUT', 'ESUT Student Portal', 'https://portal.esut.edu.ng/', 'Academic', 'school-outline', 1),
    ('ESUT', 'ESUT E-Library & Catalog', 'https://library.esut.edu.ng/', 'Library', 'book-outline', 2),
    ('ESUT', 'ESUT Virtual Learning LMS', 'https://lms.esut.edu.ng/', 'Classes', 'laptop-outline', 3),
    ('ESUT', 'ESUT Undergraduate Admissions', 'https://admissions.esut.edu.ng/', 'Admissions', 'document-text-outline', 4),
    ('ESUT', 'ESUT Bursary & Payments', 'https://portal.esut.edu.ng/', 'Finance', 'card-outline', 5),
    ('ESUT', 'ESUT Official University Website', 'https://esut.edu.ng/', 'Central Portal', 'globe-outline', 6)
)
INSERT INTO public.portal_links (campus_code, title, url, category, icon, is_active, display_order)
SELECT s.campus_code, s.title, s.url, s.category, s.icon, true, s.display_order
FROM seed_portals s
WHERE NOT EXISTS (
  SELECT 1 FROM public.portal_links p
  WHERE p.campus_code = s.campus_code AND (lower(p.url) = lower(s.url) OR lower(p.title) = lower(s.title))
);

-- =====================================================================================================
-- 3. Seed Campus Discussion Spaces for ESUT in forum_communities
-- =====================================================================================================

INSERT INTO public.forum_communities (
  slug,
  label,
  category,
  campus_code,
  icon,
  description,
  moderator_badge,
  moderator_title,
  rules,
  banner_color,
  accent_color,
  approval_status
)
VALUES
  (
    'c/esut-tech',
    'ESUT Tech & Engineering Hub',
    'Tech & Innovation',
    'ESUT',
    'code-slash',
    'Official engineering, software, robotics, and innovation space for ESUT Agbani scholars.',
    'Engineering Faculty Lead',
    'Faculty of Engineering Representatives',
    ARRAY['Share code snippets and project documentation.', 'Respect fellow engineering colleagues.', 'No unauthorized test solution leaks.'],
    '#0D9488',
    '#0F766E',
    'approved'
  ),
  (
    'c/esut-scholars',
    'ESUT Scholars & Research Desk',
    'Academic & Research',
    'ESUT',
    'school-outline',
    'Academic discussions, course syllabus reviews, seminar schedules, and peer study groups.',
    'Academic Moderator',
    'Faculty Senate & Student Representatives',
    ARRAY['Strictly academic discussions.', 'Cite sources for papers and notes.', 'Be constructive and supportive.'],
    '#0369A1',
    '#0284C7',
    'approved'
  ),
  (
    'c/esut-lifestyle',
    'ESUT Agbani Campus Life',
    'Campus Life',
    'ESUT',
    'sparkles-outline',
    'Hostel life in Agbani, campus transport, matriculation events, and student social gatherings.',
    'Campus Life Council',
    'Student Union Government ESUT',
    ARRAY['Keep discussions civil.', 'No unverified rumors or misinformation.', 'Promote campus community unity.'],
    '#7C3AED',
    '#6D28D9',
    'approved'
  )
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  campus_code = EXCLUDED.campus_code,
  approval_status = 'approved';

-- =====================================================================================================
-- 4. Fix Legacy Seeded Resources: Reassign FUNAAB and NOUN resources from 'GLOBAL' to actual campuses
-- =====================================================================================================

UPDATE public.resources
SET campus_code = 'FUNAAB'
WHERE (campus_code = 'GLOBAL' OR campus_code IS NULL)
  AND (
    file_url ILIKE '%funaab.edu.ng%'
    OR description ILIKE '%funaab%'
    OR course_title ILIKE '%funaab%'
  );

UPDATE public.resources
SET campus_code = 'NOUN'
WHERE (campus_code = 'GLOBAL' OR campus_code IS NULL)
  AND (
    file_url ILIKE '%nou.edu.ng%'
    OR description ILIKE '%noun%'
    OR description ILIKE '%national open university%'
    OR course_title ILIKE '%national open university%'
  );

-- =====================================================================================================
-- 5. Seed Initial Academic Resources for ESUT
-- =====================================================================================================

DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id
  FROM public.profiles
  WHERE email = 'inememmanuel@gmail.com' OR role = 'admin'
  ORDER BY (CASE WHEN email = 'inememmanuel@gmail.com' THEN 0 ELSE 1 END), created_at ASC
  LIMIT 1;

  IF v_admin_id IS NOT NULL THEN
    INSERT INTO public.resources (
      uploader_id,
      campus_code,
      course_code,
      course_title,
      title,
      description,
      resource_type,
      file_url,
      file_mime_type,
      semester,
      academic_year,
      is_approved,
      downloads_count,
      upvotes_count
    ) VALUES
    (
      v_admin_id,
      'ESUT',
      'ENG 201',
      'Engineering Mathematics I',
      'ENG 201: Engineering Mathematics I — Courseware & Solved Examples',
      'Differential equations, Laplace transforms, and vector calculus lecture notes from ESUT Faculty of Engineering.',
      'lecture_note',
      'https://esut.edu.ng/resources/ENG201_Engineering_Mathematics_I.pdf',
      'application/pdf',
      'First Semester',
      '2025/2026',
      TRUE,
      0,
      0
    ),
    (
      v_admin_id,
      'ESUT',
      'CSC 201',
      'Computer Science',
      'CSC 201: Introduction to Computer Programming — Course Notes & Lab Manual',
      'C++ and Python fundamentals, control structures, and object-oriented programming handout from ESUT FANS.',
      'lecture_note',
      'https://esut.edu.ng/resources/CSC201_Programming_Course_Notes.pdf',
      'application/pdf',
      'First Semester',
      '2025/2026',
      TRUE,
      0,
      0
    ),
    (
      v_admin_id,
      'ESUT',
      'FMS 201',
      'Management Sciences',
      'FMS 201: Principles of Management — Comprehensive Study Pack',
      'Management theories, organizational design, and business ethics from ESUT Faculty of Management Sciences.',
      'lecture_note',
      'https://esut.edu.ng/resources/FMS201_Principles_of_Management.pdf',
      'application/pdf',
      'First Semester',
      '2025/2026',
      TRUE,
      0,
      0
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- =====================================================================================================
-- 6. Resource Isolation & RLS Security Hardening: Only Super Admin Can View All Campuses
-- =====================================================================================================

DROP POLICY IF EXISTS "Resources viewable if approved and matching campus or global or owner or admin or staff" ON public.resources;
DROP POLICY IF EXISTS "resources_select_policy" ON public.resources;

CREATE POLICY "Resources viewable if approved and matching campus or global or owner or admin or staff" ON public.resources
FOR SELECT TO authenticated
USING (
  -- 1. Uploader can always see their own uploaded resources
  uploader_id = auth.uid()
  OR
  -- 2. Super Administrators can view all resources across all campuses
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        email = 'inememmanuel@gmail.com'
        OR admin_role = 'super_admin'
        OR (role = 'admin' AND campus_code = 'GLOBAL')
      )
  )
  OR
  -- 3. Campus Admin and Staff can manage/view resources belonging to their assigned campus
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'staff')
      AND campus_code = resources.campus_code
  )
  OR
  -- 4. Approved resources: Users only see resources of their own campus or true GLOBAL resources
  (
    is_approved = TRUE
    AND (
      resources.campus_code = 'GLOBAL'
      OR resources.campus_code = (
        SELECT campus_code FROM public.profiles WHERE id = auth.uid()
      )
    )
  )
);
