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

let verificationState: VerificationRequest[] = [
  {
    id: 'vr-101',
    userId: 'user-adekunle',
    applicantName: 'Adekunle Gold',
    documentType: 'Student ID',
    documentReference: 'UNILAG/ENG/2021/4892',
    institutionClaimed: 'University of Lagos (UNILAG)',
    submittedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    status: 'pending',
    documentPhotoUri: null,
  },
  {
    id: 'vr-102',
    userId: 'user-folake',
    applicantName: 'Folake Adeleke',
    documentType: 'Alumni Certificate',
    documentReference: 'UI/CERT/2022/8911',
    institutionClaimed: 'University of Ibadan (UI)',
    submittedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    status: 'pending',
    documentPhotoUri: null,
  },
];

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
      if (payload.photoBlob) {
        const filePath = `verifications/${authUserId}/${reqId}.jpg`;
        await supabase.storage.from('resources').upload(filePath, payload.photoBlob, {
          contentType: 'image/jpeg',
          upsert: true,
        });
        const { data: publicUrlData } = supabase.storage.from('resources').getPublicUrl(filePath);
        photoUrl = publicUrlData?.publicUrl || photoUrl;
      }

      const campusCode = payload.institutionClaimed.includes('UNILAG')
        ? 'UNILAG'
        : payload.institutionClaimed.includes('UI')
          ? 'UI'
          : 'GLOBAL';

      const { error } = await supabase.from('verifications').insert({
        id: reqId,
        user_id: authUserId,
        campus_code: campusCode,
        requested_role: 'student',
        id_card_front_url: photoUrl || 'https://storage.lioris.app/verifications/default-id.jpg',
        status: 'pending',
        review_notes: `${payload.documentType}: ${payload.documentReference}`,
      });
      if (error) {
        console.warn('[Verification] Supabase insert warning:', error.message);
      }
    }
  } catch (err) {
    console.warn('[Verification] Submission backend warning:', err);
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
      .select('*, profiles(full_name, role, campus_code)')
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
    }
  } catch (err) {
    console.warn('[Verification] Status update backend warning:', err);
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
