import { api } from './client';
import { UserProfile, UserRole } from './types';

import { supabase } from './supabase';
import { getInstitutionByCode, getInstitutionForEmail, LAUNCH_INSTITUTIONS } from './institutions';
import { getSessionUser } from '../auth/tokenStorage';

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

 if (!instCode) {
   if (emailLower.includes('ui.edu.ng') || emailLower.includes('diana.prince') || emailLower.includes('dr.adeyemi') || emailLower.includes('adeola')) {
     instCode = 'UI';
     instName = 'University of Ibadan';
   } else if (emailLower.includes('unilag.edu.ng')) {
     instCode = 'UNILAG';
     instName = 'University of Lagos';
   } else if (emailLower.includes('funaab.edu.ng')) {
     instCode = 'FUNAAB';
     instName = 'Federal University of Agriculture, Abeokuta';
   } else if (emailLower.includes('oau') || emailLower.includes('oauife.edu.ng')) {
     instCode = 'OAU';
     instName = 'Obafemi Awolowo University';
   } else if (emailLower.includes('unn.edu.ng')) {
     instCode = 'UNN';
     instName = 'University of Nigeria Nsukka';
   } else {
     instCode = 'UI';
     instName = 'University of Ibadan';
   }
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
 
 const campusCode = data.campus_code || fallback.institutionCode;
 const inst = getInstitutionByCode(campusCode) || {
 code: campusCode,
 name: campusCode === 'UNILAG' ? 'University of Lagos' : campusCode === 'FUNAAB' ? 'Federal University of Agriculture, Abeokuta' : 'University of Ibadan',
 domain: 'ui.edu.ng',
 };

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

export async function deleteMyAccount(userId?: string): Promise<{ success: boolean }> {
 let targetId = userId;
 if (!targetId) {
 const { data } = await supabase.auth.getUser();
 targetId = data?.user?.id;
 }
 if (targetId) {
 try {
 await supabase.from('profiles').delete().eq('id', targetId);
 profileState.delete(targetId);
 } catch {}
 }
 await supabase.auth.signOut().catch(() => {});
 return { success: true };
}
