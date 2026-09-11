import { UserProfile, UserRole } from './types';

export interface VerificationDetails {
  isVerified: boolean;
  type: 'official' | 'student' | 'staff' | 'alumni' | 'unverified';
  badgeColor: string;
  label: string;
  explanation: string;
  verifiedSince?: string;
  institution?: string;
}

export type VerificationCandidate = Partial<UserProfile> & {
  role?: UserRole | string;
};

/**
 * Returns authentic social-media verification status and explanation
 * based on the user's institutional credential validation.
 */
export function getVerificationDetails(
  user?: VerificationCandidate | null,
): VerificationDetails {
  if (!user) {
    return {
      isVerified: false,
      type: 'unverified',
      badgeColor: '#94A3B8',
      label: 'Unverified Account',
      explanation: 'This account has not yet completed university ID validation.',
    };
  }

  const isVerified =
    user.isVerified === true ||
    user.verificationStatus === 'verified' ||
    user.role === 'admin' ||
    user.role === 'staff';

  if (!isVerified) {
    return {
      isVerified: false,
      type: 'unverified',
      badgeColor: '#94A3B8',
      label: 'Standard Account',
      explanation: 'This account has not completed official university credential validation.',
    };
  }

  if (user.role === 'admin') {
    return {
      isVerified: true,
      type: 'official',
      badgeColor: '#EAB308', // Official Gold for Administrators
      label: 'Platform Administration',
      explanation: 'Verified official administrative entity with platform governance authority.',
      institution: (user as any).institutionName || 'Campus Central',
    };
  }

  if (user.role === 'staff') {
    return {
      isVerified: true,
      type: 'staff',
      badgeColor: '#1D9BF0', // Authentic Social Blue
      label: 'Verified Faculty / Staff',
      explanation: 'Verified university faculty member or academic department staff.',
      institution: (user as any).institutionName || 'University Faculty',
    };
  }

  if (user.role === 'alumni') {
    return {
      isVerified: true,
      type: 'alumni',
      badgeColor: '#1D9BF0', // Authentic Social Blue
      label: 'Verified Alumni',
      explanation: 'Verified graduate with confirmed university degree credentials.',
      institution: (user as any).institutionName || 'Alumni Chapter',
    };
  }

  // Student
  return {
    isVerified: true,
    type: 'student',
    badgeColor: '#1D9BF0', // Authentic Social Blue
    label: 'Verified Campus Member',
    explanation: 'Official university matriculation identity confirmed via institutional email & student credentials.',
    institution: (user as any).institutionName || 'University Registry',
  };
}
