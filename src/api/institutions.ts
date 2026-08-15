import { FALL_BACK_TO_MOCKS } from './config';
import { api } from './client';

export interface Institution {
  code: string;
  name: string;
  domain: string;
}

/**
 * Launching with exactly these 3 universities. Any other school goes
 * through the waitlist (see below) rather than being able to register
 * directly — this is the single source of truth other files should
 * import from, replacing what used to be 3 separately hardcoded copies
 * of roughly the same list (AppHeader, ChangeWorkspaceScopeModal, the
 * Admin Workdesk's scope selector).
 */
export const LAUNCH_INSTITUTIONS: Institution[] = [
  { code: 'UNILAG', name: 'University of Lagos', domain: 'unilag.edu.ng' },
  { code: 'UI', name: 'University of Ibadan', domain: 'ui.edu.ng' },
  { code: 'FUNAAB', name: 'Federal University of Agriculture, Abeokuta', domain: 'funaab.edu.ng' },
];

/**
 * Matches a registration email's domain against a launch institution.
 * Returns null for anything else — those emails should be routed to
 * the waitlist instead of allowed to self-register, since we aren't
 * live at their school yet.
 */
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

// Backs the "Join Waitlist" card on the login screen. Submissions land
// in the same store the Admin Workdesk's Approvals tab reads from, so
// there's a real (if fully mock) loop between the two.
export async function joinWaitlist(payload: JoinWaitlistPayload): Promise<WaitlistEntry> {
  const created: WaitlistEntry = {
    id: `w-${Date.now()}`,
    universityName: payload.universityName,
    email: payload.email,
    submittedAt: new Date().toISOString(),
    status: 'pending',
  };
  if (!FALL_BACK_TO_MOCKS) {
    await api.post('/waitlist', payload);
    return created;
  }
  try {
    await api.post('/waitlist', payload);
  } catch {
    // Expected in mock mode — fall through to local state below.
  }
  waitlistState = [...waitlistState, created];
  return created;
}

export async function listWaitlist(): Promise<WaitlistEntry[]> {
  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.get<{ items: WaitlistEntry[] }>('/waitlist');
    return data.items;
  }
  try {
    const { data } = await api.get<{ items: WaitlistEntry[] }>('/waitlist');
    return data.items;
  } catch {
    return waitlistState.filter((w) => w.status === 'pending');
  }
}

export async function respondToWaitlistEntry(id: string, status: 'approved' | 'rejected'): Promise<void> {
  waitlistState = waitlistState.map((w) => (w.id === id ? { ...w, status } : w));
}
