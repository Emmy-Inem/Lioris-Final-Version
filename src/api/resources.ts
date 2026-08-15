import { api } from './client';
import { Resource } from './types';
import { mockResources } from './mockData';
import { withMockFallback } from './withMockFallback';
import { FALL_BACK_TO_MOCKS } from './config';

const INITIAL_RESOURCES: Resource[] = [
  ...mockResources.map((r) => ({ ...r, approvalStatus: 'approved' as const })),
  {
    id: 'res-sub-1',
    title: 'CSC 415 Distributed Systems Midterm Review & Solutions (2024)',
    courseCode: 'CSC 415',
    department: 'Computer Science & AI',
    category: 'Past Questions',
    description: 'Detailed past question breakdown with concurrency proofs, Byzantine fault tolerance diagrams, and consensus notes.',
    fileSize: '4.2 MB',
    authorName: 'Chioma Okonkwo',
    authorId: 'user-chioma',
    authorRole: 'student',
    likesCount: 0,
    downloadsCount: 0,
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    approvalStatus: 'pending',
    fileType: 'PDF',
    semester: 'Harmattan / First',
    academicLevel: '400L',
    syllabusTopic: 'Distributed Consensus & Raft',
  },
  {
    id: 'res-sub-2',
    title: 'EEE 305 Signal Processing Formula Sheet & Matlab Laboratory Scripts',
    courseCode: 'EEE 305',
    department: 'Electrical Engineering',
    category: 'Notes',
    description: 'Fourier transform summary, Z-transforms, and Matlab frequency filter design templates.',
    fileSize: '6.8 MB',
    authorName: 'Adekunle Gold',
    authorId: 'user-adekunle',
    authorRole: 'student',
    likesCount: 0,
    downloadsCount: 0,
    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    approvalStatus: 'pending',
    fileType: 'ZIP',
    semester: 'Rain / Second',
    academicLevel: '300L',
    syllabusTopic: 'Fast Fourier Transform & Filter Banks',
  },
];

let resourcesState: Resource[] = [...INITIAL_RESOURCES];

export interface ResourcesQuery {
  q?: string;
  category?: Resource['category'];
  department?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'all';
}

function filterMockResources(query: ResourcesQuery): Resource[] {
  let results = [...resourcesState];
  if (query.approvalStatus && query.approvalStatus !== 'all') {
    results = results.filter((r) => r.approvalStatus === query.approvalStatus);
  } else if (!query.approvalStatus) {
    // Default to approved for public library lists
    results = results.filter((r) => r.approvalStatus !== 'rejected');
  }
  if (query.category) results = results.filter((r) => r.category === query.category);
  if (query.department) results = results.filter((r) => r.department === query.department);
  if (query.q) {
    const q = query.q.toLowerCase();
    results = results.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.courseCode.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        r.authorName.toLowerCase().includes(q),
    );
  }
  return results;
}

export async function listResources(query: ResourcesQuery = {}): Promise<Resource[]> {
  return withMockFallback(async () => {
    const { data } = await api.get<{ items: Resource[] }>('/resources', { params: query });
    return data.items;
  }, filterMockResources(query));
}

export async function listPendingResources(): Promise<Resource[]> {
  return listResources({ approvalStatus: 'pending' });
}

export async function approveResource(id: string): Promise<Resource> {
  return updateResource(id, { approvalStatus: 'approved', rejectionReason: null });
}

export async function rejectResource(id: string, reason?: string): Promise<Resource> {
  return updateResource(id, { approvalStatus: 'rejected', rejectionReason: reason || 'File did not meet quality or syllabus standards.' });
}

export interface CreateResourcePayload {
  title: string;
  courseCode: string;
  description: string;
  category: Resource['category'];
  department?: string;
  fileSize?: string;
  fileType?: Resource['fileType'];
  academicLevel?: Resource['academicLevel'];
}

// Backs the "Share Academic File" upload flow (ShareAcademicFileModal).
export async function createResource(payload: CreateResourcePayload): Promise<Resource> {
  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.post<Resource>('/resources', payload);
    return data;
  }
  try {
    const { data } = await api.post<Resource>('/resources', payload);
    return data;
  } catch {
    const created: Resource = {
      id: `mock-resource-${Date.now()}`,
      title: payload.title,
      description: payload.description || 'No description provided.',
      category: payload.category,
      department: payload.department || 'General',
      courseCode: payload.courseCode,
      fileSize: payload.fileSize || '3.4 MB',
      fileType: payload.fileType || 'PDF',
      academicLevel: payload.academicLevel || '300L',
      authorName: 'You',
      likesCount: 0,
      downloadsCount: 0,
      createdAt: new Date().toISOString(),
      approvalStatus: 'approved',
    };
    resourcesState = [created, ...resourcesState];
    return created;
  }
}

export async function updateResource(id: string, payload: Partial<Resource>): Promise<Resource> {
  let updated: Resource | undefined;
  resourcesState = resourcesState.map((r) => {
    if (r.id === id) {
      updated = { ...r, ...payload };
      return updated;
    }
    return r;
  });
  if (!updated) throw new Error('Resource not found');
  return updated;
}

export async function deleteResource(id: string): Promise<boolean> {
  resourcesState = resourcesState.filter((r) => r.id !== id);
  return true;
}
