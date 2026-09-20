import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { getInstitutionByCode } from './institutions';
import { useAuth } from '@/auth/AuthContext';

/**
 * Who is entitled to see a campus, and - when they are not - why not.
 *
 * IMPORTANT: this is NOT the security control. The boundary is RLS:
 * `public.auth_campus_access()` decides server-side what a caller may read,
 * and an unverified account simply gets zero campus rows back. This hook
 * exists so the UI can say "verify to unlock" instead of rendering a
 * mysteriously empty feed, and so we do not let someone type out a post the
 * database is guaranteed to reject.
 *
 * The rule mirrors `auth_campus_access()` exactly:
 *   - admin / staff  -> always in (two admins are unverified today; walling
 *                       them would lock the owner out of his own platform)
 *   - verified       -> in, for their own campus
 *   - everyone else  -> GLOBAL content only
 */
export interface CampusAccess {
  hasCampusAccess: boolean;
  campusCode: string | null;
  reason: 'verified' | 'admin' | 'staff' | 'unverified' | 'pending' | 'rejected' | 'no-campus';
}

export const CAMPUS_ACCESS_KEY = 'campus-access';

/** Raw row we need from `profiles`. Deliberately NOT `getMyProfile()`: that
 *  helper collapses `rejected` into `none`, and a rejected applicant needs
 *  different wording (re-apply) from someone who never applied. */
interface CampusAccessRow {
  role: string | null;
  campusCode: string | null;
  verificationStatus: string | null;
}

const LOCKED_OUT: CampusAccess = {
  hasCampusAccess: false,
  campusCode: null,
  reason: 'unverified',
};

/** Pure, testable mapping from a profile row to the access decision. */
export function deriveCampusAccess(row: CampusAccessRow | null | undefined): CampusAccess {
  if (!row) return LOCKED_OUT;

  const role = (row.role ?? 'student').toLowerCase();
  const rawCampus = row.campusCode ?? null;
  const campusCode = rawCampus && rawCampus !== 'GLOBAL' ? rawCampus : null;
  const status = (row.verificationStatus ?? '').toLowerCase();

  // Moderators keep reach regardless of verification status.
  if (role === 'admin' || role === 'staff') {
    return { hasCampusAccess: true, campusCode, reason: role === 'admin' ? 'admin' : 'staff' };
  }

  // Nobody claims a campus -> there is nothing to unlock, only GLOBAL.
  if (!campusCode) {
    return { hasCampusAccess: false, campusCode: null, reason: 'no-campus' };
  }

  if (status === 'verified') {
    return { hasCampusAccess: true, campusCode, reason: 'verified' };
  }

  if (status === 'pending') {
    return { hasCampusAccess: false, campusCode, reason: 'pending' };
  }

  if (status === 'rejected') {
    return { hasCampusAccess: false, campusCode, reason: 'rejected' };
  }

  return { hasCampusAccess: false, campusCode, reason: 'unverified' };
}

export async function fetchCampusAccess(userId: string): Promise<CampusAccess> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, campus_code, verification_status')
    .eq('id', userId)
    .single();

  if (error || !data) {
    // Fail CLOSED in the UI: show the locked card rather than a broken feed.
    // The database is the real gate either way, so this only affects wording.
    return LOCKED_OUT;
  }

  return deriveCampusAccess({
    role: data.role ?? null,
    campusCode: data.campus_code ?? null,
    verificationStatus: data.verification_status ?? null,
  });
}

/**
 * Cached with React Query under ['campus-access', userId] so it invalidates
 * alongside ['profile'] when verification is submitted or approved.
 */
export function useCampusAccess(): CampusAccess & { isLoading: boolean } {
  let userId: string | undefined;
  let sessionRole: string | undefined;
  try {
    const auth = useAuth();
    userId = auth?.user?.id;
    sessionRole = auth?.user?.role;
  } catch {
    // Rendered outside AuthProvider (isolated previews / tests).
  }

  const { data, isLoading } = useQuery({
    queryKey: [CAMPUS_ACCESS_KEY, userId],
    queryFn: () => fetchCampusAccess(userId!),
    enabled: !!userId,
    staleTime: 60_000,
  });

  if (!userId) {
    return { ...LOCKED_OUT, reason: 'no-campus', isLoading: false };
  }

  if (!data) {
    // While loading, trust the session role only far enough to avoid flashing
    // a lock at an admin. Everyone else waits for the row.
    const role = (sessionRole ?? '').toLowerCase();
    if (role === 'admin' || role === 'staff') {
      return {
        hasCampusAccess: true,
        campusCode: null,
        reason: role === 'admin' ? 'admin' : 'staff',
        isLoading,
      };
    }
    return { ...LOCKED_OUT, isLoading };
  }

  return { ...data, isLoading };
}

/** Human-readable campus name for a code, falling back to the code itself. */
export function campusNameForCode(code: string | null | undefined): string {
  if (!code) return 'your campus';
  return getInstitutionByCode(code)?.name ?? code;
}
