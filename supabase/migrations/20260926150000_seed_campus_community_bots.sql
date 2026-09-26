-- ============================================================================
-- SEED 20 VERIFIED COMMUNITY BOTS & FORUM POSTS (UI, UNILAG, FUNAAB)
-- Creates 20 verified student/alumni accounts across auth.users and profiles,
-- and seeds 20 high-value, insightful forum discussion posts covering Tech Hub,
-- General (Making Money / Side Hustles), Academic, Polls, Housing, Social, and
-- Lost & Found.
--
-- Strictly idempotent: safe to run multiple times with ON CONFLICT.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. SEED auth.users
-- ----------------------------------------------------------------------------

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000101',
  '00000000-0000-0000-0000-000000000000',
  'tunde.balogun@ui.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Tunde Balogun","username":"tundecodes","role":"student","campus_code":"UI","department":"Computer Science","faculty":"Science","level":"400L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000102',
  '00000000-0000-0000-0000-000000000000',
  'funke.adeyemi@ui.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Funke Adeyemi","username":"funke_agri","role":"student","campus_code":"UI","department":"Agricultural Economics","faculty":"Agriculture","level":"300L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000103',
  '00000000-0000-0000-0000-000000000000',
  'kemi.ogunlesi@ui.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Dr. Kemi Ogunlesi","username":"kemi_mentor","role":"alumni","campus_code":"UI","department":"Medicine & Surgery","faculty":"Clinical Sciences","level":"Alumni (MBBS ''21)"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000104',
  '00000000-0000-0000-0000-000000000000',
  'ibrahim.danladi@ui.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Ibrahim Danladi","username":"ibro_stats","role":"student","campus_code":"UI","department":"Economics","faculty":"The Social Sciences","level":"400L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000105',
  '00000000-0000-0000-0000-000000000000',
  'simi.adeleke@ui.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Simi Adeleke","username":"simi_law","role":"student","campus_code":"UI","department":"Public Law","faculty":"Law","level":"500L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000106',
  '00000000-0000-0000-0000-000000000000',
  'kayode.johnson@ui.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Kayode Johnson","username":"kayode_housing","role":"student","campus_code":"UI","department":"Mechanical Engineering","faculty":"Technology","level":"300L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000107',
  '00000000-0000-0000-0000-000000000000',
  'bolanle.oshodi@ui.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Bolanle Oshodi","username":"bola_dike","role":"student","campus_code":"UI","department":"Biochemistry","faculty":"Basic Medical Sciences","level":"200L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000201',
  '00000000-0000-0000-0000-000000000000',
  'chinedu.okonkwo@unilag.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Chinedu Okonkwo","username":"chinedu_ux","role":"student","campus_code":"UNILAG","department":"Systems Engineering","faculty":"Engineering","level":"400L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000202',
  '00000000-0000-0000-0000-000000000000',
  'blessing.oladipo@unilag.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Blessing Oladipo","username":"blessing_fin","role":"student","campus_code":"UNILAG","department":"Finance","faculty":"Management Sciences","level":"300L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000203',
  '00000000-0000-0000-0000-000000000000',
  'femi.alabi@unilag.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Femi Alabi","username":"femi_growth","role":"alumni","campus_code":"UNILAG","department":"Mass Communication","faculty":"Social Sciences","level":"Alumni (''22)"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000204',
  '00000000-0000-0000-0000-000000000000',
  'amina.bello@unilag.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Amina Bello","username":"amina_code","role":"student","campus_code":"UNILAG","department":"Computer Science","faculty":"Science","level":"200L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000205',
  '00000000-0000-0000-0000-000000000000',
  'dayo.adeyemi@unilag.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Dayo Adeyemi","username":"dayo_akoka","role":"student","campus_code":"UNILAG","department":"Business Administration","faculty":"Management Sciences","level":"300L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000206',
  '00000000-0000-0000-0000-000000000000',
  'zainab.alhassan@unilag.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Zainab Al-Hassan","username":"zainab_creatives","role":"student","campus_code":"UNILAG","department":"Creative Arts","faculty":"Arts","level":"300L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000207',
  '00000000-0000-0000-0000-000000000000',
  'emeka.nwosu@unilag.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Emeka Nwosu","username":"emeka_eng","role":"student","campus_code":"UNILAG","department":"Electrical & Electronics Engineering","faculty":"Engineering","level":"400L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000301',
  '00000000-0000-0000-0000-000000000000',
  'damilola.alabi@funaab.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Damilola Alabi","username":"dami_agritech","role":"student","campus_code":"FUNAAB","department":"Agricultural Media & Farm Management","faculty":"Agricultural Management","level":"500L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000302',
  '00000000-0000-0000-0000-000000000000',
  'olamide.bakare@funaab.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Olamide Bakare","username":"olamide_dev","role":"student","campus_code":"FUNAAB","department":"Computer Science","faculty":"Physical Sciences","level":"400L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000303',
  '00000000-0000-0000-0000-000000000000',
  'folake.adeleke@funaab.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Folake Adeleke","username":"folake_foodtech","role":"student","campus_code":"FUNAAB","department":"Food Science & Technology","faculty":"Food Science","level":"300L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000304',
  '00000000-0000-0000-0000-000000000000',
  'emmanuel.ogundipe@funaab.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Emmanuel Ogundipe","username":"emmanuel_mechatronics","role":"student","campus_code":"FUNAAB","department":"Mechatronics Engineering","faculty":"Engineering","level":"400L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000305',
  '00000000-0000-0000-0000-000000000000',
  'niyi.adekunle@funaab.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Dr. Niyi Adekunle","username":"niyi_alumni","role":"alumni","campus_code":"FUNAAB","department":"Animal Nutrition","faculty":"Animal Science","level":"Alumni (''20)"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000306',
  '00000000-0000-0000-0000-000000000000',
  'titilayo.sowemimo@funaab.edu.ng',
  '$2a$10$wT8Bwz8e8rF8qXhX.x.jYeKx7s6Z4L1dM5xN9p8oQ2rS1tU0vW2Xa',
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name":"Titilayo Sowemimo","username":"titi_funaab","role":"student","campus_code":"FUNAAB","department":"Plant Breeding & Seed Technology","faculty":"Plant Science","level":"200L"}'::jsonb,
  'authenticated',
  'authenticated',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

-- ----------------------------------------------------------------------------
-- 2. SEED public.profiles
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000101',
  'tunde.balogun@ui.edu.ng',
  'Tunde Balogun',
  'tundecodes',
  'student'::user_role_type,
  'UI',
  'Computer Science',
  'Science',
  '400L',
  '400L CS @ UI | Fullstack Dev (React/Node) | Earning in USD on Upwork | Building tech solutions for Nigerian students.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Law_Students_Nigeria_Iftar_2023_01.jpg/500px-Law_Students_Nigeria_Iftar_2023_01.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000102',
  'funke.adeyemi@ui.edu.ng',
  'Funke Adeyemi',
  'funke_agri',
  'student'::user_role_type,
  'UI',
  'Agricultural Economics',
  'Agriculture',
  '300L',
  'Agric Econ 300L @ UI | Founder of Campus Fruit Bowl (Smoothies & Healthy Parfait across Kuti, Queens & Idia Halls).',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Law_Students_Nigeria_Iftar_2023_02.jpg/500px-Law_Students_Nigeria_Iftar_2023_02.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000103',
  'kemi.ogunlesi@ui.edu.ng',
  'Dr. Kemi Ogunlesi',
  'kemi_mentor',
  'alumni'::user_role_type,
  'UI',
  'Medicine & Surgery',
  'Clinical Sciences',
  'Alumni (MBBS ''21)',
  'UI MBBS ''21 | Global Health Researcher | Rhodes Scholar Finalist | Helping UIites secure fully-funded study abroad scholarships.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Law_Students_Nigeria_Iftar_2023_16.jpg/500px-Law_Students_Nigeria_Iftar_2023_16.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000104',
  'ibrahim.danladi@ui.edu.ng',
  'Ibrahim Danladi',
  'ibro_stats',
  'student'::user_role_type,
  'UI',
  'Economics',
  'The Social Sciences',
  '400L',
  'Economics 400L @ UI | Financial Markets & Macro Analyst | Freelance Data Analyst (PowerBI, Python).',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Law_Students_Nigeria_Iftar_2023_12.jpg/500px-Law_Students_Nigeria_Iftar_2023_12.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000105',
  'simi.adeleke@ui.edu.ng',
  'Simi Adeleke',
  'simi_law',
  'student'::user_role_type,
  'UI',
  'Public Law',
  'Law',
  '500L',
  '500L Law @ UI | Moot & Mock Winner | Tech Law Researcher | Believer in disciplined study habits without academic burnout.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Law_Students_Nigeria_Iftar_2023_17.jpg/500px-Law_Students_Nigeria_Iftar_2023_17.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000106',
  'kayode.johnson@ui.edu.ng',
  'Kayode Johnson',
  'kayode_housing',
  'student'::user_role_type,
  'UI',
  'Mechanical Engineering',
  'Technology',
  '300L',
  'Mech Eng 300L @ UI | Mellanby Hall Executive | Off-campus housing scout helping students avoid agent extortion in Agbowo & Bodija.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Law_Students_Nigeria_Iftar_2023_13.jpg/500px-Law_Students_Nigeria_Iftar_2023_13.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000107',
  'bolanle.oshodi@ui.edu.ng',
  'Bolanle Oshodi',
  'bola_dike',
  'student'::user_role_type,
  'UI',
  'Biochemistry',
  'Basic Medical Sciences',
  '200L',
  '200L Biochemistry @ UI | Queen Idia Hall | Campus volunteer with passion for community service and campus recovery.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Law_Students_Nigeria_Iftar_2023_18.jpg/500px-Law_Students_Nigeria_Iftar_2023_18.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000201',
  'chinedu.okonkwo@unilag.edu.ng',
  'Chinedu Okonkwo',
  'chinedu_ux',
  'student'::user_role_type,
  'UNILAG',
  'Systems Engineering',
  'Engineering',
  '400L',
  'Systems Eng 400L @ UNILAG | Senior Product Designer | Remote Contractor earning in USD | Passionate about building global digital careers from Akoka.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Law_Students_Nigeria_Iftar_2023_14.jpg/500px-Law_Students_Nigeria_Iftar_2023_14.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000202',
  'blessing.oladipo@unilag.edu.ng',
  'Blessing Oladipo',
  'blessing_fin',
  'student'::user_role_type,
  'UNILAG',
  'Finance',
  'Management Sciences',
  '300L',
  'Finance 300L @ UNILAG | ICAN Candidate | Financial modeler helping small businesses in Lagos automate bookkeeping.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Discovery_For_Youth_02.jpg/500px-Discovery_For_Youth_02.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000203',
  'femi.alabi@unilag.edu.ng',
  'Femi Alabi',
  'femi_growth',
  'alumni'::user_role_type,
  'UNILAG',
  'Mass Communication',
  'Social Sciences',
  'Alumni (''22)',
  'UNILAG Mass Comm ''22 | Growth Marketing Lead at YC-backed Fintech | Career Coach for ambitious undergraduates.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Law_Students_Nigeria_Iftar_2023_15.jpg/500px-Law_Students_Nigeria_Iftar_2023_15.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000204',
  'amina.bello@unilag.edu.ng',
  'Amina Bello',
  'amina_code',
  'student'::user_role_type,
  'UNILAG',
  'Computer Science',
  'Science',
  '200L',
  '200L CS @ UNILAG | Frontend Developer & UI tinkerer | Google Women Techmakers Ambassador | Community builder.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Discovery_For_Youth_03.jpg/500px-Discovery_For_Youth_03.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000205',
  'dayo.adeyemi@unilag.edu.ng',
  'Dayo Adeyemi',
  'dayo_akoka',
  'student'::user_role_type,
  'UNILAG',
  'Business Administration',
  'Management Sciences',
  '300L',
  'Business Admin 300L @ UNILAG | Jaja Hall Resident | Tech Accessories & Gadget Trader on campus.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Discovery_For_Youth_04.jpg/500px-Discovery_For_Youth_04.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000206',
  'zainab.alhassan@unilag.edu.ng',
  'Zainab Al-Hassan',
  'zainab_creatives',
  'student'::user_role_type,
  'UNILAG',
  'Creative Arts',
  'Arts',
  '300L',
  'Creative Arts 300L @ UNILAG | 3D Animator & Visual Storyteller | Freelance Brand Designer for Lagos tech startups.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Discovery_For_Youth_05.jpg/500px-Discovery_For_Youth_05.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000207',
  'emeka.nwosu@unilag.edu.ng',
  'Emeka Nwosu',
  'emeka_eng',
  'student'::user_role_type,
  'UNILAG',
  'Electrical & Electronics Engineering',
  'Engineering',
  '400L',
  'EEE 400L @ UNILAG | Robotics & Embedded Systems Enthusiast | Faculty of Engineering Student Welfare Committee.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Discovery_For_Youth_06.jpg/500px-Discovery_For_Youth_06.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000301',
  'damilola.alabi@funaab.edu.ng',
  'Damilola Alabi',
  'dami_agritech',
  'student'::user_role_type,
  'FUNAAB',
  'Agricultural Media & Farm Management',
  'Agricultural Management',
  '500L',
  '500L Farm Management @ FUNAAB | Agribusiness Entrepreneur | Managing a 350-bird poultry unit in Kotopo | Empowering students to build farm wealth.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Discovery_For_Youth_07.jpg/500px-Discovery_For_Youth_07.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000302',
  'olamide.bakare@funaab.edu.ng',
  'Olamide Bakare',
  'olamide_dev',
  'student'::user_role_type,
  'FUNAAB',
  'Computer Science',
  'Physical Sciences',
  '400L',
  '400L CS @ FUNAAB | Backend Developer (Golang & PostgreSQL) | Remote freelancer working from Camp/Alabata.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Discovery_For_Youth_08.jpg/500px-Discovery_For_Youth_08.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000303',
  'folake.adeleke@funaab.edu.ng',
  'Folake Adeleke',
  'folake_foodtech',
  'student'::user_role_type,
  'FUNAAB',
  'Food Science & Technology',
  'Food Science',
  '300L',
  'Food Science 300L @ FUNAAB | Pastry Chef & Packaged Healthy Snacks Producer | Supplying university cafeterias and hostelites.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Discovery_For_Youth_09.jpg/500px-Discovery_For_Youth_09.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000304',
  'emmanuel.ogundipe@funaab.edu.ng',
  'Emmanuel Ogundipe',
  'emmanuel_mechatronics',
  'student'::user_role_type,
  'FUNAAB',
  'Mechatronics Engineering',
  'Engineering',
  '400L',
  'Mechatronics 400L @ FUNAAB | Hardware Hacker | Solar power setups and automated drip-irrigation enthusiast.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Discovery_For_Youth_10.jpg/500px-Discovery_For_Youth_10.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000305',
  'niyi.adekunle@funaab.edu.ng',
  'Dr. Niyi Adekunle',
  'niyi_alumni',
  'alumni'::user_role_type,
  'FUNAAB',
  'Animal Nutrition',
  'Animal Science',
  'Alumni (''20)',
  'FUNAAB Alumni ''20 | Managing Director at GreenField Agro Exports | Mentoring agricultural students on agribusiness export value chains.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Discovery_For_Youth_11.jpg/500px-Discovery_For_Youth_11.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  username,
  role,
  campus_code,
  department,
  faculty,
  level,
  bio,
  avatar_url,
  verification_status
) VALUES (
  '00000000-0000-4000-a000-000000000306',
  'titilayo.sowemimo@funaab.edu.ng',
  'Titilayo Sowemimo',
  'titi_funaab',
  'student'::user_role_type,
  'FUNAAB',
  'Plant Breeding & Seed Technology',
  'Plant Science',
  '200L',
  '200L PBST @ FUNAAB | Nimbe Adedipe Library Regular | Peer tutor and campus hostel logistics enthusiast.',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Discovery_For_Youth_16.jpg/500px-Discovery_For_Youth_16.jpg',
  'verified'::verification_status_type
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  campus_code = EXCLUDED.campus_code,
  department = EXCLUDED.department,
  faculty = EXCLUDED.faculty,
  level = EXCLUDED.level,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  verification_status = 'verified'::verification_status_type;

ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation;

-- ----------------------------------------------------------------------------
-- 3. SEED public.posts (20 INSIGHTFUL FORUM POSTS)
-- ----------------------------------------------------------------------------

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000101',
  '00000000-0000-4000-a000-000000000101',
  'UI',
  'campus'::visibility_scope_type,
  'student',
  'How I went from 0 clients to earning $800/month on Upwork while studying CS at UI (Full Breakdown)',
  'A lot of people in UI ask me how I balance 400L Computer Science with freelancing on Upwork. Here is the unfiltered blueprint I wish someone gave me when I entered 200L:

1. Stop bidding on generic jobs like "Web Developer".
Clients get 50+ proposals in 10 minutes. I carved out a specific sub-niche: Next.js + Technical Documentation & API integrations for early-stage fintechs.

2. The UI Power & Internet Routine:
- Kenneth Dike Library (KDL) daytime runs for study & heavy coding.
- Two 30,000mAh Romoss power banks for laptop & phone charging in the hostel during night outages.
- MTN 5G router + Airtel 4G SIM failover.

3. Getting Foreign Payouts to Nigeria:
I route my Upwork USD payouts through Geegpay / Grey virtual accounts into my local GTBank account. Rates are competitive and zero clearing delays.

4. Academics First Rule:
I schedule client deliverables for Thursday nights and weekends so I don''t miss compulsory lectures or practical sessions.

If you have questions about profile optimization, drop them below and I will review a few!',
  'Tech Hub',
  'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&auto=format&fit=crop&q=80',
  NULL,
  68,
  24,
  14,
  TRUE,
  'published',
  '2026-09-24T09:30:00.000Z',
  '2026-09-24T09:30:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000102',
  '00000000-0000-4000-a000-000000000102',
  'UI',
  'campus'::visibility_scope_type,
  'student',
  'The Campus Side Hustle Blueprint: How we turned fresh fruit bowls into ₦180k profit/month in Kuti & Queens Halls',
  'You don''t need tech skills or a laptop to start making money on campus. Last semester, my roommate and I noticed how hard it is to get fresh, hygienically prepped fruits during evening study sessions.

Here are the exact numbers:
- Initial Capital: ₦15,000.
- Sourcing: Bodija Market every Tuesday & Saturday at 6:30 AM (wholesale watermelons, pineapples, bananas, and apples).
- Packaging: Disposable clear containers with branded stickers (₦70 per unit).
- Distribution: We took pre-orders via WhatsApp status and delivered door-to-door in Kuti Hall, Queen Idia, and Queen Elizabeth Halls between 7 PM and 9 PM.

Gross Sales per week: ~₦85,000.
Cost of Goods & Logistics: ~₦40,000.
Net monthly profit shared: ~₦180,000.

Key Lesson: Consistency and strict hygiene. People pay quickly when they know your food is 100% clean and arrives on time.',
  'General',
  'https://images.unsplash.com/photo-1490818387583-1baba5e638af?w=800&auto=format&fit=crop&q=80',
  NULL,
  52,
  18,
  9,
  FALSE,
  'published',
  '2026-09-24T14:15:00.000Z',
  '2026-09-24T14:15:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000103',
  '00000000-0000-4000-a000-000000000103',
  'UI',
  'campus'::visibility_scope_type,
  'alumni',
  'Step-by-step roadmap: How UI undergraduates can position for Commonwealth, Rhodes, & Mastercard scholarships',
  'Many students assume international scholarships only go to 4.90 CGPA holders. That is a myth.

When selection committees evaluate Nigerian applicants, they score four pillars:

1. Academic Consistency (A minimum of a solid Second Class Upper is required; First Class gives an edge, but leadership tilts the scale).
2. Community Impact: What tangible problem did you solve within your hall of residence, department, or Ibadan community?
3. Research Engagement: Don''t wait for final year project. Volunteer as a student research assistant for professors in your faculty.
4. Compelling Narrative: Explain WHY your degree will transform your home country upon graduation.

I am organizing a free scholarship mentorship session next weekend for interested UIites across all faculties. Start working on your CV today!',
  'Academic',
  NULL,
  NULL,
  94,
  37,
  28,
  FALSE,
  'published',
  '2026-09-23T11:00:00.000Z',
  '2026-09-23T11:00:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000104',
  '00000000-0000-4000-a000-000000000104',
  'UI',
  'campus'::visibility_scope_type,
  'student',
  'Campus Earning Poll: What is your biggest bottleneck to earning in USD / remote freelancing right now?',
  'We talk a lot about making money while on campus, but everyone faces different hurdles. Cast your vote below so we can share targeted toolkits and masterclasses addressing the top issue!',
  'Polls',
  NULL,
  '{"question":"What is your biggest hurdle to earning online on campus?","options":[{"id":"opt-1","label":"Reliable electricity / device battery life","votes":54},{"id":"opt-2","label":"High-income digital skill & portfolio proof","votes":41},{"id":"opt-3","label":"Slow internet connection / high data costs","votes":29},{"id":"opt-4","label":"Finding foreign clients & payment setup","votes":72}],"totalVotes":196,"closesAt":"2026-10-30T00:00:00.000Z"}'::jsonb,
  43,
  16,
  7,
  FALSE,
  'published',
  '2026-09-25T16:20:00.000Z',
  '2026-09-25T16:20:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000105',
  '00000000-0000-4000-a000-000000000105',
  'UI',
  'campus'::visibility_scope_type,
  'student',
  'How I raised my CGPA from 2.92 in 200L to a 4.31 First Class track without burning out (The Feynman + Anki Protocol)',
  'At the end of my 200L First Semester in UI Faculty of Law, my results came out and I almost wept. I was cramming 8 hours every night in SUB but remembering nothing in the exam hall.

Here is what changed my life in 300L:

1. Active Recall over Passive Reading:
Instead of highlighting 50 pages of notes, I closed the textbook and forced myself to write down everything from memory on blank sheets of paper.

2. The Feynman Technique:
If I can''t explain a legal doctrine (like Donoghue v Stevenson or Promissory Estoppel) in simple pidgin English to my non-law roommate in 2 minutes, I don''t know it well enough.

3. Past Questions Mapping:
I gathered past exam questions from 2018 to 2024. UI lecturers test principles, not just facts. 70% of exam scenarios are variations of past tests.

Study smart, get 7 hours of sleep, and stay consistent!',
  'Academic',
  NULL,
  NULL,
  88,
  31,
  22,
  FALSE,
  'published',
  '2026-09-23T18:45:00.000Z',
  '2026-09-23T18:45:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000106',
  '00000000-0000-4000-a000-000000000106',
  'UI',
  'campus'::visibility_scope_type,
  'student',
  'UI Off-Campus Housing Guide 2026: Agbowo vs Bodija vs Orogun — Rents, Light, Water & Red Flags',
  'If you are looking for an off-campus apartment around UI this session, read this before paying any agent a single Naira:

1. Agbowo (Closest to UI Main Gate):
- Self-contain: ₦180,000 - ₦280,000/year.
- Pros: Walking distance to campus; cheap bike fares (₦100-₦150).
- Cons: Erratic transformer load in some streets, congested drainage.

2. Bodija / Housing Estate:
- Self-contain: ₦300,000 - ₦450,000/year.
- Pros: Stable power supply, serene environment, excellent security.
- Cons: Transport fare to UI campus is higher (₦250-₦400/trip).

3. Red Flags:
- Never pay "inspection fee" above ₦2,000 to unverified agents.
- Always inspect the water pump and verify the prepaid meter balance before signing agreements.
- Insist on meeting the landlord or accredited caretaker directly.',
  'Housing',
  'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&auto=format&fit=crop&q=80',
  NULL,
  65,
  22,
  16,
  FALSE,
  'published',
  '2026-09-22T15:10:00.000Z',
  '2026-09-22T15:10:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000107',
  '00000000-0000-4000-a000-000000000107',
  'UI',
  'campus'::visibility_scope_type,
  'student',
  'FOUND: Casio Scientific Calculator (fx-991EX) + UI Student ID card at Kenneth Dike Library (KDL) 2nd Floor',
  'Found this Casio scientific calculator along with a plastic UI student ID card yesterday evening (Thursday) around 6:30 PM on Table 14 in the 2nd Floor Quiet Study Wing of KDL.

The owner''s surname begins with "O" from Faculty of Technology.

I have handed it over to the head librarian desk on the ground floor. You can claim it there with proper matric identification or send me a DM here with your department and details so I can confirm!',
  'Lost & Found',
  NULL,
  NULL,
  36,
  8,
  11,
  FALSE,
  'published',
  '2026-09-25T19:00:00.000Z',
  '2026-09-25T19:00:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000201',
  '00000000-0000-4000-a000-000000000201',
  'UNILAG',
  'campus'::visibility_scope_type,
  'student',
  'From Akoka to $1,500/month: How I landed a remote US UI/UX contract using Twitter & Loom teardowns',
  'If you are in UNILAG applying to 200 job postings on LinkedIn and getting zero replies, stop.

Here is the exact method I used to get hired by a Delaware-based B2B SaaS startup:

1. The Unsolicited Teardown:
I picked 5 early-stage startups that recently raised seed rounds on TechCrunch. I used their products, found 3 key UX friction points in their checkout flow, and redesigned them in Figma.

2. The 3-Minute Loom Video:
I recorded a Loom walking through the user drop-off problem and showed the prototype fix. I sent it directly to the founders on Twitter/X and LinkedIn.

3. The Result:
3 of the founders replied. 2 offered short trial contracts, and 1 converted into a retainership paying $1,500/month.

Don''t just show a portfolio of mockups. Show founders that you can directly improve their conversion and revenue.',
  'Tech Hub',
  'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=800&auto=format&fit=crop&q=80',
  NULL,
  112,
  38,
  45,
  TRUE,
  'published',
  '2026-09-24T08:15:00.000Z',
  '2026-09-24T08:15:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000202',
  '00000000-0000-4000-a000-000000000202',
  'UNILAG',
  'campus'::visibility_scope_type,
  'student',
  '5 High-Income Digital Skills Lagos Businesses and SMEs Are Actively Paying Students ₦150k+ For',
  'You don''t need to know how to code to make serious money in Lagos as an undergraduate. Thousands of businesses in Yaba, Ikeja, and Lekki have revenue but zero digital systems.

Here are 5 skills in massive demand:

1. Cloud Bookkeeping (QuickBooks / Wave Accounting):
Small retail and restaurant owners lose track of daily sales. Setting up their monthly ledger takes 4 hours/week and pays ₦60k - ₦100k per client.

2. Short-form Video Editing (CapCut / Premiere Pro):
Brands need 15 TikToks/Reels a month. A student charging ₦8,000 per video earns ₦120,000 from just one client.

3. Google My Business (Local SEO):
Claiming and ranking local clinics, spas, and auto shops on Google Maps so they get calls.

4. WhatsApp Marketing Automation:
Setting up ManyChat / WATI auto-replies for Instagram vendors who get overwhelmed by DMs.

5. Cold Email Prospecting for Lagos Agencies.

Pick ONE skill, practice for 30 days, and pitch 5 local businesses every Saturday.',
  'General',
  NULL,
  NULL,
  79,
  29,
  19,
  FALSE,
  'published',
  '2026-09-24T12:00:00.000Z',
  '2026-09-24T12:00:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000203',
  '00000000-0000-4000-a000-000000000203',
  'UNILAG',
  'campus'::visibility_scope_type,
  'alumni',
  'The exact LinkedIn cold messaging framework that landed me 4 fintech internship interviews as a UNILAG student',
  'When I was in 300L at UNILAG, I had zero connections in the tech industry. I landed my first growth internship at a YC startup using this exact 4-line LinkedIn message:

---
"Hi [Founder Name], love what you are building with [Product Feature]. Noticed your team recently launched [Campaign], and thought of 2 quick growth experiments you could run with campus communities in Lagos to acquire users at lower CAC.

Wrote a brief 1-page summary here: [Link]. No worries if your hands are full, just wanted to share value!"
---

Why this works:
- It praises specific work (not generic flattery).
- It provides immediate value upfront before asking for anything.
- It respects their time.

Stop sending "Dear Sir, please mentor me." Send solutions.',
  'General',
  NULL,
  NULL,
  95,
  34,
  26,
  FALSE,
  'published',
  '2026-09-23T15:30:00.000Z',
  '2026-09-23T15:30:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000204',
  '00000000-0000-4000-a000-000000000204',
  'UNILAG',
  'campus'::visibility_scope_type,
  'student',
  'Tech Stack Poll: What high-income technical skill are you committing to master this semester?',
  'With remote roles expanding and AI tools evolving quickly, what area are you directing your focus on this semester? Let''s see what UNILAG techies are prioritizing!',
  'Polls',
  NULL,
  '{"question":"Which tech track are you committing to master this semester?","options":[{"id":"opt-1","label":"Fullstack Web Dev (React, Next.js, Node/Go)","votes":76},{"id":"opt-2","label":"Mobile App Dev (Flutter, React Native)","votes":38},{"id":"opt-3","label":"Product Design (Figma, Design Systems & UX)","votes":52},{"id":"opt-4","label":"Data Analytics & AI Engineering (Python, SQL)","votes":64}],"totalVotes":230,"closesAt":"2026-10-30T00:00:00.000Z"}'::jsonb,
  61,
  20,
  12,
  FALSE,
  'published',
  '2026-09-25T14:40:00.000Z',
  '2026-09-25T14:40:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000205',
  '00000000-0000-4000-a000-000000000205',
  'UNILAG',
  'campus'::visibility_scope_type,
  'student',
  'Akoka, Bariga, Onike & Yaba Lodge Survival Guide: Rents, Flood Zones, and Security Checklist',
  'Before you pay rent for any off-campus apartment around UNILAG, please note these hard lessons learned from my 2 years living off-campus:

1. Flood Check:
Never inspect an apartment in dry season without inspecting the gutter depth and street slope. Certain areas around Bariga and lower Akoka flood heavily during peak July rains.

2. Power & Prepaid Metering:
Insist on seeing the physical prepaid meter. Many lodges share 1 meter among 12 tenants, leading to weekly fights over estimated recharge contributions.

3. Current Pricing (2026 Reality):
- Single Room (Shared facilities in Akoka): ₦200,000 - ₦300,000
- Studio / Self-contain (Akoka / Onike): ₦350,000 - ₦600,000
- Serviced Studio (Yaba Tech / Alagomeji): ₦700,000 - ₦1.1m

4. Security:
Check if the street gate closes by 10 PM. If you do night classes on campus or work remote jobs, you need a lodge with 24/7 pedestrian access.',
  'Housing',
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&auto=format&fit=crop&q=80',
  NULL,
  71,
  25,
  18,
  FALSE,
  'published',
  '2026-09-22T17:30:00.000Z',
  '2026-09-22T17:30:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000206',
  '00000000-0000-4000-a000-000000000206',
  'UNILAG',
  'campus'::visibility_scope_type,
  'student',
  'Balancing client deadlines with 8 AM UNILAG lectures: How I run a freelance animation studio without going insane',
  'Being a creative freelancer in UNILAG is an extreme sport. You have a 3D animation deliverable due Friday, a group presentation in Faculty of Arts on Thursday, and test scripts to revise.

3 rules that keep my sanity intact:

1. No Client Calls During Lecture Hours:
I set my Calendly availability strictly between 4:30 PM and 7:00 PM. No exceptions.

2. 50% Upfront Commitment Deposit:
Never touch a design project until the 50% deposit hits. Serious clients respect this policy immediately.

3. Batch Work on Weekends:
I render long 3D assets on Sunday nights when the campus library or quiet power corners are clear.

You can earn well while getting your degree if you protect your schedule fiercely.',
  'Social',
  NULL,
  NULL,
  58,
  19,
  14,
  FALSE,
  'published',
  '2026-09-24T18:00:00.000Z',
  '2026-09-24T18:00:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000207',
  '00000000-0000-4000-a000-000000000207',
  'UNILAG',
  'campus'::visibility_scope_type,
  'student',
  'FOUND: HP 65W Blue-Pin Laptop Charger + SanDisk 64GB Flash Drive in Faculty of Engineering Block B',
  'Found an HP 65W original blue-pin power adapter and a metallic red SanDisk 64GB flash drive on the back row bench of Lecture Hall B3 in Faculty of Engineering.

It was forgotten after the 2 PM Digital Signal Processing lecture yesterday.

I handed it to the Departmental EESA Secretariat office. If this belongs to you, come by the office with your student ID or matric number to collect it!',
  'Lost & Found',
  NULL,
  NULL,
  39,
  6,
  9,
  FALSE,
  'published',
  '2026-09-25T11:20:00.000Z',
  '2026-09-25T11:20:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000301',
  '00000000-0000-4000-a000-000000000301',
  'FUNAAB',
  'campus'::visibility_scope_type,
  'student',
  'Real Numbers: How 3 FUNAAB students raised 300 broilers in Kotopo and netted ₦320,000 profit in 7 weeks',
  'People think agriculture is just theory in FUNAAB. Three of us pooled our savings during 400L second semester and rented a small farm pen in Kotopo.

Here are the exact financials:
- Pen Rent (7 weeks cycle): ₦35,000
- Day-Old Chicks (300 birds @ ₦650/chick): ₦195,000
- Feed (Starter & Finisher mash - 24 bags total): ₦380,000
- Vaccines & Medication: ₦22,000
- Mortality: 9 birds lost (3% - well below industry standard of 5%)
- Total Investment: ~₦632,000

Sales at 7 Weeks:
291 live broilers sold at average of ₦3,300 to staff members and Abeokuta hotels during festive demand.
Gross Revenue: ₦960,300.
Net Profit: ₦328,300 (split 3 ways = ₦109,400 each).

Practical agriculture on campus pays real money if you pay attention to feed conversion ratio and biosecurity!',
  'General',
  'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=800&auto=format&fit=crop&q=80',
  NULL,
  104,
  42,
  33,
  TRUE,
  'published',
  '2026-09-24T10:00:00.000Z',
  '2026-09-24T10:00:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000302',
  '00000000-0000-4000-a000-000000000302',
  'FUNAAB',
  'campus'::visibility_scope_type,
  'student',
  'Remote Software Engineering from Camp/Alabata: The Survival Kit (Power, Dual SIM 5G routers & Solar setups)',
  'Doing remote software engineering from Camp or Alabata in Abeokuta has unique challenges, especially electricity and fluctuating cellular towers. Here is the setup that lets me push code to US/UK clients without downtime:

1. Power Setup:
- 100W foldable solar panel + 150Wh portable DC station (cost ₦85k last year, keeps my laptop running 8 extra hours).
- 60,000mAh Romoss power bank for phone and router failover.

2. Network Routing:
- MTN 4G/5G is fastest near Camp junction, but Airtel has stronger uptime in Isolu.
- I use a dual-SIM Huawei LTE router with an auto-failover bridge.

3. Study & Coding Spaces:
- Nimbe Adedipe Library basement during afternoons (quiet, solar backup).
- COLPHYS ICT center for high-bandwidth git operations and docker pulls.

Don''t let location stop you from competing globally. Build your workstation step by step.',
  'Tech Hub',
  'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80',
  NULL,
  77,
  26,
  15,
  FALSE,
  'published',
  '2026-09-23T14:10:00.000Z',
  '2026-09-23T14:10:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000303',
  '00000000-0000-4000-a000-000000000303',
  'FUNAAB',
  'campus'::visibility_scope_type,
  'student',
  'Making money during exam weeks: How our healthy granola and packaged snacks business clears ₦50k/week',
  'During FUNAAB exam weeks, thousands of students are burning midnight candles across Motion Ground, 2,000-Seater, and COLAMRUD lecture theaters.

Everyone gets hungry at 1 AM and the gate canteens are closed.

We started packaging ₦500 energy snack packs (roasted groundnuts, baked coconut chips, dried tiger nuts, and honey oats) sealed in airtight foil pouches:

- Shelf life: 30 days.
- Production cost per pouch: ₦220.
- Sale price: ₦500.
- Sold per night: 30-40 packs across student reading circles.

By solving a real campus convenience problem, we made over ₦150k pure profit during the 3-week examination window last semester!',
  'Social',
  NULL,
  NULL,
  64,
  21,
  13,
  FALSE,
  'published',
  '2026-09-24T19:30:00.000Z',
  '2026-09-24T19:30:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000304',
  '00000000-0000-4000-a000-000000000304',
  'FUNAAB',
  'campus'::visibility_scope_type,
  'student',
  'Network Reliability Poll: Which mobile network is currently most reliable for hotspot coding in Camp & Isolu?',
  'Fellow developers and tech freelancers living around Camp, Isolu, and Oluwo: vote for your top network provider for late-night internet access (11 PM - 5 AM).',
  'Polls',
  NULL,
  '{"question":"Most consistent network for remote work around Camp/Isolu?","options":[{"id":"opt-1","label":"MTN 4G / 5G","votes":68},{"id":"opt-2","label":"Airtel NG","votes":53},{"id":"opt-3","label":"Glo 4G","votes":19},{"id":"opt-4","label":"Starlink / Shared Community WiFi","votes":31}],"totalVotes":171,"closesAt":"2026-10-30T00:00:00.000Z"}'::jsonb,
  46,
  17,
  8,
  FALSE,
  'published',
  '2026-09-25T13:00:00.000Z',
  '2026-09-25T13:00:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000305',
  '00000000-0000-4000-a000-000000000305',
  'FUNAAB',
  'campus'::visibility_scope_type,
  'alumni',
  'Why FUNAAB students are sitting on a goldmine: The overlooked agricultural export opportunity (Ginger, Sesame, Cashew)',
  'To every student in COLAMRUD, COLPLANT, and COLANIM:

Stop thinking that your agricultural degree prepares you only for farm labor or civil service jobs. Nigeria exported over $400M in non-oil agricultural commodities last year.

The real money is in commodity sourcing, quality grading, and aggregation:
1. Cashew aggregation in Ogun and Oyo state farming clusters.
2. Dried split ginger moisture testing and bulk bagging.
3. Sesame seed cleaning.

Exporters in Lagos pay cash on delivery for commodities that meet strict moisture and purity standards (which you learn right here in our labs).

Learn the laboratory testing and logistics side of agribusiness, not just crop planting. That is where seven-figure export margins are built.',
  'Academic',
  NULL,
  NULL,
  91,
  35,
  29,
  FALSE,
  'published',
  '2026-09-23T12:30:00.000Z',
  '2026-09-23T12:30:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

INSERT INTO public.posts (
  id,
  author_id,
  campus_code,
  visibility_scope,
  audience_scope,
  title,
  content,
  category,
  image_url,
  poll_data,
  likes_count,
  comments_count,
  reposts_count,
  is_pinned,
  status,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-b000-000000000306',
  '00000000-0000-4000-a000-000000000306',
  'FUNAAB',
  'campus'::visibility_scope_type,
  'student',
  'FUNAAB Off-Campus Lodges: Camp vs Kotopo vs Isolu vs Osiele — Pricing, Borehole Water & Security Realities',
  'Choosing a lodge outside FUNAAB gate can make or break your academic semester. Here is the realistic breakdown for 2026:

1. Camp (Close to gate, highly populated):
- Self-contain: ₦180,000 - ₦280,000/year.
- Pros: Fastest transit to campus gate via shuttle bus or bike (₦100-₦150); abundant food spots.
- Cons: Noise level, competition for borehole pumping during dry spells.

2. Kotopo:
- Self-contain: ₦150,000 - ₦240,000/year.
- Pros: More serene, better accommodation sizes, good farm space.
- Cons: Longer transit distance; bike fare can reach ₦250 - ₦300 during peak rush.

3. Isolu & Oluwo:
- Excellent modern lodges for techies and quiet study, but confirm power transformer stability.

Golden Rule: Verify that the lodge has a functioning generator or solar inverter for water pumping before paying caution fee!',
  'Housing',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&auto=format&fit=crop&q=80',
  NULL,
  57,
  19,
  12,
  FALSE,
  'published',
  '2026-09-22T16:00:00.000Z',
  '2026-09-22T16:00:00.000Z'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  poll_data = EXCLUDED.poll_data,
  likes_count = EXCLUDED.likes_count,
  comments_count = EXCLUDED.comments_count,
  reposts_count = EXCLUDED.reposts_count,
  is_pinned = EXCLUDED.is_pinned,
  status = EXCLUDED.status;

COMMIT;


-- Update bot profile avatars to authentic Nigerian student portraits
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_prevent_profile_role_escalation') THEN
    ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation;
  END IF;

  UPDATE public.profiles
  SET avatar_url = CASE id::text
    WHEN '00000000-0000-4000-a000-000000000101' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Law_Students_Nigeria_Iftar_2023_01.jpg/500px-Law_Students_Nigeria_Iftar_2023_01.jpg'
    WHEN '00000000-0000-4000-a000-000000000102' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Law_Students_Nigeria_Iftar_2023_02.jpg/500px-Law_Students_Nigeria_Iftar_2023_02.jpg'
    WHEN '00000000-0000-4000-a000-000000000103' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Law_Students_Nigeria_Iftar_2023_16.jpg/500px-Law_Students_Nigeria_Iftar_2023_16.jpg'
    WHEN '00000000-0000-4000-a000-000000000104' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Law_Students_Nigeria_Iftar_2023_12.jpg/500px-Law_Students_Nigeria_Iftar_2023_12.jpg'
    WHEN '00000000-0000-4000-a000-000000000105' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Law_Students_Nigeria_Iftar_2023_17.jpg/500px-Law_Students_Nigeria_Iftar_2023_17.jpg'
    WHEN '00000000-0000-4000-a000-000000000106' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Law_Students_Nigeria_Iftar_2023_13.jpg/500px-Law_Students_Nigeria_Iftar_2023_13.jpg'
    WHEN '00000000-0000-4000-a000-000000000107' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Law_Students_Nigeria_Iftar_2023_18.jpg/500px-Law_Students_Nigeria_Iftar_2023_18.jpg'
    WHEN '00000000-0000-4000-a000-000000000201' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Law_Students_Nigeria_Iftar_2023_14.jpg/500px-Law_Students_Nigeria_Iftar_2023_14.jpg'
    WHEN '00000000-0000-4000-a000-000000000202' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Discovery_For_Youth_02.jpg/500px-Discovery_For_Youth_02.jpg'
    WHEN '00000000-0000-4000-a000-000000000203' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Law_Students_Nigeria_Iftar_2023_15.jpg/500px-Law_Students_Nigeria_Iftar_2023_15.jpg'
    WHEN '00000000-0000-4000-a000-000000000204' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Discovery_For_Youth_03.jpg/500px-Discovery_For_Youth_03.jpg'
    WHEN '00000000-0000-4000-a000-000000000205' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Discovery_For_Youth_04.jpg/500px-Discovery_For_Youth_04.jpg'
    WHEN '00000000-0000-4000-a000-000000000206' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Discovery_For_Youth_05.jpg/500px-Discovery_For_Youth_05.jpg'
    WHEN '00000000-0000-4000-a000-000000000207' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Discovery_For_Youth_06.jpg/500px-Discovery_For_Youth_06.jpg'
    WHEN '00000000-0000-4000-a000-000000000301' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Discovery_For_Youth_07.jpg/500px-Discovery_For_Youth_07.jpg'
    WHEN '00000000-0000-4000-a000-000000000302' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Discovery_For_Youth_08.jpg/500px-Discovery_For_Youth_08.jpg'
    WHEN '00000000-0000-4000-a000-000000000303' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Discovery_For_Youth_09.jpg/500px-Discovery_For_Youth_09.jpg'
    WHEN '00000000-0000-4000-a000-000000000304' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Discovery_For_Youth_10.jpg/500px-Discovery_For_Youth_10.jpg'
    WHEN '00000000-0000-4000-a000-000000000305' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Discovery_For_Youth_11.jpg/500px-Discovery_For_Youth_11.jpg'
    WHEN '00000000-0000-4000-a000-000000000306' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Discovery_For_Youth_16.jpg/500px-Discovery_For_Youth_16.jpg'
    ELSE avatar_url
  END
  WHERE id::text LIKE '00000000-0000-4000-a000-%';

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_prevent_profile_role_escalation') THEN
    ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation;
  END IF;
END $$;
