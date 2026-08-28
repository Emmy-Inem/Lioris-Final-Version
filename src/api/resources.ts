import { Resource } from './types';
import { mockResources } from './mockData';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { isUserBlocked } from './connections';
import { generateUUID } from '../utils/uuid';
import { isMockDataVisible } from './mockDataSettings';

const SEED_RESOURCES: Resource[] = [
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

// Resources this session has *successfully* written to Supabase, kept
// here only so they render instantly before the next refetch (and so
// approve/reject/update/delete on this session's own uploads can find
// them locally). Never seeded with fixtures - those only come from
// getSeedResources() below, and only while the admin's "Mock Data
// Visibility" toggle is on.
let locallyCreatedResources: Resource[] = [];

function getSeedResources(): Resource[] {
 return isMockDataVisible() ? SEED_RESOURCES : [];
}

export interface ResourcesQuery {
 q?: string;
 category?: Resource['category'];
 department?: string;
 approvalStatus?: 'pending' | 'approved' | 'rejected' | 'all';
 campusCode?: string;
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
 const { data: authData } = await supabase.auth.getUser();
 let userCampus = (query as any).campusCode;
 let userRole = 'student';
 if (authData?.user?.id) {
 const { data: prof } = await supabase.from('profiles').select('campus_code, role').eq('id', authData.user.id).maybeSingle();
 if (prof?.campus_code && !userCampus) userCampus = prof.campus_code;
 if (prof?.role) userRole = prof.role;
 }

 const isStaffOrAdmin = userRole === 'admin' || userRole === 'staff';

 const { data, error } = await supabase.from('resources').select('*').order('created_at', { ascending: false });
 if (error) throw error;

 const dbResources: Resource[] = (data ?? [])
 .filter((row: any) => !isUserBlocked(row.uploader_id))
 .filter((row: any) => {
 if (isStaffOrAdmin && !(query as any).campusCode) return true;
 return !userCampus || userCampus === 'GLOBAL' || !row.campus_code || row.campus_code === 'GLOBAL' || row.campus_code === userCampus;
 })
 .map((row: any) => ({
 id: row.id,
 title: row.title,
 courseCode: row.course_code || 'GEN 101',
 department: row.course_title || 'Academic Repository',
 category: mapResourceTypeToCategory(row.resource_type),
 description: row.description || '',
 fileSize: row.file_size_bytes ? `${(row.file_size_bytes / (1024 * 1024)).toFixed(1)} MB` : '2.5 MB',
 fileUrl: row.file_url || null,
 authorName: 'Verified Student',
 authorId: row.uploader_id,
 authorRole: 'student',
 likesCount: row.upvotes_count || 0,
 downloadsCount: row.downloads_count || 0,
 createdAt: row.created_at,
 approvalStatus: row.is_approved ? 'approved' : 'pending',
 fileType: row.file_mime_type?.includes('zip') ? 'ZIP' : 'PDF',
 campusCode: row.campus_code || 'GLOBAL',
 }));

 // Merge unique - local pool only ever contributes this session's own
 // just-created resources (always) plus seed fixtures (only when the
 // admin mock-data toggle is on).
 const pool = [...locallyCreatedResources, ...getSeedResources()];
 const merged = [...dbResources];
 for (const r of pool) {
 if (!merged.some((m) => m.id === r.id) && !isUserBlocked(r.authorId)) {
 if (isStaffOrAdmin && !(query as any).campusCode) {
 merged.push(r);
 } else if (!userCampus || userCampus === 'GLOBAL' || !(r as any).campusCode || (r as any).campusCode === 'GLOBAL' || (r as any).campusCode === userCampus) {
 merged.push(r);
 }
 }
 }
 return filterResources(merged, query);
 } catch (err) {
 console.warn('[Resources] listResources failed, showing local pool only:', err);
 return filterResources([...locallyCreatedResources, ...getSeedResources()], query);
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
 fileSize: payload.fileSize || '3.4 MB',
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
 const { data: profile } = await supabase
 .from('profiles')
 .select('campus_code')
 .eq('id', uploaderId)
 .maybeSingle();
 const campusCode = profile?.campus_code || 'GLOBAL';

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

 try {
 // If binary file blob is provided, upload directly to Supabase Storage
 if (fileBlob) {
 await supabase.storage.from('resources').upload(storagePath, fileBlob, {
 contentType: payload.fileMimeType || mimeType,
 upsert: true,
 });
 }
 } catch (err) {
 console.warn('[Resources] Storage upload error:', err);
 throw new Error('Could not upload your file. Please try again.');
 }

 const { data: publicUrlData } = supabase.storage.from('resources').getPublicUrl(storagePath);
 const fileUrl = publicUrlData?.publicUrl || `https://fdtnbluslkabwsmspbem.supabase.co/storage/v1/object/public/resources/${storagePath}`;
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
 file_mime_type: payload.fileMimeType || mimeType,
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

 const seedMatch = getSeedResources().find((r) => r.id === id);
 return { ...(seedMatch as Resource), id, ...payload };
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
