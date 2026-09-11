import { Report } from './types';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { recordAuditLogEntry } from './auditLog';
import { createNotification } from './notifications';
import { generateUUID } from '../utils/uuid';

// Reports this session has *successfully* written to Supabase, kept here
// only so they render instantly before the next refetch. Never mixed with
// mockData.ts fixtures - those only come from getMockPool() below, and
// only while the admin's "Mock Data Visibility" toggle is on.
let locallyCreatedReports: Report[] = [];



export interface ReportsQuery {
 status?: Report['status'];
 targetType?: Report['targetType'];
 /** Scopes to one launch institution */
 institutionCode?: string;
}

// GET /reports?status=&targetType=&institutionCode=
export async function listReports(query: ReportsQuery = {}): Promise<Report[]> {
 try {
 let queryBuilder = supabase.from('moderation_queue').select('*').order('created_at', { ascending: false });

 if (query.institutionCode) {
 queryBuilder = queryBuilder.eq('campus_code', query.institutionCode);
 }
 if (query.status) {
 if (query.status === 'open') {
 queryBuilder = queryBuilder.eq('status', 'pending');
 } else if (query.status === 'resolved') {
 queryBuilder = queryBuilder.eq('status', 'approved');
 } else if (query.status === 'dismissed') {
 queryBuilder = queryBuilder.eq('status', 'rejected');
 }
 }
 if (query.targetType) {
 const dbType = query.targetType === 'message' ? 'comment' : query.targetType;
 queryBuilder = queryBuilder.eq('item_type', dbType);
 }

 const { data, error } = await queryBuilder;
 if (error) throw error;

 const dbReports: Report[] = (data ?? []).map((row: any) => ({
 id: row.id,
 reporterId: row.reporter_id || 'unknown',
 targetType: (row.item_type === 'comment' ? 'message' : row.item_type) as Report['targetType'],
 targetId: row.item_id,
 reason: row.reason,
 status: (row.status === 'approved' ? 'resolved' : row.status === 'rejected' ? 'dismissed' : 'open') as Report['status'],
 assignedAdminId: row.assigned_admin_id,
 createdAt: row.created_at,
 institutionCode: row.campus_code,
 }));

 // Merge unique - local pool only ever contributes this session's own
 // just-submitted reports (always) plus seed fixtures (only when the
 // admin mock-data toggle is on).
 const merged = [...dbReports];
  for (const m of [...locallyCreatedReports]) {
 if (!merged.some((r) => r.id === m.id)) {
 merged.push(m);
 }
 }
 return merged;
 } catch (err) {
 console.warn('[Moderation] Failed to list from supabase, showing local pool only:', err);
 let results = [...locallyCreatedReports];
 if (query.status) results = results.filter((r) => r.status === query.status);
 if (query.targetType) results = results.filter((r) => r.targetType === query.targetType);
 if (query.institutionCode) results = results.filter((r) => r.institutionCode === query.institutionCode);
 return results;
 }
}

// Best-effort lookup of the user an enforcement decision actually lands on
// (the content/account owner), never the reporter. Mirrors the same
// post/event/user target resolution the moderation queue UI uses, so it
// works purely from data already on the report row - no UI wiring needed.
async function resolveActionedUserId(target: Report): Promise<string | null> {
 try {
 if (target.targetType === 'user') {
 return target.targetId && target.targetId !== 'unknown' ? target.targetId : null;
 }
 if (target.targetType === 'post') {
 const { data } = await supabase.from('posts').select('author_id').eq('id', target.targetId).maybeSingle();
 return data?.author_id ?? null;
 }
 if (target.targetType === 'event') {
 const { data } = await supabase.from('events').select('creator_id').eq('id', target.targetId).maybeSingle();
 return data?.creator_id ?? null;
 }
 } catch {
 // Notifying the actioned user is best-effort - never let a lookup
 // failure here block the moderation decision itself.
 }
 return null;
}

const TARGET_TYPE_LABEL: Record<Report['targetType'], string> = {
 post: 'post',
 message: 'message',
 event: 'event',
 user: 'account',
};

// PATCH /reports/{id}
export async function resolveReport(
 id: string,
 action: 'resolved' | 'dismissed',
 notes?: string,
): Promise<Report> {
 async function logDecision(target: Report) {
 await recordAuditLogEntry({
 action: action === 'resolved' ? 'report_resolved' : 'report_dismissed',
 summary: `${action === 'resolved' ? 'Resolved' : 'Dismissed'} a report on a ${target.targetType} (${target.reason})`,
 targetType: 'report',
 targetId: target.id,
 reason: notes,
 institutionCode: target.institutionCode,
 });
 createNotification({
 recipientId: target.reporterId,
 type: 'moderation',
 title: action === 'resolved' ? 'Your report was actioned' : 'Your report was reviewed',
 body:
 action === 'resolved'
 ? `Thanks for the report - we took action on the ${target.targetType} you flagged.`
 : `We reviewed the ${target.targetType} you reported and didn't find a policy violation this time.`,
 });

 // Fairness/transparency: also tell the person the decision actually
 // landed on that something changed, so content disappearing or an
 // account changing doesn't come out of nowhere. Reports stay anonymous -
 // this never mentions the reporter, only the outcome + reason category.
 if (action === 'resolved') {
 const actionedUserId = await resolveActionedUserId(target);
 if (actionedUserId && actionedUserId !== target.reporterId) {
 const label = TARGET_TYPE_LABEL[target.targetType] ?? target.targetType;
 createNotification({
 recipientId: actionedUserId,
 type: 'moderation',
 title:
 target.targetType === 'user'
 ? 'Your account has been actioned by campus moderation'
 : `Your ${label} was removed`,
 body:
 target.targetType === 'user'
 ? `Campus moderation has taken action on your account for violating community guidelines (reason: ${target.reason}). Contact support if you believe this is an error.`
 : `Your ${label} was removed for violating community guidelines (reason: ${target.reason}). If you believe this was a mistake, contact support.`,
 });
 }
 }
 }

 // Fetch the full row up front - update() below only echoes back the
 // columns it writes, and the vast majority of reports resolved through
 // the admin queue were never created this session (so the local cache
 // fallback below has nothing for them). Without this, both the reporter
 // notification above and the actioned-user notification would silently
 // operate on a fabricated "unknown" target for every real report.
 let dbRow: any = null;
 try {
 const { data } = await supabase.from('moderation_queue').select('*').eq('id', id).maybeSingle();
 dbRow = data;
 } catch {
 // fall back to local cache / fabricated defaults below
 }

 try {
 const dbStatus = action === 'resolved' ? 'approved' : 'rejected';
 const { data: authData } = await supabase.auth.getUser();
 const adminId = authData?.user?.id || (await getSessionUser())?.id;

 const { error } = await supabase.from('moderation_queue').update({
 status: dbStatus,
 assigned_admin_id: adminId || null,
 action_taken: notes || action,
 resolved_at: new Date().toISOString(),
 }).eq('id', id);
 if (error) throw error;
 } catch (err) {
 console.warn('[Moderation] Failed to update supabase report:', err);
 throw new Error('Could not save this moderation decision. Please try again.');
 }

 let updated: Report | undefined;
 locallyCreatedReports = locallyCreatedReports.map((r) => {
 if (r.id !== id) return r;
 updated = { ...r, status: action };
 return updated;
 });

 const fromDb: Report | null = dbRow
 ? {
 id: dbRow.id,
 reporterId: dbRow.reporter_id || 'unknown',
 targetType: (dbRow.item_type === 'comment' ? 'message' : dbRow.item_type) as Report['targetType'],
 targetId: dbRow.item_id,
 reason: dbRow.reason,
 status: action,
 assignedAdminId: dbRow.assigned_admin_id,
 createdAt: dbRow.created_at,
 institutionCode: dbRow.campus_code,
 }
 : null;

 const result: Report =
 fromDb ??
 updated ?? {
 id,
 reporterId: 'unknown',
 targetType: 'post',
 targetId: 'unknown',
 reason: notes ?? '',
 status: action,
 createdAt: new Date().toISOString(),
 };
 await logDecision(result);
 return result;
}

/**
 * Throws if there's no identifiable reporter or the Supabase insert fails,
 * instead of quietly returning a fabricated "submitted" report - a report
 * moderators never actually see is worse than an obvious error.
 */
export async function submitReport(payload: {
 targetType: Report['targetType'];
 targetId: string;
 reason: string;
 institutionCode?: string;
}): Promise<Report> {
 const reportId = generateUUID();

 const { data: authData } = await supabase.auth.getUser();
 let reporterId = authData?.user?.id;
 if (!reporterId) {
 const stored = await getSessionUser();
 if (stored?.id) reporterId = stored.id;
 }

 if (!reporterId) {
 throw new Error('You need to be signed in to submit a report.');
 }

 const itemType = payload.targetType === 'message' ? 'comment' : payload.targetType;

 let targetCampus = payload.institutionCode;
 if (!targetCampus) {
 const { data: profile } = await supabase
 .from('profiles')
 .select('campus_code')
 .eq('id', reporterId)
 .maybeSingle();
 targetCampus = profile?.campus_code || 'GLOBAL';
 }
 if (!targetCampus) targetCampus = 'GLOBAL';

 const { error } = await supabase.from('moderation_queue').insert({
 id: reportId,
 item_type: itemType,
 item_id: payload.targetId,
 reporter_id: reporterId,
 campus_code: targetCampus,
 reason: payload.reason,
 status: 'pending',
 });

 if (error) {
 console.warn('[Moderation] Failed to insert supabase report:', error.message);
 throw new Error('Could not submit your report. Please try again.');
 }

 const created: Report = {
 id: reportId,
 reporterId,
 status: 'open',
 createdAt: new Date().toISOString(),
 ...payload,
 };

 locallyCreatedReports = [created, ...locallyCreatedReports];
 return created;
}
