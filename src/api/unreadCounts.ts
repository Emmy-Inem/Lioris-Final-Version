import { supabase } from './supabase';
import { getSessionUserId } from './sessionUser';
import { getUnreadNotificationCount } from './notifications';
import { sumUnreadMessages, type ArchiveRow, type ConversationSummaryRow } from '../utils/unreadCounts';

/** The ONE query key every header badge shares. The realtime hook and the query cache invalidate it. */
export const UNREAD_COUNTS_KEY = ['unread-counts'] as const;

export interface UnreadCounts {
  notifications: number;
  messages: number;
}

/**
 * Unread messages across the caller's chats, from the same get_my_conversation_summaries RPC that
 * messaging.ts uses for the conversation list (one row per channel, unread already counted by the database),
 * minus chats the caller archived. Falls back to 0 on any error: a badge must never break a screen.
 */
export async function getUnreadMessageCount(): Promise<number> {
  try {
    const uid = await getSessionUserId();
    if (!uid) return 0;
    const { data: summaries, error } = await supabase.rpc('get_my_conversation_summaries', { p_limit: 100 });
    if (error || !Array.isArray(summaries)) return 0;

    let archives: ArchiveRow[] = [];
    if (summaries.some((s: any) => Number(s?.unread_count ?? 0) > 0)) {
      const { data: archiveRows } = await supabase
        .from('chat_channel_archives')
        .select('channel_id, archived_at')
        .eq('user_id', uid);
      archives = (archiveRows ?? []) as ArchiveRow[];
    }
    return sumUnreadMessages(summaries as ConversationSummaryRow[], archives);
  } catch (err) {
    console.warn('[UnreadCounts] message count unavailable:', err);
    return 0;
  }
}

/** Both header badges in one query. */
export async function getUnreadCounts(): Promise<UnreadCounts> {
  const [notifications, messages] = await Promise.all([
    getUnreadNotificationCount().catch((err) => {
      console.warn('[UnreadCounts] notification count unavailable:', err);
      return 0;
    }),
    getUnreadMessageCount(),
  ]);
  return { notifications, messages };
}
