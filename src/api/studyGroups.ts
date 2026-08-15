import { supabase } from './supabase';
import { StudyGroup } from './types';
import { mockStudyGroups } from './mockData';

let studyGroupsState: StudyGroup[] = [...mockStudyGroups];

export interface CreateStudyGroupPayload {
  name: string;
  courseCode: string;
  description: string;
  isPublic: boolean;
}

export async function createStudyGroup(payload: CreateStudyGroupPayload): Promise<StudyGroup> {
  const groupId = `group-${Date.now()}`;
  const created: StudyGroup = {
    id: groupId,
    memberCount: 1,
    isJoined: true,
    lastMessageAt: new Date().toISOString(),
    ...payload,
  };

  studyGroupsState = [created, ...studyGroupsState];

  try {
    await supabase.from('study_groups').insert({
      id: groupId,
      name: payload.name,
      course_code: payload.courseCode,
      description: payload.description,
      is_public: payload.isPublic,
      member_count: 1,
    });
  } catch {
    // Session fallback
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
    await supabase.from('study_group_members').insert({
      group_id: id,
      user_id: 'me',
      role: 'member',
    });
  } catch {
    // Fallback
  }

  return updated || studyGroupsState[0];
}
