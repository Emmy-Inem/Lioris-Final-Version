-- Adds an explicit, server-side onboarding-complete flag to profiles.
--
-- Previously, "has this user finished onboarding" was inferred client-side
-- from Boolean(profile.department), backstopped only by a same-browser
-- localStorage cache. Any account whose department was never set (e.g. the
-- seeded alumni demo account) got routed through the entire onboarding
-- chain again on every fresh device/browser/session, even after finishing
-- it once. This column makes onboarding-complete an explicit, durable,
-- server-side fact instead of an inferred one.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: anyone who already has a department set, or is staff/admin
-- (who never go through the self-serve onboarding chain), is considered
-- already onboarded so existing users aren't sent through onboarding again.
UPDATE profiles
SET onboarding_complete = TRUE
WHERE onboarding_complete = FALSE
  AND (department IS NOT NULL OR role IN ('staff', 'admin'));
