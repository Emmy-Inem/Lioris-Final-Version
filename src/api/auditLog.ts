import { supabase } from './supabase';
import { AuditLogAction, AuditLogEntry, UserRole } from './types';
import { getSessionUser } from '@/auth/tokenStorage';
import { generateUUID } from '../utils/uuid';

let auditLogState: AuditLogEntry[] = [
  {
    id: generateUUID(),
    actorId: 'system',
    actorName: 'Platform Security Engine',
    actorRole: 'admin',
    action: 'report_resolved',
    summary: 'Automated campus node health & TLS certificates verified',
    targetType: 'report',
    targetId: generateUUID(),
    institutionCode: 'UI',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
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

export async function recordAuditLogEntry(payload: RecordAuditLogEntryPayload): Promise<AuditLogEntry> {
  const actor = await getSessionUser();
  const entryId = generateUUID();
  const entry: AuditLogEntry = {
    id: entryId,
    actorId: actor?.id ?? 'system',
    actorName: actor?.fullName ?? 'Administrator',
    actorRole: (actor?.role as UserRole) ?? 'admin',
    createdAt: new Date().toISOString(),
    ...payload,
  };

  try {
    const isTargetUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.targetId);
    await supabase.from('audit_logs').insert({
      id: entryId,
      actor_id: actor?.id || null,
      action: payload.action,
      entity_type: payload.targetType,
      entity_id: isTargetUUID ? payload.targetId : null,
      metadata: {
        summary: payload.summary,
        reason: payload.reason,
        institutionCode: payload.institutionCode,
        targetIdRaw: payload.targetId,
        actorName: actor?.fullName || 'Administrator',
        actorRole: actor?.role || 'admin',
      },
      created_at: entry.createdAt,
    });
  } catch (err) {
    console.warn('[AuditLog] Supabase write fallback:', err);
  }

  auditLogState = [entry, ...auditLogState];
  return entry;
}

export interface AuditLogQuery {
  action?: AuditLogAction;
  institutionCode?: string;
}

export async function listAuditLogEntries(query: AuditLogQuery = {}): Promise<AuditLogEntry[]> {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*, profiles:actor_id(full_name, role)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data && data.length > 0) {
      return data.map((row: any) => ({
        id: row.id,
        actorId: row.actor_id || 'system',
        actorName: row.metadata?.actorName || row.profiles?.full_name || 'Administrator',
        actorRole: (row.metadata?.actorRole || row.profiles?.role || 'admin') as UserRole,
        action: row.action as AuditLogAction,
        summary: row.metadata?.summary || `${row.action} on ${row.entity_type}`,
        targetType: row.entity_type as AuditLogEntry['targetType'],
        targetId: row.entity_id || row.metadata?.targetIdRaw || '',
        reason: row.metadata?.reason,
        institutionCode: row.metadata?.institutionCode,
        createdAt: row.created_at,
      }));
    }
  } catch (err) {
    console.warn('[AuditLog] Supabase query fallback:', err);
  }

  let results = [...auditLogState];
  if (query.action) results = results.filter((e) => e.action === query.action);
  if (query.institutionCode) results = results.filter((e) => e.institutionCode === query.institutionCode);
  return results;
}

export const listAuditLog = listAuditLogEntries;
