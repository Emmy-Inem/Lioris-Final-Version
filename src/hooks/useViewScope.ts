import { useQuery, useQueryClient } from '@tanstack/react-query';

export type ViewScope = 'campus' | 'global';

const VIEW_SCOPE_KEY = ['view-scope'] as const;

/**
 * Shared "My Campus" vs "Global" toggle — the same state the
 * AppHeader's workspace-scope pill and ChangeWorkspaceScopeModal
 * control, read here by feed/content screens so the toggle actually
 * filters what's shown instead of being decorative. Backed by
 * react-query's cache rather than a new Context provider, since
 * QueryClientProvider is already available everywhere this is used.
 */
export function useViewScope() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: VIEW_SCOPE_KEY,
    queryFn: () => 'campus' as ViewScope,
    initialData: 'campus' as ViewScope,
    staleTime: Infinity,
  });

  function setScope(scope: ViewScope) {
    queryClient.setQueryData(VIEW_SCOPE_KEY, scope);
  }

  return { scope: data ?? 'campus', setScope };
}
