// PRD Security Requirements > Password Policy: minimum 12 characters,
// at least one uppercase, one lowercase, one number, one special
// character; common passwords must be rejected.

// Small illustrative denylist, not exhaustive — a real backend should
// check against a proper breached/common-password list (e.g. a
// Have I Been Pwned–style k-anonymity check), not a hardcoded array.
const COMMON_PASSWORDS = new Set([
  'password123!',
  'password1234',
  'qwertyuiop12',
  '123456789012',
  'letmein12345',
  'welcome12345',
  'iloveyou1234',
]);

export interface PasswordCheck {
  id: string;
  label: string;
  met: boolean;
}

export function checkPassword(password: string): PasswordCheck[] {
  return [
    { id: 'length', label: 'At least 12 characters', met: password.length >= 12 },
    { id: 'upper', label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { id: 'lower', label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { id: 'number', label: 'One number', met: /[0-9]/.test(password) },
    { id: 'special', label: 'One special character', met: /[^A-Za-z0-9]/.test(password) },
    {
      id: 'common',
      label: 'Not a commonly used password',
      met: !COMMON_PASSWORDS.has(password.toLowerCase()),
    },
  ];
}

export function isPasswordValid(password: string): boolean {
  return checkPassword(password).every((c) => c.met);
}

export interface PasswordStrength {
  score: number; // 0-100
  label: 'Too weak' | 'Weak' | 'Medium' | 'Strong';
  color: 'critical' | 'warning' | 'brand' | 'success';
}

// Real-time strength meter shown under the password field. Distinct
// from isPasswordValid (the hard gate) — this is a softer, continuous
// signal, but still reflects the real policy above rather than a
// simplified one, since we chose not to weaken the actual requirement.
export function passwordStrength(password: string): PasswordStrength {
  const checks = checkPassword(password);
  const metCount = checks.filter((c) => c.met).length;
  const lengthBonus = Math.min(20, Math.max(0, password.length - 12) * 2);
  const score = Math.min(100, Math.round((metCount / checks.length) * 80) + lengthBonus);

  if (password.length === 0) return { score: 0, label: 'Too weak', color: 'critical' };
  if (score < 40) return { score, label: 'Weak', color: 'critical' };
  if (score < 70) return { score, label: 'Medium', color: 'warning' };
  if (score < 95) return { score, label: 'Strong', color: 'brand' };
  return { score, label: 'Strong', color: 'success' };
}

// Collegiate email domains — PRD requires verified school email
// addresses. Real deployment would check against each institution's
// actual registered domain (see Domain Authority Binding in the admin
// tools), not just the TLD; this is a reasonable client-side first pass.
export function isCollegiateEmail(email: string): boolean {
  const lower = email.toLowerCase().trim();
  return /\.(edu|edu\.ng)$/.test(lower.split('@')[1] ?? '');
}

// Basic format check only — NOT restricted to any institution domain.
// Anyone can register with any real email; whether it happens to match
// a launch university determines auto-verification, not eligibility to
// register at all (see getInstitutionForEmail in api/institutions.ts).
export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Username format: letters, numbers, dots, underscores; 3-24 chars.
export function isValidUsername(username: string): boolean {
  return /^[a-z0-9._]{3,24}$/i.test(username);
}
