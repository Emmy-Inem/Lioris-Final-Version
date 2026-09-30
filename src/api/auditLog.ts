import { supabase } from './supabase';
import { AuditLogAction, AuditLogEntry, UserRole } from './types';
import { getSessionUser } from '@/auth/tokenStorage';
import { generateUUID } from '../utils/uuid';
import { assertUuid, escapePostgrestLike } from '../utils/postgrest';

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
 /** Inclusive lower bound on created_at (ISO timestamp). */
 since?: string;
 /** Inclusive upper bound on created_at (ISO timestamp). */
 until?: string;
 /** Free-text match against the acting admin/staff member's profile name. */
 actorSearch?: string;
 /** Zero-based page index, paired with pageSize. Defaults to 0. */
 page?: number;
 /** Rows per page. Defaults to 100 (matches the old hard cap) when omitted. */
 pageSize?: number;
}

export interface AuditLogPage {
 entries: AuditLogEntry[];
 /** Total rows matching the filters across all pages, from the server's exact count. */
 total: number;
 hasMore: boolean;
}

function mapAuditLogRow(row: any): AuditLogEntry {
 return {
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
 };
}

/**
 * Paginated audit log read. `institutionCode` and `actorSearch` are pushed down to
 * PostgREST (a jsonb path filter and an inner join respectively) rather than
 * filtered client-side after the fact, so `total`/`hasMore` stay accurate across
 * pages instead of reflecting a filter applied only to whichever page was fetched.
 */
export async function listAuditLogEntriesPage(query: AuditLogQuery = {}): Promise<AuditLogPage> {
 const pageSize = query.pageSize ?? 100;
 const page = Math.max(0, query.page ?? 0);
 const offset = page * pageSize;
 const actorSearch = query.actorSearch?.trim();

 try {
 // An actor-name search needs the profiles join to be INNER (not the default LEFT)
 // so the ilike filter below can actually exclude non-matching rows server-side.
 let queryBuilder = supabase
 .from('audit_logs')
 .select(actorSearch ? '*, profiles:actor_id!inner(full_name, role)' : '*, profiles:actor_id(full_name, role)', { count: 'exact' })
 .order('created_at', { ascending: false })
 .range(offset, offset + pageSize - 1);

 if (query.involvingUserId) {
 const involvingId = assertUuid(query.involvingUserId, 'user id');
 queryBuilder = queryBuilder.or(`actor_id.eq.${involvingId},entity_id.eq.${involvingId}`);
 }
 if (query.action) {
 queryBuilder = queryBuilder.eq('action', query.action);
 }
 if (query.institutionCode) {
 queryBuilder = queryBuilder.eq('metadata->>institutionCode', query.institutionCode);
 }
 if (query.since) {
 queryBuilder = queryBuilder.gte('created_at', query.since);
 }
 if (query.until) {
 queryBuilder = queryBuilder.lte('created_at', query.until);
 }
 if (actorSearch) {
 queryBuilder = queryBuilder.ilike('profiles.full_name', `%${escapePostgrestLike(actorSearch)}%`);
 }

 const { data, error, count } = await queryBuilder;
 if (error) throw error;

 const entries = (data ?? []).map(mapAuditLogRow);
 const total = count ?? entries.length;
 return { entries, total, hasMore: offset + entries.length < total };
 } catch (err) {
 console.error('[AuditLog] Failed to load audit entries:', err);
 return { entries: [], total: 0, hasMore: false };
 }
}

/** Back-compat wrapper for callers that just want a flat list (first page only). */
export async function listAuditLogEntries(query: AuditLogQuery = {}): Promise<AuditLogEntry[]> {
 const { entries } = await listAuditLogEntriesPage(query);
 return entries;
}

export const listAuditLog = listAuditLogEntries;
