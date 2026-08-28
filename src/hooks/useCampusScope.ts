import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useViewScope } from './useViewScope';
import { getMyProfile } from '@/api/profile';

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

  const homeInstitutionCode = profile?.institutionCode;
  const campusCode = scope === 'global' ? 'GLOBAL' : activeCampusCode || homeInstitutionCode;

  return { scope, setScope, activeCampusCode, setActiveCampusCode, campusCode, homeInstitutionCode };
}
