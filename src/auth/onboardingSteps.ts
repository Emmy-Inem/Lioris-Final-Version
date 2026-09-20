import { UserRole } from '@/api/types';

/**
 * Streamlined onboarding flow for new users:
 * 1. build-profile: University, College/Faculty, Department, Level, optional photo & bio.
 * 2. select-interests: Quick topic tags to personalize student feeds and events.
 * 3. verify: Prove campus membership with one photo. Always skippable - it is also reachable
 *    later from the profile and the home-screen notice, so it never blocks first-time onboarding.
 * 4. get-started: Campus welcome and seamless launch to dashboard.
 */
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

export function nextOnboardingStep(role: UserRole, currentPath: string): string | null {
  if (role !== 'student' && role !== 'alumni') return null;
  const steps = ONBOARDING_STEPS[role];

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
