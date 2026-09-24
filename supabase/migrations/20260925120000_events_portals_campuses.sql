-- Events / portal links / campuses hardening.
--
-- 1. Spotlight is an ADMIN-only decision made after an event is posted. The old trigger let campus
--    staff (and, via the client's "Sponsored" flag, event creators) feature events.
-- 2. When the admin's Global toggle (feature flag `global_workspace`) is off, a non-admin cannot publish
--    an event to the global network any more - it is kept on their own campus.
-- 3. portal_links: only 4 of the 7 campuses had rows in the database; UNN, OAU and CU (and several
--    links for the others) existed only as client-side defaults, so the admin screen could not show,
--    edit or hide them. Seed them, and stop the same title being added twice on one campus.
-- 4. campuses: the email domains that drive signup verification are validated in the database
--    (well-formed, not a public mailbox provider, not already claimed by another campus), plus a couple
--    of descriptive columns and an admin-only overview function.

-- =====================================================================================================
-- 1. spotlight = admin only
-- =====================================================================================================
-- "Sponsored" (gold badge + carousel) existed in the edit screen but had no column, so saving an event with it
-- silently failed. Give it a real column - admin-controlled like spotlight.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS sponsored boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_event_privileged_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_role text; v_campus text;
BEGIN
  IF auth.uid() IS NOT NULL AND pg_trigger_depth() = 1 THEN
    SELECT role::text, campus_code INTO v_role, v_campus FROM profiles WHERE id = auth.uid();
    -- Spotlight / sponsored: admins only, and only ever changed on an event that already exists.
    IF v_role IS DISTINCT FROM 'admin' THEN
      IF TG_OP = 'INSERT' THEN
        NEW.is_spotlight := false;
        NEW.sponsored := false;
      ELSE
        NEW.is_spotlight := OLD.is_spotlight;
        NEW.sponsored := OLD.sponsored;
      END IF;
    END IF;
    -- RSVP counter is maintained by a nested trigger; only campus staff/admin may touch it directly.
    IF NOT (v_role = 'admin' OR (v_role = 'staff' AND v_campus = NEW.campus_code)) THEN
      IF TG_OP = 'INSERT' THEN
        NEW.registered_count := 0;
      ELSE
        NEW.registered_count := OLD.registered_count;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- =====================================================================================================
-- 2. no global events while the Global toggle is off (non-admins are kept on their own campus)
-- =====================================================================================================
CREATE OR REPLACE FUNCTION public.global_workspace_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    (SELECT (value ->> 'global_workspace')::boolean FROM public.platform_settings WHERE key = 'feature_flags'),
    true);
$$;

CREATE OR REPLACE FUNCTION public.events_keep_campus_when_global_off()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_role text; v_campus text;
BEGIN
  IF auth.uid() IS NULL OR public.global_workspace_enabled() THEN RETURN NEW; END IF;
  SELECT role::text, campus_code INTO v_role, v_campus FROM profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin'
     AND (NEW.visibility_scope::text = 'global' OR NEW.campus_code = 'GLOBAL')
     AND v_campus IS NOT NULL AND v_campus <> 'GLOBAL' THEN
    NEW.visibility_scope := 'campus';
    NEW.campus_code := v_campus;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_events_keep_campus_when_global_off ON public.events;
CREATE TRIGGER trg_events_keep_campus_when_global_off BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_keep_campus_when_global_off();

-- =====================================================================================================
-- 3. portal links: seed what the client only knew as defaults, and prevent duplicates
-- =====================================================================================================
WITH seed(campus_code, title, url, category, icon, display_order) AS (
  VALUES
      ('UNILAG', 'UNILAG Student Portal', 'https://studentportal.unilag.edu.ng/', 'Academic', 'school-outline', 1),
      ('UNILAG', 'Main Library Catalog & Archives', 'https://library.unilag.edu.ng/', 'Library', 'book-outline', 2),
      ('UNILAG', 'UNILAG e-Learning LMS', 'https://lms.unilag.edu.ng/', 'Classes', 'laptop-outline', 3),
      ('UNILAG', 'Bursary & Payments (Remita)', 'https://payments.unilag.edu.ng/', 'Finance', 'card-outline', 4),
      ('UNILAG', 'Hostel Accommodation System', 'https://studentportal.unilag.edu.ng/', 'Housing', 'home-outline', 5),
      ('UNILAG', 'Medical Centre & Health Clinic', 'https://unilag.edu.ng/medical-centre/', 'Health', 'medkit-outline', 6),
      ('UNILAG', 'CITS ICT & Student Email', 'https://cits.unilag.edu.ng/', 'ICT & Services', 'hardware-chip-outline', 7),
      ('UNILAG', 'Postgraduate School (SPGS)', 'https://spgs.unilag.edu.ng/', 'Postgraduate', 'ribbon-outline', 8),
      ('UI', 'UI Student Portal', 'https://student-portal.ui.edu.ng/', 'Academic', 'school-outline', 1),
      ('UI', 'Result Management (UIRMS)', 'https://uirms.ui.edu.ng/', 'Results', 'trophy-outline', 2),
      ('UI', 'Kenneth Dike Memorial Library', 'https://library.ui.edu.ng/', 'Library', 'book-outline', 3),
      ('UI', 'UI DLC Virtual Classroom', 'https://dlcportal.ui.edu.ng/', 'Classes', 'laptop-outline', 4),
      ('UI', 'Undergraduate Admissions', 'https://admissions.ui.edu.ng/', 'Admissions', 'document-text-outline', 5),
      ('UI', 'University Central Portal', 'https://portal.ui.edu.ng/', 'Central Portal', 'globe-outline', 6),
      ('UI', 'Jaja Health Services Clinic', 'https://ui.edu.ng/', 'Health', 'medkit-outline', 7),
      ('FUNAAB', 'FUNAAB Student Portal', 'https://portal.unaab.edu.ng/', 'Academic', 'school-outline', 1),
      ('FUNAAB', 'Nimbe Adedipe Digital Library', 'https://library.unaab.edu.ng/', 'Library', 'book-outline', 2),
      ('FUNAAB', 'FUNAAB Central Portal', 'https://funaab.edu.ng/', 'Central Portal', 'globe-outline', 3),
      ('FUNAAB', 'Bursary Invoicing & Billing', 'https://portal.unaab.edu.ng/', 'Finance', 'card-outline', 4),
      ('FUNAAB', 'Hostel Accommodation System', 'https://portal.unaab.edu.ng/', 'Housing', 'home-outline', 5),
      ('FUNAAB', 'Directorate of Health Services', 'https://funaab.edu.ng/health-services/', 'Health', 'medkit-outline', 6),
      ('FUNAAB', 'ICTREC Tech Resource Centre', 'https://funaab.edu.ng/', 'ICT & Services', 'hardware-chip-outline', 7),
      ('UNN', 'UNN Student Portal', 'https://unnportal.unn.edu.ng/', 'Academic', 'school-outline', 1),
      ('UNN', 'UNN e-Learning Portal', 'https://elearning.unn.edu.ng/', 'Classes', 'laptop-outline', 2),
      ('UNN', 'Nnamdi Azikiwe Library & OPAC', 'https://library.unn.edu.ng/', 'Library', 'book-outline', 3),
      ('UNN', 'Medical Centre Health Portal', 'https://medicalcentre.unn.edu.ng/', 'Health', 'medkit-outline', 4),
      ('UNN', 'UNN iLearn Digital Campus', 'https://ilearn.unn.edu.ng/', 'Online Learning', 'desktop-outline', 5),
      ('UNN', 'Hostel & Remita Billing', 'https://unnportal.unn.edu.ng/', 'Housing & Finance', 'home-outline', 6),
      ('UNN', 'UNN Central University Portal', 'https://unn.edu.ng/', 'Central Portal', 'globe-outline', 7),
      ('OAU', 'OAU Student ePortal', 'https://eportal.oauife.edu.ng/', 'Academic', 'school-outline', 1),
      ('OAU', 'OAU e-Learning LMS', 'https://lms.oauife.edu.ng/', 'Classes', 'laptop-outline', 2),
      ('OAU', 'Hezekiah Oluwasanmi Library', 'https://library.oauife.edu.ng/', 'Library', 'book-outline', 3),
      ('OAU', 'Postgraduate College Portal', 'https://pgcollege.oauife.edu.ng/', 'Postgraduate', 'ribbon-outline', 4),
      ('OAU', 'Centre for Distance Learning', 'https://cdl.oauife.edu.ng/', 'Distance Learning', 'desktop-outline', 5),
      ('OAU', 'Bursary & E-Invoicing', 'https://bursary.oauife.edu.ng/', 'Finance', 'card-outline', 6),
      ('OAU', 'Hostel Accommodation System', 'https://eportal.oauife.edu.ng/', 'Housing', 'home-outline', 7),
      ('OAU', 'OAU Official Portal', 'https://oauife.edu.ng/', 'Central Portal', 'globe-outline', 8),
      ('CU', 'Covenant University Student Portal', 'https://portal.covenantuniversity.edu.ng/', 'Academic', 'school-outline', 1),
      ('CU', 'Covenant Moodle LMS Classroom', 'https://moodle.cu.edu.ng/', 'Classes', 'laptop-outline', 2),
      ('CU', 'Centre for Learning Resources (CLR)', 'https://clr.covenantuniversity.edu.ng/', 'Library', 'book-outline', 3),
      ('CU', 'CBT Examination Platform', 'https://cbt.cu.edu.ng/', 'Examinations', 'create-outline', 4),
      ('CU', 'Covenant Admissions Portal', 'https://admissions.covenantuniversity.edu.ng/', 'Admissions', 'document-text-outline', 5),
      ('CU', 'Covenant University Official Website', 'https://covenantuniversity.edu.ng/', 'Central Portal', 'globe-outline', 6),
      ('GLOBAL', 'National Academic Repository (JAMB)', 'https://efacility.jamb.gov.ng/', 'National', 'school-outline', 1),
      ('GLOBAL', 'National Universities Commission (NUC)', 'https://www.nuc.edu.ng/', 'Commission', 'globe-outline', 2),
      ('GLOBAL', 'TETFUND Digital Research Library', 'https://tetfund.gov.ng/', 'Research', 'book-outline', 3),
      ('GLOBAL', 'Central Education Payments (Remita)', 'https://remita.net/', 'Finance', 'card-outline', 4),
      ('GLOBAL', 'NYSC Mobilization & Verification', 'https://portal.nysc.org.ng/', 'National Service', 'shield-checkmark-outline', 5)
)
INSERT INTO public.portal_links (campus_code, title, url, category, icon, is_active, display_order)
SELECT s.campus_code, s.title, s.url, s.category, s.icon, true, s.display_order
FROM seed s
JOIN public.campuses c ON c.code = s.campus_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.portal_links p
  WHERE p.campus_code = s.campus_code AND (lower(p.url) = lower(s.url) OR lower(p.title) = lower(s.title))
);

-- Two links to the same page under different names are fine; the same title twice on one campus is not.
CREATE UNIQUE INDEX IF NOT EXISTS portal_links_campus_title_uniq ON public.portal_links (campus_code, lower(title));

-- =====================================================================================================
-- 4. campuses
-- =====================================================================================================
ALTER TABLE public.campuses
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS country     text NOT NULL DEFAULT 'NG',
  ADD COLUMN IF NOT EXISTS created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.campuses DROP CONSTRAINT IF EXISTS campuses_details_chk;
ALTER TABLE public.campuses ADD CONSTRAINT campuses_details_chk CHECK (
  (website_url IS NULL OR website_url ~* '^https?://')
  AND (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$')
  AND (short_name IS NULL OR char_length(short_name) <= 24)
  AND (location IS NULL OR char_length(location) <= 120)
) NOT VALID;

CREATE OR REPLACE FUNCTION public.campuses_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  d       text;
  norm    text[] := '{}';
  other   record;
  -- Public mailbox providers and bare public suffixes: claiming any of these would mark every
  -- signup with such an address as a verified member of the campus.
  blocked text[] := ARRAY[
    'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','ymail.com','outlook.com','hotmail.com','live.com','msn.com',
    'icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','pm.me','zoho.com','gmx.com','mail.com',
    'yandex.com','tutanota.com','fastmail.com','lioris.app','edu.ng','com.ng','gov.ng','org.ng','net.ng','sch.ng',
    'ac.uk','co.uk','ac.za','co.za','edu.gh','edu.au','edu.ke','ac.ke','ac.ug','edu.eg','edu.in','ac.in'];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.code := OLD.code;                       -- the code is a foreign key everywhere: never re-key it
  END IF;
  NEW.code := upper(btrim(NEW.code));
  IF NEW.code <> 'GLOBAL' AND NEW.code !~ '^[A-Z][A-Z0-9]{1,15}$' THEN
    RAISE EXCEPTION 'invalid_code: use 2 to 16 letters or digits, starting with a letter';
  END IF;
  NEW.name := btrim(NEW.name);
  IF char_length(NEW.name) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'invalid_name: the university name needs 3 to 120 characters';
  END IF;

  IF NEW.code <> 'GLOBAL' THEN
    FOREACH d IN ARRAY COALESCE(NEW.email_domains, '{}') LOOP
      d := regexp_replace(lower(btrim(d)), '^@', '');
      IF d = '' THEN CONTINUE; END IF;
      IF d !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$' THEN
        RAISE EXCEPTION 'invalid_domain: "%" is not a valid email domain', d;
      END IF;
      IF d = ANY (blocked) THEN
        RAISE EXCEPTION 'public_domain_blocked: "%" is a public email provider or shared suffix, not a university domain', d;
      END IF;
      FOR other IN
        SELECT c.code AS code, x AS dom FROM public.campuses c CROSS JOIN LATERAL unnest(c.email_domains) x WHERE c.code <> NEW.code
      LOOP
        IF d = other.dom OR d LIKE '%.' || other.dom OR other.dom LIKE '%.' || d THEN
          RAISE EXCEPTION 'domain_taken: "%" overlaps with %, which already uses %', d, other.code, other.dom;
        END IF;
      END LOOP;
      norm := array_append(norm, d);
    END LOOP;
    NEW.email_domains := COALESCE((SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(norm) x), '{}');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_campuses_guard ON public.campuses;
CREATE TRIGGER trg_campuses_guard BEFORE INSERT OR UPDATE ON public.campuses
  FOR EACH ROW EXECUTE FUNCTION public.campuses_guard();

-- Admin overview for the Campuses screen: one row per campus with the numbers that matter.
CREATE OR REPLACE FUNCTION public.admin_campus_overview()
RETURNS TABLE (
  code text, name text, short_name text, location text, primary_color text, website_url text,
  email_domains text[], is_active boolean, created_at timestamptz,
  member_count integer, verified_count integer, portal_link_count integer, active_portal_link_count integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF COALESCE(public.auth_profile_role(), '') <> 'admin' THEN
    RAISE EXCEPTION 'not_allowed: administrators only';
  END IF;
  RETURN QUERY
  SELECT c.code, c.name, c.short_name, c.location, c.primary_color, c.website_url,
         c.email_domains, c.is_active, c.created_at,
         (SELECT count(*)::integer FROM public.profiles p WHERE p.campus_code = c.code),
         (SELECT count(*)::integer FROM public.profiles p WHERE p.campus_code = c.code AND p.verification_status::text = 'verified'),
         (SELECT count(*)::integer FROM public.portal_links l WHERE l.campus_code = c.code),
         (SELECT count(*)::integer FROM public.portal_links l WHERE l.campus_code = c.code AND l.is_active)
  FROM public.campuses c
  ORDER BY (c.code = 'GLOBAL') DESC, c.name;
END $$;
REVOKE ALL ON FUNCTION public.admin_campus_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_campus_overview() TO authenticated;
