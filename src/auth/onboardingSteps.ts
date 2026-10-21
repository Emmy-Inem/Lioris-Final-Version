import type { UserRole } from '@/api/types';

/**
 * Streamlined onboarding flow for new users:
 * 1. build-profile: University, College/Faculty, Department, Level, optional photo & bio.
 * 2. select-interests: Legacy-compatible route for joining real campus discussion spaces.
 *    Keeping the path prevents older paused sessions from breaking.
 * 3. verify: Prove campus membership with one photo. Always skippable - it is also reachable
 *    later from the profile and the home-screen notice, so it never blocks first-time onboarding.
 * 4. get-started: Campus welcome and seamless launch to dashboard.
 *
 * A member aged 13-17 who has not given a guardian yet gets ONE extra step straight after build-profile
 * (GUARDIAN_STEP). It is not in the lists below: adults never see it, and it is always skippable (the account just
 * stays limited until the guardian's consent is confirmed - see MinorConsentBanner).
 */
export const GUARDIAN_STEP = '/(auth)/onboarding/guardian-details';

export const ONBOARDING_STEPS: Record<Extract<UserRole, 'student' | 'alumni'>, string[]> = {
  student: [
    '/(auth)/onboarding/build-profile',
    '/(auth)/onboarding/select-interests',
    '/(auth)/onboarding/verify',
    '/(auth)/onboarding/get-started',
  ],
  alumni: [
    '/(auth)/onboarding/build-profile',
    '/(auth)/onboarding/select-interests',
    '/(auth)/onboarding/verify',
    '/(auth)/onboarding/get-started',
  ],
};

export function firstOnboardingStep(role?: UserRole): string {
  return '/(auth)/onboarding/build-profile';
}

/**
 * A step stored on the profile (or in an old cached session) is only trusted if it is still a real step for
 * the role; a retired path would redirect to a route that no longer exists.
 */
export function resolveOnboardingStep(role: UserRole | undefined, step?: string | null): string {
  if (role && (role === 'student' || role === 'alumni') && step && (ONBOARDING_STEPS[role].includes(step) || step === GUARDIAN_STEP)) return step;
  return firstOnboardingStep(role);
}

export function nextOnboardingStep(role: UserRole, currentPath: string, options: { needsGuardian?: boolean } = {}): string | null {
  if (role !== 'student' && role !== 'alumni') return null;
  const steps = ONBOARDING_STEPS[role];

  if (options.needsGuardian && currentPath === steps[0]) return GUARDIAN_STEP;
  if (currentPath === GUARDIAN_STEP) return steps[1];

  const index = steps.indexOf(currentPath);
  if (index === -1 || index === steps.length - 1) return null;
  return steps[index + 1];
}

/** Returns 1-based step number and total step count, for progress UI. */
export function onboardingProgress(role: UserRole, currentPath: string): { step: number; total: number } {
  if (role !== 'student' && role !== 'alumni') return { step: 1, total: 3 };
  const steps = ONBOARDING_STEPS[role];
  const index = steps.indexOf(currentPath);
  return { step: (index === -1 ? 0 : index) + 1, total: steps.length };
}
