import { FALL_BACK_TO_MOCKS } from'./config';
import { api } from'./client';
import { recordAuditLogEntry } from'./auditLog';
import { createNotification } from'./notifications';

export interface VerificationRequest {
  id: string;
  userId: string;
  applicantName: string;
  documentType: 'Student ID' | 'Admission Letter' | 'Staff ID' | 'Alumni Certificate';
  documentReference: string;
  institutionClaimed: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  /** Local device URI of the uploaded document photo, if provided. A real backend would upload this to a signed-URL bucket, not store a device-local path. */
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
}

// Backs the Profile screen's"Apply for Verification"flow. Submitting
// does NOT immediately grant the tick — a real reviewer (Admin's
// Verify Credentials tool) approves or rejects it, matching how actual
// document verification has to work.
export async function submitVerificationRequest(payload: SubmitVerificationPayload): Promise<VerificationRequest> {
  const created: VerificationRequest = {
    id: `vr-${Date.now()}`,
    ...payload,
    submittedAt: new Date().toISOString(),
    status: 'pending',
  };
  if (!FALL_BACK_TO_MOCKS) {
    await api.post('/verification-requests', payload);
    return created;
  }
  try {
    await api.post('/verification-requests', payload);
  } catch {
    // Expected in mock mode.
  }
  verificationState = [...verificationState, created];
  return created;
}

export async function listVerificationRequests(): Promise<VerificationRequest[]> {
  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.get<{ items: VerificationRequest[] }>('/verification-requests');
    return data.items;
  }
  try {
    const { data } = await api.get<{ items: VerificationRequest[] }>('/verification-requests');
    return data.items;
  } catch {
    return verificationState.filter((v) => v.status === 'pending');
  }
}

export async function respondToVerificationRequest(id: string, status: 'approved' | 'rejected'): Promise<VerificationRequest | undefined> {
  let updated: VerificationRequest | undefined;
  verificationState = verificationState.map((v) => {
    if (v.id !== id) return v;
    updated = { ...v, status };
    return updated;
  });
  if (updated) {
    // PRD Section 6.2 — moderation decisions must be audit-logged.
    await recordAuditLogEntry({
      action: status === 'approved' ? 'verification_approved' : 'verification_rejected',
      summary: `${status === 'approved' ? 'Approved' : 'Rejected'} a verification application from ${updated.applicantName} (claimed ${updated.institutionClaimed})`,
      targetType: 'verification_request',
      targetId: id,
    });
    // The applicant themselves was previously never told either way —
    // no notification was ever created anywhere in the app before this.
    createNotification({
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
