-- ============================================================================
-- LIORIS - ONBOARDING COMPLETION & FACULTY/COLLEGE PERSISTENCE (2026)
-- ============================================================================
-- 1. Ensure `onboarding_complete` column exists on public.profiles.
-- 2. Ensure `faculty` column exists on public.profiles.
-- 3. Backfill: users with a department already set or who are staff/admin
--    are marked as onboarding_complete = true.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS faculty TEXT;

-- Backfill existing users with departments or administrative roles
UPDATE public.profiles
SET onboarding_complete = TRUE
WHERE onboarding_complete = FALSE
  AND (department IS NOT NULL OR role IN ('staff', 'admin'));

NOTIFY pgrst, 'reload schema';
