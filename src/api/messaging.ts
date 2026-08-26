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

import { generateUUID } from '../utils/uuid';

export async function getOrCreateConversationWithUser(
 userId: string,
 userName: string,
 avatarUrl?: string | null,
): Promise<Conversation> {
 const existing = conversationsState.find((c) => c.participantId === userId || c.id === userId);
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

 conversationsState = [created, ...conversationsState];
 if (!messagesState[convId]) {
 messagesState[convId] = [
 {
 id: generateUUID(),
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
 const msgId = generateUUID();
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

 // 3. Persist into Supabase chat_messages table with valid sender_id & ensured membership
 try {
 const { data: authData } = await supabase.auth.getUser();
 const authUid = authData?.user?.id;

 if (authUid) {
 // Ensure sender is registered in chat_channel_members so RLS permits insert
 await supabase
 .from('chat_channel_members')
 .upsert(
 { channel_id: conversationId, user_id: authUid },
 { onConflict: 'channel_id,user_id', ignoreDuplicates: true },
 );

 const { error } = await supabase.from('chat_messages').insert({
 id: msgId,
 channel_id: conversationId,
 sender_id: authUid,
 content,
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


