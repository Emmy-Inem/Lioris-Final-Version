import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ViewScope = 'campus' | 'global';

const VIEW_SCOPE_KEY = ['view-scope'] as const;
const ACTIVE_CAMPUS_KEY = ['active-campus-code'] as const;

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

function persistScope(scope: ViewScope) {
  if (isWeb) {
    webSet(STORAGE_SCOPE_KEY, scope);
    return;
  }
  SecureStore.setItemAsync(STORAGE_SCOPE_KEY, scope).catch(() => {});
}

function persistCampus(campusCode?: string) {
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

let hydrated = false;

export function useViewScope() {
  const queryClient = useQueryClient();

  const { data: scope } = useQuery({
    queryKey: VIEW_SCOPE_KEY,
    queryFn: () => 'campus' as ViewScope,
    initialData: 'campus' as ViewScope,
    staleTime: Infinity,
  });

  const { data: activeCampusCode } = useQuery({
    queryKey: ACTIVE_CAMPUS_KEY,
    queryFn: () => undefined as string | undefined,
    initialData: undefined as string | undefined,
    staleTime: Infinity,
    enabled: false,
  });

  // Restore the persisted choice once per app session (any component using
  // this hook can be the one that triggers it - the `hydrated` guard makes
  // sure it only actually runs once).
  useEffect(() => {
    if (hydrated) return;
    hydrated = true;
    (async () => {
      try {
        const [storedScope, storedCampus] = await Promise.all([
          isWeb ? webGet(STORAGE_SCOPE_KEY) : SecureStore.getItemAsync(STORAGE_SCOPE_KEY),
          isWeb ? webGet(STORAGE_CAMPUS_KEY) : SecureStore.getItemAsync(STORAGE_CAMPUS_KEY),
        ]);
        if (storedScope === 'campus' || storedScope === 'global') {
          queryClient.setQueryData(VIEW_SCOPE_KEY, storedScope);
        }
        if (storedCampus) {
          queryClient.setQueryData(ACTIVE_CAMPUS_KEY, storedCampus);
        }
      } catch {
        // keep the in-memory defaults
      }
    })();
  }, [queryClient]);

  function setScope(nextScope: ViewScope) {
    queryClient.setQueryData(VIEW_SCOPE_KEY, nextScope);
    persistScope(nextScope);
  }

  function setActiveCampusCode(campusCode?: string) {
    queryClient.setQueryData(ACTIVE_CAMPUS_KEY, campusCode);
    queryClient.setQueryData(VIEW_SCOPE_KEY, 'campus' as ViewScope);
    persistCampus(campusCode);
    persistScope('campus');
  }

  return {
    scope: scope ?? 'campus',
    setScope,
    activeCampusCode,
    setActiveCampusCode,
  };
}
