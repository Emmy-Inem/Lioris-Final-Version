import { JobListing } from './types';
import { supabase } from './supabase';
import { listSavedItemIds } from './bookmarks';
import { getSessionUser } from '../auth/tokenStorage';
import { generateUUID } from '../utils/uuid';
import { isUserBlocked } from './connections';
import { getInstitutionForEmail } from './institutions';
import { assertSafeHttpUrl, sanitizeHttpUrl } from '../utils/safeUrl';
import { inferWorkplaceType, inferExperienceLevel } from '../utils/careerFilters';

export { inferWorkplaceType, inferExperienceLevel };

export interface JobsQuery {
  q?: string;
  type?: JobListing['type'];
  workplaceType?: 'Remote' | 'Hybrid' | 'On-site';
  experienceLevel?: 'Entry level' | 'Mid-Senior level' | 'Executive';
  datePosted?: 'all' | 'past24h' | 'pastWeek' | 'pastMonth';
  savedOnly?: boolean;
  campusCode?: string;
}

// Jobs this session has *successfully* written to Supabase, kept here only
// so they render instantly before the next refetch. Never mixed with
// mockData.ts fixtures - those only come from getLocalPool() below, and
// only while the admin's "Mock Data Visibility" toggle is on.
let locallyCreatedJobs: JobListing[] = [];

function getLocalPool(): JobListing[] {
  return [...locallyCreatedJobs];
}

function filterJobs(pool: JobListing[], query: JobsQuery): JobListing[] {
  let results = pool.filter((j) => !isUserBlocked((j as any).posterId));
  if (query.type) results = results.filter((j) => j.type === query.type);
  if (query.workplaceType) results = results.filter((j) => j.workplaceType === query.workplaceType);
  if (query.experienceLevel) results = results.filter((j) => j.experienceLevel === query.experienceLevel);
  if (query.savedOnly) results = results.filter((j) => j.isSaved === true);
  if (query.datePosted && query.datePosted !== 'all') {
    const now = Date.now();
    const maxAgeMs =
      query.datePosted === 'past24h'
        ? 24 * 60 * 60 * 1000
        : query.datePosted === 'pastWeek'
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
    results = results.filter((j) => now - new Date(j.createdAt).getTime() <= maxAgeMs);
  }
  if (query.campusCode && query.campusCode !== 'GLOBAL') {
    results = results.filter((j) => !j.campusCode || j.campusCode === 'GLOBAL' || j.campusCode === query.campusCode);
  }
  if (query.q) {
    const q = query.q.toLowerCase();
    results = results.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q) ||
        (j.description && j.description.toLowerCase().includes(q)) ||
        j.postedByName.toLowerCase().includes(q),
    );
  }
  return results;
}

export async function listJobs(query: JobsQuery = {}): Promise<JobListing[]> {
 try {
 const { data: authData } = await supabase.auth.getUser();
 let userCampus = query.campusCode;
 let userRole = 'student';

 if (authData?.user?.id) {
 const { data: prof } = await supabase.from('profiles').select('campus_code, role').eq('id', authData.user.id).maybeSingle();
 if (prof?.campus_code && !userCampus) userCampus = prof.campus_code;
 if (prof?.role) userRole = prof.role;
 }

 if (!userCampus && authData?.user?.email) {
   // Domain match, not substring. The previous chain mis-assigned campuses
      // (`includes('oau')` claimed joaustin@unilag.edu.ng for OAU) and hardcoded
      // demo names above the real domain. Every demo account is @ui.edu.ng, so
      // plain domain matching already covers them.
      userCampus = getInstitutionForEmail(authData.user.email)?.code;
 }

 const isStaffOrAdmin = userRole === 'admin' || userRole === 'staff';

 // No .eq('is_approved', true) here any more: RLS itself now decides visibility
 // (approved postings to everyone in scope, plus a poster's own row regardless
 // of status, plus staff/admin see everything) - see 20261001000000_workflow_gaps.sql.
 // Filtering client-side instead lets a poster see their own pending posting.
 let req = supabase
 .from('jobs')
 .select('*, poster:profiles!jobs_poster_id_fkey(full_name, role, avatar_url, campus_code)')
 .order('created_at', { ascending: false });

 if (query.type) {
 req = req.eq('type', query.type);
 }

 const { data, error } = await req;
 if (error) throw error;

 const dbJobs: JobListing[] = (data ?? [])
 .filter((row: any) => !isUserBlocked(row.poster_id))
 // This is the normal browse feed, not the moderation queue: an unapproved
 // posting only belongs here for its own poster, checking on its review status -
 // never mixed into anyone else's feed just because they happen to be staff/admin.
 .filter((row: any) => row.is_approved === true || row.poster_id === authData?.user?.id)
    .filter((row: any) => {
      if (isStaffOrAdmin && !query.campusCode) return true;
      const targetCampus = (userCampus || 'GLOBAL').toUpperCase();
      const rowCampus = (row.campus_code || 'GLOBAL').toUpperCase();
      if (targetCampus === 'GLOBAL') {
        return rowCampus === 'GLOBAL' || !!row.is_remote;
      }
      return rowCampus === targetCampus || rowCampus === 'GLOBAL' || !!row.is_remote;
    })
 .map((row: any) => ({
 id: row.id,
 title: row.title,
 company: row.company,
 location: row.location,
 type: row.type as JobListing['type'],
 remote: row.is_remote ?? false,
 workplaceType: inferWorkplaceType(row),
 experienceLevel: inferExperienceLevel(row),
 // A bad stored link (e.g. javascript:) must never reach an opener.
 applyUrl: sanitizeHttpUrl(row.apply_url) ?? '',
 acceptsInAppApplications: row.accepts_in_app_applications ?? false,
 applicationsCount: row.applications_count ?? 0,
 isApproved: row.is_approved ?? true,
 postedByName: row.poster?.full_name || row.posted_by_name || 'Alumni Network',
 posterId: row.poster_id,
 createdAt: row.created_at,
 description: row.description || '',
 salary: row.salary || undefined,
 campusCode: row.campus_code || 'GLOBAL',
 }));

 // Merge unique - local pool only ever contributes this session's own
 // just-created jobs (always) plus seed fixtures (only when the admin
 // mock-data toggle is on).
 const merged = [...dbJobs];
 const scopedQuery = { ...query, campusCode: isStaffOrAdmin && !query.campusCode ? undefined : userCampus };
 for (const item of getLocalPool()) {
 if (!merged.some((j) => j.id === item.id) && !isUserBlocked((item as any).posterId)) {
 merged.push(item);
 }
 }

 try {
   const jobIds = merged.map((j) => j.id);
   const savedIds = await listSavedItemIds('job', jobIds);
   for (const j of merged) {
     j.isSaved = savedIds.has(j.id);
   }
 } catch {
   // best effort for saved decoration
 }

 return filterJobs(merged, scopedQuery);
 } catch (err) {
 console.warn('[Jobs] Supabase listJobs error, showing local pool only:', err);
 return filterJobs(getLocalPool(), query);
 }
}

export interface CreateJobQuestionInput {
  text: string;
  type: 'text' | 'yes_no';
  required: boolean;
}

export interface CreateJobPayload {
  title: string;
  company: string;
  location: string;
  type: JobListing['type'];
  remote?: boolean;
  workplaceType?: 'Remote' | 'Hybrid' | 'On-site';
  experienceLevel?: 'Entry level' | 'Mid-Senior level' | 'Executive';
  /** External apply link. Optional when acceptsInAppApplications is true. */
  applyUrl?: string;
  /** Accept CV + screening-question applications inside Lioris. Defaults to true. */
  acceptsInAppApplications?: boolean;
  questions?: CreateJobQuestionInput[];
  salary?: string;
  description?: string;
  campusCode?: string;
}

/**
 * Throws if the Supabase insert fails or there's no authenticated poster,
 * instead of quietly returning a fabricated "success" job. Callers must
 * catch this and show a real error - see CreateJobModal.
 */
export async function createJob(payload: CreateJobPayload): Promise<JobListing> {
  const acceptsInApp = payload.acceptsInAppApplications ?? true;
  const applyUrl = payload.applyUrl?.trim() ? assertSafeHttpUrl(payload.applyUrl, 'The apply link') : '';
  if (!acceptsInApp && !applyUrl) {
    throw new Error('Add an external apply link, or turn on in-app applications.');
  }
  const jobId = generateUUID();
  const { data: authData } = await supabase.auth.getUser();
  let realPosterId = authData?.user?.id;
  const sessionUser = await getSessionUser();
  const posterName = sessionUser?.fullName || authData?.user?.user_metadata?.full_name || 'Alumni Member';
  const campusCode = payload.campusCode || (sessionUser as any)?.campusCode || 'GLOBAL';

  if (!realPosterId && sessionUser?.id) {
    realPosterId = sessionUser.id;
  }

  if (!realPosterId) {
    throw new Error('You need to be signed in to post an opportunity.');
  }

  const isRemote = payload.remote ?? payload.workplaceType === 'Remote';

  const { error } = await supabase.from('jobs').insert({
    id: jobId,
    poster_id: realPosterId,
    campus_code: campusCode,
    title: payload.title,
    company: payload.company,
    location: payload.location,
    type: payload.type,
    is_remote: isRemote,
    apply_url: applyUrl || null,
    accepts_in_app_applications: acceptsInApp,
    salary: payload.salary || null,
    description: payload.description || null,
    posted_by_name: posterName,
  });

  if (error) {
    console.warn('[Jobs] Supabase insert error:', error.message);
    throw new Error('Could not publish this opportunity. Please try again.');
  }

  const questions = (payload.questions ?? []).filter((q) => q.text.trim());
  if (acceptsInApp && questions.length > 0) {
    const { error: qError } = await supabase.from('job_questions').insert(
      questions.map((q, i) => ({
        job_id: jobId,
        question_text: q.text.trim(),
        question_type: q.type,
        is_required: q.required,
        order_index: i,
      })),
    );
    // Non-fatal: the job itself is already live; a poster can add questions later.
    if (qError) console.warn('[Jobs] Could not save screening questions:', qError.message);
  }

  const created: JobListing = {
    id: jobId,
    title: payload.title,
    company: payload.company,
    location: payload.location,
    type: payload.type,
    remote: isRemote,
    workplaceType: payload.workplaceType ?? (isRemote ? 'Remote' : 'On-site'),
    experienceLevel: payload.experienceLevel ?? 'Entry level',
    salary: payload.salary,
    description: payload.description,
    applyUrl,
    acceptsInAppApplications: acceptsInApp,
    applicationsCount: 0,
    // Optimistic placeholder only - the moderation trigger decides the real
    // value server-side (false for a non-staff/admin poster), and the next
    // listJobs() refetch replaces this local entry with the DB row.
    isApproved: true,
    postedByName: posterName,
    createdAt: new Date().toISOString(),
  };

  locallyCreatedJobs = [created, ...locallyCreatedJobs];
  return created;
}

/** Every job the signed-in user has posted, any review status - backs a "My Postings" view. */
export async function listMyJobs(): Promise<JobListing[]> {
  const { data: authData } = await supabase.auth.getUser();
  const uid = authData?.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('jobs')
    .select('*, poster:profiles!jobs_poster_id_fkey(full_name)')
    .eq('poster_id', uid)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    type: row.type as JobListing['type'],
    remote: row.is_remote ?? false,
    workplaceType: inferWorkplaceType(row),
    experienceLevel: inferExperienceLevel(row),
    applyUrl: sanitizeHttpUrl(row.apply_url) ?? '',
    acceptsInAppApplications: row.accepts_in_app_applications ?? false,
    applicationsCount: row.applications_count ?? 0,
    isApproved: row.is_approved ?? true,
    postedByName: row.poster?.full_name || row.posted_by_name || 'Alumni Network',
    posterId: row.poster_id,
    createdAt: row.created_at,
    description: row.description || '',
    salary: row.salary || undefined,
    campusCode: row.campus_code || 'GLOBAL',
  }));
}

// --- Admin moderation ---

/** Every job awaiting review - admin/staff only (RLS-enforced). */
export async function listPendingJobs(): Promise<JobListing[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*, poster:profiles!jobs_poster_id_fkey(full_name)')
    .eq('is_approved', false)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    type: row.type as JobListing['type'],
    remote: row.is_remote ?? false,
    workplaceType: inferWorkplaceType(row),
    experienceLevel: inferExperienceLevel(row),
    applyUrl: sanitizeHttpUrl(row.apply_url) ?? '',
    acceptsInAppApplications: row.accepts_in_app_applications ?? false,
    applicationsCount: row.applications_count ?? 0,
    isApproved: row.is_approved ?? false,
    postedByName: row.poster?.full_name || row.posted_by_name || 'Alumni Network',
    posterId: row.poster_id,
    createdAt: row.created_at,
    description: row.description || '',
    salary: row.salary || undefined,
    campusCode: row.campus_code || 'GLOBAL',
  }));
}

export async function approveJob(id: string): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('jobs')
    .update({ is_approved: true, approved_by: authData?.user?.id ?? null, approved_at: new Date().toISOString(), rejection_reason: null })
    .eq('id', id);
  if (error) {
    console.warn('[Jobs] approveJob error:', error.message);
    throw new Error('Could not approve this posting. Please try again.');
  }
}

export async function rejectJob(id: string, reason?: string): Promise<void> {
  const { error } = await supabase.from('jobs').update({ is_approved: false, rejection_reason: reason || 'Did not meet posting standards.' }).eq('id', id);
  if (error) {
    console.warn('[Jobs] rejectJob error:', error.message);
    throw new Error('Could not reject this posting. Please try again.');
  }
}
