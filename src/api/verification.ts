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
 documentType: 'Student ID' | 'Admission Letter' | 'Staff ID' | 'Alumni Certificate';
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

export async function submitVerificationRequest(payload: SubmitVerificationPayload): Promise<VerificationRequest> {
 const reqId = generateUUID();
 let photoUrl = payload.documentPhotoUri || null;
 let documentPath: string | null = null;

 try {
 const { data: authData } = await supabase.auth.getUser();
 let authUserId = authData?.user?.id;
 if (!authUserId) {
 const stored = await getSessionUser();
 if (stored?.id) authUserId = stored.id;
 }

 if (authUserId) {
 let photoBlobToUpload = payload.photoBlob;
 if (!photoBlobToUpload && payload.documentPhotoUri) {
 try {
 const resp = await fetch(payload.documentPhotoUri);
 photoBlobToUpload = await resp.blob();
 } catch {
 // keep URI as is
 }
 }
 // Evidence is mandatory: an application with no document gives a moderator nothing to check.
 if (!photoBlobToUpload) {
 throw new Error('Please attach a clear photo of your student ID, admission letter or certificate.');
 }
 {
 const filePath = `${authUserId}/${reqId}.jpg`;
 const { error: uploadError } = await supabase.storage.from(VERIFICATIONS_BUCKET).upload(filePath, photoBlobToUpload, {
 contentType: 'image/jpeg',
 upsert: true,
 });
 if (uploadError) {
 throw new Error('We could not upload your document. Please check your connection and try again.');
 }
 // Persist the storage PATH, not a signed URL. A signed URL expires (the old code baked in a
 // 30-day one), so any review after that window showed the admin a dead link. Reviewers mint a
 // fresh 5-minute signed URL at the moment they open the document instead.
 documentPath = filePath;
 photoUrl = filePath;
 }

        let campusCode = 'GLOBAL';
        const { data: userProfile } = await supabase.from('profiles').select('campus_code').eq('id', authUserId).maybeSingle();
        if (userProfile?.campus_code) {
          campusCode = userProfile.campus_code;
        } else if (payload.institutionClaimed) {
          const upper = payload.institutionClaimed.toUpperCase();
          if (upper.includes('UNILAG')) campusCode = 'UNILAG';
          else if (upper.includes('UI') || upper.includes('IBADAN')) campusCode = 'UI';
          else if (upper.includes('OAU') || upper.includes('IFE')) campusCode = 'OAU';
          else if (upper.includes('UNN') || upper.includes('NSUKKA')) campusCode = 'UNN';
          else if (upper.includes('FUNAAB') || upper.includes('ABEOKUTA')) campusCode = 'FUNAAB';
          else if (upper.includes('CU') || upper.includes('COVENANT')) campusCode = 'CU';
        }

        const { error } = await supabase.from('verifications').insert({
          id: reqId,
          user_id: authUserId,
          campus_code: campusCode,
          requested_role: 'student',
          id_card_front_url: photoUrl,
          status: 'pending',
          review_notes: payload.documentReference
            ? `${payload.documentType}: ${payload.documentReference}`
            : payload.documentType,
        });
        if (error) {
          throw new Error('We could not submit your verification request. Please try again.');
        }

        // Sync pending status to user's profile in database
        await supabase.from('profiles').update({ verification_status: 'pending' }).eq('id', authUserId);
      }
    } catch (err) {
      // Surface the failure: reporting "pending" for a request that was never stored
      // leaves the applicant waiting for a review that will never happen.
      console.warn('[Verification] Submission failed:', err);
      throw err instanceof Error ? err : new Error('Verification submission failed.');
    }

    const created: VerificationRequest = {
      id: reqId,
      ...payload,
      documentReference: payload.documentReference || undefined,
      documentPhotoUri: photoUrl,
      documentStoragePath: documentPath,
      submittedAt: new Date().toISOString(),
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
  rejectionReason: parsed.rejectionReason ?? null,
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
export async function listVerificationRequests(): Promise<VerificationRequest[]> {
 try {
  const { data, error } = await supabase
   .from('verifications')
   .select('*, profiles!verifications_user_id_fkey(full_name, role, campus_code)')
   .eq('status', 'pending')
   .order('created_at', { ascending: true });

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

/**
 * Records a reviewer's decision.
 *
 * Two things were broken here and both were silent:
 *
 * 1. A rejection wrote `verification_status = 'none'`. `verification_status_type` is
 *    `('unverified','pending','verified','rejected')` - `'none'` is not a member, so Postgres
 *    rejected the UPDATE, the error was swallowed by the catch below, and the applicant was left
 *    sitting in `pending` forever while the admin's screen said "rejected".
 * 2. The rejection reason was never written anywhere the applicant could read it, so even a
 *    successful rejection told them nothing they could act on.
 *
 * Failures now propagate instead of being logged and ignored: a decision the database refused
 * must not be reported to the reviewer as a decision that stuck.
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
    });
  }

  return updated;
}

export async function adminDirectVerifyUser(userId: string, isVerified: boolean): Promise<boolean> {
  try {
    const status = isVerified ? 'verified' : 'none';
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
    });

    return true;
  } catch (err) {
    console.error('[Verification] adminDirectVerifyUser failed:', err);
    return false;
  }
}
