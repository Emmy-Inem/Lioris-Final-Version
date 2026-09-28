/**
 * Authentication Rate Limiting & Approaching Limit Warning Utility.
 *
 * Provides client-side rate limiting with storage persistence across page reloads
 * (using localStorage where available, with in-memory fallback for SSR/native).
 * Protects login, password recovery, confirmation resends, and OTP verification
 * against brute-force abuse, while proactively warning users when they approach thresholds.
 */

export interface AuthRateLimitStatus {
  allowed: boolean;
  totalAttempts: number;
  maxAttempts: number;
  remainingAttempts: number;
  isApproachingLimit: boolean;
  isLocked: boolean;
  lockedUntil?: number;
  remainingLockoutSeconds?: number;
  warningMessage?: string;
}

export interface StoredAttemptRecord {
  count: number;
  lastAttempt: number;
  lockedUntil?: number;
}

const LOGIN_STORAGE_KEY = 'lioris_rate_limit_login';
const RESET_STORAGE_KEY = 'lioris_rate_limit_reset';
const RESEND_STORAGE_KEY = 'lioris_rate_limit_resend';
const OTP_STORAGE_KEY = 'lioris_rate_limit_otp';

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const RESET_MAX_ATTEMPTS = 3;
export const RESET_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

const inMemoryStore: Record<string, Record<string, StoredAttemptRecord>> = {
  [LOGIN_STORAGE_KEY]: {},
  [RESET_STORAGE_KEY]: {},
  [RESEND_STORAGE_KEY]: {},
  [OTP_STORAGE_KEY]: {},
};

function getStorageRecord(storeKey: string, idKey: string): StoredAttemptRecord | null {
  const cleanId = idKey.toLowerCase().trim();
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed[cleanId]) {
          return parsed[cleanId];
        }
      }
    }
  } catch {
    // Fallback on memory store if storage access fails
  }
  return inMemoryStore[storeKey]?.[cleanId] || null;
}

function setStorageRecord(storeKey: string, idKey: string, record: StoredAttemptRecord): void {
  const cleanId = idKey.toLowerCase().trim();
  inMemoryStore[storeKey] = inMemoryStore[storeKey] || {};
  inMemoryStore[storeKey][cleanId] = record;

  try {
    if (typeof localStorage !== 'undefined') {
      let map: Record<string, StoredAttemptRecord> = {};
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        map = JSON.parse(raw) || {};
      }
      // Prune old entries older than 24 hours
      const now = Date.now();
      for (const k of Object.keys(map)) {
        if (map[k]?.lastAttempt && now - map[k].lastAttempt > 24 * 60 * 60 * 1000) {
          delete map[k];
        }
      }
      map[cleanId] = record;
      localStorage.setItem(storeKey, JSON.stringify(map));
    }
  } catch {
    // Fallback on memory store
  }
}

function clearStorageRecord(storeKey: string, idKey: string): void {
  const cleanId = idKey.toLowerCase().trim();
  if (inMemoryStore[storeKey]) {
    delete inMemoryStore[storeKey][cleanId];
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const map = JSON.parse(raw) || {};
        delete map[cleanId];
        localStorage.setItem(storeKey, JSON.stringify(map));
      }
    }
  } catch {
    // Fallback on memory store
  }
}

// ---------------------------------------------------------------------------
// 1. Password Login Rate Limiting
// ---------------------------------------------------------------------------

/**
 * Checks if the specified email account is currently throttled or locked out.
 * Throws an explicit Error with remaining lockout seconds if currently locked.
 */
export function checkLoginRateLimit(email: string): AuthRateLimitStatus {
  const clean = email.toLowerCase().trim();
  if (!clean) return { allowed: true, totalAttempts: 0, maxAttempts: LOGIN_MAX_ATTEMPTS, remainingAttempts: LOGIN_MAX_ATTEMPTS, isApproachingLimit: false, isLocked: false };

  const record = getStorageRecord(LOGIN_STORAGE_KEY, clean);
  const now = Date.now();

  if (!record) {
    return {
      allowed: true,
      totalAttempts: 0,
      maxAttempts: LOGIN_MAX_ATTEMPTS,
      remainingAttempts: LOGIN_MAX_ATTEMPTS,
      isApproachingLimit: false,
      isLocked: false,
    };
  }

  // Active lockout check
  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingSec = Math.max(1, Math.ceil((record.lockedUntil - now) / 1000));
    throw new Error(`Too many failed login attempts. Account temporarily locked for security. Please try again in ${remainingSec}s.`);
  }

  // Window expiration check: if last attempt was > 15 mins ago and not locked, reset
  if (now - record.lastAttempt > LOGIN_WINDOW_MS) {
    clearStorageRecord(LOGIN_STORAGE_KEY, clean);
    return {
      allowed: true,
      totalAttempts: 0,
      maxAttempts: LOGIN_MAX_ATTEMPTS,
      remainingAttempts: LOGIN_MAX_ATTEMPTS,
      isApproachingLimit: false,
      isLocked: false,
    };
  }

  const remaining = Math.max(0, LOGIN_MAX_ATTEMPTS - record.count);
  const isApproaching = record.count >= 3 && record.count < LOGIN_MAX_ATTEMPTS;

  return {
    allowed: true,
    totalAttempts: record.count,
    maxAttempts: LOGIN_MAX_ATTEMPTS,
    remainingAttempts: remaining,
    isApproachingLimit: isApproaching,
    isLocked: false,
  };
}

/**
 * Records a failed login attempt and calculates progressive lockouts or approaching warnings.
 */
export function recordLoginFailure(email: string): AuthRateLimitStatus {
  const clean = email.toLowerCase().trim();
  const now = Date.now();
  const existing = getStorageRecord(LOGIN_STORAGE_KEY, clean);

  // If previous record expired, start fresh
  const isExpired = existing && (now - existing.lastAttempt > LOGIN_WINDOW_MS) && (!existing.lockedUntil || now >= existing.lockedUntil);
  const currentCount = (existing && !isExpired) ? existing.count : 0;
  const newCount = currentCount + 1;

  let lockedUntil: number | undefined;
  let remainingLockoutSeconds: number | undefined;
  let warningMessage: string | undefined;

  if (newCount >= LOGIN_MAX_ATTEMPTS) {
    const lockoutSec = Math.min(300, 60 * (newCount - (LOGIN_MAX_ATTEMPTS - 1)));
    lockedUntil = now + lockoutSec * 1000;
    remainingLockoutSeconds = lockoutSec;
  } else if (newCount === 3) {
    warningMessage = 'Warning: 2 attempts remaining before temporary account lock.';
  } else if (newCount === 4) {
    warningMessage = 'Warning: 1 attempt remaining before temporary account lock.';
  }

  setStorageRecord(LOGIN_STORAGE_KEY, clean, {
    count: newCount,
    lastAttempt: now,
    lockedUntil,
  });

  const remaining = Math.max(0, LOGIN_MAX_ATTEMPTS - newCount);
  const isLocked = Boolean(lockedUntil && now < lockedUntil);

  return {
    allowed: !isLocked,
    totalAttempts: newCount,
    maxAttempts: LOGIN_MAX_ATTEMPTS,
    remainingAttempts: remaining,
    isApproachingLimit: newCount >= 3 && newCount < LOGIN_MAX_ATTEMPTS,
    isLocked,
    lockedUntil,
    remainingLockoutSeconds,
    warningMessage,
  };
}

/**
 * Resets failed login attempts upon successful authentication.
 */
export function clearLoginAttempts(email: string): void {
  clearStorageRecord(LOGIN_STORAGE_KEY, email);
}

// ---------------------------------------------------------------------------
// 2. Password Reset Request Rate Limiting
// ---------------------------------------------------------------------------

/**
 * Checks if the user has exceeded password reset requests for this window.
 */
export function checkPasswordResetRateLimit(email: string): void {
  const clean = email.toLowerCase().trim();
  if (!clean) return;

  const record = getStorageRecord(RESET_STORAGE_KEY, clean);
  const now = Date.now();

  if (!record) return;

  if (now - record.lastAttempt > RESET_WINDOW_MS) {
    clearStorageRecord(RESET_STORAGE_KEY, clean);
    return;
  }

  if (record.count >= RESET_MAX_ATTEMPTS) {
    const remainingMin = Math.max(1, Math.ceil((record.lastAttempt + RESET_WINDOW_MS - now) / 60000));
    throw new Error(`Too many password reset requests. For security, please wait ${remainingMin} minute(s) before requesting another recovery code.`);
  }
}

/**
 * Records a password reset request and generates an approaching-limit warning if on attempt 2.
 */
export function recordPasswordResetAttempt(email: string): { warning?: string } {
  const clean = email.toLowerCase().trim();
  const now = Date.now();
  const existing = getStorageRecord(RESET_STORAGE_KEY, clean);

  const isExpired = existing && (now - existing.lastAttempt > RESET_WINDOW_MS);
  const currentCount = (existing && !isExpired) ? existing.count : 0;
  const newCount = currentCount + 1;

  setStorageRecord(RESET_STORAGE_KEY, clean, {
    count: newCount,
    lastAttempt: now,
  });

  if (newCount === 2) {
    return { warning: 'Warning: You have 1 recovery code request remaining in this 15-minute window.' };
  } else if (newCount >= RESET_MAX_ATTEMPTS) {
    return { warning: 'Notice: Maximum password recovery requests reached for this 15-minute window.' };
  }

  return {};
}

// ---------------------------------------------------------------------------
// 3. Confirmation Email Resend Cooldown Rate Limiting
// ---------------------------------------------------------------------------

/**
 * Enforces a 60-second cooldown between email confirmation resends.
 */
export function checkResendCooldown(email: string): void {
  const clean = email.toLowerCase().trim();
  if (!clean) return;

  const record = getStorageRecord(RESEND_STORAGE_KEY, clean);
  const now = Date.now();

  if (!record) return;

  const elapsed = now - record.lastAttempt;
  if (elapsed < RESEND_COOLDOWN_MS) {
    const remainingSec = Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000));
    throw new Error(`Please wait ${remainingSec}s before requesting another confirmation code.`);
  }
}

/**
 * Records an email resend attempt timestamp.
 */
export function recordResendAttempt(email: string): void {
  const clean = email.toLowerCase().trim();
  const now = Date.now();
  setStorageRecord(RESEND_STORAGE_KEY, clean, {
    count: 1,
    lastAttempt: now,
  });
}

// ---------------------------------------------------------------------------
// 4. OTP / Verification Code Failure Rate Limiting
// ---------------------------------------------------------------------------

/**
 * Checks if OTP verification is currently locked due to too many invalid entries.
 */
export function checkOtpRateLimit(email: string): void {
  const clean = email.toLowerCase().trim();
  if (!clean) return;

  const record = getStorageRecord(OTP_STORAGE_KEY, clean);
  const now = Date.now();

  if (!record) return;

  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingSec = Math.max(1, Math.ceil((record.lockedUntil - now) / 1000));
    throw new Error(`Too many invalid code attempts. Verification temporarily locked. Please try again in ${remainingSec}s.`);
  }

  if (now - record.lastAttempt > OTP_WINDOW_MS) {
    clearStorageRecord(OTP_STORAGE_KEY, clean);
  }
}

/**
 * Records an invalid OTP attempt with warnings at attempts 3 & 4 and a 5-minute lockout at attempt 5.
 */
export function recordOtpFailure(email: string): { warning?: string; locked?: boolean; remainingSec?: number } {
  const clean = email.toLowerCase().trim();
  const now = Date.now();
  const existing = getStorageRecord(OTP_STORAGE_KEY, clean);

  const isExpired = existing && (now - existing.lastAttempt > OTP_WINDOW_MS) && (!existing.lockedUntil || now >= existing.lockedUntil);
  const currentCount = (existing && !isExpired) ? existing.count : 0;
  const newCount = currentCount + 1;

  let lockedUntil: number | undefined;
  let remainingSec: number | undefined;
  let warning: string | undefined;

  if (newCount >= OTP_MAX_ATTEMPTS) {
    const lockout = 300; // 5 minutes
    lockedUntil = now + lockout * 1000;
    remainingSec = lockout;
  } else if (newCount === 3) {
    warning = 'Warning: 2 verification attempts remaining before temporary lock.';
  } else if (newCount === 4) {
    warning = 'Warning: 1 verification attempt remaining before temporary lock.';
  }

  setStorageRecord(OTP_STORAGE_KEY, clean, {
    count: newCount,
    lastAttempt: now,
    lockedUntil,
  });

  return {
    warning,
    locked: Boolean(lockedUntil && now < lockedUntil),
    remainingSec,
  };
}

/**
 * Clears OTP failure history upon successful code verification.
 */
export function clearOtpFailures(email: string): void {
  clearStorageRecord(OTP_STORAGE_KEY, email);
}
