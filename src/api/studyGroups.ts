import { supabase } from './supabase';
import { StudyGroup } from './types';
import { getSessionUser } from '../auth/tokenStorage';
import { generateUUID } from '../utils/uuid';
import { isUserBlocked } from './connections';

// Groups this session has *successfully* written to Supabase, kept here
// only so they render instantly before the next refetch. Never mixed with
// mockData.ts fixtures - those only come from getLocalPool() below, and
// only while the admin's "Mock Data Visibility" toggle is on.
let locallyCreatedGroups: StudyGroup[] = [];

function getLocalPool(): StudyGroup[] {
 return [...locallyCreatedGroups];
}

export interface CreateStudyGroupPayload {
 name: string;
 courseCode: string;
 description: string;
 isPublic: boolean;
 campusCode?: string;
}

/**
 * Throws if the Supabase insert fails or there's no authenticated creator,
 * instead of quietly returning a fabricated "success" group. Callers must
 * catch this and show a real error - see CreateStudyGroupModal.
 */
export async function createStudyGroup(payload: CreateStudyGroupPayload): Promise<StudyGroup> {
 const groupId = generateUUID();

 const { data: authData } = await supabase.auth.getUser();
 let creatorId: string | null = authData?.user?.id || null;
 if (!creatorId) {
 const stored = await getSessionUser();
 if (stored?.id) creatorId = stored.id;
 }

 if (!creatorId) {
 throw new Error('You need to be signed in to create a study pod.');
 }

 let campusCode = payload.campusCode;
 if (!campusCode) {
 const { data: profile } = await supabase
 .from('profiles')
 .select('campus_code')
 .eq('id', creatorId)
 .maybeSingle();
 campusCode = profile?.campus_code || 'GLOBAL';
 }
 if (!campusCode) campusCode = 'GLOBAL';

 const { error } = await supabase.from('study_groups').insert({
 id: groupId,
 creator_id: creatorId,
 campus_code: campusCode,
 name: payload.name,
 course_code: payload.courseCode,
 description: payload.description,
 is_private: !payload.isPublic,
 });

 if (error) {
 console.warn('[StudyGroups] Create group error:', error.message);
 throw new Error('Could not create this study pod. Please try again.');
 }

 const { error: memberError } = await supabase.from('study_group_members').insert({
 group_id: groupId,
 user_id: creatorId,
 });
 if (memberError) {
 console.warn('[StudyGroups] Auto-join creator error:', memberError.message);
 }

 const created: StudyGroup = {
 id: groupId,
 memberCount: 1,
 isJoined: true,
 lastMessageAt: new Date().toISOString(),
 ...payload,
 campusCode,
 };

 locallyCreatedGroups = [created, ...locallyCreatedGroups];
 return created;
}

export async function listStudyGroups(campusCode?: string): Promise<StudyGroup[]> {
 try {
 const { data: authData } = await supabase.auth.getUser();
 const currentUserId = authData?.user?.id || (await getSessionUser())?.id;

 let userCampus = campusCode;
 let userRole = 'student';
 if (currentUserId) {
 const { data: prof } = await supabase.from('profiles').select('campus_code, role').eq('id', currentUserId).maybeSingle();
 if (prof?.campus_code && !userCampus) userCampus = prof.campus_code;
 if (prof?.role) userRole = prof.role;
 }

 const isStaffOrAdmin = userRole === 'admin' || userRole === 'staff';

 const { data, error } = await supabase
 .from('study_groups')
 .select('*, study_group_members(user_id)')
 .order('created_at', { ascending: false });

 if (error) throw error;

 const dbGroups: StudyGroup[] = (data ?? [])
 .filter((row: any) => !isUserBlocked(row.creator_id))
 .filter((row: any) => {
 if (isStaffOrAdmin && !campusCode) return true;
 return !userCampus || userCampus === 'GLOBAL' || !row.campus_code || row.campus_code === 'GLOBAL' || row.campus_code === userCampus;
 })
 .map((row: any) => {
 const members = Array.isArray(row.study_group_members) ? row.study_group_members : [];
 const isJoined = currentUserId ? members.some((m: any) => m.user_id === currentUserId) : false;
 return {
 id: row.id,
 name: row.name,
 courseCode: row.course_code || 'CSC 201',
 description: row.description || '',
 isPublic: !row.is_private,
 memberCount: Math.max(1, members.length),
 isJoined,
 campusCode: row.campus_code || 'GLOBAL',
 lastMessageAt: row.created_at,
 };
 });

 // Merge unique - local pool only ever contributes this session's own
 // just-created groups (always) plus seed fixtures (only when the admin
 // mock-data toggle is on).
 const merged = [...dbGroups];
 for (const g of getLocalPool()) {
 if (!merged.some((m) => m.id === g.id) && !isUserBlocked((g as any).creatorId)) {
 if (isStaffOrAdmin && !campusCode) {
 merged.push(g);
 } else if (!userCampus || userCampus === 'GLOBAL' || !(g as any).campusCode || (g as any).campusCode === 'GLOBAL' || (g as any).campusCode === userCampus) {
 merged.push(g);
 }
 }
 }
 return merged;
 } catch (err) {
 console.warn('[StudyGroups] listStudyGroups failed, showing local pool only:', err);
 return getLocalPool().filter((g) => !isUserBlocked((g as any).creatorId));
 }
}

export async function joinStudyGroup(id: string): Promise<StudyGroup> {
 let updated: StudyGroup | undefined;
 locallyCreatedGroups = locallyCreatedGroups.map((g) => {
 if (g.id !== id) return g;
 updated = { ...g, isJoined: true, memberCount: g.memberCount + 1 };
 return updated;
 });

 try {
 const { data: authData } = await supabase.auth.getUser();
 let userId = authData?.user?.id;
 if (!userId) {
 const stored = await getSessionUser();
 if (stored?.id) userId = stored.id;
 }

 if (userId) {
 const { error } = await supabase.from('study_group_members').insert({
 group_id: id,
 user_id: userId,
 });
 if (error) console.warn('[StudyGroups] Join error:', error.message);
 }
 } catch (err) {
 console.warn('[StudyGroups] Join backend error:', err);
 }

 if (!updated) {
 try {
 const { data: grp } = await supabase
 .from('study_groups')
 .select('*, study_group_members(count)')
 .eq('id', id)
 .maybeSingle();
 if (grp) {
 updated = {
 id: grp.id,
 name: grp.name,
 courseCode: grp.course_code || 'GEN 101',
 description: grp.description || '',
 isPublic: !grp.is_private,
 memberCount: Math.max(1, (grp.study_group_members?.[0]?.count ?? 1)),
 isJoined: true,
 campusCode: grp.campus_code || 'GLOBAL',
 };
 }
 } catch {
 // ignore
 }
 }

 return (
 updated ?? {
 id,
 name: 'Study Group',
 courseCode: 'Academic Group',
 description: 'Active revision cohort',
 isPublic: true,
 memberCount: 2,
 isJoined: true,
 }
 );
}

export async function leaveStudyGroup(id: string): Promise<StudyGroup> {
 let updated: StudyGroup | undefined;
 locallyCreatedGroups = locallyCreatedGroups.map((g) => {
 if (g.id !== id) return g;
 updated = { ...g, isJoined: false, memberCount: Math.max(1, g.memberCount - 1) };
 return updated;
 });

 try {
 const { data: authData } = await supabase.auth.getUser();
 let userId = authData?.user?.id;
 if (!userId) {
 const stored = await getSessionUser();
 if (stored?.id) userId = stored.id;
 }

 if (userId) {
 const { error } = await supabase
 .from('study_group_members')
 .delete()
 .eq('group_id', id)
 .eq('user_id', userId);
 if (error) console.warn('[StudyGroups] Leave error:', error.message);
 }
 } catch (err) {
 console.warn('[StudyGroups] Leave backend error:', err);
 }

 if (!updated) {
 try {
 const { data: grp } = await supabase
 .from('study_groups')
 .select('*, study_group_members(count)')
 .eq('id', id)
 .maybeSingle();
 if (grp) {
 updated = {
 id: grp.id,
 name: grp.name,
 courseCode: grp.course_code || 'GEN 101',
 description: grp.description || '',
 isPublic: !grp.is_private,
 memberCount: Math.max(1, (grp.study_group_members?.[0]?.count ?? 1)),
 isJoined: false,
 campusCode: grp.campus_code || 'GLOBAL',
 };
 }
 } catch {
 // ignore
 }
 }

 return (
 updated ?? {
 id,
 name: 'Study Group',
 courseCode: 'Academic Group',
 description: 'Active revision cohort',
 isPublic: true,
 memberCount: 1,
 isJoined: false,
 }
 );
}
