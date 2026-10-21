import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { getMyMinorStatus, MINOR_STATUS_QUERY_KEY, type MinorStatus } from '@/api/minors';

/**
 * The signed-in member's own age / consent status (null while loading, signed out, or when the database
 * cannot be asked). It is read from the server every time - the app never keeps a date of birth or an age -
 * and is refreshed after the member changes their date of birth or guardian details.
 */
export function useMinorStatus(): { status: MinorStatus | null; isLoading: boolean; refresh: (next?: MinorStatus) => Promise<void> } {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const queryKey = [...MINOR_STATUS_QUERY_KEY, userId];

  const query = useQuery<MinorStatus | null>({
    queryKey,
    queryFn: getMyMinorStatus,
    enabled: Boolean(userId),
    // A birthday can move a member out of the minor band, and an administrator can confirm consent at any time.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  async function refresh(next?: MinorStatus) {
    if (next) queryClient.setQueryData(queryKey, next);
    await queryClient.invalidateQueries({ queryKey: MINOR_STATUS_QUERY_KEY });
  }

  return { status: userId ? query.data ?? null : null, isLoading: query.isLoading, refresh };
}
