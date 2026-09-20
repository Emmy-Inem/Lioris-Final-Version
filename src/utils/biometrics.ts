import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/api/supabase';
import {
  base64UrlToBuffer,
  classifyPasswordCheckError,
  describeBiometricMethod,
  PasswordCheckFailure,
} from './webauthnEncoding';

export const BIOMETRICS_ENABLED_KEY = 'lioris_setting_biometrics';
export const BIOMETRICS_CREDENTIAL_ID_KEY = 'lioris_biometric_cred_id';
export const APP_LOCK_SESSION_KEY = 'lioris_app_locked_session';

const isWeb = Platform.OS === 'web';

export async function getStoredPref(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch {
      return null;
    }
    return null;
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setStoredPref(key: string, value: string): Promise<void> {
  if (isWeb) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch {}
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {}
}

export async function removeStoredPref(key: string): Promise<void> {
  if (isWeb) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {}
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {}
}

type ShieldListener = (enabled: boolean) => void;
const shieldListeners = new Set<ShieldListener>();

/**
 * Turns the App Shield on or off and tells the lock overlay straight away. Settings used to write
 * the preference directly, but the overlay only read it once at startup, so toggling the shield had
 * no effect until the app was reloaded (and turning it off left the lock armed).
 */
export async function setShieldEnabled(enabled: boolean): Promise<void> {
  await setStoredPref(BIOMETRICS_ENABLED_KEY, enabled ? 'true' : 'false');
  shieldListeners.forEach((listener) => listener(enabled));
}

export function subscribeToShield(listener: ShieldListener): () => void {
  shieldListeners.add(listener);
  return () => {
    shieldListeners.delete(listener);
  };
}

/** Name of the unlock method on this device, e.g. "fingerprint or screen lock". */
export function getBiometricMethodLabel(): string {
  if (!isWeb || typeof navigator === 'undefined') return 'device biometrics';
  return describeBiometricMethod(navigator.userAgent || '');
}

/**
 * Check whether device biometrics / platform passkey authenticator is available.
 */
export async function isBiometricsAvailable(): Promise<{
  available: boolean;
  platformAuthenticator: boolean;
  type: string;
}> {
  if (!isWeb) {
    // Native without expo-local-authentication uses secure password fallback
    return {
      available: false,
      platformAuthenticator: false,
      type: 'password_fallback',
    };
  }

  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return {
      available: false,
      platformAuthenticator: false,
      type: 'none',
    };
  }

  try {
    const isAvailable = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.();
    return {
      available: !!isAvailable,
      platformAuthenticator: !!isAvailable,
      type: isAvailable ? 'platform_biometrics' : 'security_key',
    };
  } catch {
    return {
      available: false,
      platformAuthenticator: false,
      type: 'none',
    };
  }
}

export interface BiometricResult {
  success: boolean;
  error?: string;
  /** The user dismissed the prompt (or the device has no saved passkey for this site). */
  cancelled?: boolean;
  /** No passkey existed yet, so one was created as part of this call. */
  enrolled?: boolean;
}

function webAuthnSupported(): boolean {
  return isWeb && typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;
}

function getRpId(): string | undefined {
  const hostname = window.location.hostname;
  // WebAuthn requires a valid domain or localhost (no IP addresses)
  const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  return isIp ? undefined : hostname || 'localhost';
}

function randomChallenge(): Uint8Array {
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  return challenge;
}

/**
 * Register a biometric/passkey credential on this device. Creating the credential already asks the
 * device to verify the user (fingerprint / face / screen lock), so a successful call is itself a
 * successful biometric check.
 */
export async function registerBiometrics(
  userId: string,
  userEmail?: string,
  userName?: string,
): Promise<BiometricResult> {
  if (!webAuthnSupported()) {
    return { success: false, error: 'Biometric passkey not supported in this environment.' };
  }

  try {
    const rpId = getRpId();
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge() as BufferSource,
        rp: {
          name: 'Lioris Campus Platform',
          ...(rpId ? { id: rpId } : {}),
        },
        user: {
          id: Uint8Array.from(userId || 'lioris_user', (c) => c.charCodeAt(0)),
          name: userEmail || 'user@lioris.app',
          displayName: userName || 'Lioris Member',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          // Discoverable where the device supports it, so the passkey can still be found if the
          // stored credential id is lost (cleared site data, another tab, a restored backup).
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;

    if (credential && credential.id) {
      await setStoredPref(BIOMETRICS_CREDENTIAL_ID_KEY, credential.id);
      return { success: true, enrolled: true };
    }
    return { success: false, error: 'Credential creation did not return a valid credential.' };
  } catch (err: any) {
    if (err?.name === 'NotAllowedError') {
      return { success: false, cancelled: true, error: 'Biometric verification was cancelled or timed out.' };
    }
    if (err?.name === 'InvalidStateError') {
      return { success: false, error: 'A passkey for this account already exists on this device.' };
    }
    return { success: false, error: err?.message || 'Biometric registration failed.' };
  }
}

/**
 * Authenticate with device biometrics (fingerprint, Face ID, Touch ID, Windows Hello).
 *
 * If this device has no saved passkey yet, one is created instead of asking the browser to look up
 * a passkey that does not exist. Doing the lookup anyway is what produced Android's "No passkeys
 * available" sheet and a dead end: the unlock could never succeed and Settings could never turn
 * the shield on.
 */
export async function authenticateWithBiometrics(
  user?: { id: string; email?: string; fullName?: string } | null,
): Promise<BiometricResult> {
  if (!webAuthnSupported()) {
    return { success: false, error: 'Biometrics unavailable on this device.' };
  }

  const storedCredId = await getStoredPref(BIOMETRICS_CREDENTIAL_ID_KEY);

  let allowedId: ArrayBuffer | null = null;
  if (storedCredId) {
    try {
      allowedId = base64UrlToBuffer(storedCredId);
    } catch {
      // A corrupt stored id can never work; forget it and enrol afresh.
      await removeStoredPref(BIOMETRICS_CREDENTIAL_ID_KEY);
    }
  }

  if (!allowedId) {
    if (!user) return { success: false, error: 'Please sign in again to set up biometrics.' };
    return registerBiometrics(user.id, user.email, user.fullName);
  }

  try {
    const rpId = getRpId();
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge() as BufferSource,
        ...(rpId ? { rpId } : {}),
        userVerification: 'required',
        timeout: 60000,
        allowCredentials: [{ id: allowedId, type: 'public-key', transports: ['internal'] }],
      },
    });
    return assertion ? { success: true } : { success: false, error: 'Biometric verification failed.' };
  } catch (err: any) {
    if (err?.name === 'NotAllowedError') {
      // The browser reports "cancelled" and "no matching passkey on this device" identically.
      return {
        success: false,
        cancelled: true,
        error: 'Biometric check was cancelled, or this device has no saved passkey. Use your password, or set biometrics up again.',
      };
    }
    return { success: false, error: err?.message || 'Biometric authentication failed.' };
  }
}

/** Throws away the saved passkey id and creates a fresh one (the "set up again" recovery path). */
export async function reEnrollBiometrics(user: {
  id: string;
  email?: string;
  fullName?: string;
}): Promise<BiometricResult> {
  await removeStoredPref(BIOMETRICS_CREDENTIAL_ID_KEY);
  return registerBiometrics(user.id, user.email, user.fullName);
}

export interface PasswordCheckResult {
  success: boolean;
  failure?: PasswordCheckFailure;
}

/**
 * Checks the account password so the user can unlock with it.
 *
 * Two things the previous version got wrong:
 *  - It sent no captcha token. Supabase Auth on this project rejects every password sign-in without
 *    one, so even the CORRECT password failed - and the overlay reported that as "Incorrect
 *    password" whatever the real reason. The caller now passes a Turnstile token and gets the real
 *    failure back.
 *  - It called signInWithPassword on the app's own client, which replaces the live session. For an
 *    admin that drops the session to AAL1 and can bounce them to the MFA screen. The check now runs
 *    on a throwaway client that never touches the stored session, and signs that client out again.
 */
export async function verifyPasswordFallback(
  email?: string,
  password?: string,
  captchaToken?: string,
): Promise<PasswordCheckResult> {
  if (!email || !password) {
    return { success: false, failure: 'unknown' };
  }

  const checker = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'lioris-lock-verify',
    },
  });

  try {
    const { data, error } = await checker.auth.signInWithPassword({
      email,
      password,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });
    if (error || !data?.session) {
      return { success: false, failure: classifyPasswordCheckError(error) };
    }
    // Revoke just this throwaway session so unlocking does not leave extra sessions behind.
    await checker.auth.signOut({ scope: 'local' }).catch(() => {});
    return { success: true };
  } catch (err: any) {
    return { success: false, failure: classifyPasswordCheckError({ message: err?.message }) };
  }
}
