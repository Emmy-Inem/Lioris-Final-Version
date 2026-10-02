import { Resource } from './types';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { isUserBlocked, isUserMuted } from './connections';
import { assertWithinStorageQuota } from './platformSettings';
import { generateUUID } from '../utils/uuid';
import { getInstitutionForEmail } from './institutions';
import { assertSafeHttpUrl, sanitizeHttpUrl } from '../utils/safeUrl';
import { assertUuid } from '../utils/postgrest';

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
  /** 0-based page of results past the first. Defaults to 0 (existing behaviour, unchanged for callers that don't pass it). */
  page?: number;
  /** Rows per page. Defaults to 100 (the previous hardcoded `.limit(100)`). */
  pageSize?: number;
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

/**
 * Shared row->Resource mapping, used by listResources/listMyResources so the
 * approval/rejection shape never drifts between the general browse feed and
 * a student's own "My Uploads" view.
 */
function mapResourceRow(row: any): Resource {
  return {
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
    // A row carrying a rejection_reason was explicitly rejected, not merely
    // "not yet approved" - without this, a rejected upload and a pending one
    // were indistinguishable to the student who submitted it.
    approvalStatus: row.rejection_reason ? 'rejected' : row.is_approved ? 'approved' : 'pending',
    rejectionReason: row.rejection_reason ?? null,
    fileType: row.file_mime_type?.includes('zip') ? 'ZIP' : 'PDF',
    campusCode: row.campus_code || 'GLOBAL',
    academicLevel: row.academic_level,
    semester: row.semester,
    syllabusTopic: row.syllabus_topic,
  } as Resource;
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

    const pageSize = query.pageSize ?? 100;
    const page = Math.max(0, query.page ?? 0);
    const offset = page * pageSize;

    const { data, error } = await supabase
      .from('resources')
      .select('*, profiles:uploader_id(full_name, role, avatar_url, department)')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;

    const dbResources: Resource[] = (data ?? [])
      .filter((row: any) => !isUserBlocked(row.uploader_id) && !isUserMuted(row.uploader_id))
      .filter((row: any) => {
        if (isStaffOrAdmin && !(query as any).campusCode) return true;
        const targetCampus = (userCampus || 'GLOBAL').toUpperCase();
        const rowCampus = (row.campus_code || 'GLOBAL').toUpperCase();
        if (targetCampus === 'GLOBAL') {
          return rowCampus === 'GLOBAL';
        }
        return rowCampus === targetCampus || rowCampus === 'GLOBAL';
      })
      .map(mapResourceRow);

    // Merge unique - local session creations not yet reflected by the query above.
    // Only on the first page: these are always the newest resources, so they would
    // otherwise be re-shown (duplicated) at the top of every later page too.
    const pool = page === 0 ? [...locallyCreatedResources] : [];
    const merged = [...dbResources];
    for (const r of pool) {
      if (!merged.some((m) => m.id === r.id || (m.title.toLowerCase() === r.title.toLowerCase() && m.courseCode.toLowerCase() === r.courseCode.toLowerCase())) && !isUserBlocked(r.authorId) && !isUserMuted(r.authorId)) {
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
    console.warn('[Resources] listResources failed, showing local pool:', err);
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
 const cleanReason = reason || 'File did not meet quality or syllabus standards.';
 const updated = await updateResource(id, { approvalStatus: 'rejected', rejectionReason: cleanReason });

 // Tell the uploader why - previously the reason was written to the
 // database (once updateResource's mapping above actually persists it) but
 // never surfaced: no notification, and no "my uploads" view to see it in.
 // Best-effort: the rejection itself must not fail just because this did.
 try {
 const { data: row } = await supabase.from('resources').select('uploader_id, title').eq('id', id).maybeSingle();
 if (row?.uploader_id) {
 const { createNotification } = await import('./notifications');
 await createNotification({
 recipientId: row.uploader_id,
 type: 'moderation',
 title: 'Resource upload rejected',
 body: `Your upload "${row.title || updated.title || 'your resource'}" was not approved. Reason: ${cleanReason}`,
 deepLinkPath: '/resources',
 });
 }
 } catch (err) {
 console.warn('[Resources] rejectResource notification failed:', err);
 }

 return updated;
}

/**
 * The signed-in uploader's own resources - every status (pending, approved,
 * rejected), unlike listResources()'s browse feed which hides rejected
 * uploads from everyone by default. Backs the "My Uploads" filter on the
 * Resources screen (app/(student)/resources.tsx), the student-facing
 * counterpart to listMyJobs()/listMyMarketplaceListings().
 */
export async function listMyResources(): Promise<Resource[]> {
  const { data: authData } = await supabase.auth.getUser();
  let uploaderId = authData?.user?.id;
  if (!uploaderId) {
    const stored = await getSessionUser();
    uploaderId = stored?.id;
  }
  if (!uploaderId) return [];

  try {
    const { data, error } = await supabase
      .from('resources')
      .select('*, profiles:uploader_id(full_name, role, avatar_url, department)')
      .eq('uploader_id', uploaderId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const dbResources = (data ?? []).map(mapResourceRow);
    const localMine = locallyCreatedResources.filter((r) => r.authorId === uploaderId);
    const merged = [...dbResources];
    for (const r of localMine) {
      if (!merged.some((m) => m.id === r.id)) merged.push(r);
    }
    return merged;
  } catch (err) {
    console.warn('[Resources] listMyResources failed, showing local pool only:', err);
    return locallyCreatedResources.filter((r) => r.authorId === uploaderId);
  }
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
    // Set below once the uploader's role is known - see the comment there.
    approvalStatus: 'pending',
  };

  // Fetch uploader's campus and role. The role also decides what the optimistic
  // `created` object below reports for approvalStatus: it must match what
  // enforce_resource_moderation() (supabase/migrations/20260924121000_resource_takedown_requests.sql)
  // actually does server-side - it forces is_approved/approved_by/approved_at
  // back to false/NULL on INSERT for anyone whose role is not admin or staff,
  // no matter what the client sends. Reporting 'approved' here for a student
  // upload was simply wrong: the row is always created pending for them.
  const { data: uploaderProfile } = await supabase
    .from('profiles')
    .select('campus_code, role')
    .eq('id', uploaderId)
    .maybeSingle();
  const campusCode = payload.campusCode || uploaderProfile?.campus_code || 'GLOBAL';
  const isPrivilegedUploader = uploaderProfile?.role === 'admin' || uploaderProfile?.role === 'staff';
  created.approvalStatus = isPrivilegedUploader ? 'approved' : 'pending';

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
 const uploadBytes = fileBlob instanceof ArrayBuffer ? fileBlob.byteLength : (fileBlob as Blob).size;
 await assertWithinStorageQuota(uploadBytes, ft === 'IMG' ? 'image' : 'document');
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
 * Persists to Supabase and throws when the write did not actually happen -
 * either a real error, or (since supabase-js resolves `{ error: null }` for
 * an UPDATE that matched zero rows, e.g. RLS silently excluding a row the
 * caller cannot touch) zero affected rows. Callers must catch this and show
 * a real error instead of assuming success; see ManageResourcesModal /
 * ResourcesModerationTab.
 */
export async function updateResource(id: string, payload: Partial<Resource>): Promise<Resource> {
  assertUuid(id, 'resource id');
  if (payload.fileUrl) assertSafeHttpUrl(payload.fileUrl, 'The file link');

  const dbPayload: any = {};
  if (payload.title) dbPayload.title = payload.title;
  if (payload.description !== undefined) dbPayload.description = payload.description;
  if (payload.courseCode) dbPayload.course_code = payload.courseCode;
  if (payload.semester) dbPayload.semester = payload.semester;
  if (payload.fileUrl) dbPayload.file_url = payload.fileUrl;
  if (payload.approvalStatus) dbPayload.is_approved = payload.approvalStatus === 'approved';
  // rejectionReason is explicitly checked against undefined (not truthiness) so that
  // approveResource's `rejectionReason: null` call actually clears a stale reason in
  // the DB instead of being silently dropped - the same gap that previously left
  // rejectResource()'s reason written only to the in-memory cache, never to Postgres.
  if (payload.rejectionReason !== undefined) dbPayload.rejection_reason = payload.rejectionReason;

  if (Object.keys(dbPayload).length > 0) {
    const { data, error } = await supabase.from('resources').update(dbPayload).eq('id', id).select('id');
    if (error) {
      console.warn('[Resources] Supabase updateResource error:', error.message);
      throw new Error('Could not save your changes. Please try again.');
    }
    if (!data || data.length === 0) {
      throw new Error('Could not save your changes: this resource was not found, or you do not have permission to edit it.');
    }
  }

  let updated: Resource | undefined;
  locallyCreatedResources = locallyCreatedResources.map((r) => {
    if (r.id === id) {
      updated = { ...r, ...payload };
      return updated;
    }
    return r;
  });

  return updated ?? ({ id, ...payload } as Resource);
}

export async function deleteResource(id: string): Promise<boolean> {
  assertUuid(id, 'resource id');
  const { data, error } = await supabase.from('resources').delete().eq('id', id).select('id');
  if (error) {
    console.warn('[Resources] Delete resource error:', error.message);
    throw new Error('Could not delete this resource. Please try again.');
  }
  if (!data || data.length === 0) {
    throw new Error('Could not delete this resource: it was not found, or you do not have permission to delete it.');
  }
  locallyCreatedResources = locallyCreatedResources.filter((r) => r.id !== id);
  return true;
}

/**
 * Increments the download counter through a SECURITY DEFINER RPC
 * (supabase/migrations/20261007000000_resources_and_copilot_fixes.sql). A raw
 * `.update()` here would match zero rows for anyone but an admin/staff
 * member - the only UPDATE policy on `resources` requires that role - so the
 * counter would never actually persist for the student downloading it. This
 * is a non-critical side effect (a download still proceeds either way), so
 * failures are logged, not thrown.
 */
export async function trackResourceDownload(id: string): Promise<void> {
  try {
    assertUuid(id, 'resource id');
    const { error } = await supabase.rpc('increment_resource_download', { p_resource_id: id });
    if (error) throw error;
  } catch (err) {
    console.warn('[Resources] Error tracking download:', err);
  }
}

export interface ResourceUpvoteResult {
  upvoted: boolean;
  upvotesCount: number;
}

/**
 * Toggles the signed-in user's upvote through a SECURITY DEFINER RPC that
 * does a real toggle against `resource_upvotes` (one row per user per
 * resource) instead of trusting the client's notion of "increment" or
 * "decrement" - repeatedly calling this can never inflate the count past one
 * upvote per user, unlike the old raw `.update()` (which also silently
 * failed to persist at all for non-admin/staff callers). Throws on failure
 * so the caller can revert its optimistic UI.
 */
export async function toggleResourceUpvote(id: string): Promise<ResourceUpvoteResult> {
  assertUuid(id, 'resource id');
  const { data, error } = await supabase.rpc('toggle_resource_upvote', { p_resource_id: id });
  if (error) {
    console.warn('[Resources] toggleResourceUpvote failed:', error.message);
    throw new Error('Could not update your upvote. Please try again.');
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { upvoted: !!row?.upvoted, upvotesCount: row?.upvotes_count ?? 0 };
}

/** Whether the signed-in user has already upvoted this resource (for the initial button state). */
export async function isResourceUpvotedByMe(id: string): Promise<boolean> {
  assertUuid(id, 'resource id');
  try {
    const { data, error } = await supabase.from('resource_upvotes').select('resource_id').eq('resource_id', id).maybeSingle();
    if (error) throw error;
    return !!data;
  } catch (err) {
    console.warn('[Resources] isResourceUpvotedByMe failed:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Ratings & reviews (resource_ratings - see
// supabase/migrations/20261005020000_resource_ratings.sql). One 1-5 star
// rating per user per resource, with an optional short review. Unlike likes/
// downloads above, these throw on a real failure instead of swallowing it:
// silently dropping a rating would show the submitter a false "saved".
// ---------------------------------------------------------------------------

export interface ResourceRatingSummary {
  avgRating: number;
  ratingCount: number;
}

export interface ResourceRating {
  id: string;
  resourceId: string;
  raterId: string;
  raterName?: string;
  rating: number;
  review?: string | null;
  createdAt: string;
}

async function currentResourceRaterId(): Promise<string | null> {
  const { data: authData } = await supabase.auth.getUser();
  if (authData?.user?.id) return authData.user.id;
  const stored = await getSessionUser();
  return stored?.id || null;
}

/**
 * Upserts the signed-in user's rating (and optional short review) for a
 * resource. A second call for the same resource updates the existing row
 * (UNIQUE(resource_id, rater_id) + ON CONFLICT) instead of creating another
 * one - there is only ever one rating per user per resource.
 */
export async function submitResourceRating(resourceId: string, rating: number, review?: string): Promise<void> {
  assertUuid(resourceId, 'resource id');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('Choose a star rating from 1 to 5.');
  }
  const raterId = await currentResourceRaterId();
  if (!raterId) {
    throw new Error('You need to be signed in to rate this resource.');
  }
  const trimmedReview = review?.trim();

  const { error } = await supabase.from('resource_ratings').upsert(
    {
      resource_id: resourceId,
      rater_id: raterId,
      rating,
      review: trimmedReview ? trimmedReview.slice(0, 1000) : null,
    },
    { onConflict: 'resource_id,rater_id' },
  );
  if (error) {
    console.warn('[Resources] submitResourceRating failed:', error.message);
    throw new Error('Could not save your rating. Please try again.');
  }
}

/** Removes the signed-in user's own rating for a resource, if they left one. */
export async function deleteMyResourceRating(resourceId: string): Promise<void> {
  assertUuid(resourceId, 'resource id');
  const raterId = await currentResourceRaterId();
  if (!raterId) {
    throw new Error('You need to be signed in to do that.');
  }
  const { error } = await supabase.from('resource_ratings').delete().eq('resource_id', resourceId).eq('rater_id', raterId);
  if (error) {
    console.warn('[Resources] deleteMyResourceRating failed:', error.message);
    throw new Error('Could not remove your rating. Please try again.');
  }
}

/** Average rating (rounded to 1 decimal place) and count for a resource. Zero/zero when nobody has rated it yet. */
export async function getResourceRatingSummary(resourceId: string): Promise<ResourceRatingSummary> {
  assertUuid(resourceId, 'resource id');
  const { data, error } = await supabase.rpc('get_resource_rating_summary', { p_resource: resourceId });
  if (error) {
    console.warn('[Resources] getResourceRatingSummary failed:', error.message);
    throw new Error("Could not load this resource's rating. Please try again.");
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    avgRating: row?.avg_rating != null ? Number(row.avg_rating) : 0,
    ratingCount: row?.rating_count != null ? Number(row.rating_count) : 0,
  };
}

/** Most recent ratings/reviews for a resource, newest first. */
export async function listResourceRatings(resourceId: string, limit = 20): Promise<ResourceRating[]> {
  assertUuid(resourceId, 'resource id');
  const { data, error } = await supabase
    .from('resource_ratings')
    .select('id, resource_id, rater_id, rating, review, created_at, profiles:rater_id(full_name)')
    .eq('resource_id', resourceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[Resources] listResourceRatings failed:', error.message);
    throw new Error('Could not load reviews for this resource. Please try again.');
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    resourceId: row.resource_id,
    raterId: row.rater_id,
    raterName: row.profiles?.full_name || undefined,
    rating: row.rating,
    review: row.review ?? null,
    createdAt: row.created_at,
  }));
}
