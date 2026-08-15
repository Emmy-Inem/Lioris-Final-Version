import { supabase } from './supabase';
import { Conversation, Message } from './types';
import { mockConversations, mockMessages } from './mockData';

// In-memory state synchronized across the active session
let conversationsState: Conversation[] = [...mockConversations];
const messagesState: Record<string, Message[]> = { ...mockMessages };

export async function listConversations(): Promise<Conversation[]> {
  try {
    const { data, error } = await supabase
      .from('chat_channels')
      .select('*')
      .order('updated_at', { ascending: false });

    if (!error && data && data.length > 0) {
      const dbConvs: Conversation[] = data.map((row: any) => ({
        id: row.id,
        participantId: row.created_by || 'peer-user',
        participantName: row.name || 'Campus Student',
        participantAvatarUrl: null,
        isOnline: true,
        lastMessageAt: row.updated_at,
        lastMessagePreview: row.description || 'Active chat channel',
        unreadCount: 0,
      }));
      // Merge unique
      const merged = [...dbConvs];
      for (const c of conversationsState) {
        if (!merged.some((m) => m.id === c.id)) {
          merged.push(c);
        }
      }
      conversationsState = merged;
      return merged;
    }
  } catch {
    // Fallback to local session
  }
  return conversationsState;
}

export async function archiveConversation(id: string): Promise<void> {
  try {
    await supabase.from('chat_channels').delete().eq('id', id);
  } catch {
    // Session fallback
  }
  conversationsState = conversationsState.filter((c) => c.id !== id);
  delete messagesState[id];
}

export async function getOrCreateConversationWithUser(
  userId: string,
  userName: string,
  avatarUrl?: string | null,
): Promise<Conversation> {
  const existing = conversationsState.find((c) => c.participantId === userId || c.id === userId);
  if (existing) return existing;

  const convId = `conv-${userId.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-4)}`;
  const created: Conversation = {
    id: convId,
    participantId: userId,
    participantName: userName,
    participantAvatarUrl: avatarUrl,
    isOnline: true,
    lastMessageAt: new Date().toISOString(),
    lastMessagePreview: 'Started conversation',
    unreadCount: 0,
  };

  try {
    await supabase.from('chat_channels').insert({
      id: convId,
      name: userName,
      channel_type: 'direct',
      description: `Direct chat with ${userName}`,
    });
  } catch {
    // Local fallback
  }

  conversationsState = [created, ...conversationsState];
  if (!messagesState[convId]) {
    messagesState[convId] = [
      {
        id: `welcome-${Date.now()}`,
        conversationId: convId,
        senderId: userId,
        content: `Hi there! I am ${userName}. Feel free to ask anything about courses, events, or listings.`,
        messageType: 'text',
        status: 'read',
        sentAt: new Date().toISOString(),
      },
    ];
  }
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

    if (!error && data && data.length > 0) {
      const dbMsgs: Message[] = data.map((row: any) => ({
        id: row.id,
        conversationId: row.channel_id,
        senderId: row.sender_id || 'me',
        content: row.content,
        messageType: row.message_type || 'text',
        status: 'read',
        sentAt: row.created_at,
      }));

      // Merge with local state
      const local = messagesState[conversationId] ?? [];
      const combined = [...dbMsgs];
      for (const m of local) {
        if (!combined.some((c) => c.id === m.id)) {
          combined.push(m);
        }
      }
      messagesState[conversationId] = combined;
      return { items: combined };
    }
  } catch {
    // Fallback to local session
  }

  if (!messagesState[conversationId]) {
    messagesState[conversationId] = [
      {
        id: `init-${Date.now()}`,
        conversationId,
        senderId: 'peer',
        content: 'Hey! Glad we connected on Lioris.',
        messageType: 'text',
        status: 'read',
        sentAt: new Date(Date.now() - 3600000).toISOString(),
      },
    ];
  }

  return { items: messagesState[conversationId] };
}

import { getSessionUser } from '../auth/tokenStorage';

export async function sendMessage(
  conversationId: string,
  content: string,
): Promise<Message> {
  const msgId = `msg-${Date.now()}`;
  const now = new Date().toISOString();

  // Resolve authentic sender identity
  let currentSenderId = 'me';
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user?.id) {
      currentSenderId = authData.user.id;
    } else {
      const stored = await getSessionUser();
      if (stored?.id) currentSenderId = stored.id;
    }
  } catch {
    // fallback
  }

  const newMessage: Message = {
    id: msgId,
    conversationId,
    senderId: currentSenderId,
    content,
    messageType: 'text',
    status: 'sent',
    sentAt: now,
  };

  // 1. Immediately store in local memory state for responsive UI
  if (!messagesState[conversationId]) {
    messagesState[conversationId] = [];
  }
  messagesState[conversationId].push(newMessage);

  // 2. Update conversation preview
  conversationsState = conversationsState.map((c) =>
    c.id === conversationId
      ? { ...c, lastMessagePreview: content, lastMessageAt: now }
      : c,
  );

  // 3. Persist into Supabase chat_messages table with valid sender_id
  try {
    const { data: authData } = await supabase.auth.getUser();
    const authUid = authData?.user?.id;

    if (authUid) {
      const { error } = await supabase.from('chat_messages').insert({
        id: msgId,
        channel_id: conversationId,
        sender_id: authUid,
        content,
        message_type: 'text',
      });
      if (error) {
        console.warn('[Messaging] Supabase persistence error:', error.message);
      }
    } else {
      // Local session message
      console.log('[Messaging] Message stored in local active session (unauthenticated guest mode)');
    }
  } catch (err) {
    console.warn('[Messaging] Failed to reach Supabase backend:', err);
  }

  return newMessage;
}


