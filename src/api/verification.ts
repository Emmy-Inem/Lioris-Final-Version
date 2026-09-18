import { recordAuditLogEntry } from './auditLog';
import { createNotification } from './notifications';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { generateUUID } from '../utils/uuid';

export interface VerificationRequest {
 id: string;
 userId: string;
 applicantName: string;
 documentType: 'Student ID' | 'Admission Letter' | 'Staff ID' | 'Alumni Certificate';
 documentReference: string;
 institutionClaimed: string;
 submittedAt: string;
 status: 'pending' | 'approved' | 'rejected';
 documentPhotoUri?: string | null;
}

let verificationState: VerificationRequest[] = [];

export interface SubmitVerificationPayload {
 userId: string;
 applicantName: string;
 documentType: VerificationRequest['documentType'];
 documentReference: string;
 institutionClaimed: string;
 documentPhotoUri?: string | null;
 photoBlob?: Blob;
}

export async function submitVerificationRequest(payload: SubmitVerificationPayload): Promise<VerificationRequest> {
 const reqId = generateUUID();
 let photoUrl = payload.documentPhotoUri || null;

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
 const { error: uploadError } = await supabase.storage.from('verifications').upload(filePath, photoBlobToUpload, {
 contentType: 'image/jpeg',
 upsert: true,
 });
 if (uploadError) {
 throw new Error('We could not upload your document. Please check your connection and try again.');
 }
 // Generate secure temporary signed URL for authorized viewing
 const { data: signedUrlData } = await supabase.storage
 .from('verifications')
 .createSignedUrl(filePath, 60 * 60 * 24 * 30);
 photoUrl = signedUrlData?.signedUrl || filePath;
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
          review_notes: `${payload.documentType}: ${payload.documentReference}`,
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
 documentPhotoUri: photoUrl,
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
 const dbRequests: VerificationRequest[] = data.map((row: any) => ({
 id: row.id,
 userId: row.user_id,
 applicantName: row.profiles?.full_name || 'Campus Applicant',
 documentType: 'Student ID',
 documentReference: row.review_notes || 'ID-VERIFY',
 institutionClaimed: row.campus_code || 'University Campus',
 submittedAt: row.created_at,
 status: row.status === 'approved' ? 'approved' : row.status === 'rejected' ? 'rejected' : 'pending',
 documentPhotoUri: row.id_card_front_url,
 }));
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
  } else if (status === 'rejected' && reqRow?.user_id) {
    await supabase
      .from('profiles')
      .update({ verification_status: 'unverified' })
      .eq('id', reqRow.user_id);
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
        updated = {
          id: vRow.id,
          userId: vRow.user_id,
          applicantName: vRow.profiles?.full_name || 'Campus Applicant',
          documentType: 'Student ID',
          documentReference: vRow.review_notes || 'ID-VERIFY',
          institutionClaimed: vRow.campus_code || 'University Campus',
          submittedAt: vRow.created_at,
          status,
          documentPhotoUri: vRow.id_card_front_url,
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
    const status = isVerified ? 'verified' : 'unverified';
    const { error } = await supabase
      .from('profiles')
      .update({
        verification_status: status,
      })
      .eq('id', userId);

    if (error) throw error;

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
