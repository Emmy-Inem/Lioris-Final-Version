import { JobListing } from './types';
import { mockJobListings } from './mockData';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { generateUUID } from '../utils/uuid';
import { isUserBlocked } from './connections';

export interface JobsQuery {
 q?: string;
 type?: JobListing['type'];
 campusCode?: string;
}

let jobsState: JobListing[] = [...mockJobListings];

function filterMockJobs(query: JobsQuery): JobListing[] {
 let results = [...jobsState].filter((j) => !isUserBlocked((j as any).posterId));
 if (query.type) results = results.filter((j) => j.type === query.type);
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
 let req = supabase
 .from('jobs')
 .select('*, poster:profiles!jobs_poster_id_fkey(full_name, role, avatar_url, campus_code)')
 .eq('is_approved', true)
 .order('created_at', { ascending: false });

 if (query.type) {
 req = req.eq('type', query.type);
 }

 const { data, error } = await req;

 if (!error && data && data.length > 0) {
 const dbJobs: JobListing[] = data
 .filter((row: any) => !isUserBlocked(row.poster_id))
 .map((row: any) => ({
 id: row.id,
 title: row.title,
 company: row.company,
 location: row.location,
 type: row.type as JobListing['type'],
 remote: row.is_remote ?? false,
 applyUrl: row.apply_url,
 postedByName: row.poster?.full_name || row.posted_by_name || 'Alumni Network',
 createdAt: row.created_at,
 description: row.description || '',
 salary: row.salary || undefined,
 }));

 // Merge unique
 const merged = [...dbJobs];
 for (const item of jobsState) {
 if (!merged.some((j) => j.id === item.id) && !isUserBlocked((item as any).posterId)) {
 merged.push(item);
 }
 }
 jobsState = merged;
 return filterMockJobs(query);
 }
 } catch (err) {
 console.warn('[Jobs] Supabase listJobs error:', err);
 }

 return filterMockJobs(query);
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

export async function createJob(payload: CreateJobPayload): Promise<JobListing> {
 const jobId = generateUUID();
 const sessionUser = await getSessionUser();
 const posterId = sessionUser?.id || 'me';
 const posterName = sessionUser?.fullName || 'Alumni Member';
 const campusCode = payload.campusCode || (sessionUser as any)?.campusCode || 'GLOBAL';

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

 jobsState = [created, ...jobsState];

 try {
 const { data: authData } = await supabase.auth.getUser();
 const realPosterId = authData?.user?.id;

 if (realPosterId) {
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
 throw error;
 }
 }
 } catch (err) {
 console.warn('[Jobs] Supabase insert error:', err);
 throw err;
 }

 return created;
}
