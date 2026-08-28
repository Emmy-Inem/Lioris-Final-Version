import { Mentorship, MentorProfile } from './types';
import { mockMentorships, mockMentorProfiles } from './mockData';
import { createNotification } from './notifications';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { generateUUID } from '../utils/uuid';
import { isMockDataVisible } from './mockDataSettings';

// Mentorships this session has *successfully* written to Supabase, kept
// here only so they render instantly before the next refetch. Never mixed
// with mockData.ts fixtures - those only come from getMockPool() below,
// and only while the admin's "Mock Data Visibility" toggle is on.
let locallyCreatedMentorships: Mentorship[] = [];

function getMockMentorshipsPool(): Mentorship[] {
 return isMockDataVisible() ? mockMentorships : [];
}

export async function listMentorships(): Promise<Mentorship[]> {
 try {
 const { data: authData } = await supabase.auth.getUser();
 let currentUserId = authData?.user?.id;
 if (!currentUserId) {
 const stored = await getSessionUser();
 if (stored?.id) currentUserId = stored.id;
 }

 if (!currentUserId) throw new Error('Not signed in');

 const { data, error } = await supabase
 .from('mentorships')
 .select('*, mentor:profiles!mentorships_mentor_id_fkey(full_name, role, department, avatar_url), student:profiles!mentorships_student_id_fkey(full_name, role, department, avatar_url)')
 .or(`student_id.eq.${currentUserId},mentor_id.eq.${currentUserId}`)
 .order('created_at', { ascending: false });

 if (error) throw error;

 const dbMentorships: Mentorship[] = (data ?? []).map((row: any) => ({
 id: row.id,
 studentId: row.student_id,
 studentName: row.student?.full_name || 'Student Mentee',
 mentorId: row.mentor_id,
 mentorName: row.mentor?.full_name || 'Verified Mentor',
 status: row.status as any,
 focusArea: row.focus_area,
 createdAt: row.created_at,
 }));

 const merged = [...dbMentorships];
 for (const item of [...locallyCreatedMentorships, ...getMockMentorshipsPool()]) {
 if (!merged.some((m) => m.id === item.id)) {
 merged.push(item);
 }
 }
 return merged;
 } catch (err) {
 console.warn('[Mentorship] listMentorships failed, showing local pool only:', err);
 return [...locallyCreatedMentorships, ...getMockMentorshipsPool()];
 }
}

export interface MentorSearchQuery {
 focusArea?: string;
 q?: string;
}

function filterMockMentors(query: MentorSearchQuery): MentorProfile[] {
 let results = isMockDataVisible() ? [...mockMentorProfiles] : [];

 if (query.focusArea && query.focusArea !== 'All Fields') {
 results = results.filter((m) =>
 m.expertiseTags.some((tag) => tag.toLowerCase() === query.focusArea!.toLowerCase()),
 );
 }

 if (query.q) {
 const q = query.q.toLowerCase();
 results = results.filter(
 (m) =>
 m.fullName.toLowerCase().includes(q) ||
 m.bio.toLowerCase().includes(q) ||
 m.company?.toLowerCase().includes(q) ||
 m.expertiseTags.some((tag) => tag.toLowerCase().includes(q)),
 );
 }

 return results;
}

export async function searchMentors(query: MentorSearchQuery = {}): Promise<MentorProfile[]> {
 try {
 const { data, error } = await supabase
 .from('profiles')
 .select('id, full_name, bio, role, department, avatar_url, campus_code')
 .in('role', ['staff', 'alumni', 'admin']);

 if (error) throw error;

 const dbMentors: MentorProfile[] = (data ?? []).map((row: any) => ({
 id: row.id,
 fullName: row.full_name,
 department: row.department || 'Academic Department',
 bio: row.bio || `Academic Mentor & Verified ${row.role} at ${row.campus_code || 'University'}`,
 expertiseTags: ['Leadership', 'Career Growth', 'Research', 'Tech'],
 avatarUrl: row.avatar_url,
 company: row.campus_code || 'Academic Faculty',
 availableSlots: 4,
 }));

 // Merge unique - mock fixtures only ever show up here when the admin
 // mock-data toggle is on.
 const local = filterMockMentors(query);
 const merged = [...dbMentors];
 for (const item of local) {
 if (!merged.some((m) => m.id === item.id)) {
 merged.push(item);
 }
 }
 return merged;
 } catch (err) {
 console.warn('[Mentorship] searchMentors failed, showing mock pool only:', err);
 return filterMockMentors(query);
 }
}

/**
 * Throws if there's no authenticated student or the Supabase insert fails,
 * instead of quietly returning a fabricated "pending" request. Callers
 * must catch this and show a real error.
 */
export async function requestMentorship(
 mentorId: string,
 focusArea?: string,
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

 const { error } = await supabase.from('mentorships').insert({
 id: reqId,
 student_id: studentId,
 mentor_id: mentorId,
 status: 'pending',
 focus_area: focusArea || 'Academic Guidance',
 });

 if (error) {
 console.warn('[Mentorship] Request mentorship Supabase error:', error.message);
 throw new Error('Could not send this mentorship request. Please try again.');
 }

 const mentor = mockMentorProfiles.find((m) => m.id === mentorId);
 const created: Mentorship = {
 id: reqId,
 studentId,
 mentorId,
 mentorName: mentor?.fullName ?? 'Verified Mentor',
 status: 'pending',
 focusArea,
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
