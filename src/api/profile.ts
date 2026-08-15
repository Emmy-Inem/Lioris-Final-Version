import { api } from'./client';
import { UserProfile, UserRole } from'./types';
import { withMockFallback } from'./withMockFallback';
import { FALL_BACK_TO_MOCKS } from'./config';

export function nextLevelXp(level: number): number {
  if (level === 1) return 200;
  if (level === 3) return 500;
  if (level === 5) return 1000;
  if (level === 10) return 2000;
  return 5000;
}

const profileState = new Map<string, UserProfile>();

function mockProfileFor(user: { id: string; fullName: string; role: UserRole; email?: string }): UserProfile {
  if (profileState.has(user.id)) return profileState.get(user.id)!;

  const isAlumni = user.role === 'alumni';
  const isStaff = user.role === 'staff';
  const isAdmin = user.role === 'admin';
  const isSpecialAdmin = user.email?.toLowerCase().includes('inememmanuel') || user.id.includes('inememmanuel');

  const resolvedEmail = user.email || (isSpecialAdmin ? 'inememmanuel@gmail.com' : `${user.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@lioris.edu`);

  const created: UserProfile = {
    id: user.id,
    fullName: isSpecialAdmin ? 'Inem Emmanuel' : user.fullName,
    username: isSpecialAdmin ? 'inememmanuel' : user.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '.'),
    email: resolvedEmail,
    userType: isSpecialAdmin ? 'admin' : user.role,
    graduationYear: isAlumni ? 2022 : 2026,
    connectionsCount: isAlumni ? 142 : 48,
    bio: isSpecialAdmin
      ? 'Platform Root Administrator & Campus Architect. Overseeing multi-campus workspaces, security policies & moderation.'
      : isAlumni
      ? 'Lead Software Engineer @ Paystack. Mentoring student developers and sponsoring open STEM research.'
      : isStaff
      ? 'Faculty Coordinator & Lecturer, Department of Computer Sciences. Campus Tech Advisor.'
      : isAdmin
      ? 'Platform Root Administrator. Overseeing campus multi-node workspaces & moderation.'
      : 'Computer Science senior building mobile systems & AI apps. Active campus peer mentor.',
    department: 'Computer Science & AI',
    interests: ['Software Engineering', 'Cloud Architecture', 'Mobile Systems', 'Campus AI', 'UI/UX Design'],
    institutionName: 'University of Ibadan',
    institutionCode: 'UI',
    avatarUrl: isSpecialAdmin
      ? 'avatar_male_2'
      : isAlumni
      ? 'avatar_female'
      : isStaff
      ? 'avatar_mentor'
      : isAdmin
      ? 'avatar_alumni_2'
      : 'avatar_male',
    coverUrl: 'campus_students_photo',
    isVerified: true,
    verificationStatus: 'verified',
    xp: isSpecialAdmin ? 3200 : 850,
    level: isSpecialAdmin ? 10 : 4,
    reputationScore: isSpecialAdmin ? 980 : 320,
    trustLevel: isSpecialAdmin ? 10 : 8,
    streakDays: 28,
    postsCount: isSpecialAdmin ? 16 : 4,
    resourcesCount: isSpecialAdmin ? 24 : 6,
    eventsCount: isSpecialAdmin ? 12 : 5,
    badgesCount: isSpecialAdmin ? 8 : 3,
    followersCount: isSpecialAdmin ? 340 : 88,
    followingCount: isSpecialAdmin ? 120 : 64,
  };
  profileState.set(user.id, created);
  return created;
}

export async function getMyProfile(user: {
  id: string;
  fullName: string;
  role: UserRole;
  email?: string;
}): Promise<UserProfile> {
  return withMockFallback(async () => {
    const { data } = await api.get<UserProfile>('/profile/me');
    return data;
  }, mockProfileFor(user));
}

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
          verificationStatus: 'verified'as const,
        }
      : {}),
  });
}

export function markVerificationPending(userId: string) {
  const existing = profileState.get(userId);
  if (existing) {
    profileState.set(userId, { ...existing, verificationStatus: 'pending' });
  }
}

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

export async function updateProfileImages(
  userId: string,
  updates: { avatarUrl?: string | null; coverUrl?: string | null },
): Promise<UserProfile> {
  const current = profileState.get(userId) || mockProfileFor({ id: userId, fullName: 'You', role: 'student' });
  const updated: UserProfile = {
    ...current,
    ...(updates.avatarUrl !== undefined ? { avatarUrl: updates.avatarUrl } : {}),
    ...(updates.coverUrl !== undefined ? { coverUrl: updates.coverUrl } : {}),
  };
  profileState.set(userId, updated);
  return updated;
}

export async function updateMyProfile(userId: string, patch: Partial<UserProfile>): Promise<UserProfile> {
  return withMockFallback(
    async () => {
      const { data } = await api.patch<UserProfile>('/profile/me', patch);
      return data;
    },
    (() => {
      const current = profileState.get(userId) || mockProfileFor({ id: userId, fullName: 'You', role: 'student' });
      const updated: UserProfile = { ...current, ...patch };
      profileState.set(userId, updated);
      return updated;
    })(),
  );
}
