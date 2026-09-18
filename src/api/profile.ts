import { api } from './client';
import { UserProfile, UserRole } from './types';

import { supabase } from './supabase';
import { getInstitutionByCode, getInstitutionForEmail, LAUNCH_INSTITUTIONS } from './institutions';
import { clearTokens, getSessionUser } from '../auth/tokenStorage';

export function nextLevelXp(level: number): number {
 if (level === 1) return 200;
 if (level === 3) return 500;
 if (level === 5) return 1000;
 if (level === 10) return 2000;
 return 5000;
}

const profileState = new Map<string, UserProfile>();

/**
 * Default empty profile used while a user's `profiles` record is loading
 * from Supabase, or as a base for empty fields.
 */
function defaultProfileFor(user: { id: string; fullName: string; role: UserRole; email?: string }): UserProfile {
 if (profileState.has(user.id)) return profileState.get(user.id)!;

 const isAlumni = user.role === 'alumni';
 const isStaff = user.role === 'staff';
 const isAdmin = user.role === 'admin';
 const resolvedEmail = user.email || `${user.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@lioris.edu`;
 const username = user.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '.');

 // Authoritatively derive campus institution from email domain or demo identity
 const emailLower = resolvedEmail.toLowerCase();
 let inst = getInstitutionForEmail(emailLower);
 let instCode = inst?.code;
 let instName = inst?.name;

 // getInstitutionForEmail already matches on the email domain, including
 // every demo account (all @ui.edu.ng). The substring ladder that used to
 // live here only ran for *unrecognised* domains, where it guessed badly -
 // `includes('oau')` assigned joaustin@some-school.edu to Obafemi Awolowo.
 // An unknown domain has no campus, so fall back to the default explicitly.
  if (!instCode || instCode === 'GLOBAL') {
    instCode = 'UI';
    instName = 'University of Ibadan';
  }

 const created: UserProfile = {
 id: user.id,
 fullName: user.fullName,
 username,
 email: resolvedEmail,
 userType: user.role,
 graduationYear: undefined,
 bio: '',
 department: 'Computer Science',
 interests: [],
 institutionName: instName || 'University of Ibadan',
 institutionCode: instCode || 'UI',
 avatarUrl: undefined,
 coverUrl: undefined,
 isVerified: isAdmin,
 verificationStatus: isAdmin ? 'verified' : 'none',
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

export async function getMyProfile(user?: {
 id: string;
 fullName?: string;
 role?: UserRole;
 email?: string;
}): Promise<UserProfile> {
 let resolvedUser: { id: string; fullName: string; role: UserRole; email?: string } = {
 id: 'me',
 fullName: 'User',
 role: 'student',
 };

 if (user) {
 resolvedUser = {
 id: user.id,
 fullName: user.fullName || 'User',
 role: (user.role || 'student') as UserRole,
 email: user.email,
 };
 } else {
 const { data: authData } = await supabase.auth.getUser();
 if (authData?.user) {
 resolvedUser = {
 id: authData.user.id,
 fullName: authData.user.user_metadata?.full_name || 'User',
 role: (authData.user.user_metadata?.role || 'student') as UserRole,
 email: authData.user.email,
 };
 } else {
 const stored = await getSessionUser();
 resolvedUser = {
 id: stored?.id || 'me',
 fullName: stored?.fullName || 'User',
 role: (stored?.role || 'student') as UserRole,
 email: stored?.email,
 };
 }
 }

 const fallback = defaultProfileFor(resolvedUser);
 try {
 const { data, error } = await supabase
 .from('profiles')
 .select('id, full_name, username, bio, department, interests, campus_code, avatar_url, banner_url, verification_status, role, is_suspended')
 .eq('id', resolvedUser.id)
 .single();
 if (!error && data) {
 const isVerified = data.verification_status === 'verified';
 const verificationStatus = data.verification_status || (isVerified ? 'verified' : 'none');
 
    const isStudent = data.role === 'student' || resolvedUser.role === 'student';
    const rawCampus = data.campus_code;
    let campusCode = (rawCampus && rawCampus !== 'GLOBAL') ? rawCampus : fallback.institutionCode;
    if (isStudent && (!campusCode || campusCode === 'GLOBAL')) {
      campusCode = 'UI';
    }
    const inst = (campusCode && campusCode !== 'GLOBAL' ? getInstitutionByCode(campusCode) : null) || {
      code: 'UI',
      name: 'University of Ibadan',
      domain: 'ui.edu.ng',
    };

    // Quietly sync back to Supabase if the student's campus_code was set to GLOBAL or empty
    if (isStudent && (data.campus_code === 'GLOBAL' || !data.campus_code)) {
      supabase.from('profiles').update({ campus_code: 'UI' }).eq('id', resolvedUser.id).then(() => {}, () => {});
    }

 const merged: UserProfile = {
 ...fallback,
 fullName: data.full_name || fallback.fullName,
 username: data.username || fallback.username,
 bio: data.bio || fallback.bio,
 department: data.department || fallback.department,
 interests: data.interests || fallback.interests,
 institutionName: inst.name,
 institutionCode: inst.code,
 avatarUrl: data.avatar_url || fallback.avatarUrl,
 coverUrl: data.banner_url || fallback.coverUrl,
 isVerified,
 verificationStatus,
 };
 profileState.set(resolvedUser.id, merged);
 return merged;
 }
 } catch {
 // Session fallback
 }
 return fallback;
}

export function seedProfileUsername(
 user: { id: string; fullName: string; role: UserRole },
 username: string,
 institution?: { code: string; name: string },
) {
 const base = defaultProfileFor(user);
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
 try {
 const { data } = await api.post<UserProfile>('/profile/me/verify-email');
 return data;
 } catch {
 const current = profileState.get(userId);
 if (!current) throw new Error('Profile not found');
 const updated: UserProfile = { ...current, isVerified: true };
 profileState.set(userId, updated);
 return updated;
 }
}

export async function uploadAvatarImage(
 userId: string,
 imageBlob: Blob | ArrayBuffer,
 fileExt = 'jpg',
): Promise<string> {
 const filePath = `${userId}/avatar_${Date.now()}.${fileExt}`;
 const { error } = await supabase.storage.from('avatars').upload(filePath, imageBlob, {
 contentType: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`,
 upsert: true,
 });
 if (error) {
 console.warn('[Profile] Upload avatar error:', error.message);
 }
 const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
 const avatarUrl = publicUrlData?.publicUrl || filePath;

 try {
 await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId);
 } catch {
 // fallback
 }

 await updateProfileImages(userId, { avatarUrl });
 return avatarUrl;
}

export async function uploadCoverImage(
 userId: string,
 imageBlob: Blob | ArrayBuffer,
 fileExt = 'jpg',
): Promise<string> {
 const filePath = `${userId}/cover_${Date.now()}.${fileExt}`;
 const { error } = await supabase.storage.from('campus-media').upload(filePath, imageBlob, {
   contentType: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`,
   upsert: true,
 });
 if (error) {
   console.warn('[Profile] Upload cover error:', error.message);
 }
 const { data: publicUrlData } = supabase.storage.from('campus-media').getPublicUrl(filePath);
 const coverUrl = publicUrlData?.publicUrl || filePath;

 try {
   await supabase.from('profiles').update({ banner_url: coverUrl }).eq('id', userId);
 } catch {
   // fallback
 }

 await updateProfileImages(userId, { coverUrl });
 return coverUrl;
}

export async function updateProfileImages(
 userId: string,
 updates: { avatarUrl?: string | null; coverUrl?: string | null },
): Promise<UserProfile> {
  const current = profileState.get(userId) || defaultProfileFor({ id: userId, fullName: 'You', role: 'student' });
 const updated: UserProfile = {
 ...current,
 ...(updates.avatarUrl !== undefined ? { avatarUrl: updates.avatarUrl } : {}),
 ...(updates.coverUrl !== undefined ? { coverUrl: updates.coverUrl } : {}),
 };
 profileState.set(userId, updated);

 try {
 const patch: any = {};
 if (updates.avatarUrl !== undefined) patch.avatar_url = updates.avatarUrl;
 if (updates.coverUrl !== undefined) patch.banner_url = updates.coverUrl;
 await supabase.from('profiles').update(patch).eq('id', userId);
 } catch {
 // fallback
 }

 return updated;
}

export async function updateMyProfile(
 userIdOrPatch: string | Partial<UserProfile>,
 maybePatch?: Partial<UserProfile>,
): Promise<UserProfile> {
 let userId: string;
 let patch: Partial<UserProfile>;

 if (typeof userIdOrPatch === 'string') {
 userId = userIdOrPatch;
 patch = maybePatch || {};
 } else {
 patch = userIdOrPatch;
 const { data } = await supabase.auth.getUser();
 const stored = await getSessionUser();
 userId = data?.user?.id || stored?.id || 'me';
 }

  const current = profileState.get(userId) || defaultProfileFor({ id: userId, fullName: 'You', role: 'student' });
 const updated: UserProfile = { ...current, ...patch };
 profileState.set(userId, updated);

 try {
 const dbPatch: any = {
 updated_at: new Date().toISOString(),
 };
 if (patch.fullName !== undefined) dbPatch.full_name = patch.fullName;
 if (patch.bio !== undefined) dbPatch.bio = patch.bio;
 if (patch.department !== undefined) dbPatch.department = patch.department;
 if (patch.interests !== undefined) dbPatch.interests = patch.interests;
 if (patch.institutionCode !== undefined) dbPatch.campus_code = patch.institutionCode;
 if (patch.avatarUrl !== undefined) dbPatch.avatar_url = patch.avatarUrl;
 if (patch.coverUrl !== undefined) dbPatch.banner_url = patch.coverUrl;

 if (userId !== 'me') {
 await supabase.from('profiles').update(dbPatch).eq('id', userId);
 }
 } catch {
 // Session fallback
 }

 return updated;
}

/**
 * Permanently deletes the signed-in user's account. The heavy lifting (storage
 * files, database rows and the auth login itself) happens server-side in the
 * `delete-my-account` edge function, because a client cannot delete its own
 * auth user or every dependent row. On success the local session is wiped.
 * Server errors (for example the last-admin protection) are surfaced verbatim.
 */
export async function deleteMyAccount(): Promise<{ success: boolean }> {
  const { data, error } = await supabase.functions.invoke('delete-my-account', {
    body: { confirm: 'DELETE' },
  });

  let message: string | null = null;
  if (error) {
    message = error.message || null;
    // FunctionsHttpError carries the JSON body of the failed response in `context`.
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === 'function') {
      try {
        const body = await (ctx as Response).clone().json();
        if (body && typeof body.error === 'string') message = body.error;
        else if (body && typeof body.message === 'string') message = body.message;
      } catch {}
    }
  } else if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string') {
    message = (data as { error: string }).error;
  }
  if (message !== null || error) {
    const friendly =
      message && !/non-2xx|Failed to send a request/i.test(message)
        ? message
        : 'We could not delete your account right now. Please check your connection and try again, or contact support.';
    throw new Error(friendly);
  }

  profileState.clear();
  await clearTokens().catch(() => {});
  await supabase.auth.signOut().catch(() => {});
  return { success: true };
}

/** GDPR/NDPA data portability & access: returns everything we hold about the caller as JSON. */
export async function exportMyData(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) {
    throw new Error(error.message || 'We could not prepare your data export. Please try again.');
  }
  return (data ?? {}) as Record<string, unknown>;
}

export async function getPublicProfile(userId: string): Promise<UserProfile | null> {
  if (!userId) return null;
  const cached = profileState.get(userId);
  if (cached) return cached;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, username, bio, department, interests, campus_code, avatar_url, banner_url, verification_status, role')
      .eq('id', userId)
      .single();

    if (!error && data) {
      const inst = data.campus_code ? getInstitutionByCode(data.campus_code) : null;
      const isVerified = data.verification_status === 'verified';
      const userProfile: UserProfile = {
        id: data.id,
        fullName: data.full_name || 'Campus Member',
        username: data.username || data.full_name?.toLowerCase().replace(/[^a-z0-9]+/g, '.') || 'user',
        email: '',
        userType: (data.role || 'student') as UserRole,
        graduationYear: undefined,
        bio: data.bio || '',
        department: data.department || 'Academic',
        interests: data.interests || [],
        institutionName: inst?.name || 'University of Ibadan',
        institutionCode: inst?.code || data.campus_code || 'UI',
        avatarUrl: data.avatar_url || undefined,
        coverUrl: data.banner_url || undefined,
        isVerified,
        verificationStatus: data.verification_status || (isVerified ? 'verified' : 'none'),
        postsCount: 0,
        resourcesCount: 0,
        eventsCount: 0,
        badgesCount: 0,
        followersCount: 0,
        followingCount: 0,
      };
      profileState.set(userId, userProfile);
      return userProfile;
    }
  } catch (err) {
    console.warn('[Profile] getPublicProfile lookup failed:', err);
  }
  return null;
}
