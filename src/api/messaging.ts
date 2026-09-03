import { supabase } from './supabase';
import { Conversation, Message } from './types';
import { generateUUID } from '../utils/uuid';
import { getSessionUser } from '../auth/tokenStorage';

// Real conversations/messages only (db-fetched or locally created) - never
// seeded with mockData.ts fixtures. Fixtures only ever come from
// getMockConversations()/getMockMessagesFor() below, and only while the
// admin's "Mock Data Visibility" toggle is on.
let localConversations: Conversation[] = [];
const localMessages: Record<string, Message[]> = {};



export async function listConversations(): Promise<Conversation[]> {
 try {
 const { data, error } = await supabase
 .from('chat_channels')
 .select('*')
 .order('updated_at', { ascending: false });

 if (error) throw error;

 const dbConvs: Conversation[] = (data ?? []).map((row: any) => ({
 id: row.id,
 participantId: row.created_by || 'peer-user',
 participantName: row.name || 'Campus Student',
 participantAvatarUrl: null,
 isOnline: true,
 lastMessageAt: row.updated_at,
 lastMessagePreview: row.description || 'Active chat channel',
 unreadCount: 0,
 }));
 // Merge unique real conversations only; cache them for the
 // existing-conversation lookup in getOrCreateConversationWithUser.
 const merged = [...dbConvs];
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
 try {
 await supabase.from('chat_channels').delete().eq('id', id);
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
 const existing = localConversations.find((c) => c.participantId === userId || c.id === userId);
 if (existing) return existing;

 const convId = generateUUID();
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
 const { data: authData } = await supabase.auth.getUser();
 const currentUserId = authData?.user?.id;

 // 1. Insert chat channel
 await supabase.from('chat_channels').insert({
 id: convId,
 name: userName,
 is_direct_message: true,
 created_by: currentUserId || null,
 });

 // 2. Populate chat_channel_members for both participants
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
 console.warn('[Messaging] Local fallback for channel creation:', err);
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
 const dbMsgs: Message[] = data.map((row: any) => ({
 id: row.id,
 conversationId: row.channel_id,
 senderId: row.sender_id || 'me',
 content: row.content,
 messageType: row.message_type || 'text',
 status: 'read',
 sentAt: row.created_at,
 }));

 // Merge with local (real, non-mock) state
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

/**
 * Throws if the message can't actually be persisted for a signed-in user,
 * instead of quietly reporting "sent" for a message the recipient will
 * never see. ChatThread already has retry/failed-state handling that
 * depends on this rejecting.
 */
export async function sendMessage(
 conversationId: string,
 content: string,
): Promise<Message> {
 const msgId = generateUUID();
 const now = new Date().toISOString();

 // Resolve authentic sender identity
 const { data: authData } = await supabase.auth.getUser();
 let currentSenderId = authData?.user?.id;
 if (!currentSenderId) {
 const stored = await getSessionUser();
 if (stored?.id) currentSenderId = stored.id;
 }

 const newMessage: Message = {
 id: msgId,
 conversationId,
 senderId: currentSenderId || 'me',
 content,
 messageType: 'text',
 status: 'sent',
 sentAt: now,
 };

 if (currentSenderId) {
 // Ensure sender is registered in chat_channel_members so RLS permits insert
 await supabase
 .from('chat_channel_members')
 .upsert(
 { channel_id: conversationId, user_id: currentSenderId },
 { onConflict: 'channel_id,user_id', ignoreDuplicates: true },
 );

 const { error } = await supabase.from('chat_messages').insert({
 id: msgId,
 channel_id: conversationId,
 sender_id: currentSenderId,
 content,
 });

 if (error) {
 console.warn('[Messaging] Supabase persistence error:', error.message);
 throw new Error('Message could not be sent. Check your connection and try again.');
 }
 } else {
 console.log('[Messaging] Message stored in local active session (unauthenticated guest mode)');
 }

 // Only reaches here once the message is actually persisted (or we're in
 // the explicit unauthenticated-guest fallback) - never on a failed send.
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
