import { isPermissionRefusal, refusalMessageFor } from '../utils/permissionErrors';
import { supabase } from './supabase';
import { Conversation, Message } from './types';
import { generateUUID } from '../utils/uuid';
import { getSessionUser } from '../auth/tokenStorage';
import { isCallMessage } from './calling';
import { isUserBlocked } from './connections';
import { assertSafeHttpUrl } from '../utils/safeUrl';
import { storagePathFor } from './signedUrls';
import { escapePostgrestLike } from '../utils/postgrest';
import { getFriendlyErrorMessage, isMinorRestrictedError } from '../utils/errors';

function toPreviewText(content: string | undefined | null): string {
  if (!content) return 'Started conversation';
  if (isCallMessage(content)) {
    return content.startsWith('📹') ? '📹 Video call' : '📞 Voice call';
  }
  return content;
}

// Real conversations/messages cache for optimistic updates and offline resilience
let localConversations: Conversation[] = [];
const localMessages: Record<string, Message[]> = {};

/** Sign-out / account switch: the previous account's conversations and messages must not be merged into the next list. */
export function clearMessagingSessionCache(): void {
  localConversations = [];
  for (const key of Object.keys(localMessages)) delete localMessages[key];
}

export interface UserToMessage {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: string;
  department: string | null;
  campusCode: string | null;
}

/** One channel the person belongs to, with only what the list needs (no message history). */
interface ChannelListRow {
  id: string;
  name: string | null;
  is_direct_message: boolean | null;
  campus_code?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  chat_channel_members?: any[];
  latest: { content?: string | null; created_at: string } | null;
  unread: number;
}

const CHANNEL_MEMBER_SELECT = `
  id,
  name,
  is_direct_message,
  campus_code,
  created_by,
  created_at,
  updated_at,
  chat_channel_members (
    user_id,
    joined_at,
    profiles (
      id,
      full_name,
      avatar_url,
      department,
      role,
      campus_code,
      last_active_at
    )
  )`;

/**
 * Loads the conversation list. The list used to embed EVERY message of EVERY channel just to find the newest one
 * and count unread, so opening Messages downloaded the whole chat history (and PostgREST silently cut it at 1000
 * rows). It now asks the database for one summary row per channel (last message + unread count), then loads the
 * members of just those channels. If the summary function is not deployed yet, it falls back to the old query.
 */
async function loadChannelRows(currentUserId?: string): Promise<ChannelListRow[]> {
  try {
    const { data: summaries, error } = await supabase.rpc('get_my_conversation_summaries', { p_limit: 100 });
    if (!error && Array.isArray(summaries)) {
      const ids = summaries.map((s: any) => s.id);
      const byId = new Map<string, any>();
      if (ids.length > 0) {
        const { data: channels, error: channelError } = await supabase
          .from('chat_channels')
          .select(CHANNEL_MEMBER_SELECT)
          .in('id', ids);
        if (channelError) throw channelError;
        for (const ch of channels ?? []) byId.set((ch as any).id, ch);
      }
      return summaries.map((s: any) => {
        const ch = byId.get(s.id) ?? {};
        return {
          id: s.id,
          name: ch.name ?? s.name ?? null,
          is_direct_message: ch.is_direct_message ?? s.is_direct_message ?? true,
          campus_code: ch.campus_code ?? null,
          created_by: ch.created_by ?? s.created_by ?? null,
          created_at: ch.created_at ?? s.created_at,
          updated_at: ch.updated_at ?? s.updated_at,
          chat_channel_members: ch.chat_channel_members ?? [],
          latest: s.last_message_at ? { content: s.last_message_content, created_at: s.last_message_at } : null,
          unread: Number(s.unread_count ?? 0),
        } as ChannelListRow;
      });
    }
  } catch (summaryErr) {
    console.warn('[Messaging] Conversation summaries unavailable, using the full query:', summaryErr);
  }

  const { data, error } = await supabase
    .from('chat_channels')
    .select(`${CHANNEL_MEMBER_SELECT}, chat_messages (id, sender_id, content, is_read, created_at)`)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const msgs = (row.chat_messages ?? []).slice().sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return {
      ...row,
      latest: msgs[0] ?? null,
      unread: currentUserId ? msgs.filter((m: any) => m.sender_id !== currentUserId && !m.is_read).length : 0,
    } as ChannelListRow;
  });
}

export async function listConversations(): Promise<Conversation[]> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    let currentUserId = authData?.user?.id;
    let currentUserName = authData?.user?.user_metadata?.full_name;
    if (!currentUserId) {
      const stored = await getSessionUser();
      if (stored?.id) {
        currentUserId = stored.id;
        currentUserName = stored.fullName;
      }
    }

    const data = await loadChannelRows(currentUserId);

    // Exclude channels the current user has archived for themselves.
    // Archiving does NOT delete the shared channel (that would destroy it
    // for the other participant); it just hides it from this user's list.
    // Depends on `chat_channel_archives` (migration supabase_fix_audit_2026.sql).
    let archivedChannelIds = new Set<string>();
    if (currentUserId) {
      try {
        const { data: archivedRows } = await supabase
          .from('chat_channel_archives')
          .select('channel_id, archived_at')
          .eq('user_id', currentUserId);
        // An archived chat stays hidden only until someone writes in it again: before this, archiving was
        // permanent and a friend's later replies never surfaced (not even in the unread badge).
        const newestByChannel = new Map<string, number>();
        for (const row of data ?? []) {
          if (row.latest?.created_at) newestByChannel.set(row.id, new Date(row.latest.created_at).getTime());
        }
        archivedChannelIds = new Set(
          (archivedRows ?? [])
            .filter((r: any) => {
              const archivedAt = r.archived_at ? new Date(r.archived_at).getTime() : 0;
              return (newestByChannel.get(r.channel_id) ?? 0) <= archivedAt;
            })
            .map((r: any) => r.channel_id),
        );
      } catch (archiveErr) {
        console.warn('[Messaging] Failed to load archived channels:', archiveErr);
      }
    }

    const nonArchivedData = (data ?? []).filter((row: any) => !archivedChannelIds.has(row.id));

    const dbConvs: Conversation[] = nonArchivedData.map((row: any) => {
      const latestMsg = row.latest;

      let participantId = row.created_by || 'peer-user';
      let participantName = row.name || 'Campus Member';
      let participantAvatarUrl: string | null = null;
      let participantDepartment: string | null = null;
      let participantRole: string | null = null;
      let partnerLastActiveAt: string | null = null;

      const isDirect = row.is_direct_message !== false;
      const members = row.chat_channel_members ?? [];

      if (isDirect && members.length > 0) {
        const otherMember = members.find((m: any) => m.user_id !== currentUserId) ?? members[0];
        const profile = otherMember?.profiles;
        if (profile) {
          participantId = profile.id;
          participantName = profile.full_name || 'Campus Student';
          participantAvatarUrl = profile.avatar_url ?? null;
          participantDepartment = profile.department ?? null;
          participantRole = profile.role ?? null;
          partnerLastActiveAt = profile.last_active_at ?? null;
        } else if (otherMember) {
          participantId = otherMember.user_id;
        }
      }

      // If participantName happens to equal current user's name for a DM, make sure we show a peer label
      if (isDirect && currentUserName && participantName.toLowerCase() === currentUserName.toLowerCase() && members.length > 1) {
        const other = members.find((m: any) => m.user_id !== currentUserId);
        if (other?.profiles?.full_name) {
          participantName = other.profiles.full_name;
          partnerLastActiveAt = other.profiles.last_active_at ?? partnerLastActiveAt;
        }
      }

      const unreadCount = currentUserId ? Number(row.unread ?? 0) : 0;

      const lastMessageAt = latestMsg?.created_at || row.updated_at || row.created_at;
      const lastMessagePreview = toPreviewText(latestMsg?.content);

      // Compute real online status: active within the last 5 minutes
      const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
      const isOnline = partnerLastActiveAt
        ? new Date().getTime() - new Date(partnerLastActiveAt).getTime() < ONLINE_THRESHOLD_MS
        : false;

      return {
        id: row.id,
        participantId,
        participantName,
        participantAvatarUrl,
        participantDepartment,
        participantRole,
        isOnline,
        lastMessageAt,
        lastMessagePreview,
        unreadCount,
      };
    });

    // Filter to only channels where the current user is an enrolled member (if signed in)
    const userChannels = (currentUserId
      ? dbConvs.filter((c) => {
          const raw = data?.find((d: any) => d.id === c.id);
          const members = raw?.chat_channel_members ?? [];
          if (members.length === 0) return true;
          return members.some((m: any) => m.user_id === currentUserId) || raw?.created_by === currentUserId;
        })
      : dbConvs
    ).filter((c) => !isUserBlocked(c.participantId));

    // Sort by latest message time
    userChannels.sort((a, b) => {
      const tA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const tB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return tB - tA;
    });

    // Merge unique real conversations with local cache
    const merged = [...userChannels];
    for (const c of localConversations) {
      if (!merged.some((m) => m.id === c.id)) {
        merged.push(c);
      }
    }
    localConversations = merged;
    return [...merged];
  } catch (err) {
    console.warn('[Messaging] listConversations failed, showing local pool only:', err);
    return [...localConversations];
  }
}

export async function archiveConversation(id: string): Promise<void> {
  // IMPORTANT: `chat_channels` rows are SHARED between both DM participants.
  // This used to call `.delete()` on the channel, which destroyed it for the
  // other participant too (not just "archived" it for the caller). Instead,
  // record a per-user archive marker in `chat_channel_archives` (channel_id,
  // user_id) and filter archived channels out of `listConversations` for
  // that user only. This depends on the `chat_channel_archives` table (with
  // RLS allowing a user to read/write only their own rows) being created via
  // migration `supabase_fix_audit_2026.sql`.
  try {
    const { data: authData } = await supabase.auth.getUser();
    let currentUserId = authData?.user?.id;
    if (!currentUserId) {
      const stored = await getSessionUser();
      if (stored?.id) currentUserId = stored.id;
    }

    if (currentUserId) {
      // Replace any older marker so archived_at is "now" (the list un-hides a chat that gets newer messages).
      // archived_at is left to the column default (DEFAULT NOW()) so it is stamped by the server, the same clock
      // as chat_messages.created_at it is compared with - a device clock that is off would hide or resurrect chats.
      await supabase.from('chat_channel_archives').delete().eq('channel_id', id).eq('user_id', currentUserId);
      await supabase.from('chat_channel_archives').insert({ channel_id: id, user_id: currentUserId });
    }
  } catch {
    // Session fallback
  }
  localConversations = localConversations.filter((c) => c.id !== id);
  delete localMessages[id];
}

export async function getOrCreateConversationWithUser(
  userId: string,
  userName: string,
  avatarUrl?: string | null,
): Promise<Conversation> {
  if (userId && isUserBlocked(userId)) {
    throw new Error("You can't message a user you've blocked.");
  }

  // Check in-memory cache first
  const existing = localConversations.find(
    (c) => c.participantId === userId || (c.id === userId && c.participantName === userName),
  );
  if (existing) return existing;

  const { data: authData } = await supabase.auth.getUser();
  let currentUserId = authData?.user?.id;
  if (!currentUserId) {
    const stored = await getSessionUser();
    if (stored?.id) currentUserId = stored.id;
  }

  // Ensure neither user has blocked the other
  if (currentUserId && userId && currentUserId !== userId) {
    try {
      const { data: hasBlock } = await supabase.rpc('users_have_block', { p_user_a: currentUserId, p_user_b: userId });
      if (hasBlock) {
        throw new Error('Messaging is unavailable between these accounts.');
      }
    } catch (blockErr: any) {
      if (blockErr.message?.includes('Messaging is unavailable')) throw blockErr;
    }
  }

  // If signed in, query Supabase for an existing direct channel between both users
  if (currentUserId) {
    try {
      const { data: myMemberships } = await supabase
        .from('chat_channel_members')
        .select('channel_id')
        .eq('user_id', currentUserId);

      const myChannelIds = (myMemberships ?? []).map((m: any) => m.channel_id);

      if (myChannelIds.length > 0) {
        const { data: shared } = await supabase
          .from('chat_channel_members')
          .select('channel_id, chat_channels!inner(id, is_direct_message, updated_at)')
          .eq('user_id', userId)
          .in('channel_id', myChannelIds)
          .eq('chat_channels.is_direct_message', true)
          .limit(1);

        if (shared && shared.length > 0) {
          const channelId = shared[0].channel_id;
          // Opening a chat with this person again un-archives it.
          void supabase.from('chat_channel_archives').delete().eq('channel_id', channelId).eq('user_id', currentUserId).then(() => {}, () => {});
          const found: Conversation = {
            id: channelId,
            participantId: userId,
            participantName: userName,
            participantAvatarUrl: avatarUrl ?? null,
            // Online status is unknown without last_active_at; resolved on next list refresh
            isOnline: false,
            lastMessageAt: (shared[0].chat_channels as any)?.updated_at || new Date().toISOString(),
            lastMessagePreview: 'Active chat channel',
            unreadCount: 0,
          };
          localConversations = [found, ...localConversations.filter((c) => c.id !== channelId)];
          return found;
        }
      }
    } catch (lookupErr) {
      console.warn('[Messaging] Error looking up shared direct channel:', lookupErr);
    }
  }

  // Create a brand new direct channel
  const convId = generateUUID();
  const now = new Date().toISOString();
  const created: Conversation = {
    id: convId,
    participantId: userId,
    participantName: userName,
    participantAvatarUrl: avatarUrl ?? null,
    // Online status is unknown at creation time; resolved on next list refresh
    isOnline: false,
    lastMessageAt: now,
    lastMessagePreview: 'Started conversation',
    unreadCount: 0,
  };

  try {
    // 1. Insert chat channel
    const { error: channelError } = await supabase.from('chat_channels').insert({
      id: convId,
      name: userName,
      is_direct_message: true,
      created_by: currentUserId || null,
      created_at: now,
      updated_at: now,
    });
    // Signed in: a refused insert (blocked, suspended, permission off) is a real failure. Opening a "ghost"
    // chat that can never deliver anything is worse than saying so.
    if (channelError && currentUserId) {
      throw new Error(isMinorRestrictedError(channelError) ? getFriendlyErrorMessage(channelError) : 'Could not start this conversation right now. Please try again.');
    }

    // 2. Enroll both members in chat_channel_members
    const memberRows: { channel_id: string; user_id: string }[] = [];
    if (currentUserId) memberRows.push({ channel_id: convId, user_id: currentUserId });
    if (userId && userId !== currentUserId) memberRows.push({ channel_id: convId, user_id: userId });

    if (memberRows.length > 0) {
      const { error: memberError } = await supabase
        .from('chat_channel_members')
        .upsert(memberRows, { onConflict: 'channel_id,user_id', ignoreDuplicates: true });
      if (memberError) {
        console.warn('[Messaging] Channel member enrollment warning:', memberError.message);
        if (currentUserId) {
          throw new Error(isMinorRestrictedError(memberError) ? getFriendlyErrorMessage(memberError) : 'Could not start this conversation right now. Please try again.');
        }
      }
    }
  } catch (err) {
    if (currentUserId) throw err instanceof Error ? err : new Error('Could not start this conversation right now. Please try again.');
    console.warn('[Messaging] Supabase channel creation fallback:', err);
  }

  localConversations = [created, ...localConversations];
  return created;
}

/** Newest messages first from the database, so a long chat never drops its latest messages at the row cap. */
export const MESSAGE_PAGE_SIZE = 150;

export async function listMessages(
  conversationId: string,
  limit: number = MESSAGE_PAGE_SIZE,
): Promise<{ items: Message[]; nextCursor?: string }> {
  try {
    const { data: newestFirst, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (error) throw error;

    const hasMore = (newestFirst?.length ?? 0) > limit;
    const data = (newestFirst ?? []).slice(0, limit).reverse();

    if (data && data.length > 0) {
      const { data: authData } = await supabase.auth.getUser();
      let currentUserId = authData?.user?.id;
      if (!currentUserId) {
        const stored = await getSessionUser();
        if (stored?.id) currentUserId = stored.id;
      }

      // Messages this user chose to "delete for me" (chat_message_deletes) -
      // a per-user hide, never visible to the other participant.
      let deletedForMe = new Set<string>();
      if (currentUserId) {
        try {
          const { data: deletedRows } = await supabase
            .from('chat_message_deletes')
            .select('message_id')
            .eq('user_id', currentUserId)
            .in('message_id', data.map((row: any) => row.id));
          deletedForMe = new Set((deletedRows ?? []).map((row: any) => row.message_id));
        } catch (delErr) {
          console.warn('[Messaging] Failed to load per-message deletes:', delErr);
        }
      }

      const dbMsgs: (Message & { mediaUrl?: string })[] = data
        .filter((row: any) => !deletedForMe.has(row.id))
        .map((row: any) => ({
          id: row.id,
          conversationId: row.channel_id,
          senderId: row.sender_id || 'me',
          content: row.content,
          messageType: row.message_type || 'text',
          status: row.is_read ? 'read' : 'sent',
          sentAt: row.created_at,
          // `media_url` is a pre-existing column on chat_messages used to reference
          // real uploaded attachments (photos/documents) sent from ChatThread. It
          // holds either a safe http(s) URL or a bare `resources` bucket storage
          // path (that bucket is private - see src/api/storage.ts); either way it
          // was validated when `sendMessage` wrote it, so it's passed through as-is
          // and resolved to something renderable at display time via
          // `resolveMediaUrl`/`useSignedUrl` (src/api/signedUrls.ts).
          mediaUrl: (typeof row.media_url === 'string' && row.media_url.trim()) || undefined,
        }));

      // Merge with local state, dropping anything deleted-for-me that might
      // still be sitting in the optimistic local cache.
      const local = (localMessages[conversationId] ?? []).filter((m) => !deletedForMe.has(m.id));
      const combined = [...dbMsgs];
      for (const m of local) {
        if (!combined.some((c) => c.id === m.id)) {
          combined.push(m);
        }
      }
      localMessages[conversationId] = combined;
      return { items: [...combined], nextCursor: hasMore ? 'older' : undefined };
    }
  } catch (err) {
    console.warn('[Messaging] listMessages failed, showing local pool only:', err);
  }

  return { items: [...(localMessages[conversationId] ?? [])] };
}

/**
 * "Delete for me": hides a single message from only the caller's own view.
 * The other participant's copy is untouched - mirrors how `archiveConversation`
 * already works per-user. Backed by the `chat_message_deletes` join table
 * (migration 20261006010000_messaging_calling_fixes.sql) rather than a column
 * on the hot `chat_messages` table.
 */
export async function deleteMessageForMe(messageId: string): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  let currentUserId = authData?.user?.id;
  if (!currentUserId) {
    const stored = await getSessionUser();
    if (stored?.id) currentUserId = stored.id;
  }
  if (!currentUserId) {
    throw new Error('You must be signed in to delete a message.');
  }

  for (const convId of Object.keys(localMessages)) {
    localMessages[convId] = localMessages[convId].filter((m) => m.id !== messageId);
  }

  const { error } = await supabase
    .from('chat_message_deletes')
    .upsert(
      { message_id: messageId, user_id: currentUserId },
      { onConflict: 'message_id,user_id', ignoreDuplicates: true },
    );
  if (error) {
    console.warn('[Messaging] deleteMessageForMe error:', error.message);
    throw new Error('Could not delete this message. Please try again.');
  }
}

/**
 * Admin-only hard delete of a reported chat message - the "message" branch
 * of the moderation takedown flow (ModerationQueue.tsx handleConfirmTakedown),
 * which previously had no way to actually remove a reported message. Goes
 * through the `admin_delete_chat_message` RPC (migration
 * 20261009020000_admin_moderation_fixes.sql) rather than a bare
 * `.delete()`, so a non-admin caller always gets back a clear "not allowed"
 * error instead of a silent, RLS-refused no-op; it hard-deletes the row,
 * matching the real-DELETE convention the same takedown flow already uses
 * for posts/pod posts/listings rather than a soft "removed" flag.
 */
export async function deleteMessageAsAdmin(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_chat_message', { p_message_id: messageId });
  if (error) {
    console.warn('[Messaging] deleteMessageAsAdmin error:', error.message);
    throw new Error('Could not remove this message. Please try again.');
  }

  for (const convId of Object.keys(localMessages)) {
    localMessages[convId] = localMessages[convId].filter((m) => m.id !== messageId);
  }
}

export async function sendMessage(
  conversationId: string,
  content: string,
  // Optional real attachment reference: either a safe http(s) URL, or the bare
  // storage PATH that `uploadMediaFile('resources', ...)` returns (the
  // `resources` bucket is private - see src/api/storage.ts - so an upload
  // never yields a URL). Persisted to the pre-existing
  // `chat_messages.media_url` column — additive, no schema change required.
  mediaUrl?: string,
): Promise<Message & { mediaUrl?: string }> {
  if (mediaUrl) {
    // A genuinely external link (pasted or otherwise user-supplied) must be a
    // safe http(s) URL. A bare storage path - what our own upload flow hands
    // back for the private `resources` bucket - is never a URL at all, so
    // running it through `assertSafeHttpUrl` always threw. `storagePathFor`
    // is the same validator `resolveMediaUrl` uses to trust a stored path: it
    // rejects anything carrying a scheme (`javascript:`, `data:`, ...) and
    // only lets through a plain `<uid>/<file>`-shaped path.
    if (/^https?:\/\//i.test(mediaUrl)) {
      mediaUrl = assertSafeHttpUrl(mediaUrl, 'The attachment link');
    } else {
      const path = storagePathFor('resources', mediaUrl);
      if (!path) {
        throw new Error('The attachment link must be a valid http(s) URL or an uploaded file path.');
      }
      mediaUrl = path;
    }
  }

  const msgId = generateUUID();
  const now = new Date().toISOString();

  // Resolve authentic sender identity
  const { data: authData } = await supabase.auth.getUser();
  let currentSenderId = authData?.user?.id;
  if (!currentSenderId) {
    const stored = await getSessionUser();
    if (stored?.id) currentSenderId = stored.id;
  }

  const newMessage: Message & { mediaUrl?: string } = {
    id: msgId,
    conversationId,
    senderId: currentSenderId || 'me',
    content,
    messageType: 'text',
    status: 'sent',
    sentAt: now,
    mediaUrl,
  };

  if (currentSenderId) {
    // Ensure sender is enrolled in chat_channel_members so RLS allows insert
    await supabase
      .from('chat_channel_members')
      .upsert(
        { channel_id: conversationId, user_id: currentSenderId },
        { onConflict: 'channel_id,user_id', ignoreDuplicates: true },
      );

    const { error: msgError } = await supabase.from('chat_messages').insert({
      id: msgId,
      channel_id: conversationId,
      sender_id: currentSenderId,
      content,
      media_url: mediaUrl ?? null,
      is_read: false,
      // created_at is left to the column default (DEFAULT NOW()): the server stamps it, so ordering, the
      // archive comparison and the call-invite staleness check never depend on this device's clock.
      // `now` below is only the optimistic local timestamp.
    });

    if (msgError) {
      console.warn('[Messaging] Supabase persistence error:', msgError.message);
      if (isPermissionRefusal(msgError)) throw new Error(refusalMessageFor(msgError, 'Messaging'));
      throw new Error('Message could not be sent. Check your connection and try again.');
    }

    // Touch updated_at on the channel so conversation order is updated and realtime fires
    try {
      await supabase
        .from('chat_channels')
        .update({ updated_at: now })
        .eq('id', conversationId);
    } catch {
      // Non-blocking
    }
  } else {
    if (__DEV__) console.log('[Messaging] Message stored in local session (guest mode)');
  }

  if (!localMessages[conversationId]) {
    localMessages[conversationId] = [];
  }
  localMessages[conversationId].push(newMessage);

  localConversations = localConversations.map((c) =>
    c.id === conversationId
      ? { ...c, lastMessagePreview: toPreviewText(content), lastMessageAt: now }
      : c,
  );

  return newMessage;
}

export async function markConversationAsRead(conversationId: string): Promise<void> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    let currentUserId = authData?.user?.id;
    if (!currentUserId) {
      const stored = await getSessionUser();
      if (stored?.id) currentUserId = stored.id;
    }

    if (currentUserId) {
      await supabase
        .from('chat_messages')
        .update({ is_read: true })
        .eq('channel_id', conversationId)
        .neq('sender_id', currentUserId)
        .eq('is_read', false);
    }

    localConversations = localConversations.map((c) =>
      c.id === conversationId ? { ...c, unreadCount: 0 } : c,
    );
  } catch (err) {
    console.warn('[Messaging] markConversationAsRead warning:', err);
  }
}

export async function searchUsersToMessage(
  query?: string,
  campusCode?: string,
): Promise<UserToMessage[]> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    let currentUserId = authData?.user?.id;
    if (!currentUserId) {
      const stored = await getSessionUser();
      if (stored?.id) currentUserId = stored.id;
    }

    let req = supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role, department, campus_code')
      .eq('is_suspended', false)
      .order('full_name', { ascending: true })
      .limit(30);

    if (currentUserId) {
      req = req.neq('id', currentUserId);
    }

    if (campusCode && campusCode !== 'GLOBAL') {
      req = req.eq('campus_code', campusCode);
    }

    if (query && query.trim()) {
      req = req.ilike('full_name', `%${escapePostgrestLike(query.trim())}%`);
    }

    const { data, error } = await req;
    if (error) throw error;

    return (data ?? [])
      .map((row: any) => ({
        id: row.id,
        fullName: row.full_name || 'Campus Member',
        avatarUrl: row.avatar_url ?? null,
        role: row.role || 'student',
        department: row.department ?? null,
        campusCode: row.campus_code ?? null,
      }))
      .filter((u: any) => !isUserBlocked(u.id));
  } catch (err) {
    console.warn('[Messaging] searchUsersToMessage error:', err);
    return [];
  }
}
