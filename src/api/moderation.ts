import { Report } from './types';
import { mockReports } from './mockData';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { recordAuditLogEntry } from './auditLog';
import { createNotification } from './notifications';
import { generateUUID } from '../utils/uuid';
import { isMockDataVisible } from './mockDataSettings';

// Reports this session has *successfully* written to Supabase, kept here
// only so they render instantly before the next refetch. Never mixed with
// mockData.ts fixtures - those only come from getMockPool() below, and
// only while the admin's "Mock Data Visibility" toggle is on.
let locallyCreatedReports: Report[] = [];

function getMockPool(): Report[] {
 return isMockDataVisible() ? mockReports : [];
}

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
 for (const m of [...locallyCreatedReports, ...getMockPool()]) {
 if (!merged.some((r) => r.id === m.id)) {
 merged.push(m);
 }
 }
 return merged;
 } catch (err) {
 console.warn('[Moderation] Failed to list from supabase, showing local pool only:', err);
 let results = [...locallyCreatedReports, ...getMockPool()];
 if (query.status) results = results.filter((r) => r.status === query.status);
 if (query.targetType) results = results.filter((r) => r.targetType === query.targetType);
 if (query.institutionCode) results = results.filter((r) => r.institutionCode === query.institutionCode);
 return results;
 }
}

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

 const result: Report =
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
