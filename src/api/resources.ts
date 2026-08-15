import { api } from './client';
import { Resource } from './types';
import { mockResources } from './mockData';
import { withMockFallback } from './withMockFallback';
import { FALL_BACK_TO_MOCKS } from './config';

let resourcesState = [...mockResources];

export interface ResourcesQuery {
  q?: string;
  category?: Resource['category'];
  department?: string;
}

function filterMockResources(query: ResourcesQuery): Resource[] {
  let results = [...resourcesState];
  if (query.category) results = results.filter((r) => r.category === query.category);
  if (query.department) results = results.filter((r) => r.department === query.department);
  if (query.q) {
    const q = query.q.toLowerCase();
    results = results.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.courseCode.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q),
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

export interface CreateResourcePayload {
  title: string;
  courseCode: string;
  description: string;
  category: Resource['category'];
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
      department: 'General',
      courseCode: payload.courseCode,
      fileSize: '\u2014',
      authorName: 'You',
      likesCount: 0,
      downloadsCount: 0,
      createdAt: new Date().toISOString(),
    };
    resourcesState = [created, ...resourcesState];
    return created;
  }
}
