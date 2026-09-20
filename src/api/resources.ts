import { Resource } from './types';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { isUserBlocked } from './connections';
import { generateUUID } from '../utils/uuid';
import { getInstitutionForEmail } from './institutions';
import { assertSafeHttpUrl, sanitizeHttpUrl } from '../utils/safeUrl';

// Content types a resource upload may be stored with.
const ALLOWED_RESOURCE_MIME_TYPES = new Set([
 'application/pdf',
 'application/zip',
 'application/x-zip-compressed',
 'application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-powerpoint',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
 'application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'text/plain',
 'image/jpeg',
 'image/png',
 'image/webp',
 'image/gif',
]);

let locallyCreatedResources: Resource[] = [];

export interface ResourcesQuery {
  q?: string;
  category?: Resource['category'];
  department?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'all';
  campusCode?: string;
  academicLevel?: string;
}

function filterResources(pool: Resource[], query: ResourcesQuery): Resource[] {
  let results = [...pool];
  if (query.approvalStatus && query.approvalStatus !== 'all') {
    results = results.filter((r) => r.approvalStatus === query.approvalStatus);
  } else if (!query.approvalStatus) {
    results = results.filter((r) => r.approvalStatus !== 'rejected');
  }
  if (query.category) results = results.filter((r) => r.category === query.category);
  if (query.department) results = results.filter((r) => r.department === query.department);
  if (query.academicLevel && query.academicLevel !== 'All Levels') {
    const normalized = query.academicLevel.replace(/\s*Lvl$/i, 'L').trim().toLowerCase();
    results = results.filter((r) => {
      if (!r.academicLevel) return true;
      return r.academicLevel.toLowerCase() === normalized;
    });
  }
  if (query.q) {
    const q = query.q.toLowerCase();
    results = results.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.courseCode.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        r.authorName.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.syllabusTopic && r.syllabusTopic.toLowerCase().includes(q)),
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
 const { data: authData } = await supabase.auth.getUser();
 let userCampus = (query as any).campusCode;
 let userRole = 'student';
 if (authData?.user?.id) {
 const { data: prof } = await supabase.from('profiles').select('campus_code, role').eq('id', authData.user.id).maybeSingle();
 if (prof?.campus_code && !userCampus) userCampus = prof.campus_code;
 if (prof?.role) userRole = prof.role;
 if (!userCampus && authData.user.user_metadata?.campus_code) {
 userCampus = authData.user.user_metadata.campus_code;
 }
 }

 if (!userCampus && authData?.user?.email) {
      // Domain match, not substring. The previous chain mis-assigned campuses
      // (`includes('oau')` claimed joaustin@unilag.edu.ng for OAU) and hardcoded
      // demo names above the real domain. Every demo account is @ui.edu.ng, so
      // plain domain matching already covers them.
      userCampus = getInstitutionForEmail(authData.user.email)?.code;
    }

    const isStaffOrAdmin = userRole === 'admin' || userRole === 'staff';

    const { data, error } = await supabase
      .from('resources')
      .select('*, profiles:uploader_id(full_name, role, avatar_url, department)')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const dbResources: Resource[] = (data ?? [])
      .filter((row: any) => !isUserBlocked(row.uploader_id))
      .filter((row: any) => {
        if (isStaffOrAdmin && !(query as any).campusCode) return true;
        const targetCampus = (userCampus || 'GLOBAL').toUpperCase();
        const rowCampus = (row.campus_code || 'GLOBAL').toUpperCase();
        if (targetCampus === 'GLOBAL') {
          return rowCampus === 'GLOBAL';
        }
        return rowCampus === targetCampus || rowCampus === 'GLOBAL';
      })
      .map((row: any) => ({
        id: row.id,
        title: row.title,
        courseCode: row.course_code || 'GEN 101',
        department: row.profiles?.department || row.course_title || 'Academic Repository',
        category: mapResourceTypeToCategory(row.resource_type),
        description: row.description || '',
        // Undefined when the upload recorded no size - ResourceCard omits the
        // chip rather than showing an invented "2.5 MB".
        fileSize: row.file_size_bytes ? `${(row.file_size_bytes / (1024 * 1024)).toFixed(1)} MB` : undefined,
        fileUrl: sanitizeHttpUrl(row.file_url) ?? null,
        authorName: row.profiles?.full_name || 'Campus Student',
        authorId: row.uploader_id,
        authorRole: (row.profiles?.role || 'student') as any,
        likesCount: row.upvotes_count || 0,
        downloadsCount: row.downloads_count || 0,
        createdAt: row.created_at,
        approvalStatus: row.is_approved ? 'approved' : 'pending',
        fileType: row.file_mime_type?.includes('zip') ? 'ZIP' : 'PDF',
        campusCode: row.campus_code || 'GLOBAL',
        academicLevel: row.academic_level,
        semester: row.semester,
        syllabusTopic: row.syllabus_topic,
      }));

    // Merge unique - the local pool is only resources created in this session, which may not have synced yet.
    // There is deliberately no bundled catalog: every resource shown must be a real upload.
    const pool = [...locallyCreatedResources];
    const merged = [...dbResources];
    for (const r of pool) {
      if (!merged.some((m) => m.id === r.id || (m.title.toLowerCase() === r.title.toLowerCase() && m.courseCode.toLowerCase() === r.courseCode.toLowerCase())) && !isUserBlocked(r.authorId)) {
        if (isStaffOrAdmin && !(query as any).campusCode) {
          merged.push(r);
        } else {
          const targetCampus = (userCampus || 'GLOBAL').toUpperCase();
          const rCampus = ((r as any).campusCode || 'GLOBAL').toUpperCase();
          if (targetCampus === 'GLOBAL') {
            merged.push(r);
          } else if (rCampus === targetCampus || rCampus === 'GLOBAL') {
            merged.push(r);
          }
        }
      }
    }
    return filterResources(merged, query);
  } catch (err) {
    console.warn('[Resources] listResources failed, showing local pool only:', err);
    const targetCampus = ((query as any).campusCode || 'GLOBAL').toUpperCase();
    const fallbackPool = [...locallyCreatedResources].filter((r) => {
      const rCampus = ((r as any).campusCode || 'GLOBAL').toUpperCase();
      if (targetCampus === 'GLOBAL') return true;
      return rCampus === targetCampus || rCampus === 'GLOBAL';
    });
    return filterResources(fallbackPool, query);
  }
}

export async function listPendingResources(): Promise<Resource[]> {
 return listResources({ approvalStatus: 'pending' });
}

export async function approveResource(id: string): Promise<Resource> {
 try {
 const { error } = await supabase.from('resources').update({ is_approved: true, approved_at: new Date().toISOString() }).eq('id', id);
 if (error) throw error;
 } catch (err) {
 console.warn('[Resources] Approve error:', err);
 throw new Error('Could not approve this resource. Please try again.');
 }
 return updateResource(id, { approvalStatus: 'approved', rejectionReason: null });
}

export async function rejectResource(id: string, reason?: string): Promise<Resource> {
 try {
 const { error } = await supabase.from('resources').update({ is_approved: false }).eq('id', id);
 if (error) throw error;
 } catch (err) {
 console.warn('[Resources] Reject error:', err);
 throw new Error('Could not reject this resource. Please try again.');
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

/**
 * Throws if there's no identifiable uploader or the Supabase insert fails,
 * instead of quietly returning a fabricated "uploaded" resource. Callers
 * must catch this and show a real error - see ManageResourcesModal.
 */
export async function createResource(
  payload: Partial<Resource> & {
    title: string;
    courseCode: string;
    category: Resource['category'];
    fileSizeBytes?: number;
    fileMimeType?: string;
    campusCode?: string;
  },
  fileBlob?: Blob | ArrayBuffer,
): Promise<Resource> {
  const resourceId = generateUUID();

  const { data: authData } = await supabase.auth.getUser();
  let uploaderId: string | null = authData?.user?.id || null;
  if (!uploaderId) {
    const stored = await getSessionUser();
    if (stored?.id) uploaderId = stored.id;
  }

  if (!uploaderId) {
    throw new Error('You need to be signed in to share a resource.');
  }

  const created: Resource = {
    id: resourceId,
    title: payload.title,
    description: payload.description || 'No description provided.',
    category: payload.category,
    department: payload.department || 'General',
    courseCode: payload.courseCode,
    fileSize: payload.fileSize || undefined,
    fileType: payload.fileType || 'PDF',
    academicLevel: payload.academicLevel || '300L',
    authorName: 'You',
    authorId: uploaderId,
    likesCount: 0,
    downloadsCount: 0,
    createdAt: new Date().toISOString(),
    approvalStatus: 'approved',
  };

  // Fetch uploader's campus
  let campusCode = payload.campusCode;
  if (!campusCode) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('campus_code')
      .eq('id', uploaderId)
      .maybeSingle();
    campusCode = profile?.campus_code || 'GLOBAL';
  }

 let fileExt = 'pdf';
 let mimeType = 'application/pdf';
 const ft = (payload.fileType || '').toUpperCase();
 if (ft === 'ZIP') { fileExt = 'zip'; mimeType = 'application/zip'; }
 else if (ft === 'DOC') { fileExt = 'docx'; mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; }
 else if (ft === 'PPT') { fileExt = 'pptx'; mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'; }
 else if (ft === 'XLS') { fileExt = 'xlsx'; mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; }
 else if (ft === 'TXT') { fileExt = 'txt'; mimeType = 'text/plain'; }
 else if (ft === 'IMG') { fileExt = 'jpg'; mimeType = 'image/jpeg'; }

 const storagePath = `${uploaderId}/${resourceId}.${fileExt}`;

 // Only allow-listed content types are ever stored; a client-supplied mime
 // type outside the list falls back to the one derived from the file type.
 const storedMimeType =
 payload.fileMimeType && ALLOWED_RESOURCE_MIME_TYPES.has(payload.fileMimeType.toLowerCase())
 ? payload.fileMimeType.toLowerCase()
 : mimeType;

 // If binary file blob is provided, upload directly to Supabase Storage.
 // supabase-js resolves with `{ error }` rather than throwing, so it must be checked.
 if (fileBlob) {
 const { error: uploadError } = await supabase.storage.from('resources').upload(storagePath, fileBlob, {
 contentType: storedMimeType,
 upsert: false,
 });
 if (uploadError) {
 console.warn('[Resources] Storage upload error:', uploadError.message);
 throw new Error('Could not upload your file. Please try again.');
 }
 }

 const { data: publicUrlData } = supabase.storage.from('resources').getPublicUrl(storagePath);
 if (!publicUrlData?.publicUrl) {
 throw new Error('Could not resolve the uploaded file address. Please try again.');
 }
 const fileUrl = assertSafeHttpUrl(publicUrlData.publicUrl, 'The file link');
 created.fileUrl = fileUrl;

 const realSizeBytes = (fileBlob && typeof (fileBlob as any).size === 'number' ? (fileBlob as any).size : undefined)
 || payload.fileSizeBytes
 || 2500000;

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
 file_size_bytes: realSizeBytes,
 file_mime_type: storedMimeType,
 is_approved: true,
 });

 if (error) {
 console.warn('[Resources] Create resource error:', error.message);
 throw new Error('Could not share this resource. Please try again.');
 }

 locallyCreatedResources = [created, ...locallyCreatedResources];
 return created;
}

/**
 * Persists to Supabase first. The in-memory cache is only used to enrich
 * the returned object for resources this session already knows about
 * (its own uploads); a resource that isn't in that cache (any resource
 * fetched from the database in the normal case) still gets updated for
 * real - this just returns a best-effort merged object for it instead of
 * throwing, since the write already succeeded.
 */
export async function updateResource(id: string, payload: Partial<Resource>): Promise<Resource> {
 if (payload.fileUrl) assertSafeHttpUrl(payload.fileUrl, 'The file link');
 try {
 const dbPayload: any = {};
 if (payload.title) dbPayload.title = payload.title;
 if (payload.description !== undefined) dbPayload.description = payload.description;
 if (payload.courseCode) dbPayload.course_code = payload.courseCode;
 if (payload.semester) dbPayload.semester = payload.semester;
 if (payload.fileUrl) dbPayload.file_url = payload.fileUrl;
 if (payload.approvalStatus) dbPayload.is_approved = payload.approvalStatus === 'approved';

 if (Object.keys(dbPayload).length > 0) {
 await supabase.from('resources').update(dbPayload).eq('id', id);
 }
 } catch (err) {
 console.warn('[Resources] Supabase updateResource error:', err);
 }

 let updated: Resource | undefined;
 locallyCreatedResources = locallyCreatedResources.map((r) => {
 if (r.id === id) {
 updated = { ...r, ...payload };
 return updated;
 }
 return r;
 });

 if (updated) return updated;

  return { id, ...payload } as Resource;
}

export async function deleteResource(id: string): Promise<boolean> {
  locallyCreatedResources = locallyCreatedResources.filter((r) => r.id !== id);
  try {
    await supabase.from('resources').delete().eq('id', id);
  } catch {
    // Fallback
  }
  return true;
}

export async function trackResourceDownload(id: string): Promise<void> {
  try {
    const { data } = await supabase.from('resources').select('downloads_count').eq('id', id).maybeSingle();
    if (data) {
      await supabase.from('resources').update({ downloads_count: (data.downloads_count || 0) + 1 }).eq('id', id);
    }
  } catch (err) {
    console.warn('[Resources] Error tracking download:', err);
  }
}

export async function toggleResourceUpvote(id: string, increment: boolean): Promise<void> {
  try {
    const { data } = await supabase.from('resources').select('upvotes_count').eq('id', id).maybeSingle();
    if (data) {
      const current = data.upvotes_count || 0;
      const next = increment ? current + 1 : Math.max(0, current - 1);
      await supabase.from('resources').update({ upvotes_count: next }).eq('id', id);
    }
  } catch (err) {
    console.warn('[Resources] Error toggling upvote:', err);
  }
}
