import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY_BASE = 'lioris_read_home_alerts';

// Safe runtime detection without breaking Node test runner
let secureStore: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  secureStore = require('expo-secure-store');
} catch {
  // Node.js test runner or environment without expo-secure-store
}

// Same guarded require as secureStore above: tokenStorage.ts pulls in
// react-native statically, which `node --test` cannot resolve, so this is
// read defensively and falls back to the un-namespaced key below.
let authTokenStorage: any = null;
try {
  authTokenStorage = require('../auth/tokenStorage');
} catch {
  // Node.js test runner or environment without expo-secure-store/react-native
}

/**
 * Local-only (no network) read of whichever account is currently signed in,
 * so the dismissed-announcement list below can be namespaced per user -
 * mirrors scopedLocalKey()/currentUserId() in src/api/bookmarks.ts.
 */
async function currentUserId(): Promise<string | null> {
  try {
    const stored = await authTokenStorage?.getSessionUser?.();
    return stored?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Before this, every account on the same device (or an admin flipping
 * through the role-switcher) shared one un-namespaced storage key, so
 * signing in as a second user on the same device showed them the first
 * user's already-dismissed announcements - or hid ones they'd never
 * actually seen. Namespacing by user id, with a one-time migration of
 * whatever a pre-namespacing install already wrote, fixes both.
 */
function scopedKey(userId: string | null): string {
  return userId ? `${STORAGE_KEY_BASE}:${userId}` : STORAGE_KEY_BASE;
}

let memoryCache: Set<string> = new Set<string>();
let isHydrated = false;
/** Which account the in-memory cache currently holds - re-hydrated on a change. */
let hydratedForUserId: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}

async function readRaw(key: string): Promise<string | null> {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    if (secureStore && typeof secureStore.getItemAsync === 'function') {
      return await secureStore.getItemAsync(key);
    }
  } catch {
    // Non-blocking fallback
  }
  return null;
}

async function writeRaw(key: string, raw: string): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, raw);
      return;
    }
    if (secureStore && typeof secureStore.setItemAsync === 'function') {
      await secureStore.setItemAsync(key, raw);
    }
  } catch {
    // Non-blocking
  }
}

/**
 * Hydrates the read alert IDs from persistent storage (localStorage on Web/Node, SecureStore on
 * Mobile), scoped to whichever account is currently signed in. Re-hydrates automatically if the
 * signed-in account has changed since the last call.
 */
export async function hydrateReadAlertIds(): Promise<Set<string>> {
  const uid = await currentUserId();
  if (isHydrated && hydratedForUserId === uid) return memoryCache;

  try {
    const key = scopedKey(uid);
    let raw = await readRaw(key);

    if (!raw) {
      // First read for this account on this device: fall back to whatever a
      // pre-namespacing install left under the shared key, and migrate it
      // onto this account's own key so it isn't read again for the next
      // account that signs in here.
      const legacy = await readRaw(STORAGE_KEY_BASE);
      if (legacy) {
        raw = legacy;
        await writeRaw(key, legacy);
      }
    }

    if (raw) {
      const parsed = JSON.parse(raw);
      memoryCache = Array.isArray(parsed) ? new Set(parsed) : new Set();
    } else {
      memoryCache = new Set();
    }
  } catch {
    memoryCache = new Set();
  }

  isHydrated = true;
  hydratedForUserId = uid;
  notify();
  return memoryCache;
}

/**
 * Synchronous check for whether an alert or forum message has already been read/dismissed.
 */
export function isHomeAlertReadSync(id: string): boolean {
  return memoryCache.has(id);
}

/**
 * Marks an alert/message as read/dismissed and persists to local storage.
 * It immediately triggers state updates so the item disappears from Home.
 */
export async function markHomeAlertAsRead(id: string): Promise<void> {
  if (!id) return;
  // Make sure the cache reflects the CURRENT account before mutating it -
  // otherwise a cache still holding the previous account's data would get
  // written back out under the new account's key.
  await hydrateReadAlertIds();

  memoryCache.add(id);
  notify();

  try {
    const uid = await currentUserId();
    const serialized = JSON.stringify(Array.from(memoryCache));
    await writeRaw(scopedKey(uid), serialized);
  } catch {
    // Non-blocking
  }
}

/**
 * Clears read state (e.g. for testing or full reset) for the current account.
 */
export async function clearReadHomeAlerts(): Promise<void> {
  memoryCache.clear();
  notify();

  try {
    const uid = await currentUserId();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(scopedKey(uid));
    } else if (secureStore && typeof secureStore.deleteItemAsync === 'function') {
      await secureStore.deleteItemAsync(scopedKey(uid));
    }
  } catch {
    // ignore
  }
}

/**
 * React hook to reactively filter out read/opened alerts from Home.
 */
export function useReadHomeAlerts() {
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set(memoryCache));

  useEffect(() => {
    void hydrateReadAlertIds();

    const onChange = () => {
      setReadIds(new Set(memoryCache));
    };

    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const markAsRead = useCallback((id: string) => {
    void markHomeAlertAsRead(id);
  }, []);

  const isRead = useCallback(
    (id: string) => {
      return readIds.has(id);
    },
    [readIds]
  );

  return {
    readIds,
    markAsRead,
    isRead,
  };
}
