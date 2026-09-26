import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getStoredValue, setStoredValue } from './useViewScope';

/**
 * Persists the forum selected channel (subforum) and sort order across
 * navigations using React Query + localStorage/SecureStore — same pattern
 * as useBotVisibility so state survives unmount, re-mount, and app restarts.
 */

export const FORUM_CHANNEL_QUERY_KEY = ['forum-selected-channel'] as const;
export const FORUM_SORT_QUERY_KEY = ['forum-sort-by'] as const;

const STORAGE_CHANNEL_KEY = 'lioris.forumChannel';
const STORAGE_SORT_KEY = 'lioris.forumSort';

let channelHydrated = false;
let sortHydrated = false;

/** Returns the persisted selected subforum channel and a setter. */
export function useForumChannel() {
  const queryClient = useQueryClient();

  const { data: selectedChannel = null } = useQuery<string | null>({
    queryKey: FORUM_CHANNEL_QUERY_KEY,
    queryFn: () => null as string | null,
    initialData: null as string | null,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (channelHydrated) return;
    channelHydrated = true;
    getStoredValue(STORAGE_CHANNEL_KEY)
      .then((stored) => {
        if (stored) queryClient.setQueryData(FORUM_CHANNEL_QUERY_KEY, stored);
      })
      .catch(() => {});
  }, [queryClient]);

  const setSelectedChannel = (channel: string | null) => {
    queryClient.setQueryData(FORUM_CHANNEL_QUERY_KEY, channel);
    setStoredValue(STORAGE_CHANNEL_KEY, channel ?? '');
  };

  return { selectedChannel, setSelectedChannel };
}

/** Returns the persisted sort order and a setter. */
export function useForumSort() {
  const queryClient = useQueryClient();

  const { data: sortBy = 'latest' } = useQuery<'latest' | 'popular'>({
    queryKey: FORUM_SORT_QUERY_KEY,
    queryFn: () => 'latest' as 'latest' | 'popular',
    initialData: 'latest' as 'latest' | 'popular',
    staleTime: Infinity,
  });

  useEffect(() => {
    if (sortHydrated) return;
    sortHydrated = true;
    getStoredValue(STORAGE_SORT_KEY)
      .then((stored) => {
        if (stored === 'latest' || stored === 'popular') {
          queryClient.setQueryData(FORUM_SORT_QUERY_KEY, stored);
        }
      })
      .catch(() => {});
  }, [queryClient]);

  const setSortBy = (sort: 'latest' | 'popular') => {
    queryClient.setQueryData(FORUM_SORT_QUERY_KEY, sort);
    setStoredValue(STORAGE_SORT_KEY, sort);
  };

  return { sortBy, setSortBy };
}
