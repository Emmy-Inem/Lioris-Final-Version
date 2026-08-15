import { supabase } from './supabase';
import { generateUUID } from '../utils/uuid';

export interface Institution {
  code: string;
  name: string;
  domain: string;
}

export const LAUNCH_INSTITUTIONS: Institution[] = [
  { code: 'UNILAG', name: 'University of Lagos', domain: 'unilag.edu.ng' },
  { code: 'UI', name: 'University of Ibadan', domain: 'ui.edu.ng' },
  { code: 'FUNAAB', name: 'Federal University of Agriculture, Abeokuta', domain: 'funaab.edu.ng' },
];

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
