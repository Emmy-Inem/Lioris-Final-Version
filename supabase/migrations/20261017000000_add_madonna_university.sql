-- Add Madonna University, Nigeria as a complete, active Lioris campus.
-- Official services only are seeded; no placeholder academic resources are created.

INSERT INTO public.campuses (
  code, name, short_name, location, primary_color, email_domains, website_url, is_active
)
VALUES (
  'MUN',
  'Madonna University, Nigeria',
  'MUN',
  'Elele, Rivers / Okija, Anambra / Akpugo, Enugu',
  '#7C1D3A',
  ARRAY['madonnauniversity.edu.ng'],
  'https://www.madonnauniversity.edu.ng/',
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
    ('MUN', 'Madonna University Student Portal', 'https://madonna.skool-board.com/', 'Academic', 'school-outline', 1),
    ('MUN', 'Madonna University Website', 'https://www.madonnauniversity.edu.ng/', 'Central Portal', 'globe-outline', 2),
    ('MUN', 'Academics & Programmes', 'https://www.madonnauniversity.edu.ng/academics/', 'Academic', 'library-outline', 3),
    ('MUN', 'University Library', 'https://www.madonnauniversity.edu.ng/library-5/', 'Library', 'book-outline', 4),
    ('MUN', 'Fees & Payment Guide', 'https://www.madonnauniversity.edu.ng/mode-of-payment-2/', 'Finance', 'card-outline', 5),
    ('MUN', 'Campus & Facilities', 'https://www.madonnauniversity.edu.ng/campus-facilities/', 'Campus Services', 'business-outline', 6)
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
    'c/mun-academics',
    'MUN Academic Exchange',
    'Academic & Research',
    'MUN',
    'school-outline',
    'Course discussions, study circles, research support, and academic opportunities across Madonna University.',
    'Academic Moderator',
    'Madonna University Academic Moderators',
    '["Keep discussions focused on learning.", "Credit authors and sources.", "Do not share restricted assessment material."]'::jsonb,
    '#7C1D3A',
    '#9F1239',
    'approved'
  ),
  (
    'c/mun-campus-life',
    'MUN Campus Life',
    'Campus Life',
    'MUN',
    'people-outline',
    'Practical campus updates and student conversations for Elele, Okija, and Akpugo.',
    'Campus Moderator',
    'Madonna University Campus Moderators',
    '["Tag the relevant campus when location matters.", "Protect personal information.", "Do not post unverified emergency information."]'::jsonb,
    '#1D4ED8',
    '#2563EB',
    'approved'
  ),
  (
    'c/mun-health-sciences',
    'MUN Health Sciences',
    'Health Sciences',
    'MUN',
    'medkit-outline',
    'Learning, placements, professional development, and peer support for health-sciences students.',
    'Health Sciences Moderator',
    'Health Sciences Student Moderators',
    '["Do not share patient-identifying information.", "Do not present discussion as medical advice.", "Use academic and professional sources."]'::jsonb,
    '#047857',
    '#059669',
    'approved'
  ),
  (
    'c/mun-engineering-innovation',
    'MUN Engineering & Innovation',
    'Tech & Innovation',
    'MUN',
    'construct-outline',
    'Projects, technical learning, competitions, and collaboration for engineering and technology students.',
    'Innovation Moderator',
    'Engineering & Technology Moderators',
    '["Share reproducible technical details where possible.", "Respect project ownership.", "Keep collaboration constructive."]'::jsonb,
    '#B45309',
    '#D97706',
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
  AND university_name ILIKE '%madonna%';
