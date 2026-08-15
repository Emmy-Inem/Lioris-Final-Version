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
      const { error } = await supabase.from('study_groups').insert({
        id: groupId,
        creator_id: creatorId,
        name: payload.name,
        course_code: payload.courseCode,
        description: payload.description,
        is_public: payload.isPublic,
        member_count: 1,
      });
      if (error) {
        console.warn('[StudyGroups] Create group error:', error.message);
      } else {
        await supabase.from('study_group_members').insert({
          group_id: groupId,
          user_id: creatorId,
          role: 'admin',
        });
      }
    }
  } catch (err) {
    console.warn('[StudyGroups] Backend create error:', err);
  }

  return created;
}

export async function listStudyGroups(): Promise<StudyGroup[]> {
  try {
    const { data, error } = await supabase
      .from('study_groups')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      const dbGroups: StudyGroup[] = data.map((row: any) => ({
        id: row.id,
        name: row.name,
        courseCode: row.course_code || 'CSC 201',
        description: row.description || '',
        isPublic: row.is_public !== false,
        memberCount: row.member_count || 1,
        isJoined: false,
        lastMessageAt: row.updated_at,
      }));
      // Merge unique
      const merged = [...dbGroups];
      for (const g of studyGroupsState) {
        if (!merged.some((m) => m.id === g.id)) {
          merged.push(g);
        }
      }
      studyGroupsState = merged;
      return merged;
    }
  } catch {
    // Session fallback
  }
  return studyGroupsState;
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
        role: 'member',
      });
      if (error) console.warn('[StudyGroups] Join error:', error.message);
    }
  } catch (err) {
    console.warn('[StudyGroups] Join failure:', err);
  }

  return updated || studyGroupsState[0];
}

export async function leaveStudyGroup(id: string): Promise<void> {
  studyGroupsState = studyGroupsState.map((g) => {
    if (g.id !== id) return g;
    return { ...g, isJoined: false, memberCount: Math.max(1, g.memberCount - 1) };
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
    console.warn('[StudyGroups] Leave failure:', err);
  }
}

