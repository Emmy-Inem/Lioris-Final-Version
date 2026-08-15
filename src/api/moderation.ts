import { api } from'./client';
import { Report } from'./types';
import { mockReports } from'./mockData';
import { withMockFallback } from'./withMockFallback';
import { FALL_BACK_TO_MOCKS } from'./config';
import { recordAuditLogEntry } from'./auditLog';
import { createNotification } from'./notifications';

// Mutable in-memory copy so resolve/dismiss actually persists — the
// previous version returned a fabricated success object without ever
// updating the underlying list, so a"resolved"report would silently
// reappear as open on the next fetch.
let reportsState = [...mockReports];

export interface ReportsQuery {
  status?: Report['status'];
  targetType?: Report['targetType'];
  /** Scopes to one launch institution — backs the Staff/Admin moderation distinction (Staff only ever pass their own). */
  institutionCode?: string;
}

function filterMockReports(query: ReportsQuery): Report[] {
  let results = [...reportsState];
  if (query.status) results = results.filter((r) => r.status === query.status);
  if (query.targetType) results = results.filter((r) => r.targetType === query.targetType);
  if (query.institutionCode) results = results.filter((r) => r.institutionCode === query.institutionCode);
  return results;
}

// GET /reports?status=&targetType=&institutionCode= — PRD Section 15.6
export async function listReports(query: ReportsQuery = {}): Promise<Report[]> {
  return withMockFallback(async () => {
    const { data } = await api.get<{ items: Report[] }>('/reports', { params: query });
    return data.items;
  }, filterMockReports(query));
}

// PATCH /reports/{id} — PRD Section 15.6
export async function resolveReport(
  id: string,
  action: 'resolved' | 'dismissed',
  notes?: string,
): Promise<Report> {
  async function logDecision(target: Report) {
    // PRD Section 6.2's acceptance criteria: moderation decisions must
    // be audit-logged. Runs regardless of which branch below succeeds —
    // there's no live backend yet to assume already does this itself.
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
          ? `Thanks for the report — we took action on the ${target.targetType} you flagged.`
          : `We reviewed the ${target.targetType} you reported and didn't find a policy violation this time.`,
    });
  }

  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.patch<Report>(`/reports/${id}`, { action, notes });
    await logDecision(data);
    return data;
  }
  try {
    const { data } = await api.patch<Report>(`/reports/${id}`, { action, notes });
    await logDecision(data);
    return data;
  } catch {
    let updated: Report | undefined;
    reportsState = reportsState.map((r) => {
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
}

// Submits a new report — the content-side counterpart to the admin
// review flow above. Used from post/message/profile"Report"actions.
// Previously fired the request and did nothing else — meaning a
// report a real user submitted would never actually appear in
// listReports()'s queue for staff/admin to review, only the
// pre-seeded mock reports ever would. This is the core of the whole
// moderation pipeline, so this silently not working is about as
// significant as this kind of bug gets.
import { generateUUID } from '../utils/uuid';

export async function submitReport(payload: {
  targetType: Report['targetType'];
  targetId: string;
  reason: string;
  institutionCode?: string;
}): Promise<Report> {
  const created: Report = {
    id: generateUUID(),
    reporterId: 'me',
    status: 'open',
    createdAt: new Date().toISOString(),
    ...payload,
  };

  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.post<Report>('/reports', payload);
    return data;
  }
  try {
    const { data } = await api.post<Report>('/reports', payload);
    reportsState = [data, ...reportsState];
    return data;
  } catch {
    reportsState = [created, ...reportsState];
    return created;
  }
}
