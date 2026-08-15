import { api } from './client';
import { AuditLogAction, AuditLogEntry, UserRole } from './types';
import { FALL_BACK_TO_MOCKS } from './config';
import { withMockFallback } from './withMockFallback';
import { getSessionUser } from '@/auth/tokenStorage';

// PRD Section 14 / Section 6.2's acceptance criteria. Seeded with a
// small believable history so the screen isn't empty before you've
// taken any actions in this session — everything after these three
// entries is appended live by recordAuditLogEntry.
let auditLogState: AuditLogEntry[] = [
  {
    id: 'audit-seed-1',
    actorId: 'mock-staff-seed',
    actorName: 'Grace Lin',
    actorRole: 'staff',
    action: 'report_resolved',
    summary: 'Resolved report on a forum post (suspected spam)',
    targetType: 'report',
    targetId: 'report-seed-1',
    institutionCode: 'FUNAAB',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
  {
    id: 'audit-seed-2',
    actorId: 'mock-admin-seed',
    actorName: 'Adebayo O.',
    actorRole: 'admin',
    action: 'event_purged',
    summary: 'Purged an event listing for policy violation',
    targetType: 'event',
    targetId: 'event-seed-4',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
  },
  {
    id: 'audit-seed-3',
    actorId: 'mock-admin-seed',
    actorName: 'Adebayo O.',
    actorRole: 'admin',
    action: 'verification_rejected',
    summary: 'Rejected a verification application — unreadable document reference',
    targetType: 'verification_request',
    targetId: 'vr-seed-2',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
  },
];

export interface RecordAuditLogEntryPayload {
  action: AuditLogAction;
  summary: string;
  targetType: AuditLogEntry['targetType'];
  targetId: string;
  reason?: string;
  institutionCode?: string;
}

/**
 * Call this from every real moderation/high-risk mutation
 * (resolveReport, revokeEventApproval, purgeEvent,
 * respondToVerificationRequest, and the two HighRiskModals actions) so
 * the audit trail is backed by something real instead of UI copy that
 * merely claims an action "goes to the audit log". Reads the current
 * actor from the local session cache directly since this lives in the
 * API layer, outside React context (same pattern client.ts already
 * uses for tokens).
 */
export async function recordAuditLogEntry(payload: RecordAuditLogEntryPayload): Promise<AuditLogEntry> {
  const actor = await getSessionUser();
  const entry: AuditLogEntry = {
    id: `audit-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    actorId: actor?.id ?? 'unknown',
    actorName: actor?.fullName ?? 'Unknown actor',
    actorRole: (actor?.role as UserRole) ?? 'admin',
    createdAt: new Date().toISOString(),
    ...payload,
  };

  if (!FALL_BACK_TO_MOCKS) {
    await api.post('/audit-log', entry);
    return entry;
  }
  try {
    await api.post('/audit-log', entry);
  } catch {
    // Expected in mock mode — see README's "Mock data fallback".
  }
  auditLogState = [entry, ...auditLogState];
  return entry;
}

export interface AuditLogQuery {
  action?: AuditLogAction;
  institutionCode?: string;
}

function filterMockAuditLog(query: AuditLogQuery): AuditLogEntry[] {
  let results = [...auditLogState];
  if (query.action) results = results.filter((e) => e.action === query.action);
  if (query.institutionCode) results = results.filter((e) => e.institutionCode === query.institutionCode);
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// GET /audit-log?action=&institutionCode= — PRD Section 14.
export async function listAuditLog(query: AuditLogQuery = {}): Promise<AuditLogEntry[]> {
  return withMockFallback(async () => {
    const { data } = await api.get<{ items: AuditLogEntry[] }>('/audit-log', { params: query });
    return data.items;
  }, filterMockAuditLog(query));
}
