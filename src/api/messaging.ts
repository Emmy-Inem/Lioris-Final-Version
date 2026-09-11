import { supabase } from './supabase';
import { Conversation, Message } from './types';
import { generateUUID } from '../utils/uuid';
import { getSessionUser } from '../auth/tokenStorage';

// Real conversations/messages cache for optimistic updates and offline resilience
let localConversations: Conversation[] = [];
const localMessages: Record<string, Message[]> = {};

export interface UserToMessage {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: string;
  department: string | null;
  campusCode: string | null;
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

    const { data, error } = await supabase
      .from('chat_channels')
      .select(`
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
            campus_code
          )
        ),
        chat_messages (
          id,
          sender_id,
          content,
          is_read,
          created_at
        )
      `)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Exclude channels the current user has archived for themselves.
    // Archiving does NOT delete the shared channel (that would destroy it
    // for the other participant); it just hides it from this user's list.
    // Depends on `chat_channel_archives` (migration supabase_fix_audit_2026.sql).
    let archivedChannelIds = new Set<string>();
    if (currentUserId) {
      try {
        const { data: archivedRows } = await supabase
          .from('chat_channel_archives')
          .select('channel_id')
          .eq('user_id', currentUserId);
        archivedChannelIds = new Set((archivedRows ?? []).map((r: any) => r.channel_id));
      } catch (archiveErr) {
        console.warn('[Messaging] Failed to load archived channels:', archiveErr);
      }
    }

    const nonArchivedData = (data ?? []).filter((row: any) => !archivedChannelIds.has(row.id));

    const dbConvs: Conversation[] = nonArchivedData.map((row: any) => {
      const msgs = (row.chat_messages ?? []).slice().sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const latestMsg = msgs[0];

      let participantId = row.created_by || 'peer-user';
      let participantName = row.name || 'Campus Member';
      let participantAvatarUrl: string | null = null;
      let participantDepartment: string | null = null;
      let participantRole: string | null = null;

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
        } else if (otherMember) {
          participantId = otherMember.user_id;
        }
      }

      // If participantName happens to equal current user's name for a DM, make sure we show a peer label
      if (isDirect && currentUserName && participantName.toLowerCase() === currentUserName.toLowerCase() && members.length > 1) {
        const other = members.find((m: any) => m.user_id !== currentUserId);
        if (other?.profiles?.full_name) {
          participantName = other.profiles.full_name;
        }
      }

      const unreadCount = currentUserId
        ? msgs.filter((m: any) => m.sender_id !== currentUserId && !m.is_read).length
        : 0;

      const lastMessageAt = latestMsg?.created_at || row.updated_at || row.created_at;
      const lastMessagePreview = latestMsg?.content || 'Started conversation';

      return {
        id: row.id,
        participantId,
        participantName,
        participantAvatarUrl,
        participantDepartment,
        participantRole,
        isOnline: true,
        lastMessageAt,
        lastMessagePreview,
        unreadCount,
      };
    });

    // Filter to only channels where the current user is an enrolled member (if signed in)
    const userChannels = currentUserId
      ? dbConvs.filter((c) => {
          const raw = data?.find((d: any) => d.id === c.id);
          const members = raw?.chat_channel_members ?? [];
          if (members.length === 0) return true;
          return members.some((m: any) => m.user_id === currentUserId) || raw?.created_by === currentUserId;
        })
      : dbConvs;

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
      await supabase
        .from('chat_channel_archives')
        .upsert(
          { channel_id: id, user_id: currentUserId },
          { onConflict: 'channel_id,user_id', ignoreDuplicates: true },
        );
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
          const found: Conversation = {
            id: channelId,
            participantId: userId,
            participantName: userName,
            participantAvatarUrl: avatarUrl ?? null,
            isOnline: true,
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
    isOnline: true,
    lastMessageAt: now,
    lastMessagePreview: 'Started conversation',
    unreadCount: 0,
  };

  try {
    // 1. Insert chat channel
    await supabase.from('chat_channels').insert({
      id: convId,
      name: userName,
      is_direct_message: true,
      created_by: currentUserId || null,
      created_at: now,
      updated_at: now,
    });

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
      }
    }
  } catch (err) {
    console.warn('[Messaging] Supabase channel creation fallback:', err);
  }

  localConversations = [created, ...localConversations];
  return created;
}

export async function listMessages(
  conversationId: string,
  cursor?: string,
): Promise<{ items: Message[]; nextCursor?: string }> {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (data && data.length > 0) {
      const dbMsgs: (Message & { mediaUrl?: string })[] = data.map((row: any) => ({
        id: row.id,
        conversationId: row.channel_id,
        senderId: row.sender_id || 'me',
        content: row.content,
        messageType: row.message_type || 'text',
        status: row.is_read ? 'read' : 'sent',
        sentAt: row.created_at,
        // `media_url` is a pre-existing column on chat_messages used to reference
        // real uploaded attachments (photos/documents) sent from ChatThread.
        mediaUrl: row.media_url ?? undefined,
      }));

      // Merge with local state
      const local = localMessages[conversationId] ?? [];
      const combined = [...dbMsgs];
      for (const m of local) {
        if (!combined.some((c) => c.id === m.id)) {
          combined.push(m);
        }
      }
      localMessages[conversationId] = combined;
      return { items: [...combined] };
    }
  } catch (err) {
    console.warn('[Messaging] listMessages failed, showing local pool only:', err);
  }

  return { items: [...(localMessages[conversationId] ?? [])] };
}

export async function sendMessage(
  conversationId: string,
  content: string,
  // Optional real attachment URL (e.g. a photo or document uploaded to Supabase
  // Storage via `uploadMediaFile`). Persisted to the pre-existing
  // `chat_messages.media_url` column — additive, no schema change required.
  mediaUrl?: string,
): Promise<Message & { mediaUrl?: string }> {
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
      created_at: now,
    });

    if (msgError) {
      console.warn('[Messaging] Supabase persistence error:', msgError.message);
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
    console.log('[Messaging] Message stored in local session (guest mode)');
  }

  if (!localMessages[conversationId]) {
    localMessages[conversationId] = [];
  }
  localMessages[conversationId].push(newMessage);

  localConversations = localConversations.map((c) =>
    c.id === conversationId
      ? { ...c, lastMessagePreview: content, lastMessageAt: now }
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
      .order('full_name', { ascending: true })
      .limit(30);

    if (currentUserId) {
      req = req.neq('id', currentUserId);
    }

    if (campusCode && campusCode !== 'GLOBAL') {
      req = req.eq('campus_code', campusCode);
    }

    if (query && query.trim()) {
      req = req.ilike('full_name', `%${query.trim()}%`);
    }

    const { data, error } = await req;
    if (error) throw error;

    return (data ?? []).map((row: any) => ({
      id: row.id,
      fullName: row.full_name || 'Campus Member',
      avatarUrl: row.avatar_url ?? null,
      role: row.role || 'student',
      department: row.department ?? null,
      campusCode: row.campus_code ?? null,
    }));
  } catch (err) {
    console.warn('[Messaging] searchUsersToMessage error:', err);
    return [];
  }
}
