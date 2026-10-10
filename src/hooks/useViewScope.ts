import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/auth/AuthContext';
import { isSuperAdminIdentity } from '@/utils/campusAccess';
import { queryClient as globalQueryClient } from '@/api/queryClient';

export type ViewScope = 'campus' | 'global';

export const VIEW_SCOPE_KEY = ['view-scope'] as const;
export const ACTIVE_CAMPUS_KEY = ['active-campus-code'] as const;

// Persisted so a chosen Campus/Global scope (and an admin's "Explore Other
// Campus Workspaces" pick) survives an app restart, instead of silently
// resetting to the default every time - important for someone actively
// testing across roles/campuses.
const STORAGE_SCOPE_KEY = 'lioris.viewScope';
const STORAGE_CAMPUS_KEY = 'lioris.activeCampusCode';
const isWeb = Platform.OS === 'web';

function webGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function webSet(key: string, value: string) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    // best effort only
  }
}

function webDelete(key: string) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch {
    // best effort only
  }
}

/** Small persisted key/value helpers shared with other view-state hooks (useForumScope). */
export async function getStoredValue(key: string): Promise<string | null> {
  try {
    return isWeb ? webGet(key) : await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export function setStoredValue(key: string, value: string) {
  if (isWeb) {
    webSet(key, value);
    return;
  }
  SecureStore.setItemAsync(key, value).catch(() => {});
}

export function persistScope(scope: ViewScope) {
  if (isWeb) {
    webSet(STORAGE_SCOPE_KEY, scope);
    return;
  }
  SecureStore.setItemAsync(STORAGE_SCOPE_KEY, scope).catch(() => {});
}

export function persistCampus(campusCode?: string) {
  if (isWeb) {
    if (campusCode) webSet(STORAGE_CAMPUS_KEY, campusCode);
    else webDelete(STORAGE_CAMPUS_KEY);
    return;
  }
  if (campusCode) {
    SecureStore.setItemAsync(STORAGE_CAMPUS_KEY, campusCode).catch(() => {});
  } else {
    SecureStore.deleteItemAsync(STORAGE_CAMPUS_KEY).catch(() => {});
  }
}

export async function getStoredCampus(): Promise<string | null> {
  try {
    return isWeb ? webGet(STORAGE_CAMPUS_KEY) : await SecureStore.getItemAsync(STORAGE_CAMPUS_KEY);
  } catch {
    return null;
  }
}

export function resetToDefaultCampusScope(qc = globalQueryClient, isSuperAdmin = false) {
  qc.setQueryData(VIEW_SCOPE_KEY, 'campus' as ViewScope);
  persistScope('campus');
  if (isSuperAdmin) {
    qc.setQueryData(ACTIVE_CAMPUS_KEY, null as ActiveCampus);
    persistCampus(undefined);
  }
}

// "No campus picked" is stored as null, never undefined: TanStack Query's setQueryData(key, undefined)
// is a documented no-op, so clearing with undefined left the old campus in place and the
// "Return to my campus" buttons did nothing.
type ActiveCampus = string | null;

let hydrated = false;

export function useViewScope() {
  const queryClient = useQueryClient();
  let currentUser: any = null;
  let authLoading = true;
  try {
    const auth = useAuth();
    currentUser = auth?.user;
    authLoading = auth?.isLoading ?? false;
  } catch {
    authLoading = false;
  }

  const isSuperAdmin = isSuperAdminIdentity(currentUser);
  const canExploreWorkspaces = isSuperAdmin;
  const userRole = currentUser?.role;
  const isStudent = userRole === 'student' && !isSuperAdmin;

  const { data: scope } = useQuery({
    queryKey: VIEW_SCOPE_KEY,
    queryFn: () => 'campus' as ViewScope,
    initialData: 'campus' as ViewScope,
    staleTime: Infinity,
  });

  const { data: storedActiveCampus } = useQuery({
    queryKey: ACTIVE_CAMPUS_KEY,
    queryFn: () => null as ActiveCampus,
    initialData: null as ActiveCampus,
    staleTime: Infinity,
    enabled: false,
  });
  const activeCampusCode = storedActiveCampus ?? undefined;

  // Restore the persisted choice once per app session (any component using
  // this hook can be the one that triggers it - the `hydrated` guard makes
  // sure it only actually runs once).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    (async () => {
      try {
        const [storedScope, storedCampus] = await Promise.all([
          isWeb ? webGet(STORAGE_SCOPE_KEY) : SecureStore.getItemAsync(STORAGE_SCOPE_KEY),
          isWeb ? webGet(STORAGE_CAMPUS_KEY) : SecureStore.getItemAsync(STORAGE_CAMPUS_KEY),
        ]);
        if (canExploreWorkspaces) {
          if (storedScope === 'campus' || storedScope === 'global') {
            queryClient.setQueryData(VIEW_SCOPE_KEY, storedScope);
          }
          if (storedCampus && storedCampus !== 'GLOBAL' && storedCampus !== 'ALL') {
            queryClient.setQueryData(ACTIVE_CAMPUS_KEY, storedCampus);
          } else {
            queryClient.setQueryData(ACTIVE_CAMPUS_KEY, null);
          }
        } else if (isStudent) {
          queryClient.setQueryData(VIEW_SCOPE_KEY, 'campus' as ViewScope);
          persistScope('campus');
          if (storedCampus && storedCampus !== 'GLOBAL') {
            queryClient.setQueryData(ACTIVE_CAMPUS_KEY, storedCampus);
          }
        } else {
          if (storedScope === 'campus' || storedScope === 'global') {
            queryClient.setQueryData(VIEW_SCOPE_KEY, storedScope);
          }
          if (storedCampus) {
            queryClient.setQueryData(ACTIVE_CAMPUS_KEY, storedCampus);
          }
        }
      } catch {
        // keep the in-memory defaults
      }
    })();
  }, [authLoading, queryClient, isStudent, canExploreWorkspaces]);

  // When switching to the student role during a session, ensure workspace defaults to campus for regular users
  const prevRoleRef = useRef(userRole);
  useEffect(() => {
    if (userRole === 'student' && prevRoleRef.current !== 'student' && !canExploreWorkspaces) {
      resetToDefaultCampusScope(queryClient);
    }
    prevRoleRef.current = userRole;
  }, [userRole, queryClient, canExploreWorkspaces]);

  function setScope(nextScope: ViewScope) {
    queryClient.setQueryData(VIEW_SCOPE_KEY, nextScope);
    persistScope(nextScope);
  }

  function setActiveCampusCode(campusCode?: string) {
    queryClient.setQueryData(ACTIVE_CAMPUS_KEY, (campusCode ?? null) as ActiveCampus);
    queryClient.setQueryData(VIEW_SCOPE_KEY, 'campus' as ViewScope);
    persistCampus(campusCode);
    persistScope('campus');
  }

  return {
    scope: canExploreWorkspaces ? scope ?? 'campus' : ('campus' as ViewScope),
    setScope,
    activeCampusCode: canExploreWorkspaces ? activeCampusCode : undefined,
    setActiveCampusCode,
    canExploreWorkspaces,
  };
}
