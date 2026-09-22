-- ============================================================================
-- LIORIS - BACKFILL profiles FOR PRE-EXISTING auth.users
-- ============================================================================
-- The on_auth_user_created trigger only fires on NEW signups. Every account
-- that existed before supabase_schema.sql was applied therefore has no
-- profiles row - and profiles is where role, campus_code and full_name live,
-- so without this the app cannot resolve who anyone is.
--
-- Mirrors handle_new_user_profile() exactly for campus detection, and applies
-- the demo-account roles the client expects (see DEMO_ACCOUNTS in
-- src/api/auth.ts).
--
-- Safe to re-run: ON CONFLICT (id) DO NOTHING.
-- ============================================================================

INSERT INTO profiles (id, email, full_name, role, campus_code, verification_status)
SELECT
    u.id,
    u.email,
    COALESCE(
        CASE LOWER(u.email)
            WHEN 'diana.prince@ui.edu.ng'   THEN 'Diana Prince'
            WHEN 'alumni.adeola@ui.edu.ng'  THEN 'Adeola Adeleke'
            WHEN 'dr.adeyemi@ui.edu.ng'     THEN 'Dr. Adeyemi Alabi'
            WHEN 'admin@ui.edu.ng'          THEN 'Super Admin UI'
        END,
        u.raw_user_meta_data->>'full_name',
        split_part(u.email, '@', 1)
    ) AS full_name,
    (CASE
        WHEN LOWER(u.email) IN ('admin@ui.edu.ng', 'inememmanuel@gmail.com') THEN 'admin'
        WHEN LOWER(u.email) = 'dr.adeyemi@ui.edu.ng'                        THEN 'staff'
        WHEN LOWER(u.email) = 'alumni.adeola@ui.edu.ng'                     THEN 'alumni'
        WHEN u.raw_user_meta_data->>'role' IN ('admin','staff','alumni','student')
             THEN u.raw_user_meta_data->>'role'
        ELSE 'student'
    END)::user_role_type AS role,
    -- Same ladder as handle_new_user_profile().
    CASE
        WHEN u.email ILIKE '%unilag.edu.ng'                                      THEN 'UNILAG'
        WHEN u.email ILIKE '%ui.edu.ng'                                          THEN 'UI'
        WHEN u.email ILIKE '%funaab.edu.ng' OR u.email ILIKE '%unaab.edu.ng'     THEN 'FUNAAB'
        WHEN u.email ILIKE '%unn.edu.ng'                                         THEN 'UNN'
        WHEN u.email ILIKE '%oauife.edu.ng'                                      THEN 'OAU'
        WHEN u.email ILIKE '%covenantuniversity.edu.ng'                          THEN 'CU'
        ELSE 'GLOBAL'
    END AS campus_code,
    (CASE
        WHEN LOWER(u.email) = 'inememmanuel@gmail.com' THEN 'verified'
        ELSE 'unverified'
    END)::verification_status_type AS verification_status
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
