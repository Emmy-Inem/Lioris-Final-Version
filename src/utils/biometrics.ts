import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/api/supabase';

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

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof btoa !== 'undefined' ? btoa(binary) : '';
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = typeof atob !== 'undefined' ? atob(base64) : '';
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Register a biometric/passkey credential on this device.
 */
export async function registerBiometrics(
  userId: string,
  userEmail?: string,
  userName?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!isWeb || typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) {
    return { success: false, error: 'Biometric passkey not supported in this environment.' };
  }

  try {
    const challenge = new Uint8Array(32);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(challenge);
    }

    const hostname = window.location.hostname;
    // WebAuthn requires a valid domain or localhost (no IP addresses)
    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    const rpId = isIp ? undefined : (hostname || 'localhost');

    const creationOptions: CredentialCreationOptions = {
      publicKey: {
        challenge,
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
        },
        timeout: 60000,
        attestation: 'none',
      },
    };

    const credential = (await navigator.credentials.create(creationOptions)) as PublicKeyCredential | null;
    if (credential && credential.id) {
      await setStoredPref(BIOMETRICS_CREDENTIAL_ID_KEY, credential.id);
      return { success: true };
    }
    return { success: false, error: 'Credential creation did not return a valid credential.' };
  } catch (err: any) {
    // User cancelled or biometric prompt dismissed
    if (err?.name === 'NotAllowedError') {
      return { success: false, error: 'Biometric verification was cancelled or timed out.' };
    }
    return { success: false, error: err?.message || 'Biometric registration failed.' };
  }
}

/**
 * Authenticate with device biometrics (Face ID, Touch ID, Windows Hello, Android Biometrics).
 */
export async function authenticateWithBiometrics(
  user?: { id: string; email?: string; fullName?: string } | null,
): Promise<{ success: boolean; error?: string }> {
  if (!isWeb || typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) {
    return { success: false, error: 'Biometrics unavailable on this device.' };
  }

  const storedCredId = await getStoredPref(BIOMETRICS_CREDENTIAL_ID_KEY);

  try {
    const challenge = new Uint8Array(32);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(challenge);
    }

    const hostname = window.location.hostname;
    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    const rpId = isIp ? undefined : (hostname || 'localhost');

    const requestOptions: CredentialRequestOptions = {
      publicKey: {
        challenge,
        ...(rpId ? { rpId } : {}),
        userVerification: 'required',
        timeout: 60000,
        ...(storedCredId
          ? {
              allowCredentials: [
                {
                  id: base64ToBuffer(storedCredId),
                  type: 'public-key',
                  transports: ['internal'],
                },
              ],
            }
          : {}),
      },
    };

    const assertion = await navigator.credentials.get(requestOptions);
    if (assertion) {
      return { success: true };
    }
    return { success: false, error: 'Biometric verification failed.' };
  } catch (err: any) {
    if (err?.name === 'NotAllowedError') {
      return { success: false, error: 'Biometric prompt was cancelled.' };
    }
    // If no credential was found or registered yet, attempt quick registration if user info is present
    if (user && (!storedCredId || err?.name === 'InvalidStateError')) {
      const regResult = await registerBiometrics(user.id, user.email, user.fullName);
      return regResult;
    }
    return { success: false, error: err?.message || 'Biometric authentication failed.' };
  }
}

/**
 * Fallback: Verify password with Supabase auth so the user can unlock using their password.
 */
export async function verifyPasswordFallback(
  email?: string,
  password?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!email || !password) {
    return { success: false, error: 'Please enter your password.' };
  }

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Password verification failed.' };
  }
}
