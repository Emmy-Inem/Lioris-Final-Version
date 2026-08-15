import { useEffect, useRef, useState } from'react';
import { useQueryClient } from'@tanstack/react-query';
import { realtimeSocket, RealtimeEvent } from'./socket';

type ConnectionStatus = 'connecting' | 'open' | 'closed';

/**
 * Mounts the socket connection once per screen tree that needs it and
 * invalidates the relevant React Query cache entries as events arrive.
 * When the socket has been down for more than `pollFallbackAfterMs`,
 * callers should switch their query's `refetchInterval` on — see the
 * `isPolling` flag this hook returns.
 */
export function useRealtimeChannel(
  onEvent?: (event: RealtimeEvent) => void,
  pollFallbackAfterMs = 8000,
) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [isPolling, setIsPolling] = useState(false);
  const downSinceRef = useRef<number | null>(null);

  useEffect(() => {
    realtimeSocket.connect();

    const unsubscribeEvents = realtimeSocket.subscribe((event) => {
      onEvent?.(event);
      invalidateForEvent(event, queryClient);
    });

    const unsubscribeStatus = realtimeSocket.subscribeStatus((next) => {
      setStatus(next);
      if (next === 'open') {
        downSinceRef.current = null;
        setIsPolling(false);
      } else if (next === 'closed' && downSinceRef.current === null) {
        downSinceRef.current = Date.now();
      }
    });

    const pollCheckInterval = setInterval(() => {
      if (downSinceRef.current && Date.now() - downSinceRef.current > pollFallbackAfterMs) {
        setIsPolling(true);
      }
    }, 2000);

    return () => {
      unsubscribeEvents();
      unsubscribeStatus();
      clearInterval(pollCheckInterval);
      realtimeSocket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, isPolling };
}

function invalidateForEvent(event: RealtimeEvent, queryClient: ReturnType<typeof useQueryClient>) {
  switch (event.type) {
    case'message.created':
      queryClient.invalidateQueries({ queryKey: ['messages', event.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      break;
    case'connection.updated':
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      queryClient.invalidateQueries({ queryKey: ['directory'] });
      break;
    case'notification.created':
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      break;
    case'rsvp.updated':
      queryClient.invalidateQueries({ queryKey: ['events'] });
      break;
    case'moderation.updated':
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      break;
  }
}
