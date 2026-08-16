import { useQuery, useQueryClient } from'@tanstack/react-query';

export type ViewScope = 'campus' | 'global';

const VIEW_SCOPE_KEY = ['view-scope'] as const;
const ACTIVE_CAMPUS_KEY = ['active-campus-code'] as const;

export function useViewScope() {
  const queryClient = useQueryClient();
  
  const { data: scope } = useQuery({
    queryKey: VIEW_SCOPE_KEY,
    queryFn: () => 'campus'as ViewScope,
    initialData: 'campus'as ViewScope,
    staleTime: Infinity,
  });

  const { data: activeCampusCode } = useQuery({
    queryKey: ACTIVE_CAMPUS_KEY,
    queryFn: () => undefined as string | undefined,
    initialData: undefined as string | undefined,
    staleTime: Infinity,
  });

  function setScope(nextScope: ViewScope) {
    queryClient.setQueryData(VIEW_SCOPE_KEY, nextScope);
  }

  function setActiveCampusCode(campusCode?: string) {
    queryClient.setQueryData(ACTIVE_CAMPUS_KEY, campusCode);
    queryClient.setQueryData(VIEW_SCOPE_KEY, 'campus' as ViewScope);
  }

  return {
    scope: scope ?? 'campus',
    setScope,
    activeCampusCode,
    setActiveCampusCode,
  };
}
