export interface MinimalUserProfile {
  email?: string;
  isVerified?: boolean;
  verificationStatus?: 'none' | 'pending' | 'verified' | 'rejected' | string;
  userType?: string;
}

const KNOWN_INSTITUTION_DOMAINS = [
  'unilag.edu.ng',
  'ui.edu.ng',
  'funaab.edu.ng',
  'unaab.edu.ng',
  'unn.edu.ng',
  'oauife.edu.ng',
  'covenantuniversity.edu.ng',
];

const INSTITUTION_NAMES: Record<string, string> = {
  GLOBAL: 'Lioris Global Network',
  UNILAG: 'University of Lagos',
  UI: 'University of Ibadan',
  FUNAAB: 'Federal University of Agriculture, Abeokuta',
  UNN: 'University of Nigeria Nsukka',
  OAU: 'Obafemi Awolowo University',
  CU: 'Covenant University',
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
 * Returns true if:
 * 1. The account is unverified (isVerified is false or verificationStatus !== 'verified')
 * 2. AND the email does NOT belong to an official university institutional domain (.edu.ng)
 * 3. AND the account is not an administrator or staff.
 */
export function isUnverifiedPersonalUser(
  profile: MinimalUserProfile | null | undefined,
): boolean {
  if (!profile) return false;

  // Admins and staff have elevated verification privilege
  if (profile.userType === 'admin' || profile.userType === 'staff') {
    return false;
  }

  // Already verified via approved document or domain
  if (profile.isVerified || profile.verificationStatus === 'verified') {
    return false;
  }

  // Check if the email belongs to an official university domain
  if (profile.email && isOfficialInstitutionalEmail(profile.email)) {
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
