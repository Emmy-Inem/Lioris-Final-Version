import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'lioris_read_home_alerts';

// Safe runtime detection without breaking Node test runner
let secureStore: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  secureStore = require('expo-secure-store');
} catch {
  // Node.js test runner or environment without expo-secure-store
}

let memoryCache: Set<string> = new Set<string>();
let isHydrated = false;
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

/**
 * Hydrates the read alert IDs from persistent storage (localStorage on Web/Node, SecureStore on Mobile).
 */
export async function hydrateReadAlertIds(): Promise<Set<string>> {
  if (isHydrated) return memoryCache;

  try {
    let raw: string | null = null;
    if (typeof localStorage !== 'undefined') {
      raw = localStorage.getItem(STORAGE_KEY);
    } else if (secureStore && typeof secureStore.getItemAsync === 'function') {
      raw = await secureStore.getItemAsync(STORAGE_KEY);
    }

    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryCache = new Set(parsed);
      }
    }
  } catch (err) {
    // Non-blocking fallback
  }

  isHydrated = true;
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
  memoryCache.add(id);
  notify();

  try {
    const serialized = JSON.stringify(Array.from(memoryCache));
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, serialized);
    } else if (secureStore && typeof secureStore.setItemAsync === 'function') {
      await secureStore.setItemAsync(STORAGE_KEY, serialized);
    }
  } catch (err) {
    // Non-blocking
  }
}

/**
 * Clears read state (e.g. for testing or full reset).
 */
export async function clearReadHomeAlerts(): Promise<void> {
  memoryCache.clear();
  notify();

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    } else if (secureStore && typeof secureStore.deleteItemAsync === 'function') {
      await secureStore.deleteItemAsync(STORAGE_KEY);
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
