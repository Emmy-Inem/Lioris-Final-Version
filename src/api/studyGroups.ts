import { supabase } from './supabase';
import { StudyGroup } from './types';
import { mockStudyGroups } from './mockData';
import { getSessionUser } from '../auth/tokenStorage';
import { generateUUID } from '../utils/uuid';

let studyGroupsState: StudyGroup[] = [...mockStudyGroups];

export interface CreateStudyGroupPayload {
  name: string;
  courseCode: string;
  description: string;
  isPublic: boolean;
  campusCode?: string;
}

export async function createStudyGroup(payload: CreateStudyGroupPayload): Promise<StudyGroup> {
  const groupId = generateUUID();
  const created: StudyGroup = {
    id: groupId,
    memberCount: 1,
    isJoined: true,
    lastMessageAt: new Date().toISOString(),
    ...payload,
  };

  studyGroupsState = [created, ...studyGroupsState];

  try {
    const { data: authData } = await supabase.auth.getUser();
    let creatorId: string | null = authData?.user?.id || null;
    if (!creatorId) {
      const stored = await getSessionUser();
      if (stored?.id) creatorId = stored.id;
    }

    if (creatorId) {
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
      created.campusCode = campusCode;

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
      } else {
        await supabase.from('study_group_members').insert({
          group_id: groupId,
          user_id: creatorId,
        });
      }
    }
  } catch (err) {
    console.warn('[StudyGroups] Backend create error:', err);
  }

  return created;
}

import { isUserBlocked } from './connections';

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

    if (!error && data && data.length > 0) {
      const dbGroups: StudyGroup[] = data
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

      // Merge unique
      const merged = [...dbGroups];
      for (const g of studyGroupsState) {
        if (!merged.some((m) => m.id === g.id) && !isUserBlocked((g as any).creatorId)) {
          if (isStaffOrAdmin && !campusCode) {
            merged.push(g);
          } else if (!userCampus || userCampus === 'GLOBAL' || !(g as any).campusCode || (g as any).campusCode === 'GLOBAL' || (g as any).campusCode === userCampus) {
            merged.push(g);
          }
        }
      }
      studyGroupsState = merged;
      return merged;
    }
  } catch {
    // Session fallback
  }
  return studyGroupsState.filter((g) => !isUserBlocked((g as any).creatorId));
}

export async function joinStudyGroup(id: string): Promise<StudyGroup> {
  let updated: StudyGroup | undefined;
  studyGroupsState = studyGroupsState.map((g) => {
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

  return (
    updated ?? {
      id,
      name: 'Campus Study Squad',
      courseCode: 'CSC 301',
      description: 'Active revision cohort',
      isPublic: true,
      memberCount: 2,
      isJoined: true,
    }
  );
}

export async function leaveStudyGroup(id: string): Promise<StudyGroup> {
  let updated: StudyGroup | undefined;
  studyGroupsState = studyGroupsState.map((g) => {
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

  return (
    updated ?? {
      id,
      name: 'Campus Study Squad',
      courseCode: 'CSC 301',
      description: 'Active revision cohort',
      isPublic: true,
      memberCount: 1,
      isJoined: false,
    }
  );
}
