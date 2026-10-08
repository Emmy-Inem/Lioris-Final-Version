import { UserProfile, UserRole } from './types';
import { getSeedBotProfileById } from '../data/seedBotProfiles';

import { assertWithinStorageQuota } from './platformSettings';
import { supabase } from './supabase';
import { getInstitutionByCode, getInstitutionForEmail } from './institutions';
import { clearTokens, getSessionUser } from '../auth/tokenStorage';
import { persistCampus, getStoredCampus } from '@/hooks/useViewScope';
import { getFriendlyErrorMessage } from '../utils/errors';

export function nextLevelXp(level: number): number {
 if (level === 1) return 200;
 if (level === 3) return 500;
 if (level === 5) return 1000;
 if (level === 10) return 2000;
 return 5000;
}

const profileState = new Map<string, UserProfile>();

/**
 * Evict a single user from the in-memory profile cache so the next
 * getPublicProfile / getMyProfile call fetches fresh data from Supabase.
 * Call this after any admin verification action (approve / reject / direct).
 */
export function invalidateProfileCache(userId: string) {
  profileState.delete(userId);
}

/**
 * Default empty profile used while a user's `profiles` record is loading
 * from Supabase, or as a base for empty fields.
 */
function defaultProfileFor(user: {
  id: string;
  fullName: string;
  role: UserRole;
  email?: string;
  adminRole?: 'super_admin' | 'campus_admin' | null;
  campusCode?: string | null;
  isSuperAdmin?: boolean;
}): UserProfile {
  if (profileState.has(user.id)) return profileState.get(user.id)!;

  const emailLower = (user.email || '').toLowerCase().trim();
  const isMasterAdmin = emailLower === 'inememmanuel@gmail.com';
  const isAdmin = user.role === 'admin' || isMasterAdmin;
  const isSuperAdmin = isMasterAdmin || user.isSuperAdmin === true || user.adminRole === 'super_admin';
  const resolvedEmail = user.email || (isMasterAdmin ? 'inememmanuel@gmail.com' : `${user.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@lioris.edu`);
 const username = user.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '.');

 // Authoritatively derive campus institution from email domain
  const instEmailLower = resolvedEmail.toLowerCase();
 let inst = user.campusCode && user.campusCode !== 'GLOBAL'
   ? getInstitutionByCode(user.campusCode)
   : getInstitutionForEmail(instEmailLower);
 let instCode = inst?.code;
 let instName = inst?.name;

 if (!instCode || instCode === 'GLOBAL') {
   instCode = undefined;
   instName = undefined;
 }

 const matchedInst = user.email ? getInstitutionForEmail(user.email) : null;
 const isOfficialEmail = !!(matchedInst && matchedInst.code !== 'GLOBAL');
 // Admins are always verified regardless of email or DB status
 const isVerified = isAdmin || isOfficialEmail;
 const verificationStatus: 'none' | 'pending' | 'verified' = isVerified ? 'verified' : 'none';

 const created: UserProfile = {
   id: user.id,
   fullName: user.fullName || 'User',
   username,
   email: resolvedEmail,
   userType: isAdmin ? 'admin' : user.role,
    adminRole: isSuperAdmin ? 'super_admin' : (isAdmin ? (user.adminRole || 'campus_admin') : null),
    graduationYear: undefined,
    bio: '',
    department: 'General Studies',
    interests: [],
    institutionName: instName,
    institutionCode: isSuperAdmin ? 'GLOBAL' : instCode,
    avatarUrl: undefined,
    coverUrl: undefined,
    isVerified,
    isCampusAmbassador: false,
    verificationStatus,
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
 actualRole?: UserRole;
 adminRole?: 'super_admin' | 'campus_admin' | null;
 isSuperAdmin?: boolean;
 campusCode?: string | null;
 email?: string;
}): Promise<UserProfile> {
 let resolvedUser: {
   id: string;
   fullName: string;
   role: UserRole;
   email?: string;
   adminRole?: 'super_admin' | 'campus_admin' | null;
   campusCode?: string | null;
   isSuperAdmin?: boolean;
 } = {
 id: 'me',
 fullName: 'User',
 role: 'student',
 };

 if (user) {
 resolvedUser = {
 id: user.id,
 fullName: user.fullName || 'User',
 role: (user.actualRole || user.role || 'student') as UserRole,
 email: user.email,
 adminRole: user.adminRole,
 campusCode: user.campusCode,
 isSuperAdmin: user.isSuperAdmin,
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
 adminRole: stored?.adminRole === 'super_admin' ? 'super_admin' : stored?.adminRole === 'campus_admin' ? 'campus_admin' : null,
 campusCode: stored?.campusCode,
 isSuperAdmin: stored?.adminRole === 'super_admin',
 };
 }
 }

 const fallback = defaultProfileFor(resolvedUser);
  try {
    let data: any = null;
    let error: any = null;

    const fullRes = await supabase
      .from('profiles')
      .select('id, full_name, username, bio, department, faculty, level, interests, campus_code, avatar_url, banner_url, resume_url, verification_status, role, admin_role, is_suspended, is_campus_ambassador, graduation_year, industry, company, job_title, location, linkedin_url')
      .eq('id', resolvedUser.id)
      .maybeSingle();

    if (!fullRes.error && fullRes.data) {
      data = fullRes.data;
    } else if (fullRes.error) {
      // Degrade gracefully if admin_role column does not exist on profiles table yet
      const fallbackRes = await supabase
        .from('profiles')
        .select('id, full_name, username, bio, department, faculty, level, interests, campus_code, avatar_url, banner_url, resume_url, verification_status, role, is_suspended, is_campus_ambassador, graduation_year, industry, company, job_title, location, linkedin_url')
        .eq('id', resolvedUser.id)
        .maybeSingle();
      if (!fallbackRes.error && fallbackRes.data) {
        data = fallbackRes.data;
      } else {
        error = fallbackRes.error;
      }
    }

    if (data) {
      const emailLower = (resolvedUser.email || '').toLowerCase().trim();
      const isPersonalAccount =
        emailLower.endsWith('@gmail.com') ||
        emailLower.endsWith('@yahoo.com') ||
        emailLower.endsWith('@hotmail.com') ||
        emailLower.endsWith('@outlook.com');
      const isMasterAdmin = emailLower === 'inememmanuel@gmail.com';
      const dbRole = isMasterAdmin ? 'admin' : ((data.role || resolvedUser.role) as UserRole);
      const isAdmin = dbRole === 'admin' || isMasterAdmin;
      const resolvedAdminRole = isMasterAdmin
        ? 'super_admin'
        : ((data.admin_role as 'super_admin' | 'campus_admin' | null | undefined) || (isAdmin ? (data.campus_code === 'GLOBAL' ? 'super_admin' : 'campus_admin') : null));
      const isSuperAdmin = isAdmin && resolvedAdminRole === 'super_admin';

     const matchedInst = resolvedUser.email ? getInstitutionForEmail(resolvedUser.email) : null;
     const isOfficialEmail = !!(matchedInst && matchedInst.code !== 'GLOBAL' && !isPersonalAccount);
     const isDbVerified = data.verification_status === 'verified';

     // Admins are always verified; DB-verified or official-email users are verified
     // unless explicitly rejected (rejected status overrides official email)
     const isVerified =
       isAdmin ||
       ((isDbVerified || isOfficialEmail) && data.verification_status !== 'rejected');

     const verificationStatus: 'none' | 'pending' | 'verified' = isVerified
       ? 'verified'
       : (data.verification_status === 'pending' ? 'pending' : 'none');

     // Quietly sync verified status if official institutional email and not yet verified
     if (isOfficialEmail && !isAdmin && data.verification_status !== 'verified') {
       supabase.from('profiles').update({ verification_status: 'verified' }).eq('id', resolvedUser.id).then(() => {}, () => {});
     }

      let rawCampus = isSuperAdmin ? 'GLOBAL' : data.campus_code;
      if (!isSuperAdmin && (!rawCampus || rawCampus === 'GLOBAL')) {
        const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: null }));
        const metaCampus = authData?.user?.user_metadata?.campus_code as string | undefined;
        const stored = await getStoredCampus();
        const candidate = (metaCampus && metaCampus !== 'GLOBAL')
          ? metaCampus
          : (stored && stored !== 'GLOBAL')
          ? stored
          : undefined;

        if (candidate) {
          rawCampus = candidate;
          persistCampus(candidate);
          supabase.rpc('set_my_campus_code', { p_campus_code: candidate }).then(() => {}, () => {});
          supabase.from('profiles').update({ campus_code: candidate }).eq('id', resolvedUser.id).then(() => {}, () => {});
        }
      }

      const campusCode = isSuperAdmin
        ? 'GLOBAL'
        : (rawCampus && rawCampus !== 'GLOBAL') ? rawCampus : fallback.institutionCode;
      const inst = (campusCode && campusCode !== 'GLOBAL') ? getInstitutionByCode(campusCode) : null;

     const merged: UserProfile = {
       ...fallback,
       adminRole: resolvedAdminRole,
        fullName: data.full_name || fallback.fullName,
        username: data.username || fallback.username,
        bio: data.bio || fallback.bio,
        department: data.department || fallback.department,
        faculty: data.faculty || fallback.faculty,
        academicLevel: data.level || fallback.academicLevel,
        interests: data.interests || fallback.interests,
        institutionName: inst?.name || fallback.institutionName || 'Campus Network',
        institutionCode: isSuperAdmin ? 'GLOBAL' : (inst?.code || fallback.institutionCode),
        avatarUrl: data.avatar_url || fallback.avatarUrl,
        coverUrl: data.banner_url || fallback.coverUrl,
        resumeUrl: data.resume_url || null,
        graduationYear: data.graduation_year ?? fallback.graduationYear ?? null,
        industry: data.industry || null,
        company: data.company || null,
        jobTitle: data.job_title || null,
        location: data.location || null,
        linkedinUrl: data.linkedin_url || null,
        userType: isAdmin ? 'admin' : dbRole,
       isVerified,
       isCampusAmbassador: !!data.is_campus_ambassador,
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
  if (institution?.code && institution.code !== 'GLOBAL') {
    persistCampus(institution.code);
  }
  const base = defaultProfileFor(user);
  profileState.set(user.id, {
    ...base,
    username,
    ...(institution
      ? {
          institutionCode: institution.code,
          institutionName: institution.name,
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
 const { data, error } = await supabase.auth.getUser();
 if (error || !data.user || data.user.id !== userId) {
 throw new Error('Could not verify the signed-in account. Please sign in again.');
 }
 if (!data.user.email_confirmed_at) {
 throw new Error('Your email address has not been confirmed yet.');
 }
 const profile = await getPublicProfile(userId);
 if (!profile) throw new Error('Profile not found');
 return profile;
}

export async function uploadAvatarImage(
 userId: string,
 imageBlob: Blob | ArrayBuffer,
 fileExt = 'jpg',
): Promise<string> {
 const normalizedExt = fileExt.toLowerCase().replace(/^image\//, '') === 'png' ? 'png' :
   fileExt.toLowerCase().replace(/^image\//, '') === 'webp' ? 'webp' : 'jpg';
 const byteLength = imageBlob instanceof ArrayBuffer ? imageBlob.byteLength : imageBlob.size;
 await assertWithinStorageQuota(byteLength, 'image');
 const filePath = `${userId}/avatar_${Date.now()}.${normalizedExt}`;
 const { error } = await supabase.storage.from('avatars').upload(filePath, imageBlob, {
 contentType: normalizedExt === 'png' ? 'image/png' : normalizedExt === 'webp' ? 'image/webp' : 'image/jpeg',
 upsert: true,
 });
 if (error) {
 throw new Error(getFriendlyErrorMessage(error, 'Could not upload the profile photo. Please try again.'));
 }
 const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
 const avatarUrl = publicUrlData?.publicUrl || filePath;

 await updateProfileImages(userId, { avatarUrl });
 return avatarUrl;
}

export async function uploadCoverImage(
 userId: string,
 imageBlob: Blob | ArrayBuffer,
 fileExt = 'jpg',
): Promise<string> {
 const rawExt = fileExt.toLowerCase().replace(/^image\//, '').replace(/^jpeg$/, 'jpg');
 const normalizedExt = ['jpg', 'png', 'webp'].includes(rawExt) ? rawExt : 'jpg';
 const byteLength = imageBlob instanceof ArrayBuffer ? imageBlob.byteLength : imageBlob.size;
 await assertWithinStorageQuota(byteLength, 'image');
 const filePath = `${userId}/cover_${Date.now()}.${normalizedExt}`;
 const { error } = await supabase.storage.from('campus-media').upload(filePath, imageBlob, {
   contentType: normalizedExt === 'png' ? 'image/png' : normalizedExt === 'webp' ? 'image/webp' : 'image/jpeg',
   upsert: true,
 });
 if (error) {
   throw new Error(getFriendlyErrorMessage(error, 'Could not upload the cover image. Please try again.'));
 }
 // campus-media is private. Persist the stable object path; components mint
 // short-lived signed URLs when rendering it. A public URL here worked only
 // before the bucket was secured and is why some covers appeared broken.
 const coverUrl = filePath;
 try {
   await updateProfileImages(userId, { coverUrl });
 } catch (error) {
   await supabase.storage.from('campus-media').remove([filePath]).catch(() => undefined);
   throw error;
 }
 return coverUrl;
}

export async function updateProfileImages(
 userId: string,
 updates: { avatarUrl?: string | null; coverUrl?: string | null },
): Promise<UserProfile> {
 const current = profileState.get(userId) || defaultProfileFor({ id: userId, fullName: 'You', role: 'student' });

 const patch: any = {};
 if (updates.avatarUrl !== undefined) patch.avatar_url = updates.avatarUrl;
 if (updates.coverUrl !== undefined) patch.banner_url = updates.coverUrl;
 if (Object.keys(patch).length > 0) {
   patch.updated_at = new Date().toISOString();
   const { data, error } = await supabase
     .from('profiles')
     .update(patch)
     .eq('id', userId)
     .select('id, avatar_url, banner_url')
     .maybeSingle();
   if (error) throw new Error(getFriendlyErrorMessage(error, 'Could not update your profile image.'));
   // PostgREST can return no error when RLS silently excludes an UPDATE. Do
   // not tell the user their photo is saved unless the row came back.
   if (!data) throw new Error('Your profile image could not be saved. Please sign in again and retry.');
   if (updates.avatarUrl !== undefined && data.avatar_url !== updates.avatarUrl) {
     throw new Error('Your profile photo did not persist. Please try again.');
   }
   if (updates.coverUrl !== undefined && data.banner_url !== updates.coverUrl) {
     throw new Error('Your cover photo did not persist. Please try again.');
   }
 }

 const updated: UserProfile = {
   ...current,
   ...(updates.avatarUrl !== undefined ? { avatarUrl: updates.avatarUrl } : {}),
   ...(updates.coverUrl !== undefined ? { coverUrl: updates.coverUrl } : {}),
 };
 profileState.set(userId, updated);

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

 try {
 const dbPatch: any = {
 updated_at: new Date().toISOString(),
 };
   if (patch.fullName !== undefined) dbPatch.full_name = patch.fullName.trim();
   if (patch.username !== undefined) {
     const cleanUsername = patch.username.trim().toLowerCase().replace(/[^a-z0-9._]/g, '');
     dbPatch.username = cleanUsername;
     updated.username = cleanUsername;
   }
   if (patch.bio !== undefined) dbPatch.bio = patch.bio;
   if (patch.department !== undefined) dbPatch.department = patch.department;
   if (patch.faculty !== undefined) dbPatch.faculty = patch.faculty;
   if (patch.academicLevel !== undefined) dbPatch.level = patch.academicLevel;
   if (patch.interests !== undefined) dbPatch.interests = patch.interests;
   if (patch.institutionCode !== undefined) {
     const cleanCode = patch.institutionCode.trim().toUpperCase();
     dbPatch.campus_code = cleanCode;
     updated.institutionCode = cleanCode;
     const inst = getInstitutionByCode(cleanCode);
     if (inst) updated.institutionName = inst.name;
     persistCampus(cleanCode);
   }
   if (patch.avatarUrl !== undefined) dbPatch.avatar_url = patch.avatarUrl;
   if (patch.coverUrl !== undefined) dbPatch.banner_url = patch.coverUrl;
   if (patch.resumeUrl !== undefined) dbPatch.resume_url = patch.resumeUrl;
   if (patch.graduationYear !== undefined) dbPatch.graduation_year = patch.graduationYear;
   if (patch.industry !== undefined) dbPatch.industry = patch.industry;
   if (patch.company !== undefined) dbPatch.company = patch.company;
   if (patch.jobTitle !== undefined) dbPatch.job_title = patch.jobTitle;
   if (patch.location !== undefined) dbPatch.location = patch.location;
   if (patch.linkedinUrl !== undefined) dbPatch.linkedin_url = patch.linkedinUrl ? patch.linkedinUrl.trim() : null;

    if (userId !== 'me') {
      const { error } = await supabase.from('profiles').update(dbPatch).eq('id', userId);
      if (error) {
        if (error.code === '23505' || /unique|duplicate/i.test(error.message)) {
          throw new Error('This username is already taken. Please choose another.');
        }
        console.warn('[Profile] Supabase update warning:', error.message);
        throw new Error(getFriendlyErrorMessage(error, 'Could not update your profile. Please try again.'));
      }

     if (patch.institutionCode !== undefined) {
       const cleanCode = patch.institutionCode.trim().toUpperCase();
       try {
         await supabase.rpc('set_my_campus_code', { p_campus_code: cleanCode });
       } catch {
         // non-blocking
       }
       try {
         await supabase.auth.updateUser({ data: { campus_code: cleanCode } });
       } catch {
         // non-blocking
       }
     }
   }
 } catch (err: any) {
   if (err?.message?.includes('already taken') || (err?.message && !err.message.includes('fetch'))) {
     throw err;
   }
   // Session fallback for offline/network
 }

 profileState.set(userId, updated);
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

/**
 * Pauses the account (distinct from permanent deletion): logging back in
 * clears it automatically - see reactivateMyAccount() and the deactivated_at
 * check in AuthContext's sign-in flow.
 */
export async function deactivateMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('deactivate_my_account');
  if (error) {
    throw new Error(error.message || 'Could not deactivate your account. Please try again.');
  }
}

/** Called automatically on a successful sign-in when the profile is deactivated. */
export async function reactivateMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('reactivate_my_account');
  if (error) {
    throw new Error(error.message || 'Could not reactivate your account. Please try again.');
  }
}

export async function getPublicProfile(userId: string): Promise<UserProfile | null> {
  if (!userId) return null;
  const cached = profileState.get(userId);
  if (cached) {
    return cached;
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, username, bio, department, interests, campus_code, avatar_url, banner_url, verification_status, is_campus_ambassador, role, admin_role, graduation_year, industry, company, job_title, location, directory_hide_company, directory_hide_location, directory_hide_job_title, linkedin_url')
      .eq('id', userId)
      .single();

    if (!error && data) {
      const inst = data.campus_code ? getInstitutionByCode(data.campus_code) : null;
      const dbRole = (data.role || 'student') as UserRole;
      const isAdmin = dbRole === 'admin';
      // Admins are always verified; others rely on DB verification_status
      const isVerified = isAdmin || data.verification_status === 'verified';
      const userProfile: UserProfile = {
        id: data.id,
        fullName: data.full_name || 'Campus Member',
        username: data.username || data.full_name?.toLowerCase().replace(/[^a-z0-9]+/g, '.') || 'user',
        email: '',
        userType: dbRole,
        adminRole: (data.admin_role as any) || (isAdmin ? (data.campus_code === 'GLOBAL' ? 'super_admin' : 'campus_admin') : null),
        graduationYear: data.graduation_year ?? null,
        bio: data.bio || '',
        department: data.department || 'Academic',
        industry: data.industry || null,
        company: data.directory_hide_company ? null : (data.company || null),
        jobTitle: data.directory_hide_job_title ? null : (data.job_title || null),
        location: data.directory_hide_location ? null : (data.location || null),
        linkedinUrl: data.linkedin_url || null,
        institutionName: inst?.name || (data.campus_code && data.campus_code !== 'GLOBAL' ? data.campus_code : 'Campus'),
        institutionCode: inst?.code || data.campus_code || undefined,
        avatarUrl: data.avatar_url || undefined,
        coverUrl: data.banner_url || undefined,
        isVerified,
        isCampusAmbassador: !!data.is_campus_ambassador,
        verificationStatus: isVerified ? 'verified' : (data.verification_status === 'pending' ? 'pending' : 'none'),
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

  const seedBot = getSeedBotProfileById(userId);
  if (seedBot) {
    profileState.set(userId, seedBot);
    return seedBot;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Peer skill endorsements (public.skill_endorsements)
// ---------------------------------------------------------------------------

export interface SkillEndorsementSummary {
  skill: string;
  count: number;
  /** Whether the signed-in viewer has already endorsed this skill - lets the UI toggle endorse/un-endorse. */
  endorsedByMe: boolean;
}

async function currentProfileUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  if (data?.user?.id) return data.user.id;
  const stored = await getSessionUser();
  return stored?.id ?? null;
}

/**
 * Per-skill endorsement counts for a profile, aggregated from the raw
 * skill_endorsements rows (readable by any signed-in member), plus whether
 * the signed-in viewer has already endorsed each one. Skills nobody has
 * endorsed yet simply do not appear in the result.
 */
export async function getSkillEndorsements(profileId: string): Promise<SkillEndorsementSummary[]> {
  const { data, error } = await supabase
    .from('skill_endorsements')
    .select('skill, endorser_id')
    .eq('profile_id', profileId);
  if (error) {
    throw new Error(getFriendlyErrorMessage(error, 'Could not load skill endorsements.'));
  }

  const viewerId = await currentProfileUserId();
  const bySkill = new Map<string, { count: number; endorsedByMe: boolean }>();
  for (const row of data ?? []) {
    const entry = bySkill.get(row.skill) ?? { count: 0, endorsedByMe: false };
    entry.count += 1;
    if (viewerId && row.endorser_id === viewerId) entry.endorsedByMe = true;
    bySkill.set(row.skill, entry);
  }
  return Array.from(bySkill.entries()).map(([skill, { count, endorsedByMe }]) => ({ skill, count, endorsedByMe }));
}

/**
 * Endorses another member's listed skill as the signed-in user. The server
 * also refuses a self-endorsement (skill_endorsements_not_self_chk) - this
 * client-side check just gives a friendlier message for the same case; the
 * UI itself should never offer the affordance on the profile owner's own
 * skills in the first place.
 */
export async function endorseSkill(profileId: string, skill: string): Promise<void> {
  const userId = await currentProfileUserId();
  if (!userId) throw new Error('Please sign in again to continue.');
  const cleanSkill = skill.trim();
  if (!cleanSkill) throw new Error('That skill is not valid.');
  if (userId === profileId) throw new Error('You cannot endorse your own skill.');

  const { error } = await supabase
    .from('skill_endorsements')
    .insert({ profile_id: profileId, skill: cleanSkill, endorser_id: userId });
  if (error) {
    if (error.code === '23505' || /duplicate|unique/i.test(error.message)) {
      throw new Error('You have already endorsed this skill.');
    }
    throw new Error(getFriendlyErrorMessage(error, 'Could not endorse this skill.'));
  }
}

/** Removes the signed-in user's own endorsement of a skill (a no-op if they had not endorsed it). */
export async function removeEndorsement(profileId: string, skill: string): Promise<void> {
  const userId = await currentProfileUserId();
  if (!userId) throw new Error('Please sign in again to continue.');

  const { error } = await supabase
    .from('skill_endorsements')
    .delete()
    .eq('profile_id', profileId)
    .eq('skill', skill)
    .eq('endorser_id', userId);
  if (error) {
    throw new Error(getFriendlyErrorMessage(error, 'Could not remove your endorsement.'));
  }
}

/**
 * Admin action: designates or revokes Campus Ambassador status for a student.
 */
export async function setCampusAmbassadorStatus(userId: string, isAmbassador: boolean): Promise<void> {
  const { error: rpcError } = await supabase.rpc('set_campus_ambassador_status', {
    p_user_id: userId,
    p_is_ambassador: isAmbassador,
  });

  if (rpcError) {
    // Fallback to direct update if RPC is pending migration
    const { error: directError } = await supabase
      .from('profiles')
      .update({ is_campus_ambassador: isAmbassador })
      .eq('id', userId);
    if (directError) {
      throw new Error(getFriendlyErrorMessage(directError, 'Could not update campus ambassador status.'));
    }
  }

  const cached = profileState.get(userId);
  if (cached) {
    profileState.set(userId, { ...cached, isCampusAmbassador: isAmbassador });
  }
}
