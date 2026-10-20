import { focusManager, QueryClient } from '@tanstack/react-query';

// React Query's default focus detection listens to the browser's `visibilitychange`, which never fires in a React Native
// app, so on a phone `refetchOnWindowFocus` and refetch intervals never knew about foreground / background. Wire it to
// AppState instead. (Online / offline tracking is wired to NetInfo by setupNetworkAwareQueries() in OfflineBanner.tsx.)
// react-native is required lazily and only inside a React Native runtime: the web build keeps React Query's own
// visibilitychange handling, and the node unit tests (which import this module) never load react-native.
if (typeof navigator !== 'undefined' && (navigator as { product?: string }).product === 'ReactNative') {
  const { AppState } = require('react-native') as typeof import('react-native');
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
    return () => subscription.remove();
  });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Do not retry permanent client errors (401 unauthenticated, 403 forbidden, 404 not found)
        if (error?.status >= 400 && error?.status < 500 && error?.status !== 408) {
          return false;
        }
        // Retry transient network dropouts or 5xx server issues up to 2 times
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
      staleTime: 30_000,
      // Keep unused results for 10 minutes so going back to a screen shows data instantly.
      gcTime: 10 * 60_000,
      // A polling query must not keep waking the radio while the app is backgrounded.
      refetchIntervalInBackground: false,
      refetchOnReconnect: true,
      // Queries keep the default networkMode ('online'): while offline a query is PAUSED (fetchStatus === 'paused')
      // and resumes by itself on reconnect; screens show "You're offline" via useIsOfflinePaused().
    },
    mutations: {
      // A mutation fires immediately and fails fast with its own error instead of hanging "pending" until the
      // connection returns (callers already toast their errors).
      networkMode: 'offlineFirst',
    },
  },
});

// The header badges use one shared ['unread-counts'] query. Whenever the notifications or conversations/messages caches
// are invalidated (marking read, opening a chat, a realtime event ...) the badge counts are refreshed with them, so every
// existing `invalidateQueries({ queryKey: ['notifications'] })` call keeps the badges truthful without being edited.
queryClient.getQueryCache().subscribe((event) => {
  if (event.type !== 'updated' || event.action.type !== 'invalidate') return;
  const head = event.query.queryKey[0];
  if (head === 'notifications' || head === 'conversations' || head === 'messages') {
    void queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
  }
});
