import { supabase } from './supabase';
import { generateUUID } from '../utils/uuid';

export interface Institution {
 code: string;
 name: string;
 /** The campus's main email domain ('' when none is set). */
 domain: string;
 shortName?: string;
 location?: string;
 primaryColor?: string;
 isActive?: boolean;
 /** Every email domain that marks a signup as a member of this campus. */
 emailDomains?: string[];
 websiteUrl?: string | null;
 createdAt?: string;
}

/** One row of the admin Campuses screen: the campus plus the numbers that matter. */
export interface CampusOverview extends Institution {
 memberCount: number;
 verifiedCount: number;
 portalLinkCount: number;
 activePortalLinkCount: number;
}

export const LAUNCH_INSTITUTIONS: Institution[] = [
 { code: 'GLOBAL', name: 'Lioris Global Network', domain: 'lioris.app', shortName: 'Global', location: 'Worldwide', primaryColor: '#2563EB' },
 { code: 'UNILAG', name: 'University of Lagos', domain: 'unilag.edu.ng', shortName: 'UNILAG', location: 'Akoka, Lagos', primaryColor: '#1E40AF' },
 { code: 'UI', name: 'University of Ibadan', domain: 'ui.edu.ng', shortName: 'UI', location: 'Ibadan, Oyo', primaryColor: '#047857' },
 { code: 'FUNAAB', name: 'Federal University of Agriculture, Abeokuta', domain: 'funaab.edu.ng', shortName: 'FUNAAB', location: 'Abeokuta, Ogun', primaryColor: '#059669' },
 { code: 'UNN', name: 'University of Nigeria Nsukka', domain: 'unn.edu.ng', shortName: 'UNN', location: 'Nsukka, Enugu', primaryColor: '#B45309' },
 { code: 'OAU', name: 'Obafemi Awolowo University', domain: 'oauife.edu.ng', shortName: 'OAU', location: 'Ile-Ife, Osun', primaryColor: '#7C3AED' },
 { code: 'CU', name: 'Covenant University', domain: 'covenantuniversity.edu.ng', shortName: 'CU', location: 'Ota, Ogun', primaryColor: '#DC2626' },
];

function rowToInstitution(row: any): Institution {
 const domains: string[] = Array.isArray(row.email_domains) ? row.email_domains : [];
 return {
 code: row.code,
 name: row.name,
 shortName: row.short_name || row.code,
 location: row.location || undefined,
 domain: domains[0] ?? '',
 emailDomains: domains,
 primaryColor: row.primary_color || '#2563EB',
 isActive: row.is_active !== false,
 websiteUrl: row.website_url ?? null,
 createdAt: row.created_at ?? undefined,
 };
}

/** Folds database campuses into the in-memory registry the rest of the app reads (new ones are added). */
function mergeIntoRegistry(fresh: Institution[]) {
 for (const inst of fresh) {
 const idx = LAUNCH_INSTITUTIONS.findIndex((li) => li.code === inst.code);
 if (idx >= 0) {
 // Keep the built-in domain as a fallback for a launch campus whose database row has none yet.
 const domain = inst.domain || LAUNCH_INSTITUTIONS[idx].domain;
 LAUNCH_INSTITUTIONS[idx] = { ...LAUNCH_INSTITUTIONS[idx], ...inst, domain };
 } else {
 LAUNCH_INSTITUTIONS.push(inst);
 }
 }
}

/** Every campus the database knows (new ones included), also refreshing the shared registry. */
export async function listCampuses(): Promise<Institution[]> {
 try {
 const { data, error } = await supabase.from('campuses').select('*').order('name', { ascending: true });
 if (!error && data && data.length > 0) {
 mergeIntoRegistry(data.map(rowToInstitution));
 }
 } catch (err) {
 console.warn('[Institutions] Error fetching campuses from database:', err);
 }
 return [...LAUNCH_INSTITUTIONS];
}

/** Campuses with member and portal-link counts. Admin only (the database refuses anyone else). */
export async function listCampusOverview(): Promise<CampusOverview[]> {
 const { data, error } = await supabase.rpc('admin_campus_overview');
 if (error) throw new Error(error.message?.replace(/^not_allowed:\s*/, '') || 'Could not load campuses.');
 const rows = (data ?? []).map((row: any) => ({
 ...rowToInstitution(row),
 memberCount: row.member_count ?? 0,
 verifiedCount: row.verified_count ?? 0,
 portalLinkCount: row.portal_link_count ?? 0,
 activePortalLinkCount: row.active_portal_link_count ?? 0,
 }));
 mergeIntoRegistry(rows);
 return rows;
}

export interface CampusInput {
 code: string;
 name?: string;
 shortName?: string;
 location?: string;
 emailDomains?: string[];
 primaryColor?: string;
 websiteUrl?: string;
 /** Starter links to publish with a brand-new campus. */
 seedPortalLinks?: Array<{ title: string; url: string; category?: string; icon?: string }>;
 /** The waitlist request this campus answers; marked approved once the campus exists. */
 waitlistEntryId?: string;
 /** Add a domain even though DNS says it does not exist (after the admin confirmed). */
 allowUnresolvedDomains?: boolean;
}

export interface CampusChangeResult {
 institution: Institution;
 warnings: string[];
}

async function callManageInstitution(body: Record<string, unknown>): Promise<any> {
 const { data, error } = await supabase.functions.invoke('admin-manage-institution', { body });
 if (error) {
 // Dynamic import: auth.ts already depends on this module.
 const { readEdgeFunctionError } = await import('./auth');
 throw await readEdgeFunctionError(error, 'Could not reach the campus service. Please try again.');
 }
 if (!data || data.error) {
 throw new Error(data?.message || 'The campus service did not answer as expected.');
 }
 return data;
}

/**
 * Adds a university. Runs on the server (admin-manage-institution): it validates the email domains, checks DNS,
 * writes the campus and audit trail, seeds portal links and answers the university request in one go.
 * Throws an EdgeFunctionError whose `.code` can be `mfa_required`, `domain_unresolved`, `domain_taken` ...
 */
export async function createInstitution(input: CampusInput, options: { dryRun?: boolean } = {}): Promise<CampusChangeResult> {
 const data = await callManageInstitution({ action: 'create', ...input, code: input.code.trim().toUpperCase(), dryRun: options.dryRun });
 if (options.dryRun) return { institution: undefined as unknown as Institution, warnings: data.warnings ?? [] };
 const institution = rowToInstitution(data.campus);
 mergeIntoRegistry([institution]);
 return { institution, warnings: data.warnings ?? [] };
}

export async function updateInstitution(input: CampusInput, options: { dryRun?: boolean } = {}): Promise<CampusChangeResult> {
 const data = await callManageInstitution({ action: 'update', ...input, code: input.code.trim().toUpperCase(), dryRun: options.dryRun });
 if (options.dryRun) return { institution: undefined as unknown as Institution, warnings: data.warnings ?? [] };
 const institution = rowToInstitution(data.campus);
 mergeIntoRegistry([institution]);
 return { institution, warnings: data.warnings ?? [] };
}

/** Switch a campus on or off. Turning off a campus that has members needs `confirm: true` (the server asks first). */
export async function setInstitutionActive(code: string, isActive: boolean, confirm = false): Promise<Institution> {
 const data = await callManageInstitution({ action: 'set_active', code: code.trim().toUpperCase(), isActive, confirm });
 const institution = rowToInstitution(data.campus ?? {});
 if (institution.code) mergeIntoRegistry([institution]);
 return institution;
}

export function getInstitutionForEmail(email: string): Institution | null {
 const domain = email.toLowerCase().trim().split('@')[1];
 if (!domain) return null;
 let best: { inst: Institution; length: number } | null = null;
 for (const inst of LAUNCH_INSTITUTIONS) {
 if (inst.isActive === false || inst.code === 'GLOBAL') continue;
 const domains = (inst.emailDomains && inst.emailDomains.length > 0 ? inst.emailDomains : [inst.domain]).filter(Boolean);
 for (const d of domains) {
 if ((domain === d || domain.endsWith(`.${d}`)) && (!best || d.length > best.length)) best = { inst, length: d.length };
 }
 }
 return best?.inst ?? null;
}

export function getInstitutionByCode(code: string): Institution | undefined {
 return LAUNCH_INSTITUTIONS.find((inst) => inst.code === code);
}

// --- Waitlist: schools not yet live ---

export interface WaitlistEntry {
 id: string;
 name?: string;
 universityName: string;
 email: string;
 submittedAt: string;
 status: 'pending' | 'approved' | 'rejected';
}

let waitlistState: WaitlistEntry[] = [];

export interface JoinWaitlistPayload {
 name?: string;
 universityName: string;
 email: string;
}

export async function joinWaitlist(payload: JoinWaitlistPayload): Promise<WaitlistEntry> {
 const waitlistId = generateUUID();

 try {
 const insertPayload: Record<string, any> = {
 id: waitlistId,
 university_name: payload.universityName,
 email: payload.email,
 status: 'pending',
 };
 if (payload.name?.trim()) {
 insertPayload.name = payload.name.trim();
 }

 const { error } = await supabase.from('waitlist_entries').insert(insertPayload);
 if (error) {
 console.warn('[Waitlist] Supabase insert error:', error.message);
 // Defensive fallback if 'name' column does not exist on remote table
 if (payload.name && error.message?.toLowerCase().includes('name')) {
 delete insertPayload.name;
 await supabase.from('waitlist_entries').insert(insertPayload);
 }
 }
 } catch (err) {
 console.warn('[Waitlist] Exception joining waitlist:', err);
 }

 const created: WaitlistEntry = {
 id: waitlistId,
 name: payload.name?.trim(),
 universityName: payload.universityName,
 email: payload.email,
 submittedAt: new Date().toISOString(),
 status: 'pending',
 };

 waitlistState = [...waitlistState, created];
 return created;
}

export async function listWaitlist(): Promise<WaitlistEntry[]> {
 try {
 const { data, error } = await supabase
 .from('waitlist_entries')
 .select('*')
 .order('submitted_at', { ascending: false });

 if (!error && data && data.length > 0) {
 const dbEntries: WaitlistEntry[] = data.map((row: any) => ({
 id: row.id,
 universityName: row.university_name,
 email: row.email,
 submittedAt: row.submitted_at,
 status: row.status as any,
 }));

 const merged = [...dbEntries];
 for (const w of waitlistState) {
 if (!merged.some((m) => m.id === w.id)) {
 merged.push(w);
 }
 }
 return merged.filter((w) => w.status === 'pending');
 }
 } catch {
 // fallback
 }

 return waitlistState.filter((w) => w.status === 'pending');
}

export async function respondToWaitlistEntry(id: string, status: 'approved' | 'rejected'): Promise<void> {
 try {
 await supabase.from('waitlist_entries').update({ status }).eq('id', id);
 } catch (err) {
 console.warn('[Waitlist] Update status error:', err);
 }
 waitlistState = waitlistState.map((w) => (w.id === id ? { ...w, status } : w));
}
