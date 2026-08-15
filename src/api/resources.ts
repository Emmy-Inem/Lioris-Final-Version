import { api } from './client';
import { Resource } from './types';
import { mockResources } from './mockData';
import { withMockFallback } from './withMockFallback';
import { FALL_BACK_TO_MOCKS } from './config';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';

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

function mapResourceTypeToCategory(type?: string): Resource['category'] {
  if (type === 'past_question') return 'Past Questions';
  if (type === 'project' || type === 'summary') return 'Projects';
  return 'Notes';
}

function mapCategoryToResourceType(category?: Resource['category']): string {
  if (category === 'Past Questions') return 'past_question';
  if (category === 'Projects') return 'summary';
  return 'lecture_note';
}

export async function listResources(query: ResourcesQuery = {}): Promise<Resource[]> {
  try {
    const { data, error } = await supabase.from('resources').select('*').order('created_at', { ascending: false });
    if (!error && data && data.length > 0) {
      const dbResources: Resource[] = data.map((row: any) => ({
        id: row.id,
        title: row.title,
        courseCode: row.course_code || 'GEN 101',
        department: row.course_title || 'Academic Repository',
        category: mapResourceTypeToCategory(row.resource_type),
        description: row.description || '',
        fileSize: row.file_size_bytes ? `${(row.file_size_bytes / (1024 * 1024)).toFixed(1)} MB` : '2.5 MB',
        authorName: 'Verified Student',
        authorId: row.uploader_id,
        authorRole: 'student',
        likesCount: row.upvotes_count || 0,
        downloadsCount: row.downloads_count || 0,
        createdAt: row.created_at,
        approvalStatus: row.is_approved ? 'approved' : 'pending',
        fileType: row.file_mime_type?.includes('zip') ? 'ZIP' : 'PDF',
      }));
      // Merge unique
      const merged = [...dbResources];
      for (const r of resourcesState) {
        if (!merged.some((m) => m.id === r.id)) {
          merged.push(r);
        }
      }
      resourcesState = merged;
      return filterMockResources(query);
    }
  } catch {
    // Fallback
  }
  return filterMockResources(query);
}

export async function listPendingResources(): Promise<Resource[]> {
  return listResources({ approvalStatus: 'pending' });
}

export async function approveResource(id: string): Promise<Resource> {
  try {
    await supabase.from('resources').update({ is_approved: true, approved_at: new Date().toISOString() }).eq('id', id);
  } catch (err) {
    console.warn('[Resources] Approve error:', err);
  }
  return updateResource(id, { approvalStatus: 'approved', rejectionReason: null });
}

export async function rejectResource(id: string, reason?: string): Promise<Resource> {
  try {
    await supabase.from('resources').update({ is_approved: false }).eq('id', id);
  } catch (err) {
    console.warn('[Resources] Reject error:', err);
  }
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

import { generateUUID } from '../utils/uuid';

export async function createResource(
  payload: CreateResourcePayload,
  fileBlob?: Blob | ArrayBuffer,
): Promise<Resource> {
  const resourceId = generateUUID();
  const created: Resource = {
    id: resourceId,
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

  try {
    const { data: authData } = await supabase.auth.getUser();
    let uploaderId: string | null = authData?.user?.id || null;
    let campusCode = 'GLOBAL';

    if (!uploaderId) {
      const stored = await getSessionUser();
      if (stored?.id) uploaderId = stored.id;
    }

    if (uploaderId) {
      // Fetch uploader's campus
      const { data: profile } = await supabase
        .from('profiles')
        .select('campus_code')
        .eq('id', uploaderId)
        .maybeSingle();

      if (profile?.campus_code) {
        campusCode = profile.campus_code;
      }

      const fileExt = payload.fileType === 'ZIP' ? 'zip' : 'pdf';
      const storagePath = `${uploaderId}/${resourceId}.${fileExt}`;

      // If binary file blob is provided, upload directly to Supabase Storage
      if (fileBlob) {
        await supabase.storage.from('resources').upload(storagePath, fileBlob, {
          contentType: payload.fileType === 'ZIP' ? 'application/zip' : 'application/pdf',
          upsert: true,
        });
      }

      const { data: publicUrlData } = supabase.storage.from('resources').getPublicUrl(storagePath);
      const fileUrl = publicUrlData?.publicUrl || `https://fdtnbluslkabwsmspbem.supabase.co/storage/v1/object/public/resources/${storagePath}`;

      created.fileUrl = fileUrl;

      const { error } = await supabase.from('resources').insert({
        id: resourceId,
        uploader_id: uploaderId,
        campus_code: campusCode,
        course_code: payload.courseCode,
        course_title: payload.department || payload.title,
        title: payload.title,
        description: payload.description || '',
        resource_type: mapCategoryToResourceType(payload.category),
        file_url: fileUrl,
        file_size_bytes: 3565158,
        file_mime_type: payload.fileType === 'ZIP' ? 'application/zip' : 'application/pdf',
        is_approved: true,
      });
      if (error) {
        console.warn('[Resources] Create resource Supabase error:', error.message);
      }
    }
  } catch (err) {
    console.warn('[Resources] Create resource error:', err);
  }

  return created;
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

  try {
    const dbPayload: any = {};
    if (payload.title) dbPayload.title = payload.title;
    if (payload.description !== undefined) dbPayload.description = payload.description;
    if (payload.courseCode) dbPayload.course_code = payload.courseCode;
    if (payload.semester) dbPayload.semester = payload.semester;
    if (payload.fileUrl) dbPayload.file_url = payload.fileUrl;

    if (Object.keys(dbPayload).length > 0) {
      await supabase.from('resources').update(dbPayload).eq('id', id);
    }
  } catch (err) {
    console.warn('[Resources] Supabase updateResource error:', err);
  }

  return updated;
}

export async function deleteResource(id: string): Promise<boolean> {
  resourcesState = resourcesState.filter((r) => r.id !== id);
  try {
    await supabase.from('resources').delete().eq('id', id);
  } catch {
    // Fallback
  }
  return true;
}

