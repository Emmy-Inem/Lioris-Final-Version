import { api } from './client';
import { UserProfile, UserRole } from './types';
import { withMockFallback } from './withMockFallback';
import { FALL_BACK_TO_MOCKS } from './config';

// Level thresholds — kept for anywhere gamification is genuinely shown
// (the Profile screen itself, per later screenshot cross-checks,
// doesn't surface XP/level UI as prominently as first assumed from the
// Kotlin source — see ProfileScreenBase.tsx).
export function nextLevelXp(level: number): number {
  if (level === 1) return 200;
  if (level === 3) return 500;
  if (level === 5) return 1000;
  if (level === 10) return 2000;
  return 5000;
}

const profileState = new Map<string, UserProfile>();

function mockProfileFor(user: { id: string; fullName: string; role: UserRole }): UserProfile {
  if (profileState.has(user.id)) return profileState.get(user.id)!;

  const created: UserProfile = {
    id: user.id,
    fullName: user.fullName,
    username: user.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '.'),
    email: `${user.id}@lioris.dev`,
    userType: user.role,
    graduationYear: null,
    connectionsCount: 0,
    bio: null,
    department: null,
    interests: [],
    institutionName: undefined,
    institutionCode: undefined,
    avatarUrl: null,
    coverUrl: null,
    isVerified: false,
    verificationStatus: 'none',
    xp: 0,
    level: 1,
    reputationScore: 0,
    trustLevel: 1,
    streakDays: 0,
    postsCount: 0,
    resourcesCount: 0,
    eventsCount: 0,
    badgesCount: 0,
    followersCount: 0,
    followingCount: 0,
  };
  profileState.set(user.id, created);
  return created;
}

export async function getMyProfile(user: {
  id: string;
  fullName: string;
  role: UserRole;
}): Promise<UserProfile> {
  return withMockFallback(async () => {
    const { data } = await api.get<UserProfile>('/profile/me');
    return data;
  }, mockProfileFor(user));
}

// Called right after registration so the username chosen on the signup
// form (not derived from fullName) is what the profile actually shows.
// Creates the profile record if it doesn't exist yet, since this runs
// before any getMyProfile call would have lazily created one.
export function seedProfileUsername(
  user: { id: string; fullName: string; role: UserRole },
  username: string,
  institution?: { code: string; name: string },
) {
  const base = mockProfileFor(user);
  profileState.set(user.id, {
    ...base,
    username,
    ...(institution
      ? {
          institutionCode: institution.code,
          institutionName: institution.name,
          isVerified: true,
          verificationStatus: 'verified' as const,
        }
      : {}),
  });
}

// Flips the profile's verificationStatus to 'pending' right after a
// verification application is submitted, so the Profile screen's
// banner reflects it on the next fetch — not just in local component
// state that would reset on reload.
export function markVerificationPending(userId: string) {
  const existing = profileState.get(userId);
  if (existing) {
    profileState.set(userId, { ...existing, verificationStatus: 'pending' });
  }
}

// Called when an Admin approves a verification request — actually
// grants the tick on the applicant's own profile, not just the request
// record. Rejection intentionally does NOT reset to 'none' here; the
// admin screen shows the rejection and the person can re-apply.
export function grantVerification(userId: string) {
  const existing = profileState.get(userId);
  if (existing) {
    profileState.set(userId, { ...existing, isVerified: true, verificationStatus: 'verified' });
  }
}

export function markVerificationRejected(userId: string) {
  const existing = profileState.get(userId);
  if (existing) {
    profileState.set(userId, { ...existing, verificationStatus: 'none' });
  }
}

// Backs the Profile screen's "Verify" button on the unverified-email
// banner. Awards the +150 XP the banner promises.
export async function verifyProfileEmail(userId: string): Promise<UserProfile> {
  if (!FALL_BACK_TO_MOCKS) {
    const { data } = await api.post<UserProfile>('/profile/me/verify-email');
    return data;
  }
  try {
    const { data } = await api.post<UserProfile>('/profile/me/verify-email');
    return data;
  } catch {
    const current = profileState.get(userId);
    if (!current) throw new Error('Profile not found');
    const updated: UserProfile = { ...current, isVerified: true, xp: current.xp + 150, reputationScore: current.reputationScore + 150 };
    profileState.set(userId, updated);
    return updated;
  }
}
