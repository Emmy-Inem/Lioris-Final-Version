-- Add Jigawa State Institute of Information Technology (JSIIT), Kazaure, as a complete, active Lioris campus.
-- The institute now trades as Jigawa State Polytechnic for Information and Communication Technology (JSPICT);
-- its live email domain is jspict.edu.ng (verified in DNS). jsiit.edu.ng does not exist, so it is NOT used.
-- Only official services are seeded; no placeholder resources or events are created.

INSERT INTO public.campuses (
  code, name, short_name, location, primary_color, email_domains, website_url, is_active
)
VALUES (
  'JSIIT',
  'Jigawa State Institute of Information Technology (JSPICT)',
  'JSIIT',
  'Kazaure, Jigawa',
  '#166534',
  ARRAY['jspict.edu.ng'],
  'https://www.jspict.edu.ng',
  true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  location = EXCLUDED.location,
  primary_color = EXCLUDED.primary_color,
  email_domains = EXCLUDED.email_domains,
  website_url = EXCLUDED.website_url,
  is_active = true;

WITH seed_portals (campus_code, title, url, category, icon, display_order) AS (
  VALUES
    ('JSIIT', 'Students Portal', 'https://www.students.jspict.edu.ng/', 'Academic', 'school-outline', 1),
    ('JSIIT', 'Digital Library', 'https://elibrary.jspict.edu.ng/Index.html', 'Library', 'book-outline', 2),
    ('JSIIT', 'Admission & Application Portal', 'https://application.jspict.edu.ng/', 'Admissions', 'document-text-outline', 3),
    ('JSIIT', 'Hostel Allocation', 'https://www.hostel.jspict.edu.ng/', 'Housing', 'home-outline', 4),
    ('JSIIT', 'Alumni Portal', 'https://www.alumni.jspict.edu.ng/', 'Alumni', 'people-outline', 5),
    ('JSIIT', 'Staff Portal', 'https://hrm.jspict.edu.ng/', 'Staff', 'briefcase-outline', 6),
    ('JSIIT', 'Official Website', 'https://www.jspict.edu.ng', 'Central Portal', 'globe-outline', 7)
)
INSERT INTO public.portal_links (campus_code, title, url, category, icon, is_active, display_order)
SELECT campus_code, title, url, category, icon, true, display_order
FROM seed_portals s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.portal_links p
  WHERE p.campus_code = s.campus_code
    AND (lower(p.url) = lower(s.url) OR lower(p.title) = lower(s.title))
);

INSERT INTO public.forum_communities (
  slug, label, category, campus_code, icon, description,
  moderator_badge, moderator_title, rules, banner_color, accent_color, approval_status
)
VALUES
  (
    'c/jsiit-academics',
    'JSIIT Academic Exchange',
    'Academic & Research',
    'JSIIT',
    'school-outline',
    'Course discussions, study circles and academic support across the Institute''s ND and HND programmes.',
    'Academic Moderator',
    'JSIIT Academic Moderators',
    '["Keep discussions focused on learning.", "Credit authors and sources.", "Do not share restricted assessment material."]'::jsonb,
    '#166534',
    '#15803D',
    'approved'
  ),
  (
    'c/jsiit-campus-life',
    'JSIIT Campus Life',
    'Campus Life',
    'JSIIT',
    'people-outline',
    'Student life, hostel, events and everyday conversations around the Kazaure campus.',
    'Campus Moderator',
    'JSIIT Campus Moderators',
    '["Protect personal information.", "Do not post unverified emergency information.", "Keep conversations respectful."]'::jsonb,
    '#1D4ED8',
    '#2563EB',
    'approved'
  ),
  (
    'c/jsiit-computing-engineering',
    'JSIIT Computing & Engineering',
    'Tech & Innovation',
    'JSIIT',
    'code-slash-outline',
    'Computer Science, Computer Engineering and Electrical/Electronics students: projects, networks, security and competitions.',
    'Innovation Moderator',
    'Computing & Engineering Moderators',
    '["Share reproducible technical details where possible.", "Respect project ownership.", "Keep collaboration constructive."]'::jsonb,
    '#B45309',
    '#D97706',
    'approved'
  ),
  (
    'c/jsiit-careers',
    'JSIIT Careers & SIWES',
    'Career & Jobs',
    'JSIIT',
    'briefcase-outline',
    'SIWES placements, internships, jobs and professional development for JSIIT students and alumni.',
    'Careers Moderator',
    'JSIIT Careers Moderators',
    '["Only share genuine opportunities.", "Never ask applicants for payment.", "Credit the original source."]'::jsonb,
    '#7C3AED',
    '#8B5CF6',
    'approved'
  )
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  campus_code = EXCLUDED.campus_code,
  icon = EXCLUDED.icon,
  description = EXCLUDED.description,
  moderator_badge = EXCLUDED.moderator_badge,
  moderator_title = EXCLUDED.moderator_title,
  rules = EXCLUDED.rules,
  banner_color = EXCLUDED.banner_color,
  accent_color = EXCLUDED.accent_color,
  approval_status = 'approved';

-- A pending request for this institution is now fulfilled.
UPDATE public.waitlist_entries
SET status = 'approved'
WHERE status = 'pending'
  AND (university_name ILIKE '%jigawa%' OR university_name ILIKE '%jspict%' OR university_name ILIKE '%jsiit%');
