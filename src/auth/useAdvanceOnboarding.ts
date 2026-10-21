import { router } from 'expo-router';
import { useAuth } from './AuthContext';
import { firstOnboardingStep, nextOnboardingStep } from './onboardingSteps';
import { getMyMinorStatus } from '@/api/minors';
import { useToast } from '@/context/ToastContext';

/**
 * Used by every screen in the onboarding chain. Each screen calls the returned
 * function when its "Continue" action succeeds; it looks up what comes next
 * for the user's role and either advances or, if this was the last step, marks
 * onboarding complete and sends the user to the dashboard.
 *
 * Resolves to true when the member moved on. Failures are reported to the member (a toast) instead of
 * becoming an unhandled rejection that left the button looking dead.
 */
export function useAdvanceOnboarding(currentPath: string) {
  const { user, setOnboardingStep, completeOnboarding, refreshUser } = useAuth();
  const toast = useToast();

  return async function advance(): Promise<boolean> {
    const userRole = user?.role || 'student';
    try {
      // Right after the profile step, a member aged 13-17 with no guardian on file is taken to the guardian step.
      // Best effort: if the status cannot be read the flow simply carries on (the banner asks again later).
      let needsGuardian = false;
      if (currentPath === firstOnboardingStep(userRole)) {
        const minor = await getMyMinorStatus();
        needsGuardian = !!minor && minor.isMinor && !minor.isUnder13 && minor.consentStatus === 'missing';
      }
      const next = nextOnboardingStep(userRole, currentPath, { needsGuardian });
      if (next) {
        await setOnboardingStep(next);
        router.replace(next as any);
        return true;
      }

      // Ensure student/alumni users have actually completed university and department
      const isAcademicRole = userRole === 'student' || userRole === 'alumni';
      let hasAcademicProfile = !!(user?.campusCode && user.campusCode !== 'GLOBAL' && user?.department && user.department.trim());

      if (isAcademicRole && !hasAcademicProfile) {
        // Fetch fresh profile from DB to verify if saved in a prior step
        const refreshed = await refreshUser();
        hasAcademicProfile = !!(refreshed?.campusCode && refreshed.campusCode !== 'GLOBAL' && refreshed?.department && refreshed.department.trim());
      }

      if (isAcademicRole && !hasAcademicProfile) {
        await setOnboardingStep('/(auth)/onboarding/build-profile');
        router.replace('/(auth)/onboarding/build-profile');
        return false;
      }

      await completeOnboarding();
      const dest = userRole === 'alumni' ? '/(alumni)/dashboard' : '/(student)/dashboard';
      router.replace(dest as any);
      return true;
    } catch (err: any) {
      if (err?.message === 'ACADEMIC_PROFILE_INCOMPLETE') {
        // The server says campus or department is still missing: send them back to fill it in.
        toast.error('Choose your university and department to continue.');
        await setOnboardingStep('/(auth)/onboarding/build-profile').catch(() => {});
        router.replace('/(auth)/onboarding/build-profile');
        return false;
      }
      toast.error(err?.message || 'We could not continue. Check your connection and try again.');
      return false;
    }
  };
}
