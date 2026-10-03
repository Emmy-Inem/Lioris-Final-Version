import { useCallback, useEffect, useState } from 'react';

/**
 * Persists which events have an active local reminder notification, keyed by
 * event id -> the scheduled notification's id. Without this, EventCard kept
 * `reminderOn`/`reminderNotificationId` in plain useState, which reset to
 * "off" on every remount (list re-render, navigating away and back) while
 * the OS notification scheduled earlier kept running - so re-enabling the
 * reminder could schedule a second, duplicate notification with no way to
 * cancel the first. Mirrors the SecureStore/localStorage + per-user
 * namespacing pattern in src/utils/readDiscussionsTracker.ts and
 * src/api/bookmarks.ts.
 */

const STORAGE_KEY_BASE = 'lioris_event_reminders_v1';

// Safe runtime detection without breaking the Node test runner.
let secureStore: any = null;
try {
  secureStore = require('expo-secure-store');
} catch {
  // Node.js test runner or environment without expo-secure-store
}

let authTokenStorage: any = null;
try {
  authTokenStorage = require('../auth/tokenStorage');
} catch {
  // Node.js test runner or environment without expo-secure-store/react-native
}

let eventsApi: any = null;
try {
  eventsApi = require('../api/events');
} catch {
  // Safe fallback for tests
}

async function currentUserId(): Promise<string | null> {
  try {
    const stored = await authTokenStorage?.getSessionUser?.();
    return stored?.id ?? null;
  } catch {
    return null;
  }
}

/** Namespaced by account, like scopedLocalKey() in src/api/bookmarks.ts. */
function scopedKey(userId: string | null): string {
  return userId ? `${STORAGE_KEY_BASE}:${userId}` : STORAGE_KEY_BASE;
}

/** eventId -> scheduled notification id. */
let memoryCache: Record<string, string> = {};
let isHydrated = false;
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

/** Hydrates the eventId -> notificationId map for the current account. */
export async function hydrateEventReminders(): Promise<Record<string, string>> {
  const uid = await currentUserId();
  if (isHydrated && hydratedForUserId === uid) return memoryCache;

  try {
    const raw = await readRaw(scopedKey(uid));
    const parsed = raw ? JSON.parse(raw) : null;
    memoryCache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    memoryCache = {};
  }

  isHydrated = true;
  hydratedForUserId = uid;
  notify();

  // Reconcile with remote database reminders if signed in
  if (uid && eventsApi?.listUserEventReminders) {
    eventsApi.listUserEventReminders()
      .then((remoteEventIds: string[]) => {
        if (Array.isArray(remoteEventIds) && remoteEventIds.length > 0) {
          let updated = false;
          for (const evId of remoteEventIds) {
            if (!memoryCache[evId]) {
              memoryCache[evId] = `backend-${evId}`;
              updated = true;
            }
          }
          if (updated) {
            notify();
            void writeRaw(scopedKey(uid), JSON.stringify(memoryCache));
          }
        }
      })
      .catch(() => {});
  }

  return memoryCache;
}

/** Synchronous read of the already-hydrated map - for render without awaiting. */
export function getEventReminderNotificationIdSync(eventId: string): string | null {
  return memoryCache[eventId] ?? null;
}

/** Records that `eventId` now has a pending notification, and persists it. */
export async function setEventReminder(eventId: string, notificationId: string): Promise<void> {
  await hydrateEventReminders();
  memoryCache = { ...memoryCache, [eventId]: notificationId };
  notify();
  try {
    const uid = await currentUserId();
    await writeRaw(scopedKey(uid), JSON.stringify(memoryCache));
  } catch {
    // Non-blocking
  }
}

/** Clears the persisted reminder for `eventId` (after cancelling the OS notification). */
export async function clearEventReminder(eventId: string): Promise<void> {
  await hydrateEventReminders();
  if (!(eventId in memoryCache)) return;
  const next = { ...memoryCache };
  delete next[eventId];
  memoryCache = next;
  notify();
  try {
    const uid = await currentUserId();
    await writeRaw(scopedKey(uid), JSON.stringify(memoryCache));
  } catch {
    // Non-blocking
  }
}

/**
 * React hook giving a card the current reminder state for one event, surviving
 * remounts because it reads from the persisted map rather than component state.
 */
export function useEventReminder(eventId: string) {
  const [, forceRerender] = useState(0);

  useEffect(() => {
    void hydrateEventReminders().then(() => forceRerender((n) => n + 1));
    const onChange = () => forceRerender((n) => n + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const notificationId = getEventReminderNotificationIdSync(eventId);
  const reminderOn = !!notificationId;

  const setReminder = useCallback(
    (notifId: string) => {
      void setEventReminder(eventId, notifId);
    },
    [eventId],
  );

  const clearReminder = useCallback(() => {
    void clearEventReminder(eventId);
  }, [eventId]);

  const toggleReminder = useCallback(
    async (notifId?: string): Promise<boolean> => {
      const isCurrentlyOn = !!getEventReminderNotificationIdSync(eventId);
      if (isCurrentlyOn) {
        await clearEventReminder(eventId);
        if (eventsApi?.toggleEventReminder) {
          await eventsApi.toggleEventReminder(eventId).catch(() => {});
        }
        return false;
      } else {
        const idToStore = notifId || `backend-${eventId}`;
        await setEventReminder(eventId, idToStore);
        if (eventsApi?.toggleEventReminder) {
          await eventsApi.toggleEventReminder(eventId).catch(() => {});
        }
        return true;
      }
    },
    [eventId],
  );

  return { reminderOn, notificationId, setReminder, clearReminder, toggleReminder };
}
