import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/api/supabase';
import {
  createCoalescer,
  matchesTarget,
  planInvalidations,
  DELAY_FAST_MS,
  type Coalescer,
  type InvalidationPlan,
  type InvalidationTarget,
} from '@/utils/realtimeInvalidation';

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
// 0 -> 1, and torn down (after a short grace period) when it goes 1 -> 0.
//
// Query invalidation is coalesced per query key (see utils/realtimeInvalidation.ts):
// every signed-in client receives every write on these tables, so a burst of
// writes used to refetch the feed / events / chat lists once per write on every
// device. Now each key refetches at most once per window, narrow keys are used
// where the payload identifies the row, and nothing is invalidated while the app
// is in the background (the dirty keys refetch once on return to foreground).
// `onEvent` callbacks are NOT debounced: message.created still flows immediately.
let sharedChannel: RealtimeChannel | null = null;
let sharedChannelUserId: string | null = null;
let currentStatus: ConnectionStatus = 'connecting';
let nextSubscriberId = 1;
let hasBeenOpen = false;
let starting = false;
let teardownTimer: ReturnType<typeof setTimeout> | null = null;
let appStateSub: { remove: () => void } | null = null;
let authSub: { unsubscribe: () => void } | null = null;
const subscribers = new Map<number, Subscriber>();
const coalescer: Coalescer = createCoalescer();

function uniqueQueryClients(): QueryClient[] {
  return [...new Set([...subscribers.values()].map((s) => s.queryClient))];
}

function invalidateTarget(target: InvalidationTarget) {
  uniqueQueryClients().forEach((qc) => {
    qc.invalidateQueries({
      predicate: (query) => matchesTarget(query.queryKey, target),
    });
  });
}

function applyPlans(plans: InvalidationPlan[]) {
  plans.forEach((p) => coalescer.schedule(p.id, () => invalidateTarget(p.target), p.delayMs));
}

/** Refresh the cheap always-on caches once (used on reconnect / return to foreground). */
function catchUpInvalidations() {
  applyPlans([
    { id: 'unread-counts', target: { key: ['unread-counts'] }, delayMs: 0 },
    { id: 'conversations', target: { key: ['conversations'] }, delayMs: DELAY_FAST_MS },
  ]);
}

function emitEvent(event: RealtimeEvent) {
  subscribers.forEach((sub) => sub.onEvent?.(event));
}

function broadcastStatus(status: ConnectionStatus) {
  currentStatus = status;
  subscribers.forEach((sub) => sub.setStatus(status));
}

type ChangePayload = { new?: Record<string, any>; old?: Record<string, any> };

function onTableChange(table: string, payload: ChangePayload, makeEvent?: (row: any) => RealtimeEvent) {
  const newRow = (payload.new ?? {}) as Record<string, any>;
  const oldRow = (payload.old ?? {}) as Record<string, any>;
  // The callback is immediate (messages, incoming calls, toasts); only the query invalidations are coalesced.
  if (makeEvent) emitEvent(makeEvent(newRow));
  applyPlans(planInvalidations(table, newRow, oldRow));
}

function buildChannel(userId: string | null): RealtimeChannel {
  const notificationsConfig: Record<string, string> = { event: '*', schema: 'public', table: 'notifications' };
  // Server-side filter: only this user's notifications are pushed to this device.
  if (userId) notificationsConfig.filter = `recipient_id=eq.${userId}`;

  return supabase
    .channel('app_public_realtime_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (payload: any) =>
      onTableChange('chat_messages', payload, (row) => ({
        type: 'message.created',
        conversationId: row?.channel_id || '',
        message: row,
      })),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_channels' }, (payload: any) =>
      onTableChange('chat_channels', payload),
    )
    .on('postgres_changes', notificationsConfig as any, (payload: any) =>
      onTableChange('notifications', payload, (row) => ({ type: 'notification.created', notification: row })),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, (payload: any) =>
      onTableChange('connections', payload, (row) => ({
        type: 'connection.updated',
        connectionId: row?.id || '',
        status: row?.status || 'pending',
      })),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, (payload: any) =>
      onTableChange('events', payload),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_attendees' }, (payload: any) =>
      onTableChange('event_attendees', payload, (row) => ({
        type: 'rsvp.updated',
        eventId: row?.event_id || payload.old?.event_id || '',
        rsvpCount: 0,
      })),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, (payload: any) =>
      onTableChange('posts', payload),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, (payload: any) =>
      onTableChange('post_comments', payload),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'verifications' }, (payload: any) =>
      onTableChange('verifications', payload),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'moderation_queue' }, (payload: any) =>
      onTableChange('moderation_queue', payload, () => ({
        type: 'moderation.updated',
        reportId: '',
        status: 'resolved',
      })),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_listings' }, (payload: any) =>
      onTableChange('marketplace_listings', payload),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mentorships' }, (payload: any) =>
      onTableChange('mentorships', payload),
    )
    .subscribe((statusResult) => {
      if (statusResult === 'SUBSCRIBED') {
        broadcastStatus('open');
        // After a reconnect, writes may have been missed: refresh the badges and chat list once.
        if (hasBeenOpen) catchUpInvalidations();
        hasBeenOpen = true;
      } else if (statusResult === 'CLOSED' || statusResult === 'CHANNEL_ERROR') {
        broadcastStatus('closed');
      }
    });
}

function openChannel(userId: string | null) {
  if (sharedChannel) {
    supabase.removeChannel(sharedChannel);
    sharedChannel = null;
  }
  sharedChannelUserId = userId;
  sharedChannel = buildChannel(userId);
}

async function ensureSharedChannel() {
  if (sharedChannel || starting) return;
  starting = true;

  // Park invalidations while the app is backgrounded; the dirty keys flush once on return to foreground.
  // (On web, AppState maps to page visibility.)
  coalescer.setPaused(Platform.OS !== 'web' && AppState.currentState !== 'active');
  appStateSub = AppState.addEventListener('change', (state) => {
    const active = state === 'active';
    coalescer.setPaused(!active);
    if (active) catchUpInvalidations();
  });

  let userId: string | null = null;
  try {
    // getSession() reads the stored session (no network round trip).
    const { data } = await supabase.auth.getSession();
    userId = data?.session?.user?.id ?? null;
  } catch {
    userId = null;
  }
  starting = false;
  // Every subscriber may have gone away while we awaited.
  if (subscribers.size === 0 || sharedChannel) return;
  openChannel(userId);

  // A different account signing in on this device needs a fresh notifications filter.
  // The listener runs while supabase-js holds its auth lock, so defer anything that awaits.
  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    const nextId = session?.user?.id ?? null;
    if (subscribers.size === 0 || nextId === sharedChannelUserId) return;
    setTimeout(() => {
      if (subscribers.size > 0 && nextId !== sharedChannelUserId) openChannel(nextId);
    }, 0);
  });
  authSub = listener?.subscription ?? null;
}

function teardownSharedChannel() {
  if (sharedChannel) {
    supabase.removeChannel(sharedChannel);
    sharedChannel = null;
  }
  sharedChannelUserId = null;
  appStateSub?.remove();
  appStateSub = null;
  authSub?.unsubscribe();
  authSub = null;
  coalescer.cancel();
  hasBeenOpen = false;
  currentStatus = 'connecting';
}

/**
 * Subscribes to Supabase Realtime (postgres_changes) across all core tables:
 * - chat_messages & chat_channels (live chat & unread badges)
 * - notifications (real-time notification delivery, filtered to the signed-in user)
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
 *
 * Query invalidations are coalesced per key and paused while the app is in the
 * background; `onEvent` callbacks are delivered immediately.
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

    if (teardownTimer) {
      clearTimeout(teardownTimer);
      teardownTimer = null;
    }
    if (!sharedChannel) {
      void ensureSharedChannel();
    } else {
      // Reflect the already-established connection status immediately.
      setStatus(currentStatus);
    }

    return () => {
      subscribers.delete(id);
      if (subscribers.size === 0) {
        // Grace period: a changing `onEvent` identity unmounts and remounts the effect back to back,
        // which must not close and reopen the websocket subscription.
        if (teardownTimer) clearTimeout(teardownTimer);
        teardownTimer = setTimeout(() => {
          teardownTimer = null;
          if (subscribers.size === 0) teardownSharedChannel();
        }, 1000);
      }
    };
  }, [queryClient, onEvent]);

  return { status, isPolling: false };
}
