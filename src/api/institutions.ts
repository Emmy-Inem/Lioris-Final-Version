import { supabase } from './supabase';
import { generateUUID } from '../utils/uuid';

export interface Institution {
  code: string;
  name: string;
  domain: string;
  shortName?: string;
  location?: string;
  primaryColor?: string;
  isActive?: boolean;
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

export async function listCampuses(): Promise<Institution[]> {
  try {
    const { data, error } = await supabase
      .from('campuses')
      .select('*')
      .order('name', { ascending: true });

    if (!error && data && data.length > 0) {
      const dbCampuses: Institution[] = data.map((row: any) => ({
        code: row.code,
        name: row.name,
        shortName: row.short_name,
        location: row.location,
        domain: row.domain || `${row.code.toLowerCase()}.edu.ng`,
        primaryColor: row.primary_color || '#2563EB',
        isActive: row.is_active,
      }));

      // Merge with in-memory launch institutions to ensure fallback integrity
      for (const inst of dbCampuses) {
        if (!LAUNCH_INSTITUTIONS.some((li) => li.code === inst.code)) {
          LAUNCH_INSTITUTIONS.push(inst);
        }
      }
      return LAUNCH_INSTITUTIONS;
    }
  } catch (err) {
    console.warn('[Institutions] Error fetching campuses from database:', err);
  }
  return LAUNCH_INSTITUTIONS;
}

export async function createInstitution(payload: {
  code: string;
  name: string;
  shortName?: string;
  location?: string;
  domain?: string;
  primaryColor?: string;
}): Promise<Institution> {
  const cleanCode = payload.code.trim().toUpperCase();
  const cleanName = payload.name.trim();
  const cleanDomain = payload.domain?.trim().toLowerCase() || `${cleanCode.toLowerCase()}.edu.ng`;

  if (!cleanCode) throw new Error('Institutional campus code is required.');
  if (!cleanName) throw new Error('Institutional university name is required.');

  const newInstitution: Institution = {
    code: cleanCode,
    name: cleanName,
    shortName: payload.shortName?.trim() || cleanCode,
    location: payload.location?.trim() || 'Nigeria',
    domain: cleanDomain,
    primaryColor: payload.primaryColor || '#2563EB',
    isActive: true,
  };

  const { error } = await supabase.from('campuses').upsert({
    code: newInstitution.code,
    name: newInstitution.name,
    short_name: newInstitution.shortName,
    location: newInstitution.location,
    primary_color: newInstitution.primaryColor,
    is_active: true,
  });

  if (error) {
    throw new Error(`Failed to provision campus: ${error.message}`);
  }

  // Update in-memory registry
  const existingIdx = LAUNCH_INSTITUTIONS.findIndex((i) => i.code === cleanCode);
  if (existingIdx >= 0) {
    LAUNCH_INSTITUTIONS[existingIdx] = newInstitution;
  } else {
    LAUNCH_INSTITUTIONS.push(newInstitution);
  }

  return newInstitution;
}

export function getInstitutionForEmail(email: string): Institution | null {
  const domain = email.toLowerCase().trim().split('@')[1];
  if (!domain) return null;
  return LAUNCH_INSTITUTIONS.find((inst) => domain === inst.domain || domain.endsWith(`.${inst.domain}`)) ?? null;
}

export function getInstitutionByCode(code: string): Institution | undefined {
  return LAUNCH_INSTITUTIONS.find((inst) => inst.code === code);
}

// --- Waitlist: schools not yet live ---

export interface WaitlistEntry {
  id: string;
  universityName: string;
  email: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

let waitlistState: WaitlistEntry[] = [
  {
    id: 'w1',
    universityName: 'Obafemi Awolowo University',
    email: 'coordinator@oauife.edu.ng',
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    status: 'pending',
  },
  {
    id: 'w2',
    universityName: 'Covenant University',
    email: 'admin@covenantuniversity.edu.ng',
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    status: 'pending',
  },
];

export interface JoinWaitlistPayload {
  universityName: string;
  email: string;
}

export async function joinWaitlist(payload: JoinWaitlistPayload): Promise<WaitlistEntry> {
  const waitlistId = generateUUID();

  try {
    const { error } = await supabase.from('waitlist_entries').insert({
      id: waitlistId,
      university_name: payload.universityName,
      email: payload.email,
      status: 'pending',
    });
    if (error) {
      console.warn('[Waitlist] Supabase insert error:', error.message);
    }
  } catch (err) {
    console.warn('[Waitlist] Exception joining waitlist:', err);
  }

  const created: WaitlistEntry = {
    id: waitlistId,
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
