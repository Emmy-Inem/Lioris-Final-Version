import { Mentorship, MentorProfile } from './types';
import { createNotification } from './notifications';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { generateUUID } from '../utils/uuid';
import { assertUuid, escapePostgrestLike } from '../utils/postgrest';

// Mentorships this session has *successfully* written to Supabase, kept
// here only so they render instantly before the next refetch. Never mixed
// with mockData.ts fixtures - those only come from getMockPool() below,
// and only while the admin's "Mock Data Visibility" toggle is on.
let locallyCreatedMentorships: Mentorship[] = [];



export async function listMentorships(): Promise<Mentorship[]> {
 try {
 const { data: authData } = await supabase.auth.getUser();
 let currentUserId = authData?.user?.id;
 if (!currentUserId) {
 const stored = await getSessionUser();
 if (stored?.id) currentUserId = stored.id;
 }

 if (!currentUserId) throw new Error('Not signed in');
 assertUuid(currentUserId, 'user id');

 const { data, error } = await supabase
 .from('mentorships')
 .select('*, mentor:profiles!mentorships_mentor_id_fkey(full_name, role, department, avatar_url), student:profiles!mentorships_student_id_fkey(full_name, role, department, avatar_url)')
 .or(`student_id.eq.${currentUserId},mentor_id.eq.${currentUserId}`)
 .order('created_at', { ascending: false });

 if (error) throw error;

  const dbMentorships: Mentorship[] = (data ?? []).map((row: any) => {
    let parsed: any = null;
    if (row.focus_area && typeof row.focus_area === 'string' && row.focus_area.startsWith('{')) {
      try {
        parsed = JSON.parse(row.focus_area);
      } catch {}
    }
    return {
      id: row.id,
      studentId: row.student_id,
      studentName: row.student?.full_name || 'Student Mentee',
      studentDepartment: row.student?.department || null,
      mentorId: row.mentor_id,
      mentorName: row.mentor?.full_name || 'Verified Mentor',
      status: row.status as any,
      focusArea: parsed?.track || row.focus_area,
      academicLevel: parsed?.level,
      pitch: parsed?.pitch,
      goals: parsed?.goals,
      cadence: parsed?.cadence,
      planOutline: parsed?.planOutline,
      documentUrl: parsed?.documentUrl,
      documentName: parsed?.documentName,
      createdAt: row.created_at,
    };
  });

  const merged = [...dbMentorships];
  for (const item of [...locallyCreatedMentorships]) {
  if (!merged.some((m) => m.id === item.id)) {
  merged.push(item);
  }
  }
  return merged;
  } catch (err) {
  console.warn('[Mentorship] listMentorships failed, showing local pool only:', err);
  return [...locallyCreatedMentorships];
  }
}

export interface MentorSearchQuery {
 focusArea?: string;
 q?: string;
}

export async function searchMentors(query: MentorSearchQuery = {}): Promise<MentorProfile[]> {
  try {
    let q = supabase
      .from('profiles')
      .select('id, full_name, bio, role, department, avatar_url, campus_code, interests, verification_status')
      .in('role', ['staff', 'alumni', 'admin']);

    if (query.q) {
      q = q.ilike('full_name', `%${escapePostgrestLike(query.q)}%`);
    }

    const { data, error } = await q;
    if (error) throw error;

    // The screen labels this list "Verified Alumni Mentors" - only surface
    // profiles that actually earned that status (admins are exempt, same
    // rule as the verified badge elsewhere).
    const verifiedOnly = (data ?? []).filter(
      (row: any) => row.verification_status === 'verified' || row.role === 'admin',
    );

    // Real profile fields only. This used to hand every mentor an identical
    // fabricated payload: the same four expertise tags, "4 slots available",
    // a campus code presented as an employer, and a bio asserting the person
    // was a "Verified" mentor.
    return verifiedOnly.map((row: any) => ({
      id: row.id,
      fullName: row.full_name,
      department: row.department || undefined,
      bio: row.bio || '',
      // profiles.interests is what the user actually picked during onboarding.
      expertiseTags: Array.isArray(row.interests) ? row.interests : [],
      avatarUrl: row.avatar_url,
      // No employer field exists on profiles; MentorCard omits it when unset.
      company: undefined,
      // Mentor capacity has no backing column, so it stays unknown rather
      // than claiming a number.
      availableSlots: undefined,
    }));
  } catch (err) {
    console.warn('[Mentorship] searchMentors failed:', err);
    return [];
  }
}

export interface RequestMentorshipPayload {
  mentorId: string;
  focusArea: string;
  academicLevel?: string;
  pitch?: string;
  goals?: string;
  cadence?: string;
  planOutline?: string;
  documentUrl?: string;
  documentName?: string;
}

/**
 * Throws if there's no authenticated student or the Supabase insert fails,
 * instead of quietly returning a fabricated "pending" request. Callers
 * must catch this and show a real error.
 */
export async function requestMentorship(
  mentorIdOrPayload: string | RequestMentorshipPayload,
  legacyFocusArea?: string,
): Promise<Mentorship> {
  const reqId = generateUUID();

  const { data: authData } = await supabase.auth.getUser();
  let studentId = authData?.user?.id;
  if (!studentId) {
    const stored = await getSessionUser();
    if (stored?.id) studentId = stored.id;
  }

  if (!studentId) {
    throw new Error('You need to be signed in to request a mentor.');
  }

  const isPayloadObj = typeof mentorIdOrPayload === 'object';
  const mentorId = isPayloadObj ? mentorIdOrPayload.mentorId : mentorIdOrPayload;
  const focusArea = isPayloadObj ? mentorIdOrPayload.focusArea : (legacyFocusArea || 'Academic Guidance');
  const academicLevel = isPayloadObj ? mentorIdOrPayload.academicLevel : undefined;
  const pitch = isPayloadObj ? mentorIdOrPayload.pitch : undefined;
  const goals = isPayloadObj ? mentorIdOrPayload.goals : undefined;
  const cadence = isPayloadObj ? mentorIdOrPayload.cadence : undefined;
  const planOutline = isPayloadObj ? mentorIdOrPayload.planOutline : undefined;
  const documentUrl = isPayloadObj ? mentorIdOrPayload.documentUrl : undefined;
  const documentName = isPayloadObj ? mentorIdOrPayload.documentName : undefined;

  // Serialize structured proposal into focus_area JSON string so that all
  // rich fields (goals, cadence, CV/document attachment, pitch) are reliably stored.
  const storedFocusArea = JSON.stringify({
    track: focusArea,
    level: academicLevel,
    pitch,
    goals,
    cadence,
    planOutline,
    documentUrl,
    documentName,
  });

  const { error } = await supabase.from('mentorships').insert({
    id: reqId,
    student_id: studentId,
    mentor_id: mentorId,
    status: 'pending',
    focus_area: storedFocusArea,
  });

  if (error) {
    console.warn('[Mentorship] Request mentorship Supabase error:', error.message);
    throw new Error('Could not send this mentorship request. Please try again.');
  }

  // Notify the mentor about the request and the attached proposal / document
  try {
    let studentName = 'A student';
    const { data: studentProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', studentId)
      .maybeSingle();
    if (studentProfile?.full_name) studentName = studentProfile.full_name;

    createNotification({
      recipientId: mentorId,
      type: 'system',
      title: 'New Mentorship Request',
      body: `${studentName} requested mentorship in ${focusArea}${documentName ? ` with attached document "${documentName}"` : ''}.`,
      deepLinkPath: '/(alumni)/mentorship',
    });
  } catch (notifErr) {
    console.warn('[Mentorship] Notification send failed:', notifErr);
  }

  const created: Mentorship = {
    id: reqId,
    studentId,
    mentorId,
    mentorName: 'Verified Mentor',
    status: 'pending',
    focusArea,
    academicLevel,
    pitch,
    goals,
    cadence,
    planOutline,
    documentUrl,
    documentName,
    createdAt: new Date().toISOString(),
  };

  locallyCreatedMentorships = [...locallyCreatedMentorships, created];
  return created;
}

export async function respondToMentorshipRequest(
 mentorshipId: string,
 action: 'accept' | 'decline',
): Promise<Mentorship> {
 const newStatus = action === 'accept' ? 'active' : 'declined';
 let updated: Mentorship | undefined;
 let realStudentId: string | undefined;
 let mentorName = 'Your mentor';

 try {
 const { data: authData } = await supabase.auth.getUser();
 const currentUserId = authData?.user?.id;
 if (currentUserId) {
 const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', currentUserId).maybeSingle();
 if (profile?.full_name) mentorName = profile.full_name;
 }

 const { data: mRow } = await supabase
 .from('mentorships')
 .update({
 status: newStatus,
 updated_at: new Date().toISOString(),
 })
 .eq('id', mentorshipId)
 .select('student_id')
 .maybeSingle();

 if (mRow?.student_id) {
 realStudentId = mRow.student_id;
 }
 } catch (err) {
 console.warn('[Mentorship] Update exception:', err);
 }

 locallyCreatedMentorships = locallyCreatedMentorships.map((m) => {
 if (m.id !== mentorshipId) return m;
 updated = { ...m, status: newStatus };
 return updated;
 });

 const finalStudentId = realStudentId || updated?.studentId;

 if (finalStudentId && finalStudentId !== 'unknown' && finalStudentId !== 'me') {
 createNotification({
 recipientId: finalStudentId,
 type: 'system',
 title: action === 'accept' ? 'Mentorship request accepted' : 'Mentorship request declined',
 body:
 action === 'accept'
 ? `${mentorName} accepted your mentorship request - say hello!`
 : `${mentorName} wasn't able to take on a new mentee right now.`,
 });
 }

 return (
 updated ?? {
 id: mentorshipId,
 studentId: finalStudentId ?? 'unknown',
 mentorId: 'me',
 mentorName,
 status: newStatus,
 }
 );
}
