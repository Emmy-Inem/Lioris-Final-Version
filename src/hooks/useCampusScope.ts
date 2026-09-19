import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useViewScope } from './useViewScope';
import { getMyProfile } from '@/api/profile';
import { getInstitutionForEmail } from '@/api/institutions';

/**
 * Resolves the campusCode that should be passed into any campus-scoped
 * list query (marketplace, jobs, events, resources, study groups).
 *
 * Settings -> "Change Workspace Scope" lets a user pick Campus vs Global,
 * and lets an admin additionally preview another campus entirely
 * ("Explore Other Campus Workspaces"). Previously that choice only ever
 * changed the accent color and a header label - none of the list screens
 * read it, so every list silently defaulted to the caller's own home
 * campus (via src/api/*.ts's own "infer from my profile" fallback)
 * regardless of what was selected. Passing an explicit campusCode here
 * (instead of leaving it undefined) is what makes the toggle real:
 *   - scope === 'global'  -> 'GLOBAL' (see everything, not just home campus)
 *   - scope === 'campus'  -> the admin's chosen activeCampusCode, or the
 *     viewer's own home campus if they haven't picked one
 */
export function useCampusScope() {
  const { user } = useAuth();
  const { scope, setScope, activeCampusCode, setActiveCampusCode } = useViewScope();

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  // Match on the email *domain*, not a substring of the whole address.
  // The old substring test mis-assigned campuses in ways that break the
  // isolation rule this hook exists to enforce: `includes('oau')` claimed
  // joaustin@unilag.edu.ng for OAU, and the hardcoded demo names meant
  // diana.prince@unilag.edu.ng resolved to UI. Every demo account is
  // @ui.edu.ng, so plain domain matching already covers them.
  const deducedFromEmail = getInstitutionForEmail(user?.email ?? '')?.code;

  const rawHome = (profile?.institutionCode && profile.institutionCode !== 'GLOBAL')
    ? profile.institutionCode
    : (deducedFromEmail && deducedFromEmail !== 'GLOBAL')
    ? deducedFromEmail
    : undefined;
  const homeInstitutionCode = rawHome;
  const campusCode = scope === 'global' ? 'GLOBAL' : (activeCampusCode && activeCampusCode !== 'GLOBAL' ? activeCampusCode : homeInstitutionCode);

  return { scope, setScope, activeCampusCode, setActiveCampusCode, campusCode, homeInstitutionCode };
}
