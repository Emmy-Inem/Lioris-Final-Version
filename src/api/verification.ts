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

/** Splits `review_notes` ("Student ID: ABC/123") back into a document type and reference. */
function parseReviewNotes(
 notes?: string | null,
): { documentType: VerificationRequest['documentType']; documentReference?: string } {
 const known: VerificationRequest['documentType'][] = [
  'Student ID',
  'Admission Letter',
  'Staff ID',
  'Alumni Certificate',
 ];
 const raw = (notes || '').trim();
 for (const type of known) {
  if (raw === type) return { documentType: type };
  if (raw.startsWith(`${type}:`)) {
   const ref = raw.slice(type.length + 1).trim();
   return { documentType: type, documentReference: ref || undefined };
  }
 }
 return { documentType: 'Student ID', documentReference: raw || undefined };
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

export async function listVerificationRequests(): Promise<VerificationRequest[]> {
 try {
 const { data, error } = await supabase
 .from('verifications')
 .select('*, profiles!verifications_user_id_fkey(full_name, role, campus_code)')
 .order('created_at', { ascending: false });

 if (!error && data && data.length > 0) {
 const dbRequests: VerificationRequest[] = data.map((row: any) => {
 const parsed = parseReviewNotes(row.review_notes);
 return {
 id: row.id,
 userId: row.user_id,
 applicantName: row.profiles?.full_name || 'Campus Applicant',
 documentType: parsed.documentType,
 documentReference: parsed.documentReference,
 institutionClaimed: row.campus_code || 'University Campus',
 submittedAt: row.created_at,
 status: (row.status === 'approved' ? 'approved' : row.status === 'rejected' ? 'rejected' : 'pending') as VerificationRequest['status'],
 documentPhotoUri: row.id_card_front_url,
 documentStoragePath: resolveVerificationDocumentPath(row.id_card_front_url),
 };
 });
 return dbRequests.filter((v) => v.status === 'pending');
 }
 } catch {
 // fallback
 }

 return verificationState.filter((v) => v.status === 'pending');
}

export async function respondToVerificationRequest(
 id: string,
 status: 'approved' | 'rejected',
): Promise<VerificationRequest | undefined> {
 let updated: VerificationRequest | undefined;
 verificationState = verificationState.map((v) => {
 if (v.id !== id) return v;
 updated = { ...v, status };
 return updated;
 });

 try {
 const { data: authData } = await supabase.auth.getUser();
 const reviewerId = authData?.user?.id || null;

 const { data: reqRow } = await supabase
 .from('verifications')
 .select('user_id, campus_code')
 .eq('id', id)
 .maybeSingle();

 await supabase
 .from('verifications')
 .update({
 status: status === 'approved' ? 'approved' : 'rejected',
 reviewed_at: new Date().toISOString(),
 reviewed_by: reviewerId,
 })
 .eq('id', id);

  if (status === 'approved' && reqRow?.user_id) {
    await supabase
      .from('profiles')
      .update({ verification_status: 'verified' })
      .eq('id', reqRow.user_id);
    // Evict from local cache so next view fetches the updated status
    invalidateProfileCache(reqRow.user_id);
  } else if (status === 'rejected' && reqRow?.user_id) {
    await supabase
      .from('profiles')
      .update({ verification_status: 'none' })
      .eq('id', reqRow.user_id);
    invalidateProfileCache(reqRow.user_id);
  }
  } catch (err) {
    console.warn('[Verification] Status update backend warning:', err);
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
