import { supabase } from './supabase';
import { AuditLogAction, AuditLogEntry, UserRole } from './types';
import { getSessionUser } from '@/auth/tokenStorage';
import { generateUUID } from '../utils/uuid';
import { assertUuid } from '../utils/postgrest';

export interface RecordAuditLogEntryPayload {
  action: AuditLogAction;
  summary: string;
  targetType: AuditLogEntry['targetType'];
  targetId: string;
  reason?: string;
  institutionCode?: string;
}

/**
 * The entry as submitted, plus whether the database accepted it. `persisted`
 * is false when the insert failed (RLS, network...) - the entry is then NOT in
 * the audit trail and must not be presented as if it were.
 *
 * actorName / actorRole are display hints only; the authoritative actor is the
 * server-side `actor_id` (auth.uid()) and server-side triggers.
 */
export interface RecordedAuditLogEntry extends AuditLogEntry {
  persisted: boolean;
}

export async function recordAuditLogEntry(payload: RecordAuditLogEntryPayload): Promise<RecordedAuditLogEntry> {
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
    const { error } = await supabase.from('audit_logs').insert({
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
        // Display hints only - never used as authority.
        actorName: actor?.fullName || 'Administrator',
        actorRole: actor?.role || 'admin',
      },
      created_at: entry.createdAt,
    });
    if (error) throw error;
    return { ...entry, persisted: true };
  } catch (err) {
    console.error('[AuditLog] Failed to persist audit entry:', err);
    return { ...entry, persisted: false };
  }
}

export interface AuditLogQuery {
 action?: AuditLogAction;
 institutionCode?: string;
 /**
  * Scopes results to entries where this id appears either as the actor
  * (who performed the action) or the target (who/what it was done to) -
  * e.g. pass a user's profile id to get their full activity trail: both
  * actions they took as an admin, and actions taken against their account.
  */
 involvingUserId?: string;
}

export async function listAuditLogEntries(query: AuditLogQuery = {}): Promise<AuditLogEntry[]> {
 try {
 let queryBuilder = supabase
 .from('audit_logs')
 .select('*, profiles:actor_id(full_name, role)')
 .order('created_at', { ascending: false })
 .limit(100);

 if (query.involvingUserId) {
 const involvingId = assertUuid(query.involvingUserId, 'user id');
 queryBuilder = queryBuilder.or(`actor_id.eq.${involvingId},entity_id.eq.${involvingId}`);
 }
 if (query.action) {
 queryBuilder = queryBuilder.eq('action', query.action);
 }

 const { data, error } = await queryBuilder;

 if (error) throw error;
 if (data && data.length > 0) {
 let rows = data;
 if (query.institutionCode) {
 rows = rows.filter((row: any) => row.metadata?.institutionCode === query.institutionCode);
 }
 return rows.map((row: any) => ({
 id: row.id,
 actorId: row.actor_id || 'system',
 actorName: row.profiles?.full_name || row.metadata?.actorName || 'Administrator',
 actorRole: (row.profiles?.role || row.metadata?.actorRole || 'admin') as UserRole,
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
 console.error('[AuditLog] Failed to load audit entries:', err);
 }

 return [];
}

export const listAuditLog = listAuditLogEntries;
