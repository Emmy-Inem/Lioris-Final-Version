import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useViewScope } from './useViewScope';
import { getMyProfile } from '@/api/profile';
import { getInstitutionForEmail } from '@/api/institutions';
import { isSuperAdminIdentity } from '@/utils/campusAccess';

/**
 * Resolves the campusCode that should be passed into any campus-scoped
 * list query (marketplace, jobs, events, resources, study groups).
 *
 * For Super Admin:
 * - By default (when no specific campus workspace is actively picked to explore),
 *   Super Admin sees ALL universities at once across Dashboard, Events,
 *   Resources, Portals, and Discussions (returns 'ALL').
 * - When exploring a specific campus (via "Explore Other Campus Workspaces"),
 *   it returns that specific university code (e.g. 'UNILAG', 'UI').
 *
 * For Regular Students, Campus Admins & Staff:
 * - Strictly isolated to their own university (homeInstitutionCode).
 * - They cannot explore other universities or see content from other institutions.
 */
export function useCampusScope() {
  const { user } = useAuth();
  const { scope, setScope, activeCampusCode, setActiveCampusCode } = useViewScope();

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  const isSuperAdmin = isSuperAdminIdentity(user);

  // Match on the email *domain*, not a substring of the whole address.
  // The old substring test mis-assigned campuses in ways that break the
  // isolation rule this hook exists to enforce: `includes('oau')` claimed
  // joaustin@unilag.edu.ng for OAU, and the hardcoded demo names meant
  // diana.prince@unilag.edu.ng resolved to UI. Every demo account is
  // @ui.edu.ng, so plain domain matching already covers them.
  const deducedFromEmail = getInstitutionForEmail(user?.email ?? '')?.code;

  // Deliberately does NOT fall back to activeCampusCode: this is meant to
  // answer "what's this person's own campus," independent of whatever an
  // admin currently has picked to explore - falling back to it here used to
  // make homeInstitutionCode equal activeCampusCode whenever the viewer's
  // own profile has no institutionCode (e.g. a root admin signed up with a
  // personal email), which made every "am I exploring a different campus"
  // check below always false for exactly the account most likely to explore.
  const homeInstitutionCode = (profile?.institutionCode && profile.institutionCode !== 'GLOBAL')
    ? profile.institutionCode
    : (deducedFromEmail && deducedFromEmail !== 'GLOBAL')
    ? deducedFromEmail
    : undefined;

  // Super Admin view:
  // If activeCampusCode is explicitly chosen (e.g. 'UNILAG' or 'UI' when exploring), scope to that campus.
  // When no specific campus is selected (or when set to 'ALL' / 'GLOBAL'),
  // Super Admin defaults to 'ALL' - seeing every university at once across all resources, events, discussions.
  // Regular students / campus staff / campus ambassadors:
  // Strictly isolated to their own home university (or GLOBAL if national).
  const campusCode = isSuperAdmin
    ? (activeCampusCode && activeCampusCode !== 'GLOBAL' && activeCampusCode !== 'ALL'
        ? activeCampusCode
        : 'ALL')
    : (scope === 'global'
        ? 'GLOBAL'
        : (activeCampusCode && activeCampusCode !== 'GLOBAL'
            ? activeCampusCode
            : homeInstitutionCode || 'GLOBAL'));

  return { scope, setScope, activeCampusCode, setActiveCampusCode, campusCode, homeInstitutionCode, isSuperAdmin };
}
