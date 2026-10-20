// Pure mapping from the get_my_conversation_summaries rows (and the caller's chat_channel_archives rows) to the
// header's unread-message badge. Mirrors what listConversations() computes, without downloading the conversation list.

export interface ConversationSummaryRow {
  id: string;
  unread_count?: number | string | null;
  last_message_at?: string | null;
}

export interface ArchiveRow {
  channel_id: string;
  archived_at?: string | null;
}

function toMillis(value: string | null | undefined): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Total unread messages across the caller's conversations. A conversation the caller archived stays hidden (and out of
 * the badge) only until someone writes in it again, exactly like listConversations().
 */
export function sumUnreadMessages(
  summaries: ConversationSummaryRow[] | null | undefined,
  archives: ArchiveRow[] | null | undefined = [],
): number {
  if (!Array.isArray(summaries)) return 0;
  const archivedAt = new Map<string, number>();
  for (const row of archives ?? []) archivedAt.set(row.channel_id, toMillis(row.archived_at));
  let total = 0;
  for (const s of summaries) {
    if (archivedAt.has(s.id) && toMillis(s.last_message_at) <= (archivedAt.get(s.id) ?? 0)) continue;
    const n = Number(s.unread_count ?? 0);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

/** Badge text: nothing for 0, "99+" past 99. */
export function formatBadgeCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '';
  return count > 99 ? '99+' : String(Math.floor(count));
}
