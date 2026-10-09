import { Resource } from './types';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { isUserBlocked, isUserMuted } from './connections';
import { assertWithinStorageQuota } from './platformSettings';
import { generateUUID } from '../utils/uuid';
import { getInstitutionForEmail } from './institutions';
import { assertSafeHttpUrl, sanitizeHttpUrl } from '../utils/safeUrl';
import { assertUuid } from '../utils/postgrest';
import { isSuperAdminIdentity, resolveCampusReadScope } from '../utils/campusAccess';

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
  /**
   * Minimum average rating (e.g. 4.5 for the filter modal's "4.5+ Stars").
   * Resources with no ratings at all (avg_rating is null/0 with zero votes)
   * are excluded once a minimum is set, same as a "4.5+ Stars" chip would
   * imply on any other reviews UI.
   */
  minRating?: number;
  /**
   * Mirrors LibraryFilterModal's SORT_OPTIONS values ('Newest Shared' |
   * 'Highest Quality Rated'). Defaults to newest-first (the existing,
   * unchanged behaviour) for any other/omitted value.
   */
  sortBy?: string;
  /** 0-based page of results past the first. Defaults to 0 (existing behaviour, unchanged for callers that don't pass it). */
  page?: number;
  /** Rows per page. Defaults to 100 (the previous hardcoded `.limit(100)`). */
  pageSize?: number;
}

function filterResources(pool: Resource[], query: ResourcesQuery): Resource[] {
  let results = [...pool];
  if (query.campusCode && query.campusCode !== 'ALL') {
    const target = query.campusCode.toUpperCase();
    results = results.filter((r) => {
      const c = (r.campusCode || 'GLOBAL').toUpperCase();
      return target === 'GLOBAL' ? c === 'GLOBAL' : (c === target || c === 'GLOBAL');
    });
  }
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
  // Rating/sort both need each row's live avgRating, which the `resources`
  // table itself does not store (ratings live in resource_ratings, summarised
  // on demand by get_resource_rating_summary()) - applied here, after the
  // rows/ratings are both in hand, rather than as a query predicate.
  if (query.minRating && query.minRating > 0) {
    results = results.filter((r) => ((r as any).avgRating ?? 0) >= query.minRating!);
  }
  if (query.sortBy === 'Highest Quality Rated') {
    results = [...results].sort((a, b) => {
      const diff = ((b as any).avgRating ?? 0) - ((a as any).avgRating ?? 0);
      if (diff !== 0) return diff;
      // Tie-break by rating count, then recency, so "Highest Quality Rated"
      // never looks like an arbitrary shuffle among unrated/equally-rated items.
      const countDiff = ((b as any).ratingCount ?? 0) - ((a as any).ratingCount ?? 0);
      if (countDiff !== 0) return countDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }
  // 'Newest Shared' (the default) is already the order the query/local pool
  // produce, so there is nothing further to do for it here.
  return results;
}

/**
 * Attaches `avgRating`/`ratingCount` to each resource so filterResources()
 * can apply `minRating`/`sortBy` ("Highest Quality Rated") - both of which
 * need a real rating, not something derivable from the `resources` row
 * alone. One bulk query for every resource on the page/pool (not one RPC
 * call per resource) - RLS on resource_ratings already limits the rows
 * returned to whatever this caller could see anyway. Best-effort: a failed
 * fetch just leaves every resource at 0/0 (treated as unrated) rather than
 * failing the whole list.
 */
async function withRatingSummaries(resources: Resource[]): Promise<Resource[]> {
  if (resources.length === 0) return resources;
  try {
    const ids = resources.map((r) => r.id);
    const { data, error } = await supabase.from('resource_ratings').select('resource_id, rating').in('resource_id', ids);
    if (error) throw error;
    const byResource = new Map<string, { sum: number; count: number }>();
    for (const row of data ?? []) {
      const entry = byResource.get(row.resource_id) || { sum: 0, count: 0 };
      entry.sum += Number(row.rating) || 0;
      entry.count += 1;
      byResource.set(row.resource_id, entry);
    }
    return resources.map((r) => {
      const entry = byResource.get(r.id);
      const avgRating = entry && entry.count > 0 ? Math.round((entry.sum / entry.count) * 10) / 10 : 0;
      return { ...r, avgRating, ratingCount: entry?.count ?? 0 } as Resource;
    });
  } catch (err) {
    console.warn('[Resources] withRatingSummaries failed, treating all as unrated:', err);
    return resources.map((r) => ({ ...r, avgRating: 0, ratingCount: 0 } as Resource));
  }
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
    courseTitle: row.course_title || undefined,
    courseCode: row.course_code || 'GEN 101',
    department: row.profiles?.department || row.course_title || 'Academic Repository',
    category: mapResourceTypeToCategory(row.resource_type),
    description: row.description || '',
    // Undefined when the upload recorded no size - ResourceCard omits the
    // chip rather than showing an invented "2.5 MB".
    fileSize: row.file_size_bytes ? `${(row.file_size_bytes / (1024 * 1024)).toFixed(1)} MB` : undefined,
    fileUrl: sanitizeHttpUrl(row.file_url) ?? (row.file_url ? String(row.file_url).trim() : null),
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

/** Loads one material by its stable id; database RLS still enforces campus access. */
export async function getResource(resourceId: string): Promise<Resource> {
  assertUuid(resourceId, 'resource id');
  const { data, error } = await supabase
    .from('resources')
    .select('*, profiles:uploader_id(full_name, role, avatar_url, department)')
    .eq('id', resourceId)
    .maybeSingle();
  if (error) throw new Error('Could not open this course material. Please try again.');
  if (!data) throw new Error('This course material is no longer available, or you do not have access to it.');
  return mapResourceRow(data);
}

export async function listResources(query: ResourcesQuery = {}): Promise<Resource[]> {
  let userCampus = 'GLOBAL';
  try {
    const { data: authData } = await supabase.auth.getUser();
    const stored = await getSessionUser();
    let prof: any = null;
    if (authData?.user?.id) {
      const { data } = await supabase.from('profiles').select('campus_code, role, admin_role').eq('id', authData.user.id).maybeSingle();
      prof = data;
    }

    const userEmail = authData?.user?.email?.toLowerCase().trim();
    const identity = {
      role: prof?.role || stored?.actualRole || authData?.user?.user_metadata?.role,
      adminRole: prof?.admin_role || stored?.adminRole || authData?.user?.user_metadata?.admin_role,
      campusCode:
        prof?.campus_code ||
        stored?.campusCode || authData?.user?.user_metadata?.campus_code ||
        (authData?.user?.email ? getInstitutionForEmail(authData.user.email)?.code : undefined),
      email: userEmail || stored?.email,
    };
    const isSuperAdmin = isSuperAdminIdentity(identity);
    userCampus = resolveCampusReadScope(identity, query.campusCode);

    const pageSize = query.pageSize ?? 100;
    const page = Math.max(0, query.page ?? 0);
    const offset = page * pageSize;

    // Every narrowing filter below (campus, approval status, category,
    // department, search) used to be applied with filterResources() only
    // *after* `.range()` had already sliced off a `pageSize` window of raw,
    // unfiltered rows. That meant a filter never actually filtered the full
    // matching set - it filtered whatever few rows happened to survive in
    // that one small window, which could legitimately be none even when
    // plenty of matches existed further down the (campus-ordered-by-date)
    // table. The symptoms matched the report exactly: picking a category,
    // department or campus could show far fewer results than expected (or
    // none), and "Load More" would disappear immediately because the
    // already-filtered page came back shorter than `pageSize`. Pushing these
    // down to the query itself, before `.range()`, makes a "page" mean a
    // page of matching rows again, so filtering and pagination compose.
    let dbQuery = supabase
      .from('resources')
      .select('*, profiles:uploader_id(full_name, role, avatar_url, department)')
      .order('created_at', { ascending: false });

    // Non-super-admins (students, staff, campus admins) are strictly isolated to their own campus and true GLOBAL.
    // Only super admin can see across all campuses or query any campus.
    if (!isSuperAdmin) {
      const targetCampus = (userCampus || 'GLOBAL').toUpperCase();
      dbQuery = targetCampus === 'GLOBAL'
        ? dbQuery.eq('campus_code', 'GLOBAL')
        : dbQuery.in('campus_code', [targetCampus, 'GLOBAL']);
    } else if (userCampus !== 'ALL') {
      const targetCampus = userCampus;
      dbQuery = targetCampus === 'GLOBAL'
        ? dbQuery.eq('campus_code', 'GLOBAL')
        : dbQuery.in('campus_code', [targetCampus, 'GLOBAL']);
    }

    if (query.approvalStatus && query.approvalStatus !== 'all') {
      if (query.approvalStatus === 'approved') {
        dbQuery = dbQuery.eq('is_approved', true).is('rejection_reason', null);
      } else if (query.approvalStatus === 'pending') {
        dbQuery = dbQuery.eq('is_approved', false).is('rejection_reason', null);
      } else if (query.approvalStatus === 'rejected') {
        dbQuery = dbQuery.not('rejection_reason', 'is', null);
      }
    } else {
      // Default (unset): hide rejected uploads from the general browse feed,
      // same as filterResources()'s `r.approvalStatus !== 'rejected'` below.
      dbQuery = dbQuery.is('rejection_reason', null);
    }

    // Category chips (All Files / Past Questions / Notes / Projects). Mirrors
    // mapResourceTypeToCategory()'s mapping, including that 'Projects' covers
    // both the 'project' and legacy 'summary' resource_type values.
    if (query.category === 'Past Questions') {
      dbQuery = dbQuery.eq('resource_type', 'past_question');
    } else if (query.category === 'Projects') {
      dbQuery = dbQuery.in('resource_type', ['project', 'summary']);
    } else if (query.category === 'Notes') {
      dbQuery = dbQuery.not('resource_type', 'in', '(past_question,project,summary)');
    }

    // Department: approximate match on the column that actually backs it
    // (course_title - see mapResourceRow/updateResource). filterResources()
    // below still does the exact, final match (and also covers the
    // profiles.department fallback), so this is only a pre-filter to keep
    // pagination correct, never the last word on whether a resource matches.
    if (query.department) {
      dbQuery = dbQuery.ilike('course_title', `%${query.department}%`);
    }

    // Free-text search: narrows the same fields filterResources() checks
    // (except author name, which needs the joined profile and is left to the
    // final client-side pass below).
    if (query.q) {
      const like = `%${query.q.replace(/[%,()]/g, ' ').trim()}%`;
      dbQuery = dbQuery.or(`title.ilike.${like},course_code.ilike.${like},course_title.ilike.${like},description.ilike.${like}`);
    }

    const { data, error } = await dbQuery.range(offset, offset + pageSize - 1);
    if (error) throw error;

    const dbResources: Resource[] = (data ?? [])
      .filter((row: any) => !isUserBlocked(row.uploader_id) && !isUserMuted(row.uploader_id))
      .map(mapResourceRow);

    // Merge unique - local session creations not yet reflected by the query above.
    // Only on the first page: these are always the newest resources, so they would
    // otherwise be re-shown (duplicated) at the top of every later page too.
    const pool = page === 0 ? [...locallyCreatedResources] : [];
    const merged = [...dbResources];
    for (const r of pool) {
      if (!merged.some((m) => m.id === r.id || (m.title.toLowerCase() === r.title.toLowerCase() && m.courseCode.toLowerCase() === r.courseCode.toLowerCase())) && !isUserBlocked(r.authorId) && !isUserMuted(r.authorId)) {
        if (isSuperAdmin && userCampus === 'ALL') {
          merged.push(r);
        } else {
          const targetCampus = userCampus;
          const rCampus = ((r as any).campusCode || 'GLOBAL').toUpperCase();
          if (targetCampus === 'GLOBAL') {
            if (rCampus === 'GLOBAL') merged.push(r);
          } else if (rCampus === targetCampus || rCampus === 'GLOBAL') {
            merged.push(r);
          }
        }
      }
    }
    // Only fetch ratings when a rating-aware filter/sort actually needs them -
    // every other call keeps the previous (cheaper, no extra query) behaviour.
    const needsRatings = (query.minRating && query.minRating > 0) || query.sortBy === 'Highest Quality Rated';
    const withRatings = needsRatings ? await withRatingSummaries(merged) : merged;
    return filterResources(withRatings, query);
  } catch (err) {
    console.warn('[Resources] listResources failed, showing local pool:', err);
    const targetCampus = userCampus;
    const fallbackPool = [...locallyCreatedResources].filter((r) => {
      const rCampus = ((r as any).campusCode || 'GLOBAL').toUpperCase();
      if (targetCampus === 'ALL') return true;
      if (targetCampus === 'GLOBAL') return rCampus === 'GLOBAL';
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
    .select('campus_code, role, verification_status, email, is_suspended')
    .eq('id', uploaderId)
    .maybeSingle();

  if (uploaderProfile?.is_suspended) {
    throw new Error('Your account is currently suspended from uploading resources.');
  }

  const isPrivilegedUser =
    uploaderProfile?.role === 'admin' ||
    uploaderProfile?.role === 'staff' ||
    uploaderProfile?.email?.toLowerCase().trim() === 'inememmanuel@gmail.com' ||
    authData?.user?.email?.toLowerCase().trim() === 'inememmanuel@gmail.com' ||
    (uploaderProfile as any)?.admin_role === 'super_admin';
  const isEdu = !!(uploaderProfile?.email && uploaderProfile.email.toLowerCase().endsWith('.edu.ng') && uploaderProfile.verification_status !== 'rejected');
  const isVerified = isPrivilegedUser || uploaderProfile?.verification_status === 'verified' || isEdu;
  if (!isVerified) {
    throw new Error('Only verified student accounts can upload academic resources. Please verify your student status.');
  }

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
  // `resources` has no dedicated department column - mapResourceRow falls back
  // to `course_title` for department (see its comment), so that is what an
  // edited department has to be written to. Previously dropped entirely here:
  // ManageResourcesModal's "Manage Library" edit let an admin type a new
  // department, showed "Resource Updated", and silently never persisted it -
  // the Department filter on the Resources screen could then never match
  // that resource under its new department, only its old one.
  if (payload.department) dbPayload.course_title = payload.department;
  // Same silent drop for category: edited in the same modal, mapped to the
  // `resource_type` column everywhere else (mapCategoryToResourceType), but
  // never written on update - so changing a resource's category here never
  // changed what the category/resource-type filter chips actually matched.
  if (payload.category) dbPayload.resource_type = mapCategoryToResourceType(payload.category);
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

  // Defense-in-depth against rating your own upload - the client (see
  // ResourceReaderModal) already hides the rating card for the uploader, and
  // the DB trigger (20261010000000_resource_ratings_self_rating_guard.sql)
  // rejects it regardless, but checking here gives a clear message instead
  // of a raw Postgres error reaching the UI. Mirrors endorseSkill()'s
  // self-endorsement guard in src/api/profile.ts.
  const { data: resourceRow, error: resourceErr } = await supabase
    .from('resources')
    .select('uploader_id')
    .eq('id', resourceId)
    .maybeSingle();
  if (resourceErr) {
    console.warn('[Resources] submitResourceRating uploader lookup failed:', resourceErr.message);
  } else if (resourceRow?.uploader_id === raterId) {
    throw new Error('You cannot rate your own upload.');
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

/**
 * The signed-in user's own rating/review for a resource, if they left one -
 * `null` when they have not rated it yet. Lets ResourceReaderModal prefill
 * the stars/review text when editing an existing rating instead of always
 * starting from 0/''.
 */
export async function getMyResourceRating(resourceId: string): Promise<{ rating: number; review: string } | null> {
  assertUuid(resourceId, 'resource id');
  const raterId = await currentResourceRaterId();
  if (!raterId) return null;
  try {
    const { data, error } = await supabase
      .from('resource_ratings')
      .select('rating, review')
      .eq('resource_id', resourceId)
      .eq('rater_id', raterId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { rating: data.rating, review: data.review ?? '' };
  } catch (err) {
    console.warn('[Resources] getMyResourceRating failed:', err);
    return null;
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
