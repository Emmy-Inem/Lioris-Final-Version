export interface MinimalUserProfile {
  id?: string;
  email?: string;
  isVerified?: boolean;
  verificationStatus?: 'none' | 'pending' | 'verified' | 'rejected' | string;
  userType?: string;
  role?: string;
  actualRole?: string;
  adminRole?: string | null;
  isSuperAdmin?: boolean;
  isCampusAdmin?: boolean;
}

const KNOWN_INSTITUTION_DOMAINS = [
  'unilag.edu.ng',
  'ui.edu.ng',
  'funaab.edu.ng',
  'unaab.edu.ng',
  'unn.edu.ng',
  'oauife.edu.ng',
  'covenantuniversity.edu.ng',
  'kdu.edu.ng',
  'koladaisiuniversity.edu.ng',
  'noun.edu.ng',
  'esut.edu.ng',
  'madonnauniversity.edu.ng',
];

const INSTITUTION_NAMES: Record<string, string> = {
  GLOBAL: 'Lioris Global Network',
  UNILAG: 'University of Lagos',
  UI: 'University of Ibadan',
  FUNAAB: 'Federal University of Agriculture, Abeokuta',
  UNN: 'University of Nigeria Nsukka',
  OAU: 'Obafemi Awolowo University',
  CU: 'Covenant University',
  KDU: 'Koladaisi University',
  NOUN: 'National Open University of Nigeria',
  ESUT: 'Enugu State University of Science and Technology',
  MUN: 'Madonna University, Nigeria',
};

/**
 * Checks whether an email address belongs to an accredited university domain (.edu.ng)
 */
export function isOfficialInstitutionalEmail(email?: string | null): boolean {
  if (!email) return false;
  const domain = email.toLowerCase().trim().split('@')[1];
  if (!domain) return false;
  if (domain.endsWith('.edu.ng')) return true;
  return KNOWN_INSTITUTION_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Checks if a user is an unverified personal account.
 * 
 * Returns false (meaning user has FULL verified access) if:
 * 1. The account is a Super Admin or Platform Administrator.
 * 2. The account is staff.
 * 3. The account has isVerified = true or verificationStatus = 'verified'.
 * 4. The account uses an official accredited university email (.edu.ng).
 */
export function isUnverifiedPersonalUser(
  profile: MinimalUserProfile | null | undefined,
): boolean {
  if (!profile) return false;

  const emailLower = (profile.email || '').toLowerCase().trim();
  const isMasterAdminEmail = emailLower === 'inememmanuel@gmail.com';

  // Super admins, admins, and staff have absolute verified access everywhere across the platform
  if (
    isMasterAdminEmail ||
    profile.isSuperAdmin ||
    profile.userType === 'admin' ||
    profile.role === 'admin' ||
    profile.actualRole === 'admin' ||
    profile.adminRole === 'super_admin' ||
    profile.adminRole === 'campus_admin' ||
    profile.userType === 'staff' ||
    profile.role === 'staff' ||
    profile.actualRole === 'staff'
  ) {
    return false;
  }

  // Already verified via approved document or domain
  if (profile.isVerified || profile.verificationStatus === 'verified') {
    return false;
  }

  // Check if the email belongs to an official university domain (unless explicitly rejected)
  if (profile.verificationStatus !== 'rejected' && profile.email && isOfficialInstitutionalEmail(profile.email)) {
    return false;
  }

  // Personal email (@gmail, @yahoo, etc.) and unverified
  return true;
}

/**
 * Returns formatted campus verification strings for UI gates.
 */
export function getCampusVerificationInfo(campusCode?: string) {
  const code = (campusCode && campusCode !== 'GLOBAL' && campusCode !== 'ALL') ? campusCode.toUpperCase() : 'CAMPUS';
  const institutionName = INSTITUTION_NAMES[code] || (code === 'CAMPUS' ? 'University' : `${code} Campus`);

  return {
    campusCode: code,
    institutionName,
    lockTitle: `Verified ${code} Students Only`,
    commentsGateMessage: `Comments and student discussions on this thread are restricted to verified ${code} members to prevent outsider snooping and maintain student safety.`,
    venueGateMessage: `Exact physical classroom coordinates, hall details, and meeting links are restricted to verified ${code} students.`,
    chatGateMessage: `Peer channels and student community chats are locked for unverified personal email accounts. Upload your student ID to unlock full access.`,
    postGateMessage: `Posting to the ${code} campus node is reserved for verified students.`,
  };
}
