import { useEffect, useState } from 'react';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/api/supabase';

export type RealtimeEvent =
  | { type: 'message.created'; conversationId: string; messageId?: string; message?: any }
  | { type: 'connection.updated'; connectionId: string; status: string }
  | { type: 'notification.created'; notificationId?: string; notification?: any }
  | { type: 'rsvp.updated'; eventId: string; rsvpCount: number }
  | { type: 'moderation.updated'; reportId: string; status: string };

type ConnectionStatus = 'connecting' | 'open' | 'closed';

interface Subscriber {
  id: number;
  onEvent?: (event: RealtimeEvent) => void;
  queryClient: QueryClient;
  setStatus: (status: ConnectionStatus) => void;
}

// --- Module-level singleton state -----------------------------------------
// `useRealtimeChannel` can be mounted by multiple components at once (e.g. on
// desktop, `MessagesListScreen` and the `ChatThread` it renders inline both
// call this hook). Each mount used to open its own Supabase Realtime
// subscription to the SAME fixed channel name, which caused every event to
// fire twice (double notifications, double query invalidations). To fix
// that, we keep a single shared Supabase channel per app instance and fan
// its events out to every subscriber via a module-level listener registry.
// The actual Supabase channel is only opened when the subscriber count goes
// 0 -> 1, and torn down when it goes 1 -> 0.
let sharedChannel: RealtimeChannel | null = null;
let currentStatus: ConnectionStatus = 'connecting';
let nextSubscriberId = 1;
const subscribers = new Map<number, Subscriber>();

function broadcastEvent(event: RealtimeEvent, invalidate: (qc: QueryClient) => void) {
  subscribers.forEach((sub) => {
    sub.onEvent?.(event);
    invalidate(sub.queryClient);
  });
}

function broadcastInvalidateOnly(invalidate: (qc: QueryClient) => void) {
  subscribers.forEach((sub) => invalidate(sub.queryClient));
}

function broadcastStatus(status: ConnectionStatus) {
  currentStatus = status;
  subscribers.forEach((sub) => sub.setStatus(status));
}

function ensureSharedChannel() {
  if (sharedChannel) return;

  sharedChannel = supabase
    .channel('app_public_realtime_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chat_messages' },
      (payload) => {
        const newRow = payload.new as any;
        const event: RealtimeEvent = {
          type: 'message.created',
          conversationId: newRow?.channel_id || '',
          message: newRow,
        };
        broadcastEvent(event, (qc) => {
          qc.invalidateQueries({ queryKey: ['messages'] });
          qc.invalidateQueries({ queryKey: ['conversations'] });
        });
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chat_channels' },
      () => {
        broadcastInvalidateOnly((qc) => qc.invalidateQueries({ queryKey: ['conversations'] }));
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      (payload) => {
        const newRow = payload.new as any;
        const event: RealtimeEvent = {
          type: 'notification.created',
          notification: newRow,
        };
        broadcastEvent(event, (qc) => qc.invalidateQueries({ queryKey: ['notifications'] }));
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'connections' },
      (payload) => {
        const newRow = payload.new as any;
        const event: RealtimeEvent = {
          type: 'connection.updated',
          connectionId: newRow?.id || '',
          status: newRow?.status || 'pending',
        };
        broadcastEvent(event, (qc) => {
          qc.invalidateQueries({ queryKey: ['connections'] });
          qc.invalidateQueries({ queryKey: ['directory'] });
        });
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'events' },
      () => {
        broadcastInvalidateOnly((qc) => qc.invalidateQueries({ queryKey: ['events'] }));
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'event_attendees' },
      () => {
        const event: RealtimeEvent = {
          type: 'rsvp.updated',
          eventId: '',
          rsvpCount: 0,
        };
        broadcastEvent(event, (qc) => qc.invalidateQueries({ queryKey: ['events'] }));
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'posts' },
      () => {
        broadcastInvalidateOnly((qc) => {
          qc.invalidateQueries({ queryKey: ['feed'] });
          qc.invalidateQueries({ queryKey: ['posts'] });
        });
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'post_comments' },
      () => {
        broadcastInvalidateOnly((qc) => {
          qc.invalidateQueries({ queryKey: ['feed'] });
          qc.invalidateQueries({ queryKey: ['comments'] });
          qc.invalidateQueries({ queryKey: ['post-comments'] });
        });
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'verifications' },
      () => {
        broadcastInvalidateOnly((qc) => {
          qc.invalidateQueries({ queryKey: ['verification-requests'] });
          qc.invalidateQueries({ queryKey: ['verifications'] });
        });
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'moderation_queue' },
      () => {
        const event: RealtimeEvent = {
          type: 'moderation.updated',
          reportId: '',
          status: 'resolved',
        };
        broadcastEvent(event, (qc) => qc.invalidateQueries({ queryKey: ['reports'] }));
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'marketplace_listings' },
      () => {
        broadcastInvalidateOnly((qc) => qc.invalidateQueries({ queryKey: ['marketplace'] }));
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'mentorships' },
      () => {
        broadcastInvalidateOnly((qc) => qc.invalidateQueries({ queryKey: ['mentorships'] }));
      },
    )
    .subscribe((statusResult) => {
      if (statusResult === 'SUBSCRIBED') {
        broadcastStatus('open');
      } else if (statusResult === 'CLOSED' || statusResult === 'CHANNEL_ERROR') {
        broadcastStatus('closed');
      }
    });
}

function teardownSharedChannel() {
  if (sharedChannel) {
    supabase.removeChannel(sharedChannel);
    sharedChannel = null;
  }
  currentStatus = 'connecting';
}

/**
 * Subscribes to Supabase Realtime (postgres_changes) across all core tables:
 * - chat_messages & chat_channels (live chat & unread badges)
 * - notifications (real-time notification delivery)
 * - connections (friend / connect requests)
 * - events & event_attendees (RSVP counters)
 * - posts & post_comments (forum feed)
 * - resources, verifications, moderation_queue, marketplace, mentorships
 *
 * Implemented as a module-level singleton: no matter how many components
 * mount this hook concurrently (e.g. `MessagesListScreen` + the `ChatThread`
 * it renders inline in the desktop split pane), only ONE underlying Supabase
 * channel subscription is ever open. Every mounted hook still receives every
 * event and still gets its own connection status.
 */
export function useRealtimeChannel(
  onEvent?: (event: RealtimeEvent) => void,
  _pollFallbackAfterMs = 8000,
) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>(currentStatus);

  useEffect(() => {
    const id = nextSubscriberId++;
    subscribers.set(id, { id, onEvent, queryClient, setStatus });

    if (subscribers.size === 1) {
      ensureSharedChannel();
    } else {
      // Reflect the already-established connection status immediately.
      setStatus(currentStatus);
    }

    return () => {
      subscribers.delete(id);
      if (subscribers.size === 0) {
        teardownSharedChannel();
      }
    };
  }, [queryClient, onEvent]);

  return { status, isPolling: false };
}
