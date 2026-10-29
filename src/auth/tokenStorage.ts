import { Platform } from'react-native';
import * as SecureStore from'expo-secure-store';

// This module no longer stores access / refresh tokens. The Supabase client (src/api/supabase.ts) is the
// only owner of the session; a second copy of the raw tokens in plain web localStorage was a pure
// liability. What remains is the small "session user" projection used to paint the dashboard instantly
// on a cold start, before the network confirms the session.
const SESSION_USER_KEY = 'lioris.sessionUser';
// Web only: the non-identifying part (ids, role, flags) lives in localStorage so a cold start in a new tab
// can still route instantly; name / e-mail / avatar / department live in sessionStorage only.
const WEB_CORE_KEY = 'lioris.sessionUser.core';
const WEB_PII_KEY = 'lioris.sessionUser.pii';
// Keys written by older builds. They are purged on sign-out and on every start.
const LEGACY_ACCESS_TOKEN_KEY = 'lioris.accessToken';
const LEGACY_REFRESH_TOKEN_KEY = 'lioris.refreshToken';

// expo-secure-store backs onto Keychain (iOS) / Keystore (Android). It has no web implementation, so
// the browser path below uses web storage instead, split as described above.
const isWeb = Platform.OS === 'web';

function webGet(store: 'local' | 'session', key: string): string | null {
 try {
 const s = store === 'local' ? (typeof localStorage !== 'undefined' ? localStorage : null) : (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
 return s ? s.getItem(key) : null;
 } catch {
 return null;
 }
}

function webSet(store: 'local' | 'session', key: string, value: string) {
 try {
 const s = store === 'local' ? (typeof localStorage !== 'undefined' ? localStorage : null) : (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
 if (s) s.setItem(key, value);
 } catch {
 // no-op - best effort only
 }
}

function webDelete(store: 'local' | 'session', key: string) {
 try {
 const s = store === 'local' ? (typeof localStorage !== 'undefined' ? localStorage : null) : (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
 if (s) s.removeItem(key);
 } catch {
 // no-op
 }
}

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

const memoryCache: Record<string, string> = {};

// Persisted session-user shape. onboardingComplete/onboardingStep are
// client-only scaffold concepts (the PRD's API contracts in Section 15
// don't define an onboarding-status field on the wire) - they exist so
// this app can tell"not authenticated"apart from"authenticated but
// mid-onboarding"and resume at the right step after a reload. Replace
// with a real server-tracked status once a backend exists.
export interface StoredSessionUser {
  id: string;
  fullName: string;
  email?: string;
  role: string;
  onboardingComplete: boolean;
  onboardingStep?: string;
  mfaVerified?: boolean;
  /**
   * The real, database-verified role behind an active "Preview Workspace As
   * Role" selection - always the role Supabase actually authenticated this
   * person as, never overwritten by previewing another role. `role` above
   * is the role being *displayed*; `actualRole` is who they really are, and
   * is what gates who can use the Role Switcher at all. Optional only for
   * backward-compatibility with sessions stored before this field existed
   * (treat a missing value as equal to `role`).
   */
  actualRole?: string;
  adminRole?: string | null;
  campusCode?: string | null;
  department?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  /** Database-backed student appointment; this is not an admin role. */
  isCampusAmbassador?: boolean;
  /** Which UI workspace the appointed student last chose. */
  workspaceMode?: 'default' | 'ambassador';
}

const PII_FIELDS = ['fullName', 'email', 'department', 'avatarUrl', 'coverUrl'] as const;

function splitForWeb(user: StoredSessionUser): { core: Record<string, unknown>; pii: Record<string, unknown> } {
  const core: Record<string, unknown> = {};
  const pii: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(user)) {
    if ((PII_FIELDS as readonly string[]).includes(k)) pii[k] = v;
    else core[k] = v;
  }
  return { core, pii };
}

function writeWebUser(user: StoredSessionUser) {
  const { core, pii } = splitForWeb(user);
  webSet('local', WEB_CORE_KEY, JSON.stringify(core));
  webSet('session', WEB_PII_KEY, JSON.stringify(pii));
}

export async function setSessionUser(user: StoredSessionUser | null) {
  if (!user) {
    await clearSessionUser();
    return;
  }
  const value = JSON.stringify(user);
  memoryCache[SESSION_USER_KEY] = value;
  if (isWeb) {
    writeWebUser(user);
    webDelete('local', SESSION_USER_KEY); // legacy copy with PII
    return;
  }
  try {
    await SecureStore.setItemAsync(SESSION_USER_KEY, value, SECURE_STORE_OPTIONS);
  } catch {
    // Retained in memoryCache
  }
}

export async function getSessionUser(): Promise<StoredSessionUser | null> {
  if (isWeb) {
    let coreRaw = webGet('local', WEB_CORE_KEY);
    let piiRaw = webGet('session', WEB_PII_KEY);
    if (!coreRaw) {
      // One-time migration of the old all-in-one localStorage record.
      const legacy = webGet('local', SESSION_USER_KEY);
      if (legacy) {
        try {
          writeWebUser(JSON.parse(legacy));
        } catch {
          // unreadable: dropped below
        }
        webDelete('local', SESSION_USER_KEY);
        coreRaw = webGet('local', WEB_CORE_KEY);
        piiRaw = webGet('session', WEB_PII_KEY);
      }
    }
    if (!coreRaw) {
      const mem = memoryCache[SESSION_USER_KEY];
      if (!mem) return null;
      try {
        return JSON.parse(mem);
      } catch {
        return null;
      }
    }
    try {
      const core = JSON.parse(coreRaw);
      const pii = piiRaw ? JSON.parse(piiRaw) : {};
      return { fullName: '', ...core, ...pii } as StoredSessionUser;
    } catch {
      return null;
    }
  }

  let raw: string | null = null;
  try {
    raw = await SecureStore.getItemAsync(SESSION_USER_KEY, SECURE_STORE_OPTIONS);
    if (raw !== null) memoryCache[SESSION_USER_KEY] = raw;
  } catch {
    raw = memoryCache[SESSION_USER_KEY] ?? null;
  }
  if (!raw) raw = memoryCache[SESSION_USER_KEY] ?? null;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function clearSessionUser() {
  delete memoryCache[SESSION_USER_KEY];
  if (isWeb) {
    webDelete('local', WEB_CORE_KEY);
    webDelete('session', WEB_PII_KEY);
    webDelete('local', SESSION_USER_KEY);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(SESSION_USER_KEY, SECURE_STORE_OPTIONS);
  } catch {
    // Ignore native cleanup errors
  }
}

/** Removes the raw tokens that older builds copied out of the Supabase session. Safe to call any time. */
export async function purgeLegacyTokenCopies() {
  if (isWeb) {
    webDelete('local', LEGACY_ACCESS_TOKEN_KEY);
    webDelete('local', LEGACY_REFRESH_TOKEN_KEY);
    return;
  }
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(LEGACY_ACCESS_TOKEN_KEY, SECURE_STORE_OPTIONS),
      SecureStore.deleteItemAsync(LEGACY_REFRESH_TOKEN_KEY, SECURE_STORE_OPTIONS),
    ]);
  } catch {
    // Ignore native cleanup errors
  }
}

/**
 * Forgets everything this module holds about the signed-in person: the cached session user and any legacy
 * token copies. (Name kept for the existing call sites; the Supabase session itself is cleared by signOut.)
 */
export async function clearTokens() {
  await clearSessionUser();
  await purgeLegacyTokenCopies();
}
