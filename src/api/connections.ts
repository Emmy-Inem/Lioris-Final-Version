import { AlumniDirectoryEntry, Connection, IncomingConnectionRequest } from'./types';
import { createNotification } from'./notifications';
import { supabase } from './supabase';
import { assertUuid, escapePostgrestLike } from '../utils/postgrest';



export interface DirectorySearchQuery {
 q?: string;
 graduationYear?: number;
 department?: string;
 industry?: string;
 company?: string;
 /**
  * Which roles to include. Defaults to alumni only, which is what the
  * alumni directory wants. Onboarding's "connect with peers and alumni"
  * step passes the wider set so students actually see their classmates.
  */
 roles?: Array<'student' | 'alumni' | 'staff' | 'admin'>;
}



// Backs the alumni directory search described in PRD Section 6.2 /
// Section 16 (Search Specifications).
export async function searchAlumniDirectory(
  query: DirectorySearchQuery = {},
): Promise<AlumniDirectoryEntry[]> {
  try {
    let q = supabase
      .from('profiles')
      .select('id, full_name, department, bio, avatar_url, role, graduation_year, industry, company, directory_hide_company')
      .eq('directory_discoverable', true);

    if (query.roles && query.roles.length > 0) {
      q = q.in('role', query.roles);
    } else {
      // profiles.role is a Postgres enum (user_role_type), which has no ILIKE operator -
      // the previous ilike('%alumni%') made every default directory search error out
      // and silently return an empty list.
      q = q.eq('role', 'alumni');
    }

    // Never suggest people to themselves.
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData?.user?.id;
    if (currentUserId) {
      q = q.neq('id', currentUserId);
    }

    if (query.q) {
      q = q.ilike('full_name', `%${escapePostgrestLike(query.q)}%`);
    }
    if (query.department) {
      q = q.eq('department', query.department);
    }
    if (query.graduationYear) {
      q = q.eq('graduation_year', query.graduationYear);
    }
    if (query.industry) {
      q = q.eq('industry', query.industry);
    }
    if (query.company) {
      q = q.ilike('company', `%${escapePostgrestLike(query.company)}%`);
    }

    const { data, error } = await q.limit(20);
    if (error || !data) return [];

    return data.map((p: any) => ({
      id: p.id,
      fullName: p.full_name || 'Alumni Member',
      department: p.department || 'Alumni Network',
      bio: p.bio || '',
      graduationYear: p.graduation_year ?? null,
      industry: p.industry ?? null,
      company: p.directory_hide_company ? null : (p.company ?? null),
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
 let senderName = 'A campus member';

 const { data: authData } = await supabase.auth.getUser();
 if (authData?.user?.id) {
 senderId = authData.user.id;
 } else {
 const stored = await getSessionUser();
 if (stored?.id) senderId = stored.id;
 }

 if (!senderId || senderId === 'me') {
 throw new Error('Could not identify the current user to send this connection request.');
 }

 const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', senderId).maybeSingle();
 if (profile?.full_name) {
 senderName = profile.full_name;
 }

 const { error } = await supabase.from('connections').upsert({
 id: connId,
 requester_id: senderId,
 recipient_id: recipientId,
 status: 'pending',
 }, { onConflict: 'requester_id,recipient_id' });
 if (error) {
 console.warn('[Connections] Send connection request Supabase error:', error.message);
 throw error;
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
 type: 'message',
 title: 'New connection request',
 body: `${senderName} wants to connect with you.`,
 deepLinkPath: '/notifications',
 });

 return created;
}

export async function respondToConnectionRequest(
 connectionId: string,
 action: 'accept' | 'decline',
): Promise<Connection> {
 let responderName = 'A colleague';

 const { data: authData } = await supabase.auth.getUser();
 const currentUserId = authData?.user?.id;
 if (currentUserId) {
 const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', currentUserId).maybeSingle();
 if (profile?.full_name) responderName = profile.full_name;
 }

 const { data: connRow, error } = await supabase
 .from('connections')
 .update({
 status: action === 'accept' ? 'accepted' : 'declined',
 updated_at: new Date().toISOString(),
 })
 .eq('id', connectionId)
 .select('requester_id')
 .maybeSingle();

 if (error) {
 console.warn('[Connections] Update connection error:', error.message);
 throw error;
 }
 if (!connRow?.requester_id) {
 throw new Error('Could not find that connection request to update.');
 }
 const realRequesterId = connRow.requester_id;

 if (action === 'accept') {
 createNotification({
 recipientId: realRequesterId,
 type: 'system',
 title: 'Connection accepted',
 body: `${responderName} accepted your connection request - start a conversation!`,
 deepLinkPath: '/messages',
 });
 }

 return {
 id: connectionId,
 requesterId: realRequesterId,
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

// Mute: a lighter option than block - hides their posts/listings/jobs/events/
// resources from your feeds, but never affects messaging (they can still
// message you, and you can still message them). Deliberately not threaded
// into src/api/messaging.ts for that reason.
const mutedUserIdsState = new Set<string>();

export function isUserMuted(userId?: string | null): boolean {
 if (!userId) return false;
 return mutedUserIdsState.has(userId);
}

export async function loadMutedUserIds(): Promise<string[]> {
 try {
 const { data: authData } = await supabase.auth.getUser();
 if (authData?.user?.id) {
 const { data, error } = await supabase
 .from('user_mutes')
 .select('muted_id')
 .eq('muter_id', authData.user.id);
 if (!error && data) {
 for (const row of data) {
 mutedUserIdsState.add(row.muted_id);
 }
 }
 }
 } catch {
 // fallback
 }
 return Array.from(mutedUserIdsState);
}

export async function muteUser(userId: string, _userName?: string): Promise<void> {
 mutedUserIdsState.add(userId);
 try {
 const { data: authData } = await supabase.auth.getUser();
 if (authData?.user?.id) {
 await supabase.from('user_mutes').upsert({
 muter_id: authData.user.id,
 muted_id: userId,
 });
 }
 } catch (err) {
 console.warn('[Connections] Mute user backend error:', err);
 }
}

export async function unmuteUser(userId: string): Promise<void> {
 mutedUserIdsState.delete(userId);
 try {
 const { data: authData } = await supabase.auth.getUser();
 if (authData?.user?.id) {
 await supabase
 .from('user_mutes')
 .delete()
 .eq('muter_id', authData.user.id)
 .eq('muted_id', userId);
 }
 } catch (err) {
 console.warn('[Connections] Unmute user backend error:', err);
 }
}

export async function checkConnectionStatus(targetUserId: string): Promise<'none' | 'pending' | 'accepted'> {
 try {
 const { data: authData } = await supabase.auth.getUser();
 const myId = authData?.user?.id || (await getSessionUser())?.id;
 if (!myId || myId === targetUserId) return 'none';
 assertUuid(myId, 'user id');
 assertUuid(targetUserId, 'user id');

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
 assertUuid(myId, 'user id');
 assertUuid(targetUserId, 'user id');

 await supabase
 .from('connections')
 .delete()
 .or(`and(requester_id.eq.${myId},recipient_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},recipient_id.eq.${myId})`);
 } catch (err) {
 console.warn('[Connections] Delete connection error:', err);
 }
}
