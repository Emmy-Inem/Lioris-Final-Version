import { api } from'./client';
import { Conversation, Message } from'./types';
import { mockConversations, mockMessages } from'./mockData';
import { withMockFallback } from'./withMockFallback';
import { FALL_BACK_TO_MOCKS } from'./config';

// Mutable in-memory copy so archiving a conversation actually persists
// for the session, rather than reappearing on the next fetch — same
// convention as reportsState in moderation.ts / eventsState in events.ts.
let conversationsState = [...mockConversations];

export async function listConversations(): Promise<Conversation[]> {
  return withMockFallback(async () => {
    const { data } = await api.get<{ items: Conversation[] }>('/conversations');
    return data.items;
  }, conversationsState);
}

// DELETE /conversations/{id} — not in Section 15's excerpted contracts,
// but implied by the"archive/delete a conversation"swipe gesture on
// the Messages list (PRD Section 8's gesture-interactions requirement).
export async function archiveConversation(id: string): Promise<void> {
  if (!FALL_BACK_TO_MOCKS) {
    await api.delete(`/conversations/${id}`);
    return;
  }
  try {
    await api.delete(`/conversations/${id}`);
  } catch {
    // Expected in mock mode.
  }
  conversationsState = conversationsState.filter((c) => c.id !== id);
}

// POST /conversations — not in Section 15's excerpted contracts, but
// implied by any"Message [person]"action starting a fresh thread
// (e.g. Marketplace's"Message Seller") where no conversation with
// that person exists yet. Previously there was no way to start a new
// conversation at all — only list ones that already existed.
export async function getOrCreateConversationWithUser(
  userId: string,
  userName: string,
  avatarUrl?: string | null,
): Promise<Conversation> {
  const existing = conversationsState.find((c) => c.participantId === userId);
  if (existing) return existing;

  const created: Conversation = {
    id: `mock-conv-${userId}`,
    participantId: userId,
    participantName: userName,
    participantAvatarUrl: avatarUrl,
    isOnline: false,
    lastMessageAt: null,
    lastMessagePreview: null,
    unreadCount: 0,
  };

  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.post<Conversation>('/conversations', { participantId: userId });
    return data;
  }
  try {
    const { data } = await api.post<Conversation>('/conversations', { participantId: userId });
    conversationsState = [data, ...conversationsState];
    return data;
  } catch {
    conversationsState = [created, ...conversationsState];
    return created;
  }
}

// GET /conversations/{id}/messages?cursor= — PRD Section 15.4
export async function listMessages(
  conversationId: string,
  cursor?: string,
): Promise<{ items: Message[]; nextCursor?: string }> {
  return withMockFallback(
    async () => {
      const { data } = await api.get(`/conversations/${conversationId}/messages`, {
        params: { cursor },
      });
      return data;
    },
    { items: mockMessages[conversationId] ?? [] },
  );
}

// POST /conversations/{id}/messages — PRD Section 15.4
export async function sendMessage(
  conversationId: string,
  content: string,
): Promise<Message> {
  return withMockFallback(
    async () => {
      const { data } = await api.post(`/conversations/${conversationId}/messages`, { content });
      return data;
    },
    {
      id: `mock-msg-${Date.now()}`,
      conversationId,
      senderId: 'me',
      content,
      messageType: 'text',
      status: 'sent',
      sentAt: new Date().toISOString(),
    },
  );
}
