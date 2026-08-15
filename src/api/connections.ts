import { api } from'./client';
import { AlumniDirectoryEntry, Connection, IncomingConnectionRequest } from'./types';
import { mockDirectory, mockIncomingConnectionRequests } from'./mockData';
import { withMockFallback } from'./withMockFallback';
import { FALL_BACK_TO_MOCKS } from'./config';
import { createNotification } from'./notifications';
import { supabase } from './supabase';

// Mutable in-memory copy so accept/decline visibly removes a request
// from the inbox within a session, without needing a real backend.
let incomingRequestsState = [...mockIncomingConnectionRequests];

export interface DirectorySearchQuery {
  q?: string;
  graduationYear?: number;
  department?: string;
  industry?: string;
  company?: string;
}

// Client-side stand-in for PRD Section 16's search spec (case-insensitive
// partial match on name/company/industry, exact-match ranked first) —
// used only while there's no real backend to search against.
function filterMockDirectory(query: DirectorySearchQuery): AlumniDirectoryEntry[] {
  let results = [...mockDirectory];

  if (query.graduationYear) {
    results = results.filter((e) => e.graduationYear === query.graduationYear);
  }
  if (query.industry) {
    results = results.filter((e) => e.industry?.toLowerCase() === query.industry!.toLowerCase());
  }
  if (query.company) {
    results = results.filter((e) => e.company?.toLowerCase() === query.company!.toLowerCase());
  }

  if (query.q) {
    const q = query.q.toLowerCase();
    results = results
      .filter(
        (e) =>
          e.fullName.toLowerCase().includes(q) ||
          e.company?.toLowerCase().includes(q) ||
          e.industry?.toLowerCase().includes(q) ||
          e.bio?.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        // Exact name match ranks first, then partial matches — PRD
        // Section 16.3's ranking order (exact > partial > ...).
        const aExact = a.fullName.toLowerCase() === q ? 0 : 1;
        const bExact = b.fullName.toLowerCase() === q ? 0 : 1;
        return aExact - bExact;
      });
  }

  return results;
}

// Backs the alumni directory search described in PRD Section 6.2 /
// Section 16 (Search Specifications).
export async function searchAlumniDirectory(
  query: DirectorySearchQuery = {},
): Promise<AlumniDirectoryEntry[]> {
  return withMockFallback(async () => {
    const { data } = await api.get<{ items: AlumniDirectoryEntry[] }>('/directory/alumni', {
      params: query,
    });
    return data.items;
  }, filterMockDirectory(query));
}

// POST /connections — PRD Section 15.3
export async function sendConnectionRequest(recipientId: string): Promise<Connection> {
  const created: Connection = {
    id: `mock-conn-${recipientId}`,
    requesterId: 'me',
    recipientId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.post<Connection>('/connections', { recipientId });
    return data;
  }
  try {
    const { data } = await api.post<Connection>('/connections', { recipientId });
    return data;
  } catch {
    // There's no real backend here to actually deliver this to a
    // separate recipient's session — this app models one active user
    // at a time, not two concurrent sessions. Consistent with how the
    // rest of this mocked notification feed already works (e.g. the
    // verification-decision notification), this surfaces in the
    // shared demo feed as what the *recipient* would see, since
    // that's the whole point of a connection request existing at all —
    // previously nothing anywhere created a notification for this.
    createNotification({
      recipientId,
      type: 'system',
      title: 'New connection request',
      body: 'Someone on your campus wants to connect with you.',
      deepLinkPath: '/(alumni)/connection-requests',
    });
    return created;
  }
}

export async function respondToConnectionRequest(
  connectionId: string,
  action: 'accept' | 'decline',
): Promise<Connection> {
  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.patch<Connection>(`/connections/${connectionId}`, { action });
    return data;
  }
  try {
    const { data } = await api.patch<Connection>(`/connections/${connectionId}`, { action });
    return data;
  } catch {
    // Only mutate the local mock inbox once we know there's no real
    // backend to talk to — withMockFallback's plain-value API would
    // otherwise run this eagerly even when a real call succeeds.
    const target = incomingRequestsState.find((r) => r.id === connectionId);
    incomingRequestsState = incomingRequestsState.filter((r) => r.id !== connectionId);
    if (action === 'accept') {
      createNotification({
        recipientId: target?.requesterId,
        type: 'system',
        title: 'Connection accepted',
        body: `${target?.requesterName ? `${target.requesterName} accepted your connection request` : 'Your connection request was accepted'} — start a conversation!`,
      });
    }
    return {
      id: connectionId,
      requesterId: 'unknown',
      recipientId: 'me',
      status: action === 'accept' ? 'accepted' : 'declined',
      createdAt: new Date().toISOString(),
      respondedAt: new Date().toISOString(),
    };
  }
}

// Incoming connection requests inbox — PRD Section 13.1's connection
// lifecycle (None -> Pending -> Accepted/Declined) implies a recipient
// needs somewhere to see and act on pending requests sent to them.
export async function listIncomingConnectionRequests(): Promise<IncomingConnectionRequest[]> {
  return withMockFallback(async () => {
    const { data } = await api.get<{ items: IncomingConnectionRequest[] }>('/connections/incoming');
    return data.items;
  }, incomingRequestsState);
}

// "People you may know" — a mixed-role suggestion list, distinct from
// searchAlumniDirectory (which only returns alumni). Backs the
// Notifications > Connections tab's suggestion cards.
export interface SuggestedConnection {
  id: string;
  name: string;
  avatarUrl?: string | null;
  roleLabel: 'Staff' | 'Student' | 'Alumni';
  department: string;
  level: number;
}

const MOCK_SUGGESTIONS: SuggestedConnection[] = [
  { id: 'sugg-1', name: 'Lioris Admin', avatarUrl: null, roleLabel: 'Staff', department: 'Administration', level: 12 },
  { id: 'sugg-2', name: 'Chioma Nwosu', avatarUrl: null, roleLabel: 'Student', department: 'Computer Science', level: 2 },
  { id: 'sugg-3', name: 'Alex Hunter', avatarUrl: null, roleLabel: 'Student', department: 'Graphic Design', level: 2 },
  { id: 'sugg-4', name: 'Sam Richards', avatarUrl: null, roleLabel: 'Student', department: 'Biology', level: 2 },
];

export async function listSuggestedConnections(): Promise<SuggestedConnection[]> {
  return withMockFallback(async () => {
    const { data } = await api.get<{ items: SuggestedConnection[] }>('/connections/suggestions');
    return data.items;
  }, MOCK_SUGGESTIONS);
}

// User Safety & Content Filtering — Persists user blocking to Supabase & active session
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


