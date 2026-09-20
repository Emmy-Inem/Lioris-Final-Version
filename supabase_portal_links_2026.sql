-- Replace the seeded portal_links rows with links that were actually verified to exist.
--
-- Why: 10 of the 24 rows pointed at hostnames that do not resolve at all (lms.unilag.edu.ng,
-- payments.unilag.edu.ng, medical.unilag.edu.ng, portal.ui.edu.ng, uhs.ui.edu.ng, lms.unaab.edu.ng,
-- library.unaab.edu.ng, healthservices.unaab.edu.ng) or returned 404 (portal.unaab.edu.ng/payments,
-- portal.unaab.edu.ng/accommodation). The six GLOBAL rows were UNILAG links relabelled as national
-- services, so every non-UNILAG student was shown another university's portal.
--
-- Every url below answered HTTP 200 over https on 2026-09-19 and was found on the university's own
-- homepage. Re-verify with:  curl -sIL -o /dev/null -w '%{http_code}\n' <url>
--
-- Idempotent: deactivates rows that are no longer valid, then upserts the verified set by (campus_code, title).

BEGIN;

-- 1. Retire every existing seeded row. Anything still valid is re-activated by the upsert below.
UPDATE public.portal_links SET is_active = false, updated_at = now();

-- 2. Upsert the verified set.
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('UNILAG','UNILAG Student Portal','https://unilag.edu.ng/student-portal/','Academic','school-outline',1),
      ('UNILAG','University Library','https://library.unilag.edu.ng/','Library','book-outline',2),
      ('UNILAG','Bursary & Student Accounts','https://unilag.edu.ng/bursary/','Finance','card-outline',3),
      ('UNILAG','Remita Fee Payments','https://unilag.edu.ng/remita/','Finance','cash-outline',4),
      ('UNILAG','Parent Portal','https://unilag.edu.ng/parent-portal/','Academic','people-outline',5),

      ('UI','UI Student Portal','https://student-portal.ui.edu.ng/login','Academic','school-outline',1),
      ('UI','UI e-Learning (LMS)','https://lms.ui.edu.ng/','Classes','laptop-outline',2),
      ('UI','Kenneth Dike Library','https://library.ui.edu.ng/','Library','book-outline',3),
      ('UI','Bursary & Student Accounts','https://bursary.ui.edu.ng/','Finance','card-outline',4),
      ('UI','Transcript Requests','https://ui.edu.ng/content/students-transcript','Academic','document-text-outline',5),

      ('FUNAAB','FUNAAB Student Portal','https://portal.unaab.edu.ng/pt/','Academic','school-outline',1),
      ('FUNAAB','Nimbe Adedipe Library','https://funaab.edu.ng/section/nimbe-adedipe-library/','Library','book-outline',2),
      ('FUNAAB','Bursary','https://funaab.edu.ng/section/bursary/','Finance','card-outline',3),
      ('FUNAAB','Directorate of Health Services','https://funaab.edu.ng/section/directorate-of-health-services/','Health','medkit-outline',4),
      ('FUNAAB','Student Affairs','https://funaab.edu.ng/section/students-affairs/','Academic','people-outline',5),

      ('GLOBAL','JAMB eFacility','https://efacility.jamb.gov.ng/','Academic','shield-checkmark-outline',1),
      ('GLOBAL','National Universities Commission','https://www.nuc.edu.ng/','Academic','business-outline',2),
      ('GLOBAL','TETFund','https://tetfund.gov.ng/','Research','library-outline',3),
      ('GLOBAL','Remita Payments','https://remita.net/','Finance','cash-outline',4),
      ('GLOBAL','NYSC','https://www.nysc.gov.ng/','Academic','ribbon-outline',5)
    ) AS v(campus_code, title, url, category, icon, display_order)
  LOOP
    UPDATE public.portal_links
       SET url = r.url, category = r.category, icon = r.icon,
           display_order = r.display_order, is_active = true, updated_at = now()
     WHERE campus_code = r.campus_code AND title = r.title;
    IF NOT FOUND THEN
      INSERT INTO public.portal_links (campus_code, title, url, category, icon, display_order, is_active)
      VALUES (r.campus_code, r.title, r.url, r.category, r.icon, r.display_order, true);
    END IF;
  END LOOP;
END
$do$;

-- 3. Delete the rows that stayed inactive (the invented ones). Keeps the table honest rather than
--    leaving dead links an admin might re-enable by accident.
DELETE FROM public.portal_links WHERE is_active = false;

COMMIT;

-- Verify:
--   select campus_code, title, url from public.portal_links where is_active order by campus_code, display_order;
