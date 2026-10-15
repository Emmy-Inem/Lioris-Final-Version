import'react-native-url-polyfill/auto';
import { createClient } from'@supabase/supabase-js';
import * as SecureStore from'expo-secure-store';
import { Platform } from'react-native';

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

// In-memory fallback cache to prevent screen-lock keychain access errors
const memoryCache: Record<string, string> = {};

const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    if (Platform.OS === 'web') {
      try {
        if (typeof localStorage !== 'undefined') {
          return localStorage.getItem(key);
        }
      } catch {
        // private mode / storage blocked: fall back to memory instead of failing sign-in
      }
      return memoryCache[key] ?? null;
    }
    try {
      const val = await SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
      if (val !== null) memoryCache[key] = val;
      return val ?? memoryCache[key] ?? null;
    } catch {
      return memoryCache[key] ?? null;
    }
  },
  setItem: async (key: string, value: string) => {
    memoryCache[key] = value;
    if (Platform.OS === 'web') {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, value);
        }
      } catch {
        // the in-memory copy keeps this tab signed in
      }
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS);
    } catch {
      // In-memory cache ensures continuity even if keychain is temporarily locked
    }
  },
  removeItem: async (key: string) => {
    delete memoryCache[key];
    if (Platform.OS === 'web') {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(key);
        }
      } catch {
        // ignore
      }
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS);
    } catch {
      // Ignored
    }
  },
};

/**
 * True when the page was opened from a password-recovery e-mail link. auth-js reads and then removes
 * location.hash, and its PASSWORD_RECOVERY event can fire before AuthProvider (which waits for fonts)
 * has subscribed - the student was then signed straight in without ever choosing a new password.
 */
export const OPENED_FROM_RECOVERY_LINK: boolean = (() => {
  try {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
    const h = window.location.hash || '';
    const q = window.location.search || '';
    return /(^|[#&])type=recovery(&|$)/.test(h) || /[?&]type=recovery(&|$)/.test(q);
  } catch {
    return false;
  }
})();

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://fdtnbluslkabwsmspbem.supabase.co';
export const SUPABASE_ANON_KEY =
 process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_TB0Pw8k2oJQTmoO951YaIQ_xzOyGpZF';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
