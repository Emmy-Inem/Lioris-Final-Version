import { api } from'./client';
import { Mentorship, MentorProfile } from'./types';
import { mockMentorships, mockMentorProfiles } from'./mockData';
import { withMockFallback } from'./withMockFallback';
import { FALL_BACK_TO_MOCKS } from'./config';
import { createNotification } from'./notifications';

// Mutable in-memory copy so accept/decline visibly updates status
// within a session, without needing a real backend.
let mentorshipsState = [...mockMentorships];

export async function listMentorships(): Promise<Mentorship[]> {
  return withMockFallback(async () => {
    const { data } = await api.get<{ items: Mentorship[] }>('/mentorships');
    return data.items;
  }, mentorshipsState);
}

export interface MentorSearchQuery {
  focusArea?: string;
  q?: string;
}

// Ported from MentorshipScreen's `filteredProfiles` logic
// (DirectoriesAndMarket.kt): matches name/bio/expertise/company text,
// plus an expertise-tag filter ("All Fields" = no filter).
function filterMockMentors(query: MentorSearchQuery): MentorProfile[] {
  let results = [...mockMentorProfiles];

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
  return withMockFallback(async () => {
    const { data } = await api.get('/mentorships/mentors', { params: query });
    return data.items as MentorProfile[];
  }, filterMockMentors(query));
}

export async function requestMentorship(
  mentorId: string,
  focusArea?: string,
): Promise<Mentorship> {
  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.post<Mentorship>('/mentorships', { mentorId, focusArea });
    return data;
  }
  try {
    const { data } = await api.post<Mentorship>('/mentorships', { mentorId, focusArea });
    return data;
  } catch {
    const mentor = mockMentorProfiles.find((m) => m.id === mentorId);
    const created: Mentorship = {
      id: `mock-ment-${mentorId}-${Date.now()}`,
      studentId: 'me',
      mentorId,
      mentorName: mentor?.fullName ?? 'Verified Mentor',
      status: 'pending',
      focusArea,
    };
    mentorshipsState = [...mentorshipsState, created];
    return created;
  }
}

export async function respondToMentorshipRequest(
  mentorshipId: string,
  action: 'accept' | 'decline',
): Promise<Mentorship> {
  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.patch<Mentorship>(`/mentorships/${mentorshipId}`, { action });
    return data;
  }
  try {
    const { data } = await api.patch<Mentorship>(`/mentorships/${mentorshipId}`, { action });
    return data;
  } catch {
    const newStatus = action === 'accept' ? 'active' : 'declined';
    let updated: Mentorship | undefined;
    mentorshipsState = mentorshipsState.map((m) => {
      if (m.id !== mentorshipId) return m;
      updated = { ...m, status: newStatus };
      return updated;
    });
    createNotification({
      type: 'system',
      title: action === 'accept' ? 'Mentorship request accepted' : 'Mentorship request declined',
      body:
        action === 'accept'
          ? `${updated?.mentorName ?? 'Your mentor'} accepted your mentorship request — say hello!`
          : `${updated?.mentorName ?? 'The mentor'} wasn't able to take on a new mentee right now.`,
    });
    return (
      updated ?? {
        id: mentorshipId,
        studentId: 'unknown',
        mentorId: 'me',
        mentorName: 'You',
        status: newStatus,
      }
    );
  }
}
