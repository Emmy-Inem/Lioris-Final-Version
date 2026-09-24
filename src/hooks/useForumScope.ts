import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { getStoredValue, setStoredValue, ViewScope } from './useViewScope';

export const FORUM_SCOPE_KEY = ['forum-scope'] as const;
const STORAGE_FORUM_SCOPE_KEY = 'lioris.forumScope';

let hydrated = false;

/**
 * The Forum's own "My Campus / Global" toggle.
 *
 * It used to share state with the workspace scope (useViewScope), so a student flipping the
 * Forum to Global also switched events, marketplace, jobs, resources and the theme to the global
 * workspace. The workspace scope is now an admin-only tool; this one only ever affects the Forum.
 *
 * `globalEnabled` mirrors the admin's Global toggles. While it is off the scope is always
 * 'campus' - whatever was stored - and nothing can set it to 'global'.
 */
export function useForumScope() {
  const queryClient = useQueryClient();
  const { isFeatureEnabled } = useFeatureFlags();
  const globalEnabled = isFeatureEnabled('global_workspace') && isFeatureEnabled('forum_global_scope');

  const { data: stored } = useQuery({
    queryKey: FORUM_SCOPE_KEY,
    queryFn: () => 'campus' as ViewScope,
    initialData: 'campus' as ViewScope,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (hydrated) return;
    hydrated = true;
    getStoredValue(STORAGE_FORUM_SCOPE_KEY)
      .then((value) => {
        if (value === 'campus' || value === 'global') queryClient.setQueryData(FORUM_SCOPE_KEY, value);
      })
      .catch(() => {
        // keep the in-memory default
      });
  }, [queryClient]);

  // Drop a stale 'global' as soon as the toggle goes off so it isn't waiting when it comes back on.
  useEffect(() => {
    if (!globalEnabled && stored === 'global') {
      queryClient.setQueryData(FORUM_SCOPE_KEY, 'campus' as ViewScope);
      setStoredValue(STORAGE_FORUM_SCOPE_KEY, 'campus');
    }
  }, [globalEnabled, stored, queryClient]);

  function setScope(next: ViewScope) {
    if (next === 'global' && !globalEnabled) return;
    queryClient.setQueryData(FORUM_SCOPE_KEY, next);
    setStoredValue(STORAGE_FORUM_SCOPE_KEY, next);
  }

  return {
    scope: (globalEnabled ? stored : 'campus') as ViewScope,
    setScope,
    globalEnabled,
  };
}
