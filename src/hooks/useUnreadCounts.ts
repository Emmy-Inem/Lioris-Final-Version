import { useQuery } from '@tanstack/react-query';
import { getUnreadCounts, UNREAD_COUNTS_KEY, type UnreadCounts } from '@/api/unreadCounts';
import { useAuth } from '@/auth/AuthContext';

const NO_UNREAD: UnreadCounts = { notifications: 0, messages: 0 };

/**
 * Unread notification + message counts for the header badges. Every header shares this one cache entry
 * (['unread-counts']), so mounting several headers costs one request, and the realtime hook / invalidations of the
 * notifications and conversations caches keep it fresh - no polling.
 */
export function useUnreadCounts(): UnreadCounts {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: UNREAD_COUNTS_KEY,
    queryFn: getUnreadCounts,
    enabled: !!user?.id,
    staleTime: 60_000,
  });
  return data ?? NO_UNREAD;
}
