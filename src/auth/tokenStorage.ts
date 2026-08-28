import { Platform } from'react-native';
import * as SecureStore from'expo-secure-store';

const ACCESS_TOKEN_KEY = 'lioris.accessToken';
const REFRESH_TOKEN_KEY = 'lioris.refreshToken';
const SESSION_USER_KEY = 'lioris.sessionUser';

// expo-secure-store backs onto Keychain (iOS) / Keystore (Android),
// which is why tokens live here instead of AsyncStorage - PRD's
// Security Requirements call for encrypting sensitive data at rest.
//
// This app targets iOS/Android; expo-secure-store has no native web
// implementation, so calling it in a browser throws instead of
// degrading gracefully. The guard below keeps `expo start --web`
// (or someone opening the Metro web URL by accident) from hard-crashing.
// It is NOT a substitute for secure storage - do not treat the web
// fallback as safe for real tokens in production.
const isWeb = Platform.OS === 'web';

function webGet(key: string): string | null {
 try {
 return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
 } catch {
 return null;
 }
}

function webSet(key: string, value: string) {
 try {
 if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
 } catch {
 // no-op - best effort only, this path is dev/web-preview convenience, not production storage
 }
}

function webDelete(key: string) {
 try {
 if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
 } catch {
 // no-op
 }
}

export async function setTokens(accessToken: string, refreshToken: string) {
 if (isWeb) {
 webSet(ACCESS_TOKEN_KEY, accessToken);
 webSet(REFRESH_TOKEN_KEY, refreshToken);
 return;
 }
 await Promise.all([
 SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
 SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
 ]);
}

export async function getAccessToken() {
 if (isWeb) return webGet(ACCESS_TOKEN_KEY);
 return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken() {
 if (isWeb) return webGet(REFRESH_TOKEN_KEY);
 return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

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
}

export async function setSessionUser(user: StoredSessionUser) {
 const value = JSON.stringify(user);
 if (isWeb) {
 webSet(SESSION_USER_KEY, value);
 return;
 }
 await SecureStore.setItemAsync(SESSION_USER_KEY, value);
}

export async function getSessionUser(): Promise<StoredSessionUser | null> {
 const raw = isWeb ? webGet(SESSION_USER_KEY) : await SecureStore.getItemAsync(SESSION_USER_KEY);
 if (!raw) return null;
 try {
 return JSON.parse(raw);
 } catch {
 return null;
 }
}

export async function clearTokens() {
 if (isWeb) {
 webDelete(ACCESS_TOKEN_KEY);
 webDelete(REFRESH_TOKEN_KEY);
 webDelete(SESSION_USER_KEY);
 return;
 }
 await Promise.all([
 SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
 SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
 SecureStore.deleteItemAsync(SESSION_USER_KEY),
 ]);
}
