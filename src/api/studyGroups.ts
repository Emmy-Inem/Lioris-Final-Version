import { api } from './client';
import { StudyGroup } from './types';
import { mockStudyGroups } from './mockData';
import { withMockFallback } from './withMockFallback';
import { FALL_BACK_TO_MOCKS } from './config';

let studyGroupsState = [...mockStudyGroups];

export interface CreateStudyGroupPayload {
  name: string;
  courseCode: string;
  description: string;
  isPublic: boolean;
}

// `StudyGroup.isPublic` implies these are student-created (like a
// public/private server), but there was no way to create one at all —
// same gap shape as Marketplace's missing "Sell an item" flow.
export async function createStudyGroup(payload: CreateStudyGroupPayload): Promise<StudyGroup> {
  const created: StudyGroup = {
    id: `mock-group-${Date.now()}`,
    memberCount: 1,
    isJoined: true,
    lastMessageAt: null,
    ...payload,
  };

  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.post<StudyGroup>('/study-groups', payload);
    return data;
  }
  try {
    const { data } = await api.post<StudyGroup>('/study-groups', payload);
    studyGroupsState = [data, ...studyGroupsState];
    return data;
  } catch {
    studyGroupsState = [created, ...studyGroupsState];
    return created;
  }
}

export async function listStudyGroups(): Promise<StudyGroup[]> {
  return withMockFallback(async () => {
    const { data } = await api.get<{ items: StudyGroup[] }>('/study-groups');
    return data.items;
  }, studyGroupsState);
}

export async function joinStudyGroup(id: string): Promise<StudyGroup> {
  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.post<StudyGroup>(`/study-groups/${id}/join`);
    return data;
  }
  try {
    const { data } = await api.post<StudyGroup>(`/study-groups/${id}/join`);
    return data;
  } catch {
    let updated: StudyGroup | undefined;
    studyGroupsState = studyGroupsState.map((g) => {
      if (g.id !== id) return g;
      updated = { ...g, isJoined: true, memberCount: g.memberCount + 1 };
      return updated;
    });
    return updated!;
  }
}
