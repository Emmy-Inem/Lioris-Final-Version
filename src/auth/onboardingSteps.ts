import { UserRole } from '@/api/types';

/**
 * Mirrors the onboarding flowcharts in PRD Section 5. Each entry is an
 * expo-router path; the auth resolver (app/index.tsx) and AuthLayout use
 * this to know what step comes after the current one, and where to
 * resume if the app is closed mid-onboarding.
 */
export const ONBOARDING_STEPS: Record<Extract<UserRole, 'student' | 'alumni'>, string[]> = {
  student: [
    '/(auth)/verify-email',
    '/(auth)/verify-school',
    '/(auth)/onboarding/choose-department',
    '/(auth)/onboarding/select-interests',
    '/(auth)/onboarding/upload-photo',
    '/(auth)/onboarding/complete-profile',
    '/(auth)/onboarding/connect-classmates',
    '/(auth)/onboarding/join-community',
  ],
  alumni: [
    '/(auth)/verify-email',
    '/(auth)/verify-alumni',
    '/(auth)/onboarding/complete-profile',
    '/(auth)/onboarding/select-interests',
    '/(auth)/onboarding/upload-photo',
    '/(auth)/onboarding/browse-directory',
    '/(auth)/onboarding/connect-classmates',
    '/(auth)/onboarding/join-event',
  ],
};

export function firstOnboardingStep(role: UserRole): string {
  if (role === 'student' || role === 'alumni') return ONBOARDING_STEPS[role][0];
  // Staff/admin accounts are provisioned by invite (PRD Sections 5.3/5.4)
  // and don't self-register through this flow, so they have no
  // onboarding chain here.
  return '/(auth)/verify-email';
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
  if (role !== 'student' && role !== 'alumni') return { step: 1, total: 1 };
  const steps = ONBOARDING_STEPS[role];
  const index = steps.indexOf(currentPath);
  return { step: (index === -1 ? 0 : index) + 1, total: steps.length };
}
