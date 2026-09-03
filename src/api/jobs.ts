import { JobListing } from './types';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { generateUUID } from '../utils/uuid';
import { isUserBlocked } from './connections';

export interface JobsQuery {
 q?: string;
 type?: JobListing['type'];
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
   const em = authData.user.email.toLowerCase();
   userCampus = em.includes('ui.edu.ng') || em.includes('diana.prince') || em.includes('dr.adeyemi') || em.includes('admin@ui.edu.ng') || em.includes('adeola')
     ? 'UI'
     : em.includes('unilag.edu.ng')
     ? 'UNILAG'
     : em.includes('funaab.edu.ng')
     ? 'FUNAAB'
     : em.includes('oau')
     ? 'OAU'
     : em.includes('unn.edu.ng')
     ? 'UNN'
     : undefined;
 }

 const isStaffOrAdmin = userRole === 'admin' || userRole === 'staff';

 let req = supabase
 .from('jobs')
 .select('*, poster:profiles!jobs_poster_id_fkey(full_name, role, avatar_url, campus_code)')
 .eq('is_approved', true)
 .order('created_at', { ascending: false });

 if (query.type) {
 req = req.eq('type', query.type);
 }

 const { data, error } = await req;
 if (error) throw error;

 const dbJobs: JobListing[] = (data ?? [])
 .filter((row: any) => !isUserBlocked(row.poster_id))
 .filter((row: any) => {
   if (isStaffOrAdmin && !query.campusCode) return true;
   if (!userCampus || userCampus === 'GLOBAL') return true;
   const rowCampus = (row.campus_code || 'GLOBAL').toUpperCase();
   return rowCampus === userCampus.toUpperCase() || rowCampus === 'GLOBAL';
 })
 .map((row: any) => ({
 id: row.id,
 title: row.title,
 company: row.company,
 location: row.location,
 type: row.type as JobListing['type'],
 remote: row.is_remote ?? false,
 applyUrl: row.apply_url,
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
 return filterJobs(merged, scopedQuery);
 } catch (err) {
 console.warn('[Jobs] Supabase listJobs error, showing local pool only:', err);
 return filterJobs(getLocalPool(), query);
 }
}

export interface CreateJobPayload {
 title: string;
 company: string;
 location: string;
 type: JobListing['type'];
 remote?: boolean;
 applyUrl: string;
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

 const { error } = await supabase.from('jobs').insert({
 id: jobId,
 poster_id: realPosterId,
 campus_code: campusCode,
 title: payload.title,
 company: payload.company,
 location: payload.location,
 type: payload.type,
 is_remote: payload.remote ?? false,
 apply_url: payload.applyUrl,
 salary: payload.salary || null,
 description: payload.description || null,
 posted_by_name: posterName,
 });

 if (error) {
 console.warn('[Jobs] Supabase insert error:', error.message);
 throw new Error('Could not publish this opportunity. Please try again.');
 }

 const created: JobListing = {
 id: jobId,
 title: payload.title,
 company: payload.company,
 location: payload.location,
 type: payload.type,
 remote: payload.remote ?? false,
 applyUrl: payload.applyUrl,
 postedByName: posterName,
 createdAt: new Date().toISOString(),
 };

 locallyCreatedJobs = [created, ...locallyCreatedJobs];
 return created;
}
