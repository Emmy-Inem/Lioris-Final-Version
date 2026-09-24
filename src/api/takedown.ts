import { supabase } from './supabase';
import { recordAuditLogEntry } from './auditLog';

/**
 * Copyright notice-and-takedown for shared resources (lecture notes, past questions, ...).
 * Backed by public.resource_takedown_requests and the submit_takedown_request /
 * resolve_takedown_request functions (supabase/migrations/20260924121000_*.sql). The functions
 * do the enforcement - hiding, deleting, notifying - so nothing here can be bypassed by a
 * modified client.
 */

export type TakedownClaimType =
  | 'owner_removal'
  | 'agent_removal'
  | 'third_party_copyright'
  | 'inappropriate'
  | 'inaccurate';

export const TAKEDOWN_CLAIM_OPTIONS: {
  type: TakedownClaimType;
  title: string;
  description: string;
  /** Legal claims need a signed-off statement; a rights holder's claim also hides the file at once. */
  isCopyrightClaim: boolean;
  hidesImmediately: boolean;
}[] = [
  {
    type: 'owner_removal',
    title: 'This is my work - please remove it',
    description: 'I wrote or hold the rights to this material (for example, I am the lecturer) and do not want it on Lioris.',
    isCopyrightClaim: true,
    hidesImmediately: true,
  },
  {
    type: 'agent_removal',
    title: "I'm acting for the rights holder",
    description: 'I am authorised by the author, lecturer or institution that owns this material.',
    isCopyrightClaim: true,
    hidesImmediately: true,
  },
  {
    type: 'third_party_copyright',
    title: "This copies someone else's work",
    description: 'It reproduces a textbook, paper or lecture material that I do not own but believe is shared without permission.',
    isCopyrightClaim: true,
    hidesImmediately: false,
  },
  {
    type: 'inappropriate',
    title: 'Inappropriate or harmful',
    description: 'Offensive, unsafe, spam, or breaks the community rules.',
    isCopyrightClaim: false,
    hidesImmediately: false,
  },
  {
    type: 'inaccurate',
    title: 'Wrong or misleading',
    description: 'Wrong course, mislabelled, or the content is not what it claims to be.',
    isCopyrightClaim: false,
    hidesImmediately: false,
  },
];

export interface SubmitTakedownPayload {
  resourceId: string;
  claimType: TakedownClaimType;
  claimantName: string;
  claimantEmail: string;
  claimantRole?: string;
  details: string;
  goodFaith: boolean;
}

export async function submitTakedownRequest(payload: SubmitTakedownPayload): Promise<{ id: string; autoHidden: boolean }> {
  const { data, error } = await supabase.rpc('submit_takedown_request', {
    p_resource_id: payload.resourceId,
    p_claim_type: payload.claimType,
    p_claimant_name: payload.claimantName.trim(),
    p_claimant_email: payload.claimantEmail.trim(),
    p_claimant_role: payload.claimantRole?.trim() || null,
    p_details: payload.details.trim(),
    p_good_faith: payload.goodFaith,
  });

  if (error) {
    // The function raises readable messages (validation, rate limit, duplicates); show them as-is.
    // A missing function means the migration has not been applied to this project yet.
    if (/could not find the function|schema cache|does not exist/i.test(error.message)) {
      throw new Error('Takedown requests are not available yet. Please contact support to report this resource.');
    }
    throw new Error(error.message || 'Could not send your request. Please try again.');
  }
  const row = (data ?? {}) as { id?: string; auto_hidden?: boolean };
  return { id: String(row.id ?? ''), autoHidden: !!row.auto_hidden };
}

export interface TakedownRequest {
  id: string;
  resourceId: string | null;
  resourceTitle: string;
  resourceCourse?: string;
  claimType: TakedownClaimType;
  claimantName: string;
  claimantEmail: string;
  claimantRole?: string;
  details: string;
  goodFaith: boolean;
  autoHidden: boolean;
  status: 'pending' | 'upheld' | 'rejected';
  adminNotes?: string;
  reviewedAt?: string;
  createdAt: string;
}

export async function listTakedownRequests(status: 'pending' | 'decided' = 'pending'): Promise<TakedownRequest[]> {
  let query = supabase
    .from('resource_takedown_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  query = status === 'pending' ? query.eq('status', 'pending') : query.neq('status', 'pending');
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Could not load takedown requests.');

  return (data ?? []).map((row: any) => ({
    id: row.id,
    resourceId: row.resource_id,
    resourceTitle: row.resource_title,
    resourceCourse: row.resource_course ?? undefined,
    claimType: row.claim_type,
    claimantName: row.claimant_name,
    claimantEmail: row.claimant_email,
    claimantRole: row.claimant_role ?? undefined,
    details: row.details,
    goodFaith: !!row.good_faith,
    autoHidden: !!row.auto_hidden,
    status: row.status,
    adminNotes: row.admin_notes ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    createdAt: row.created_at,
  }));
}

/** Uphold = remove the resource for good (row + stored file); reject = put it back online. */
export async function resolveTakedownRequest(
  request: TakedownRequest,
  decision: 'uphold' | 'reject',
  notes?: string,
): Promise<void> {
  const { data, error } = await supabase.rpc('resolve_takedown_request', {
    p_request_id: request.id,
    p_decision: decision,
    p_notes: notes?.trim() || null,
  });
  if (error) throw new Error(error.message || 'Could not record the decision. Please try again.');

  // The database function deletes the resource row; the file itself lives in Storage and is
  // removed here (admins are allowed to delete from the bucket).
  const filePath = (data as { file_path?: string | null } | null)?.file_path;
  let fileRemoved = true;
  if (decision === 'uphold' && filePath) {
    const { error: removeError } = await supabase.storage.from('resources').remove([decodeURIComponent(filePath)]);
    if (removeError) {
      fileRemoved = false;
      console.warn('[Takedown] Could not delete the stored file:', removeError.message);
    }
  }

  recordAuditLogEntry({
    action: 'item_moderated',
    summary: `Takedown request ${decision === 'uphold' ? 'upheld' : 'rejected'} for "${request.resourceTitle}"${
      fileRemoved ? '' : ' (stored file still needs deleting from the resources bucket)'
    }`,
    targetType: 'resource',
    targetId: request.resourceId ?? request.id,
    reason: notes?.trim() || undefined,
  }).catch(() => {});

  if (!fileRemoved) {
    throw new Error('The resource was removed, but its stored file could not be deleted. Delete it from the resources bucket.');
  }
}
