import { recordAuditLogEntry } from './auditLog';
import { createNotification } from './notifications';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { generateUUID } from '../utils/uuid';
import { invalidateProfileCache } from './profile';

export interface VerificationRequest {
 id: string;
 userId: string;
 applicantName: string;
 documentType:
    | 'Student ID'
    | 'Admission Letter'
    | 'Course Registration Form'
    | 'School Fees Receipt'
    | 'Library Card'
    | 'Staff ID'
    | 'Alumni Certificate';
 documentReference?: string;
 institutionClaimed: string;
 submittedAt: string;
 status: 'pending' | 'approved' | 'rejected';
 documentPhotoUri?: string | null;
 /**
  * Path of the uploaded evidence inside the PRIVATE `verifications` storage bucket,
  * e.g. `<user-id>/<request-id>.jpg`. Null when the applicant never uploaded anything
  * (older rows) or when the stored value could not be resolved back to a path.
  * NEVER build a public URL from this - use `getVerificationDocumentUrl`.
  */
 documentStoragePath?: string | null;
 /**
  * Reviewer-supplied reason this request was declined. Persisted inside `review_notes`
  * (see `formatReviewNotes`) because the table has no dedicated column. An applicant can
  * read their own `verifications` row, so this is what the "what to fix" screen shows.
  */
 rejectionReason?: string | null;
 /** When a decision was recorded, if one has been. */
 reviewedAt?: string | null;
}

/** Bucket that holds verification evidence. Private: ID documents live here. */
const VERIFICATIONS_BUCKET = 'verifications';

/**
 * Turns whatever is sitting in `verifications.id_card_front_url` into a storage path.
 *
 * Rows written before this change stored a 30-day *signed URL* in that column, which has since
 * expired for anything older than a month - a reviewer opening one got a broken image. Both
 * shapes are handled: a bare path is returned as-is, and a signed/public URL has the object path
 * pulled back out of it.
 */
export function resolveVerificationDocumentPath(stored?: string | null): string | null {
 if (!stored) return null;
 const value = stored.trim();
 if (!value) return null;

 if (!/^https?:\/\//i.test(value)) {
  // Already a storage path. Drop a leading slash or bucket segment if one crept in.
  const cleaned = value.replace(/^\/+/, '').replace(new RegExp(`^${VERIFICATIONS_BUCKET}/`), '');
  return cleaned || null;
 }

 try {
  const pathname = new URL(value).pathname;
  const marker = `/${VERIFICATIONS_BUCKET}/`;
  const idx = pathname.indexOf(marker);
  if (idx === -1) return null;
  const path = decodeURIComponent(pathname.slice(idx + marker.length));
  return path || null;
 } catch {
  return null;
 }
}

export type VerificationDocumentKind = 'image' | 'pdf' | 'unknown';

export interface VerificationDocument {
 /** Short-lived signed URL. Do not cache it and do not log it. */
 signedUrl: string;
 path: string;
 kind: VerificationDocumentKind;
 /** Seconds the signed URL stays valid. */
 expiresIn: number;
}

function documentKindForPath(path: string): VerificationDocumentKind {
 const lower = path.toLowerCase();
 if (lower.endsWith('.pdf')) return 'pdf';
 if (/\.(jpe?g|png|webp|gif|heic|heif)$/.test(lower)) return 'image';
 return 'unknown';
}

/**
 * Mints a short-lived signed URL for a verification document so a reviewer can actually look at
 * the evidence before approving. The bucket is private (admins read the whole bucket, campus staff
 * read their own campus's applicants) so this is the only correct way to display it.
 *
 * Returns null when the request carries no document at all. Throws with a reviewer-facing message
 * when a document is referenced but cannot be opened.
 */
export async function getVerificationDocumentUrl(
 request: Pick<VerificationRequest, 'documentStoragePath' | 'documentPhotoUri'>,
 expiresInSeconds = 300,
): Promise<VerificationDocument | null> {
 const path =
  resolveVerificationDocumentPath(request.documentStoragePath) ??
  resolveVerificationDocumentPath(request.documentPhotoUri);
 if (!path) return null;

 const { data, error } = await supabase.storage
  .from(VERIFICATIONS_BUCKET)
  .createSignedUrl(path, expiresInSeconds);

 if (error || !data?.signedUrl) {
  throw new Error(
   'This document could not be opened. It may have been removed by the retention job, or your account may not have permission to read it.',
  );
 }

 return {
  signedUrl: data.signedUrl,
  path,
  kind: documentKindForPath(path),
  expiresIn: expiresInSeconds,
 };
}

/**
 * Separator between the applicant's own submission notes and the reviewer's decision note.
 *
 * `verifications` has a single free-text `review_notes` column and no `rejection_reason`, so a
 * decline reason is appended after this marker rather than overwriting what the applicant sent.
 * Both halves survive, and the applicant (who can SELECT their own row) gets a reason to act on
 * instead of a dead end.
 */
const REJECTION_MARKER = '\n--- Reviewer decision: ';

/** Splits `review_notes` ("Student ID: ABC/123") back into its parts. */
function parseReviewNotes(notes?: string | null): {
 documentType: VerificationRequest['documentType'];
 documentReference?: string;
 rejectionReason?: string;
} {
 const known: VerificationRequest['documentType'][] = [
    'Student ID',
    'Admission Letter',
    'Course Registration Form',
    'School Fees Receipt',
    'Library Card',
    'Staff ID',
    'Alumni Certificate',
  ];
 let raw = (notes || '').trim();
 let rejectionReason: string | undefined;

 const markerIdx = raw.indexOf(REJECTION_MARKER.trimEnd());
 if (markerIdx !== -1) {
  rejectionReason = raw.slice(markerIdx + REJECTION_MARKER.trimEnd().length).trim() || undefined;
  raw = raw.slice(0, markerIdx).trim();
 }

 for (const type of known) {
  if (raw === type) return { documentType: type, rejectionReason };
  if (raw.startsWith(`${type}:`)) {
   const ref = raw.slice(type.length + 1).trim();
   return { documentType: type, documentReference: ref || undefined, rejectionReason };
  }
 }
 return { documentType: 'Student ID', documentReference: raw || undefined, rejectionReason };
}

/** Appends a reviewer decision note to whatever the applicant originally submitted. */
function formatReviewNotes(existing: string | null | undefined, reason: string): string {
 const base = (existing || '').split(REJECTION_MARKER.trimEnd())[0].trim();
 return `${base}${REJECTION_MARKER}${reason.trim()}`;
}

let verificationState: VerificationRequest[] = [];

export interface SubmitVerificationPayload {
 userId: string;
 applicantName: string;
 documentType: VerificationRequest['documentType'];
 documentReference?: string;
 institutionClaimed: string;
 documentPhotoUri?: string | null;
 photoBlob?: Blob;
}

/** Evidence types the private `verifications` bucket accepts. */
const EVIDENCE_TYPES: Record<string, string> = {
 'image/jpeg': 'jpg',
 'image/jpg': 'jpg',
 'image/png': 'png',
 'image/webp': 'webp',
 'application/pdf': 'pdf',
};

/** True when supabase-js reports that an RPC does not exist (database not migrated yet). */
function isMissingFunction(error: { code?: string; message?: string } | null | undefined): boolean {
 if (!error) return false;
 return error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message ?? '');
}

function friendlySubmitError(message: string): string {
 if (/campus_required/i.test(message)) return 'Choose your university in your profile first, then apply for verification.';
 if (/already_verified/i.test(message)) return 'Your account is already verified.';
 if (/account_suspended/i.test(message)) return 'Your account is suspended, so it cannot apply for verification.';
 if (/not_applicable/i.test(message)) return 'Only students and alumni apply for verification.';
 if (/invalid_document/i.test(message)) return 'Your document did not upload correctly. Please attach it again.';
 return 'We could not submit your verification request. Please try again.';
}

export async function submitVerificationRequest(payload: SubmitVerificationPayload): Promise<VerificationRequest> {
 const reqId = generateUUID();

 const { data: authData } = await supabase.auth.getUser();
 let authUserId = authData?.user?.id;
 if (!authUserId) {
 const stored = await getSessionUser();
 if (stored?.id) authUserId = stored.id;
 }
 // Reporting "pending" for a request nobody stored leaves the applicant waiting for a review that will
 // never happen, so every failure below throws.
 if (!authUserId) throw new Error('Your session has expired. Please sign in again to apply.');

 let photoBlobToUpload = payload.photoBlob;
 if (!photoBlobToUpload && payload.documentPhotoUri) {
 try {
 const resp = await fetch(payload.documentPhotoUri);
 photoBlobToUpload = await resp.blob();
 } catch {
 // reported below
 }
 }
 // Evidence is mandatory: an application with no document gives a moderator nothing to check.
 if (!photoBlobToUpload) {
 throw new Error('Please attach a clear photo of your student ID, admission letter or certificate.');
 }

 // Store the file under its REAL type. It used to be forced to image/jpeg + .jpg whatever was picked, so a
 // PNG/WebP/PDF landed mislabelled and could not be opened by the reviewer.
 const mime = (photoBlobToUpload.type || '').toLowerCase().split(';')[0].trim() || 'image/jpeg';
 const ext = EVIDENCE_TYPES[mime];
 if (!ext) throw new Error('That file type is not supported. Attach a JPG, PNG, WebP or PDF.');
 if (photoBlobToUpload.size > 10 * 1024 * 1024) throw new Error('That file is larger than 10 MB. Attach a smaller photo or scan.');

 const filePath = `${authUserId}/${reqId}.${ext}`;
 const { error: uploadError } = await supabase.storage.from(VERIFICATIONS_BUCKET).upload(filePath, photoBlobToUpload, {
 contentType: mime === 'image/jpg' ? 'image/jpeg' : mime,
 upsert: false,
 });
 if (uploadError) {
 throw new Error('We could not upload your document. Please check your connection and try again.');
 }

 // The server derives campus and role from the PROFILE (the client used to guess the campus from the
 // typed university name with substring matches such as includes('UI')), records the request and flips
 // the profile to pending in ONE transaction.
 let row: any = null;
 const { data: rpcData, error: rpcError } = await supabase.rpc('submit_verification_request', {
 p_document_path: filePath,
 p_document_type: payload.documentType,
 p_document_reference: payload.documentReference || null,
 });
 if (!rpcError) {
 row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
 } else if (isMissingFunction(rpcError)) {
 // Database not migrated yet: legacy path (campus still read from the profile, never guessed).
 const { data: me } = await supabase.from('profiles').select('campus_code, role').eq('id', authUserId).maybeSingle();
 const { data: inserted, error } = await supabase
 .from('verifications')
 .insert({
 id: reqId,
 user_id: authUserId,
 campus_code: me?.campus_code || 'GLOBAL',
 requested_role: me?.role === 'alumni' ? 'alumni' : 'student',
 id_card_front_url: filePath,
 status: 'pending',
 review_notes: payload.documentReference ? `${payload.documentType}: ${payload.documentReference}` : payload.documentType,
 })
 .select('*')
 .maybeSingle();
 if (error) throw new Error('We could not submit your verification request. Please try again.');
 row = inserted;
 const { error: pendingError } = await supabase.from('profiles').update({ verification_status: 'pending' }).eq('id', authUserId);
 if (pendingError) console.warn('[Verification] Could not mark the profile pending:', pendingError.message);
 } else {
 // Do not leave an orphaned upload behind when the request was refused.
 supabase.storage.from(VERIFICATIONS_BUCKET).remove([filePath]).then(() => {}, () => {});
 throw new Error(friendlySubmitError(rpcError.message ?? ''));
 }

  const created: VerificationRequest = {
    id: row?.id ?? reqId,
    userId: authUserId,
    applicantName: payload.applicantName,
    documentType: payload.documentType,
    documentReference: payload.documentReference || undefined,
    institutionClaimed: row?.campus_code ?? payload.institutionClaimed,
    documentPhotoUri: row?.id_card_front_url ?? filePath,
    documentStoragePath: row?.id_card_front_url ?? filePath,
    submittedAt: row?.created_at ?? new Date().toISOString(),
    status: 'pending',
  };
 verificationState = [...verificationState, created];
 return created;
}

function mapVerificationRow(row: any): VerificationRequest {
 const parsed = parseReviewNotes(row.review_notes);
 return {
  id: row.id,
  userId: row.user_id,
  applicantName: row.profiles?.full_name || 'Campus Applicant',
  documentType: parsed.documentType,
  documentReference: parsed.documentReference,
  institutionClaimed: row.campus_code || 'University Campus',
  submittedAt: row.created_at,
  status: (row.status === 'approved'
   ? 'approved'
   : row.status === 'rejected'
     ? 'rejected'
     : 'pending') as VerificationRequest['status'],
  documentPhotoUri: row.id_card_front_url,
  documentStoragePath: resolveVerificationDocumentPath(row.id_card_front_url),
  rejectionReason: row.rejection_reason ?? parsed.rejectionReason ?? null,
  reviewedAt: row.reviewed_at ?? null,
 };
}

/**
 * The pending review queue, **oldest first**.
 *
 * Newest-first was the wrong order for a work queue: the person who has waited longest is the
 * person most likely to give up, and they were pushed to the bottom of the list. Ordering by
 * `created_at` ascending makes the queue drain fairly and makes the wait time on the top card the
 * worst wait in the system.
 */
export async function listVerificationRequests(campusCode?: string): Promise<VerificationRequest[]> {
 try {
  let q = supabase
   .from('verifications')
   .select('*, profiles!verifications_user_id_fkey(full_name, role, campus_code)')
   .eq('status', 'pending');
  if (campusCode && campusCode !== 'ALL' && campusCode !== 'GLOBAL') {
   q = q.eq('campus_code', campusCode);
  }
  const { data, error } = await q.order('created_at', { ascending: true });

  if (!error && data) {
   return data.map(mapVerificationRow);
  }
 } catch {
  // fallback
 }

 return verificationState
  .filter((v) => v.status === 'pending')
  .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

/** What the signed-in applicant needs to know about their own verification. */
export interface MyVerificationState {
 /** Raw `profiles.verification_status`. `rejected` is a real state, not "unverified". */
 status: 'unverified' | 'pending' | 'verified' | 'rejected';
 /** The applicant's most recent request, if they have ever made one. */
 latestRequest: VerificationRequest | null;
 /** Reviewer's reason, when the latest request was declined. */
 rejectionReason: string | null;
 /** True when the account may submit (or re-submit) an application. */
 canApply: boolean;
}

/**
 * Reads the applicant's own verification state straight from the database.
 *
 * `getMyProfile()` flattens `rejected` into `'none'` (its `UserProfile.verificationStatus` union
 * has no `rejected` member), which is exactly why a declined student saw a generic "not verified"
 * prompt and never learned what to fix. This reader keeps the four real enum values and pairs
 * them with the reviewer's note.
 */
export async function getMyVerificationState(userId?: string): Promise<MyVerificationState> {
 let id = userId;
 if (!id) {
  const { data: authData } = await supabase.auth.getUser();
  id = authData?.user?.id;
  if (!id) {
   const stored = await getSessionUser();
   id = stored?.id;
  }
 }

 const empty: MyVerificationState = {
  status: 'unverified',
  latestRequest: null,
  rejectionReason: null,
  canApply: true,
 };
 if (!id) return empty;

 try {
  const [{ data: profileRow }, { data: requestRows }] = await Promise.all([
   supabase.from('profiles').select('verification_status').eq('id', id).maybeSingle(),
   supabase
    .from('verifications')
    .select('*, profiles!verifications_user_id_fkey(full_name, role, campus_code)')
    .eq('user_id', id)
    .order('created_at', { ascending: false })
    .limit(1),
  ]);

  const raw = profileRow?.verification_status;
  const status: MyVerificationState['status'] =
   raw === 'verified' || raw === 'pending' || raw === 'rejected' ? raw : 'unverified';

  const latestRequest = requestRows && requestRows.length > 0 ? mapVerificationRow(requestRows[0]) : null;

  return {
   status,
   latestRequest,
   rejectionReason: status === 'rejected' ? (latestRequest?.rejectionReason ?? null) : null,
   // A rejection is a "fix this and come back", not a ban: re-applying moves the profile
   // rejected -> pending, a transition the profile-escalation trigger explicitly permits.
   canApply: status === 'unverified' || status === 'rejected',
  };
 } catch {
  return empty;
 }
}

export interface RespondToVerificationOptions {
 /** Required for a rejection: the applicant is told this verbatim. */
 reason?: string;
 /**
  * Set by callers that record their own, richer audit entry (the admin queue does) so the
  * decision does not land in the moderation audit log twice.
  */
 skipAudit?: boolean;
 /** Set by callers that send their own notification. */
 skipNotification?: boolean;
}

function friendlyReviewError(message: string): string {
 if (/unauthorized_campus_scope/i.test(message)) return 'That request belongs to another campus. Only its Campus Admin or the Super Admin can decide it.';
 if (/permission_disabled/i.test(message)) return 'ID verification is switched off for your role by the Super Admin.';
 if (/already_reviewed/i.test(message)) return 'Someone already decided this request. Refresh the queue.';
 if (/reason_required/i.test(message)) return 'A rejection needs a reason - the applicant has to know what to fix.';
 if (/conflict_of_interest/i.test(message)) return 'You cannot review your own request.';
 if (/not_found/i.test(message)) return 'That request no longer exists.';
 return 'The decision could not be saved. Please try again.';
}

/**
 * Records a reviewer's decision through review_verification_request(): the request, the applicant's
 * profile status and the audit entry change together or not at all, the reviewer's authority is
 * checked against the REQUEST's campus (a Campus Admin cannot decide another campus's applicants)
 * and the applicant is notified by the database. Before this, the app wrote the two rows separately -
 * when the second write failed the request left the queue as "decided" while the student stayed
 * pending forever.
 */
export async function respondToVerificationRequest(
 id: string,
 status: 'approved' | 'rejected',
 options: RespondToVerificationOptions = {},
): Promise<VerificationRequest | undefined> {
 const reason = options.reason?.trim();
 if (status === 'rejected' && !reason) {
  throw new Error('A rejection needs a reason - the applicant has to know what to fix.');
 }

 const { data, error } = await supabase.rpc('review_verification_request', {
  p_request_id: id,
  p_approve: status === 'approved',
  p_reason: reason ?? null,
 });
 if (error) {
  if (isMissingFunction(error)) return respondToVerificationRequestLegacy(id, status, options);
  throw new Error(friendlyReviewError(error.message ?? ''));
 }

 const result = (data ?? {}) as { user_id?: string };
 if (result.user_id) invalidateProfileCache(result.user_id);

 let updated: VerificationRequest | undefined;
 verificationState = verificationState.map((v) => {
  if (v.id !== id) return v;
  updated = { ...v, status, rejectionReason: reason ?? null };
  return updated;
 });
 if (!updated) {
  try {
   const { data: vRow } = await supabase
    .from('verifications')
    .select('*, profiles!verifications_user_id_fkey(full_name, role, campus_code)')
    .eq('id', id)
    .maybeSingle();
   if (vRow) updated = { ...mapVerificationRow(vRow), status };
  } catch {
   // the decision is stored; the row only feeds the caller's optimistic UI
  }
 }
 return updated;
}

/**
 * LEGACY two-step decision, used only while the database has no review_verification_request()
 * function (migration 20261028000000 not applied yet). It is NOT atomic: the request can be marked
 * decided while the profile update fails.
 */
async function respondToVerificationRequestLegacy(
 id: string,
 status: 'approved' | 'rejected',
 options: RespondToVerificationOptions = {},
): Promise<VerificationRequest | undefined> {
 const reason = options.reason?.trim();
 if (status === 'rejected' && !reason) {
  throw new Error('A rejection needs a reason - the applicant has to know what to fix.');
 }

 let updated: VerificationRequest | undefined;
 verificationState = verificationState.map((v) => {
 if (v.id !== id) return v;
 updated = { ...v, status, rejectionReason: reason ?? null };
 return updated;
 });

 {
 const { data: authData } = await supabase.auth.getUser();
 const reviewerId = authData?.user?.id || null;

 const { data: reqRow } = await supabase
 .from('verifications')
 .select('user_id, campus_code, review_notes')
 .eq('id', id)
 .maybeSingle();

 const { error: decisionError } = await supabase
 .from('verifications')
 .update({
 status: status === 'approved' ? 'approved' : 'rejected',
 reviewed_at: new Date().toISOString(),
 reviewed_by: reviewerId,
 ...(status === 'rejected' && reason
  ? { review_notes: formatReviewNotes(reqRow?.review_notes, reason) }
  : {}),
 })
 .eq('id', id);
 if (decisionError) {
  throw new Error('The decision could not be saved. Please try again.');
 }

  if (reqRow?.user_id) {
    // 'verified' is what auth_campus_access() reads to unlock the campus wall, and
    // 'rejected' is a real enum member with a re-apply path. Nothing else is written here.
    const nextStatus = status === 'approved' ? 'verified' : 'rejected';
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ verification_status: nextStatus })
      .eq('id', reqRow.user_id);
    if (profileError) {
      throw new Error(
        status === 'approved'
          ? 'The request was marked approved but campus access could not be granted. Please retry.'
          : 'The request was marked rejected but the applicant\'s status could not be updated. Please retry.',
      );
    }
    // Evict from the in-memory cache so the next profile read sees the new status.
    invalidateProfileCache(reqRow.user_id);
  }
  }

 if (!updated) {
    try {
      const { data: vRow } = await supabase
        .from('verifications')
        .select('*, profiles!verifications_user_id_fkey(full_name, role, campus_code)')
        .eq('id', id)
        .maybeSingle();

      if (vRow) {
        const parsed = parseReviewNotes(vRow.review_notes);
        updated = {
          id: vRow.id,
          userId: vRow.user_id,
          applicantName: vRow.profiles?.full_name || 'Campus Applicant',
          documentType: parsed.documentType,
          documentReference: parsed.documentReference,
          institutionClaimed: vRow.campus_code || 'University Campus',
          submittedAt: vRow.created_at,
          status,
          documentPhotoUri: vRow.id_card_front_url,
          documentStoragePath: resolveVerificationDocumentPath(vRow.id_card_front_url),
        };
      }
    } catch {
      // ignore
    }
  }

  if (updated) {
    await recordAuditLogEntry({
      action: status === 'approved' ? 'verification_approved' : 'verification_rejected',
      summary: `${status === 'approved' ? 'Approved' : 'Rejected'} a verification application from ${updated.applicantName} (claimed ${updated.institutionClaimed})`,
      targetType: 'verification_request',
      targetId: id,
    });

    createNotification({
      recipientId: updated.userId,
      type: 'system',
      title: status === 'approved' ? 'Verification approved' : 'Verification not approved',
      body:
        status === 'approved'
          ? `Your ${updated.institutionClaimed} verification was approved. Your profile now shows the verified badge.`
          : `Your ${updated.institutionClaimed} verification wasn't approved this time. Check your submitted details and try again.`,
      deepLinkPath: '/profile',
    });
  }

  return updated;
}

export async function adminDirectVerifyUser(userId: string, isVerified: boolean): Promise<boolean> {
  try {
    // 'none' is not a member of verification_status_type ('unverified','pending','verified',
    // 'rejected') - see the explanation above respondToVerificationRequest. Writing it silently
    // fails the UPDATE, leaving the profile's status unchanged while the admin UI reports success.
    const status = isVerified ? 'verified' : 'unverified';
    const { error } = await supabase
      .from('profiles')
      .update({
        verification_status: status,
      })
      .eq('id', userId);

    if (error) throw error;

    // Evict from local cache so the next getPublicProfile fetches fresh data
    invalidateProfileCache(userId);

    await recordAuditLogEntry({
      action: isVerified ? 'verification_approved' : 'verification_rejected',
      summary: `Admin manually ${isVerified ? 'granted' : 'revoked'} verification status for user ${userId}`,
      targetType: 'user',
      targetId: userId,
    });

    await createNotification({
      recipientId: userId,
      type: 'system',
      title: isVerified ? 'Account Verified' : 'Verification Status Updated',
      body: isVerified
        ? 'A platform administrator has verified your account. Your profile now proudly displays the verification badge!'
        : 'Your account verification status has been updated by an administrator.',
      deepLinkPath: '/profile',
    });

    return true;
  } catch (err) {
    console.error('[Verification] adminDirectVerifyUser failed:', err);
    return false;
  }
}
