import { UserRole } from '@/api/types';

/**
 * Mirrors the onboarding flowcharts in PRD Section 5. Each entry is an
 * expo-router path; the auth resolver (app/index.tsx) and AuthLayout use
 * this to know what step comes after the current one, and where to
 * resume if the app is closed mid-onboarding.
 *
 * Revamped from 7 (student) / 8 (alumni) steps down to 4: the old chain
 * spread department/bio/photo across 3 separate screens and had two steps
 * that persisted nothing at all (browse-directory was a read-only preview;
 * connect-classmates never saved the connection). build-profile now
 * collects department + bio + photo together, and get-started replaces
 * both connect-classmates and the role-specific closing screen
 * (join-community / browse-directory + join-event) with one screen that
 * actually connects/joins/RSVPs instead of just previewing.
 */
export const ONBOARDING_STEPS: Record<Extract<UserRole, 'student' | 'alumni'>, string[]> = {
  student: [
    '/(auth)/verify-school',
    '/(auth)/onboarding/build-profile',
    '/(auth)/onboarding/select-interests',
    '/(auth)/onboarding/get-started',
  ],
  alumni: [
    '/(auth)/verify-alumni',
    '/(auth)/onboarding/build-profile',
    '/(auth)/onboarding/select-interests',
    '/(auth)/onboarding/get-started',
  ],
};

/**
 * Conditional detour shown right after the verify step when the user's
 * email domain doesn't match a launched institution (see
 * src/api/institutions.ts's getInstitutionForEmail). Not part of
 * ONBOARDING_STEPS since whether it's shown depends on the user's email,
 * not their role - useAdvanceOnboarding is the only caller that needs to
 * know about it, via nextOnboardingStep's institutionMatched param.
 */
export const WAITLIST_STEP = '/(auth)/onboarding/join-waitlist';

const VERIFY_STEPS = new Set<string>([ONBOARDING_STEPS.student[0], ONBOARDING_STEPS.alumni[0]]);

export function firstOnboardingStep(role: UserRole): string {
  if (role === 'student' || role === 'alumni') return ONBOARDING_STEPS[role][0];
  // Staff/admin accounts are provisioned by invite (PRD Sections 5.3/5.4)
  // and don't self-register through this flow, so they have no
  // onboarding chain here.
  return '/(auth)/verify-school';
}

export function nextOnboardingStep(role: UserRole, currentPath: string, institutionMatched = true): string | null {
  if (role !== 'student' && role !== 'alumni') return null;
  const steps = ONBOARDING_STEPS[role];

  if (VERIFY_STEPS.has(currentPath)) {
    return institutionMatched ? steps[1] : WAITLIST_STEP;
  }
  if (currentPath === WAITLIST_STEP) {
    return steps[1];
  }

  const index = steps.indexOf(currentPath);
  if (index === -1 || index === steps.length - 1) return null;
  return steps[index + 1];
}

/** Returns 1-based step number and total step count, for progress UI. */
export function onboardingProgress(role: UserRole, currentPath: string): { step: number; total: number } {
  if (role !== 'student' && role !== 'alumni') return { step: 1, total: 1 };
  const steps = ONBOARDING_STEPS[role];
  // The waitlist detour doesn't get its own slot in the total - it's an
  // interstitial that piggybacks on the verify step's position rather than
  // stretching the progress bar for the subset of users who see it.
  if (currentPath === WAITLIST_STEP) return { step: 1, total: steps.length };
  const index = steps.indexOf(currentPath);
  return { step: (index === -1 ? 0 : index) + 1, total: steps.length };
}
