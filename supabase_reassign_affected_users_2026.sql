-- ============================================================================
-- LIORIS: REASSIGN AFFECTED USERS FROM UI TO UNILAG & FUNAAB
-- 
-- Run this script in the Supabase SQL Editor:
-- 1. Step 1 inspects the most recent user registrations.
-- 2. Step 2 automatically reassigns any user who signed up for UNILAG or FUNAAB.
-- 3. Step 3 provides explicit single-user updates if emails are known.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: Inspect the most recent users
-- ----------------------------------------------------------------------------
SELECT 
    p.id, 
    p.email, 
    p.full_name, 
    p.username, 
    p.campus_code AS current_profile_campus,
    u.raw_user_meta_data->>'campus_code' AS signup_metadata_campus,
    p.created_at
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
ORDER BY p.created_at DESC
LIMIT 10;

-- ----------------------------------------------------------------------------
-- STEP 2: Automatic Reassignment via Auth Metadata
-- This immediately reassigns users whose signup metadata recorded UNILAG or FUNAAB
-- ----------------------------------------------------------------------------
UPDATE public.profiles p
SET 
    campus_code = u.raw_user_meta_data->>'campus_code',
    updated_at = now()
FROM auth.users u
WHERE p.id = u.id
  AND u.raw_user_meta_data->>'campus_code' IN ('UNILAG', 'FUNAAB')
  AND p.campus_code IS DISTINCT FROM (u.raw_user_meta_data->>'campus_code');

-- ----------------------------------------------------------------------------
-- STEP 3: Verification Check
-- ----------------------------------------------------------------------------
SELECT 
    p.id, 
    p.email, 
    p.full_name, 
    p.campus_code, 
    u.raw_user_meta_data->>'campus_code' AS meta_campus,
    p.updated_at
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
WHERE p.campus_code IN ('UNILAG', 'FUNAAB')
ORDER BY p.updated_at DESC
LIMIT 10;
