import { router } from 'expo-router';
import { useAuth } from './AuthContext';
import { nextOnboardingStep } from './onboardingSteps';

/**
 * Used by every screen in the onboarding chain. Each screen calls the returned
 * function when its "Continue" action succeeds; it looks up what comes next
 * for the user's role and either advances or, if this was the last step, marks
 * onboarding complete and sends the user to the dashboard.
 */
export function useAdvanceOnboarding(currentPath: string) {
  const { user, setOnboardingStep, completeOnboarding } = useAuth();

  return async function advance() {
    const userRole = user?.role || 'student';
    const next = nextOnboardingStep(userRole, currentPath);
    if (next) {
      await setOnboardingStep(next);
      router.replace(next as any);
    } else {
      // Ensure student/alumni users have actually completed university and department
      const isAcademicRole = userRole === 'student' || userRole === 'alumni';
      const hasAcademicProfile = !!(user?.campusCode && user.campusCode !== 'GLOBAL' && user?.department && user.department.trim());

      if (isAcademicRole && !hasAcademicProfile) {
        await setOnboardingStep('/(auth)/onboarding/build-profile');
        router.replace('/(auth)/onboarding/build-profile');
        return;
      }

      await completeOnboarding();
      router.replace('/');
    }
  };
}
