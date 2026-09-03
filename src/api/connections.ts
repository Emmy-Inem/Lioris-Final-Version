import { api } from'./client';
import { AlumniDirectoryEntry, Connection, IncomingConnectionRequest } from'./types';
import { createNotification } from'./notifications';
import { supabase } from './supabase';



export interface DirectorySearchQuery {
 q?: string;
 graduationYear?: number;
 department?: string;
 industry?: string;
 company?: string;
}



// Backs the alumni directory search described in PRD Section 6.2 /
// Section 16 (Search Specifications).
export async function searchAlumniDirectory(
  query: DirectorySearchQuery = {},
): Promise<AlumniDirectoryEntry[]> {
  try {
    let q = supabase
      .from('profiles')
      .select('id, full_name, department, bio, avatar_url, role')
      .ilike('role', '%alumni%');

    if (query.q) {
      q = q.ilike('full_name', `%${query.q}%`);
    }
    if (query.department) {
      q = q.eq('department', query.department);
    }

    const { data, error } = await q.limit(20);
    if (error || !data) return [];

    return data.map((p: any) => ({
      id: p.id,
      fullName: p.full_name || 'Alumni Member',
      department: p.department || 'Alumni Network',
      bio: p.bio || '',
      avatarUrl: p.avatar_url || null,
      connectionStatus: 'none' as const,
    }));
  } catch {
    return [];
  }
}

import { generateUUID } from '../utils/uuid';
import { getSessionUser } from '../auth/tokenStorage';

// POST /connections - PRD Section 15.3
export async function sendConnectionRequest(recipientId: string): Promise<Connection> {
 const connId = generateUUID();
 let senderId = 'me';

 try {
 const { data: authData } = await supabase.auth.getUser();
 if (authData?.user?.id) {
 senderId = authData.user.id;
 } else {
 const stored = await getSessionUser();
 if (stored?.id) senderId = stored.id;
 }

 if (senderId && senderId !== 'me') {
 const { error } = await supabase.from('connections').upsert({
 id: connId,
 requester_id: senderId,
 recipient_id: recipientId,
 status: 'pending',
 }, { onConflict: 'requester_id,recipient_id' });
 if (error) {
 console.warn('[Connections] Send connection request Supabase error:', error.message);
 }
 }
 } catch (err) {
 console.warn('[Connections] Send request error:', err);
 }

 const created: Connection = {
 id: connId,
 requesterId: senderId,
 recipientId,
 status: 'pending',
 createdAt: new Date().toISOString(),
 };

 createNotification({
 recipientId,
 type: 'system',
 title: 'New connection request',
 body: 'Someone on your campus wants to connect with you.',
 deepLinkPath: '/(alumni)/connection-requests',
 });

 return created;
}

export async function respondToConnectionRequest(
 connectionId: string,
 action: 'accept' | 'decline',
): Promise<Connection> {
 let realRequesterId: string | undefined;
 let responderName = 'A colleague';

 try {
 const { data: authData } = await supabase.auth.getUser();
 const currentUserId = authData?.user?.id;
 if (currentUserId) {
 const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', currentUserId).maybeSingle();
 if (profile?.full_name) responderName = profile.full_name;
 }

 const { data: connRow } = await supabase
 .from('connections')
 .update({
 status: action === 'accept' ? 'accepted' : 'declined',
 updated_at: new Date().toISOString(),
 })
 .eq('id', connectionId)
 .select('requester_id')
 .maybeSingle();

 if (connRow?.requester_id) {
 realRequesterId = connRow.requester_id;
 }
 } catch (err) {
 console.warn('[Connections] Update connection error:', err);
 }

 if (action === 'accept' && realRequesterId) {
 createNotification({
 recipientId: realRequesterId,
 type: 'system',
 title: 'Connection accepted',
 body: `${responderName} accepted your connection request - start a conversation!`,
 });
 }

 return {
 id: connectionId,
 requesterId: realRequesterId ?? 'unknown',
 recipientId: 'me',
 status: action === 'accept' ? 'accepted' : 'declined',
 createdAt: new Date().toISOString(),
 respondedAt: new Date().toISOString(),
 };
}

// Incoming connection requests inbox - PRD Section 13.1
export async function listIncomingConnectionRequests(): Promise<IncomingConnectionRequest[]> {
 try {
 const { data: authData } = await supabase.auth.getUser();
 let currentUserId = authData?.user?.id;
 if (!currentUserId) {
 const stored = await getSessionUser();
 if (stored?.id) currentUserId = stored.id;
 }

 if (currentUserId) {
 const { data, error } = await supabase
 .from('connections')
 .select('*, requester:profiles!connections_requester_id_fkey(full_name, role, department, avatar_url, campus_code)')
 .eq('recipient_id', currentUserId)
 .eq('status', 'pending');

 if (!error && data && data.length > 0) {
 return data.map((row: any) => ({
 id: row.id,
 requesterId: row.requester_id,
 requesterName: row.requester?.full_name || 'Campus Student',
 requesterAvatarUrl: row.requester?.avatar_url || null,
 requesterHeadline: row.requester?.department || 'Verified Member',
 createdAt: row.created_at,
 }));
 }
 }
 } catch {
 // fallback
 }

 return [];
}

export interface SuggestedConnection {
 id: string;
 name: string;
 avatarUrl?: string | null;
 roleLabel: 'Staff' | 'Student' | 'Alumni';
 department: string;
 level: number;
}

export async function listSuggestedConnections(): Promise<SuggestedConnection[]> {
 try {
 const { data: authData } = await supabase.auth.getUser();
 const currentUserId = authData?.user?.id;
 let query = supabase.from('profiles').select('id, full_name, role, department, level, avatar_url').limit(10);
 if (currentUserId) {
 query = query.neq('id', currentUserId);
 }
 const { data, error } = await query;
 if (!error && data && data.length > 0) {
 return data.map((p: any) => ({
 id: p.id,
 name: p.full_name || 'Campus Peer',
 avatarUrl: p.avatar_url || null,
 roleLabel: (p.role === 'admin' || p.role === 'staff') ? 'Staff' : p.role === 'alumni' ? 'Alumni' : 'Student',
 department: p.department || 'Academic Department',
 level: p.level || 300,
 }));
 }
 } catch (err) {
 console.warn('[Connections] Supabase suggestions error:', err);
 }

 return [];
}

// User Safety & Content Filtering - Persists user blocking to Supabase & active session
const blockedUserIdsState = new Set<string>();

export function getBlockedUserIds(): string[] {
 return Array.from(blockedUserIdsState);
}

export async function loadBlockedUserIds(): Promise<string[]> {
 try {
 const { data: authData } = await supabase.auth.getUser();
 if (authData?.user?.id) {
 const { data, error } = await supabase
 .from('user_blocks')
 .select('blocked_id')
 .eq('blocker_id', authData.user.id);
 if (!error && data) {
 for (const row of data) {
 blockedUserIdsState.add(row.blocked_id);
 }
 }
 }
 } catch {
 // fallback
 }
 return Array.from(blockedUserIdsState);
}

export function isUserBlocked(userId?: string | null): boolean {
 if (!userId) return false;
 return blockedUserIdsState.has(userId);
}

export async function blockUser(userId: string, userName?: string): Promise<void> {
 blockedUserIdsState.add(userId);
 try {
 const { data: authData } = await supabase.auth.getUser();
 if (authData?.user?.id) {
 await supabase.from('user_blocks').upsert({
 blocker_id: authData.user.id,
 blocked_id: userId,
 });
 }
 const { recordAuditLogEntry } = await import('./auditLog');
 await recordAuditLogEntry({
 action: 'user_blocked',
 summary: `Blocked user ${userName || userId}. Content from this user is hidden from your feed and events.`,
 targetType: 'user',
 targetId: userId,
 });
 } catch (err) {
 console.warn('[Connections] Block user backend error:', err);
 }
}

export async function unblockUser(userId: string): Promise<void> {
 blockedUserIdsState.delete(userId);
 try {
 const { data: authData } = await supabase.auth.getUser();
 if (authData?.user?.id) {
 await supabase
 .from('user_blocks')
 .delete()
 .eq('blocker_id', authData.user.id)
 .eq('blocked_id', userId);
 }
 } catch (err) {
 console.warn('[Connections] Unblock user backend error:', err);
 }
}

export async function checkConnectionStatus(targetUserId: string): Promise<'none' | 'pending' | 'accepted'> {
 try {
 const { data: authData } = await supabase.auth.getUser();
 const myId = authData?.user?.id || (await getSessionUser())?.id;
 if (!myId || myId === targetUserId) return 'none';

 const { data, error } = await supabase
 .from('connections')
 .select('status')
 .or(`and(requester_id.eq.${myId},recipient_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},recipient_id.eq.${myId})`)
 .maybeSingle();

 if (!error && data) {
 return (data.status as any) || 'pending';
 }
 } catch {}
 return 'none';
}

export async function deleteConnection(targetUserId: string): Promise<void> {
 try {
 const { data: authData } = await supabase.auth.getUser();
 const myId = authData?.user?.id || (await getSessionUser())?.id;
 if (!myId) return;

 await supabase
 .from('connections')
 .delete()
 .or(`and(requester_id.eq.${myId},recipient_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},recipient_id.eq.${myId})`);
 } catch (err) {
 console.warn('[Connections] Delete connection error:', err);
 }
}
