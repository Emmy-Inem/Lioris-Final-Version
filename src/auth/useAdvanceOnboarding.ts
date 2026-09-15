import { router } from'expo-router';
import { useAuth } from'./AuthContext';
import { nextOnboardingStep } from'./onboardingSteps';
import { getInstitutionForEmail } from '@/api/institutions';

/**
 * Used by every screen in the onboarding chain (PRD Section 5). Each
 * screen calls the returned function when its"Continue"action
 * succeeds; it looks up what comes next for the user's role and either
 * advances or, if this was the last step, marks onboarding complete and
 * sends the user to the resolver (which routes to their dashboard).
 */
export function useAdvanceOnboarding(currentPath: string) {
 const { user, setOnboardingStep, completeOnboarding } = useAuth();

 return async function advance() {
 const userRole = user?.role || 'student';
 // Whether to detour through the "join the waitlist" step right after
 // verify - see onboardingSteps.ts's WAITLIST_STEP.
 const institutionMatched = !user?.email || Boolean(getInstitutionForEmail(user.email));
 const next = nextOnboardingStep(userRole, currentPath, institutionMatched);
 if (next && user && user.onboardingComplete === false) {
 await setOnboardingStep(next);
 router.replace(next as any);
 } else {
 await completeOnboarding();
 router.replace('/');
 }
 };
}
