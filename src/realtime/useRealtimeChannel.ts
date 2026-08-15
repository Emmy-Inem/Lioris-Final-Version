import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabase';
import { RealtimeEvent } from './socket';

type ConnectionStatus = 'connecting' | 'open' | 'closed';

/**
 * Subscribes directly to Supabase Realtime (postgres_changes) across all core tables:
 * - chat_messages & chat_channels (live chat & unread badges)
 * - notifications (real-time notification delivery)
 * - connections (friend / connect requests)
 * - events & event_attendees (RSVP counters)
 * - posts & post_comments (forum feed)
 * - resources, verifications, moderation_queue, marketplace, mentorships
 */
export function useRealtimeChannel(
  onEvent?: (event: RealtimeEvent) => void,
  _pollFallbackAfterMs = 8000,
) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    const channel = supabase
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
          onEvent?.(event);
          queryClient.invalidateQueries({ queryKey: ['messages'] });
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_channels' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
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
          onEvent?.(event);
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
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
          onEvent?.(event);
          queryClient.invalidateQueries({ queryKey: ['connections'] });
          queryClient.invalidateQueries({ queryKey: ['directory'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['events'] });
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
          onEvent?.(event);
          queryClient.invalidateQueries({ queryKey: ['events'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['feed'] });
          queryClient.invalidateQueries({ queryKey: ['posts'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_comments' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['feed'] });
          queryClient.invalidateQueries({ queryKey: ['comments'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'verifications' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['verification-requests'] });
          queryClient.invalidateQueries({ queryKey: ['verifications'] });
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
          onEvent?.(event);
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'marketplace_listings' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['marketplace'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mentorships' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['mentorships'] });
        },
      )
      .subscribe((statusResult) => {
        if (statusResult === 'SUBSCRIBED') {
          setStatus('open');
        } else if (statusResult === 'CLOSED' || statusResult === 'CHANNEL_ERROR') {
          setStatus('closed');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, onEvent]);

  return { status, isPolling: false };
}
