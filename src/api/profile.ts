import { UserProfile, UserRole } from './types';
import { getSeedBotProfileById } from '../data/seedBotProfiles';

import { assertWithinStorageQuota } from './platformSettings';
import { supabase } from './supabase';
import { getInstitutionByCode, getInstitutionForEmail } from './institutions';
import { clearTokens, getSessionUser } from '../auth/tokenStorage';
import { persistCampus } from '@/hooks/useViewScope';
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
  avatarUrl?: string | null;
  coverUrl?: string | null;
}): UserProfile {
  if (profileState.has(user.id)) {
    const existing = profileState.get(user.id)!;
    if (user.avatarUrl && !existing.avatarUrl) existing.avatarUrl = user.avatarUrl;
    if (user.coverUrl && !existing.coverUrl) existing.coverUrl = user.coverUrl;
    return existing;
  }

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
    avatarUrl: user.avatarUrl || undefined,
    coverUrl: user.coverUrl || undefined,
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
  avatarUrl?: string | null;
  coverUrl?: string | null;
}): Promise<UserProfile> {
 let resolvedUser: {
  id: string;
  fullName: string;
  role: UserRole;
  email?: string;
  adminRole?: 'super_admin' | 'campus_admin' | null;
  campusCode?: string | null;
  isSuperAdmin?: boolean;
  avatarUrl?: string | null;
  coverUrl?: string | null;
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
    avatarUrl: user.avatarUrl,
    coverUrl: user.coverUrl,
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
        avatarUrl: stored?.avatarUrl,
        coverUrl: stored?.coverUrl,
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
      const isMasterAdmin = emailLower === 'inememmanuel@gmail.com';
      const dbRole = isMasterAdmin ? 'admin' : ((data.role || resolvedUser.role) as UserRole);
      const isAdmin = dbRole === 'admin' || isMasterAdmin;
      const resolvedAdminRole = isMasterAdmin
        ? 'super_admin'
        : ((data.admin_role as 'super_admin' | 'campus_admin' | null | undefined) || (isAdmin ? (data.campus_code === 'GLOBAL' ? 'super_admin' : 'campus_admin') : null));
      const isSuperAdmin = isAdmin && resolvedAdminRole === 'super_admin';

     // Verification is decided on the SERVER and nowhere else. The old code also treated "has an
     // institutional e-mail" as verified here and tried to write 'verified' back to the profile;
     // the database refuses that write (members cannot verify themselves), so the screen said
     // "verified" while every campus query - which follows profiles.verification_status - still
     // answered "no access". Institutional addresses are verified by the auth trigger when the
     // inbox is confirmed (supabase_email_confirmation_2026.sql), so there is nothing to infer.
     const isVerified = isAdmin || data.verification_status === 'verified';

     const verificationStatus: 'none' | 'pending' | 'verified' = isVerified
       ? 'verified'
       : (data.verification_status === 'pending' ? 'pending' : 'none');

      let rawCampus = isSuperAdmin ? 'GLOBAL' : data.campus_code;
      if (!isSuperAdmin && (!rawCampus || rawCampus === 'GLOBAL')) {
        const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: null }));
        // Only the campus this member chose at sign-up (their own account metadata). A value left in
        // device storage by a previous account on a shared phone must never be written to this one.
        const metaCampus = authData?.user?.user_metadata?.campus_code as string | undefined;
        const candidate = metaCampus && metaCampus !== 'GLOBAL' ? metaCampus : undefined;

        if (candidate) {
          rawCampus = candidate;
          persistCampus(candidate);
          // The server decides; a refusal (e.g. an institutional e-mail locked to another campus) is fine.
          supabase.rpc('set_my_campus_code', { p_campus_code: candidate }).then(() => {}, () => {});
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
        avatarUrl: data.avatar_url || resolvedUser.avatarUrl || fallback.avatarUrl,
        coverUrl: data.banner_url || resolvedUser.coverUrl || fallback.coverUrl,
        resumeUrl: data.resume_url || null,
        graduationYear: data.graduation_year ?? fallback.graduationYear ?? null,
        industry: data.industry || null,
        company: data.company || null,
        jobTitle: data.job_title || null,
        location: data.location || null,
        linkedinUrl: data.linkedin_url || null,
        // Campus Ambassadors hold campus-admin authority in the database but
        // remain student representatives in member-facing profiles.
        userType: data.is_campus_ambassador ? 'student' : isAdmin ? 'admin' : dbRole,
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
  if (resolvedUser.avatarUrl && !fallback.avatarUrl) fallback.avatarUrl = resolvedUser.avatarUrl;
  if (resolvedUser.coverUrl && !fallback.coverUrl) fallback.coverUrl = resolvedUser.coverUrl;
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

function toArrayBufferFromInput(input: Blob | ArrayBuffer | string): Promise<ArrayBuffer> | ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  if (input instanceof Blob) return input.arrayBuffer();
  if (typeof input === 'string') {
    const cleanB64 = input.includes(',') ? input.split(',')[1] : input;
    if (/^[A-Za-z0-9+/=]+$/.test(cleanB64.trim()) && cleanB64.length > 20) {
      const binaryString = atob(cleanB64.trim());
      const len = binaryString.length;
      const u8 = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        u8[i] = binaryString.charCodeAt(i);
      }
      return u8.buffer;
    }
    return (async () => {
      try {
        if (input.startsWith('file://') || input.startsWith('/')) {
          const FileSystem = await import('expo-file-system');
          const b64 = await FileSystem.readAsStringAsync(input, { encoding: FileSystem.EncodingType.Base64 });
          const binaryString = atob(b64);
          const len = binaryString.length;
          const u8 = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            u8[i] = binaryString.charCodeAt(i);
          }
          return u8.buffer;
        }
      } catch {
        // Fall back to fetch
      }
      const res = await fetch(input);
      return res.arrayBuffer();
    })();
  }
  return new ArrayBuffer(0);
}

export async function uploadAvatarImage(
 userId: string,
 imageInput: Blob | ArrayBuffer | string,
 fileExt = 'jpg',
): Promise<string> {
 const { data: authData } = await supabase.auth.getUser();
 const effectiveUserId = authData?.user?.id || (userId && userId !== 'me' ? userId : null);
 if (!effectiveUserId) throw new Error('You must be signed in to upload a profile photo.');

 const buffer = await toArrayBufferFromInput(imageInput);
 const blobType = (imageInput instanceof Blob ? imageInput.type : '') || '';
 const rawExt = (blobType ? blobType.replace(/^image\//, '') : fileExt)
   .toLowerCase()
   .replace(/^jpeg$/, 'jpg');
 const normalizedExt = ['jpg', 'png', 'webp'].includes(rawExt) ? rawExt : 'jpg';
 await assertWithinStorageQuota(buffer.byteLength, 'image');
 const filePath = `${effectiveUserId}/avatar_${Date.now()}.${normalizedExt}`;
 const { error } = await supabase.storage.from('avatars').upload(filePath, buffer, {
   contentType: normalizedExt === 'png' ? 'image/png' : normalizedExt === 'webp' ? 'image/webp' : 'image/jpeg',
   upsert: true,
 });
 if (error) {
   throw new Error(getFriendlyErrorMessage(error, 'Could not upload the profile photo. Please try again.'));
 }
 const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
 const avatarUrl = publicUrlData?.publicUrl || filePath;

 await updateProfileImages(effectiveUserId, { avatarUrl });
 return avatarUrl;
}

export async function uploadCoverImage(
 userId: string,
 imageInput: Blob | ArrayBuffer | string,
 fileExt = 'jpg',
): Promise<string> {
 const { data: authData } = await supabase.auth.getUser();
 const effectiveUserId = authData?.user?.id || (userId && userId !== 'me' ? userId : null);
 if (!effectiveUserId) throw new Error('You must be signed in to upload a cover photo.');

 const buffer = await toArrayBufferFromInput(imageInput);
 const rawExt = fileExt.toLowerCase().replace(/^image\//, '').replace(/^jpeg$/, 'jpg');
 const normalizedExt = ['jpg', 'png', 'webp'].includes(rawExt) ? rawExt : 'jpg';
 await assertWithinStorageQuota(buffer.byteLength, 'image');

 const filePath = `${effectiveUserId}/cover_${Date.now()}.${normalizedExt}`;

 // Upload to avatars bucket (which is public) so cover photos never expire and display for unverified students
 let coverUrl = filePath;
 const { error: avatarUploadError } = await supabase.storage.from('avatars').upload(filePath, buffer, {
   contentType: normalizedExt === 'png' ? 'image/png' : normalizedExt === 'webp' ? 'image/webp' : 'image/jpeg',
   upsert: true,
 });

 if (!avatarUploadError) {
   const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
   coverUrl = publicUrlData?.publicUrl || filePath;
 } else {
   // Fallback to campus-media bucket
   const { error: mediaError } = await supabase.storage.from('campus-media').upload(filePath, buffer, {
     contentType: normalizedExt === 'png' ? 'image/png' : normalizedExt === 'webp' ? 'image/webp' : 'image/jpeg',
     upsert: true,
   });
   if (mediaError) {
     throw new Error(getFriendlyErrorMessage(mediaError, 'Could not upload the cover image. Please try again.'));
   }
   coverUrl = filePath;
 }

 try {
   await updateProfileImages(effectiveUserId, { coverUrl });
 } catch (error) {
   await supabase.storage.from('avatars').remove([filePath]).catch(() => undefined);
   await supabase.storage.from('campus-media').remove([filePath]).catch(() => undefined);
   throw error;
 }
 return coverUrl;
}

export async function updateProfileImages(
 userId: string,
 updates: { avatarUrl?: string | null; coverUrl?: string | null },
): Promise<UserProfile> {
 const { data: authData } = await supabase.auth.getUser();
 const effectiveUserId = authData?.user?.id || (userId && userId !== 'me' ? userId : null);
 if (!effectiveUserId) throw new Error('You must be signed in to update profile images.');

 const current = profileState.get(effectiveUserId) || defaultProfileFor({ id: effectiveUserId, fullName: 'You', role: 'student' });

 const patch: any = {};
 if (updates.avatarUrl !== undefined) patch.avatar_url = updates.avatarUrl;
 if (updates.coverUrl !== undefined) patch.banner_url = updates.coverUrl;
 if (Object.keys(patch).length > 0) {
   patch.updated_at = new Date().toISOString();
   const { data, error } = await supabase
     .from('profiles')
     .update(patch)
     .eq('id', effectiveUserId)
     .select('id, avatar_url, banner_url')
     .maybeSingle();
   if (error) throw new Error(getFriendlyErrorMessage(error, 'Could not update your profile image.'));
   // PostgREST can return no error when RLS silently excludes an UPDATE. Do
   // not tell the user their photo is saved unless the row came back.
   if (!data) throw new Error('Your profile image could not be saved. Please sign in again and retry.');
   if (updates.avatarUrl !== undefined && updates.avatarUrl !== null && data.avatar_url !== updates.avatarUrl) {
      if (!data.avatar_url?.endsWith(updates.avatarUrl) && !updates.avatarUrl?.endsWith(data.avatar_url)) {
        throw new Error('Your profile photo did not persist. Please try again.');
      }
    }
   if (updates.coverUrl !== undefined && updates.coverUrl !== null && data.banner_url !== updates.coverUrl) {
      if (!data.banner_url?.endsWith(updates.coverUrl) && !updates.coverUrl?.endsWith(data.banner_url)) {
        throw new Error('Your cover photo did not persist. Please try again.');
      }
    }
 }

 const updated: UserProfile = {
   ...current,
   ...(updates.avatarUrl !== undefined ? { avatarUrl: updates.avatarUrl } : {}),
   ...(updates.coverUrl !== undefined ? { coverUrl: updates.coverUrl } : {}),
 };
 profileState.set(effectiveUserId, updated);
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
      // `.select('id')` so a write that matched zero rows (RLS, signed-out session) is an error
      // instead of a silent "success".
      const { data: written, error } = await supabase.from('profiles').update(dbPatch).eq('id', userId).select('id');
      if (error) {
        if (error.code === '23505' || /unique|duplicate/i.test(error.message)) {
          throw new Error('This username is already taken. Please choose another.');
        }
        console.warn('[Profile] Supabase update warning:', error.message);
        throw new Error(getFriendlyErrorMessage(error, 'Could not update your profile. Please try again.'));
      }
      if (!written || written.length === 0) {
        throw new Error('Your profile could not be saved. Please sign in again and retry.');
      }

      if (patch.institutionCode !== undefined) {
        // The database is authoritative about the campus (institutional e-mails and verified members
        // are locked). Read back what actually stuck so the app never shows a campus the server
        // refused - supabase-js returns { error } instead of throwing, so this must be inspected.
        const cleanCode = patch.institutionCode.trim().toUpperCase();
        const { error: campusError } = await supabase.rpc('set_my_campus_code', { p_campus_code: cleanCode });
        const { data: stuck } = await supabase.from('profiles').select('campus_code').eq('id', userId).maybeSingle();
        const savedCampus = (stuck?.campus_code as string | undefined) || undefined;
        if (savedCampus && savedCampus !== cleanCode) {
          updated.institutionCode = savedCampus;
          const savedInst = getInstitutionByCode(savedCampus);
          if (savedInst) updated.institutionName = savedInst.name;
          persistCampus(savedCampus);
          if (campusError) {
            throw new Error(
              /locked|verified/i.test(campusError.message ?? '')
                ? `Your campus is locked to ${savedInst?.name ?? savedCampus}. Contact support if that is wrong.`
                : getFriendlyErrorMessage(campusError, 'Could not change your campus. Please try again.'),
            );
          }
        }
        try {
          await supabase.auth.updateUser({ data: { campus_code: savedCampus ?? cleanCode } });
        } catch {
          // non-blocking: account metadata is a convenience copy
        }
      }
    }
  } catch (err: any) {
    // Never pretend a failed save worked: the old "session fallback" kept the edit in memory only and
    // returned success, so the next reload silently reverted it.
    if (err instanceof Error && err.message) throw err;
    throw new Error('Could not update your profile. Please check your connection and try again.');
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
 *
 * The function re-authenticates the caller: it wants the CURRENT PASSWORD (or a sign-in newer than ten
 * minutes). When it answers `reauth_required` this throws an Error whose `code` is 'reauth_required' so the
 * screen can ask for the password and retry.
 */
export async function deleteMyAccount(password?: string): Promise<{ success: boolean }> {
  const { data, error } = await supabase.functions.invoke('delete-my-account', {
    body: { confirm: 'DELETE', ...(password ? { password } : {}) },
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
  if (message === 'reauth_required') {
    const reauth: Error & { code?: string } = new Error(
      password
        ? 'That password is not correct. Please try again.'
        : 'Enter your current password to delete your account.',
    );
    reauth.code = 'reauth_required';
    throw reauth;
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
        userType: data.is_campus_ambassador ? 'student' : dbRole,
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


// ---------------------------------------------------------------------------
// Own-row access and onboarding, backed by server functions
// ---------------------------------------------------------------------------

/**
 * Columns every signed-in member may read on ANY profile. Everything private (email, student id,
 * push token, last-login, ...) is NOT in this list on purpose: since the audit remediation
 * (supabase/migrations/20261028000000_audit_remediation.sql) the database refuses those columns on
 * direct reads, and a select that names one fails the WHOLE request with 42501.
 */
export const PUBLIC_PROFILE_COLUMNS =
  'id, full_name, username, role, campus_code, department, faculty, level, bio, interests, avatar_url, banner_url, verification_status, trust_score, is_suspended, onboarding_complete, admin_role, is_campus_ambassador';

/**
 * The caller's OWN profile row, private columns included (email, onboarding_step, deactivated_at).
 * Uses the get_my_profile() RPC; if the RPC is unavailable it degrades to the publicly readable
 * columns, so callers must treat the private ones as optional. Returns null only when no row can be
 * read at all (signed out, or the request failed).
 */
export async function getOwnProfileRow(userId?: string): Promise<Record<string, any> | null> {
  let id = userId;
  if (!id) {
    const { data } = await supabase.auth.getUser().catch(() => ({ data: null as any }));
    id = data?.user?.id;
    if (!id) id = (await getSessionUser())?.id;
  }
  if (!id) return null;

  try {
    const { data, error } = await supabase.rpc('get_my_profile');
    if (!error && data) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row && row.id === id) return row;
    }
  } catch {
    // fall through to the column read
  }

  try {
    const { data, error } = await supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq('id', id).maybeSingle();
    if (!error && data) return data as Record<string, any>;
  } catch {
    // network failure: nothing to return
  }
  return null;
}

export interface SavedAcademicProfile {
  campusCode: string;
  department: string;
  faculty: string | null;
  verificationStatus: string;
  /** True when the server kept a campus other than the one the member asked for. */
  campusLocked: boolean;
  lockReason: 'email_domain' | 'verified' | null;
}

/**
 * Saves campus + department (+ optional faculty, level, bio) through save_academic_profile() and
 * returns what the SERVER stored. Institutional e-mail addresses and verified members are locked to
 * their campus; the caller must display `campusCode`, never the value it asked for.
 */
export async function saveAcademicProfile(input: {
  campusCode: string;
  department: string;
  faculty?: string | null;
  level?: string | null;
  bio?: string | null;
}): Promise<SavedAcademicProfile> {
  const { data, error } = await supabase.rpc('save_academic_profile', {
    p_campus_code: input.campusCode,
    p_department: input.department,
    p_faculty: input.faculty ?? null,
    p_level: input.level ?? null,
    p_bio: input.bio ?? null,
  });
  if (error && (error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? ''))) {
    // Database not migrated yet (no save_academic_profile function): legacy path, but still reads back
    // what the server actually kept instead of trusting the value that was asked for.
    const me = await supabase.auth.getUser().catch(() => ({ data: null as any }));
    const uid: string | undefined = me.data?.user?.id;
    await updateMyProfile({
      institutionCode: input.campusCode,
      department: input.department,
      faculty: input.faculty ?? undefined,
      academicLevel: input.level ?? undefined,
      bio: input.bio ?? undefined,
    });
    const row = uid ? await getOwnProfileRow(uid) : null;
    const keptCampus = String(row?.campus_code ?? input.campusCode);
    persistCampus(keptCampus);
    return {
      campusCode: keptCampus,
      department: String(row?.department ?? input.department),
      faculty: (row?.faculty as string | null) ?? null,
      verificationStatus: String(row?.verification_status ?? 'unverified'),
      campusLocked: keptCampus !== input.campusCode.toUpperCase(),
      lockReason: null,
    };
  }
  if (error) {
    const msg = error.message ?? '';
    if (/department_required/i.test(msg)) throw new Error('Please choose your department to continue.');
    if (/invalid_campus/i.test(msg)) throw new Error('Please choose your university from the list.');
    throw new Error(getFriendlyErrorMessage(error, 'We could not save your academic profile. Check your connection and try again.'));
  }
  const row = (data ?? {}) as Record<string, any>;
  const campusCode = String(row.campus_code ?? input.campusCode);
  invalidateProfileCache((await supabase.auth.getUser().catch(() => ({ data: null as any }))).data?.user?.id ?? '');
  persistCampus(campusCode);
  return {
    campusCode,
    department: String(row.department ?? input.department),
    faculty: row.faculty ?? null,
    verificationStatus: String(row.verification_status ?? 'unverified'),
    campusLocked: row.campus_locked === true,
    lockReason: row.lock_reason === 'email_domain' || row.lock_reason === 'verified' ? row.lock_reason : null,
  };
}

/**
 * Marks onboarding finished ON THE SERVER and reports the real outcome. Throws when the database
 * refused (for example campus or department still missing) so the app never walks a member into the
 * dashboard that the next sign-in would bounce back to onboarding.
 */
export async function completeOnboardingOnServer(): Promise<{ onboardingComplete: boolean; campusCode: string | null; department: string | null }> {
  const { data, error } = await supabase.rpc('complete_my_onboarding');
  if (error) {
    if (/academic_profile_incomplete/i.test(error.message ?? '')) {
      throw new Error('ACADEMIC_PROFILE_INCOMPLETE');
    }
    throw new Error(getFriendlyErrorMessage(error, 'We could not finish setting up your account. Check your connection and try again.'));
  }
  const row = (data ?? {}) as Record<string, any>;
  return {
    onboardingComplete: row.onboarding_complete === true,
    campusCode: (row.campus_code as string | null) ?? null,
    department: (row.department as string | null) ?? null,
  };
}
