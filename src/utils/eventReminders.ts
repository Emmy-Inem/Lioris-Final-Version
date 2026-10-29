import { useCallback, useEffect, useState } from 'react';
import { cancelAllScheduledDeviceNotifications, cancelLegacyDeviceReminders } from './eventRemindersLegacy';

/**
 * Which events the signed-in user has a reminder for. The server (public.event_reminders) is the source of truth
 * and also delivers the reminder (an in-app notification plus push about an hour before the event starts), so a
 * reminder follows the account across phones, the web app and reinstalls. This module keeps a per-account copy in
 * secure storage / localStorage only so the bell renders at once and still works offline; every hydrate replaces
 * it with what the server says. It used to schedule an OS notification on the device and merge the server list
 * one way only, so reminders removed elsewhere stayed "on", and a failed save still said "Reminder set".
 * Mirrors the SecureStore/localStorage + per-user namespacing pattern in src/utils/readDiscussionsTracker.ts and
 * src/api/bookmarks.ts.
 */

const STORAGE_KEY_BASE = 'lioris_event_reminders_v1';
/** Value stored for a reminder the server holds (older app versions stored a device notification id here). */
const SERVER_MARKER = 'server';

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

/** eventId -> SERVER_MARKER (or, from older versions, the device notification id to cancel). */
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

/** Event ids with an optimistic change in flight; a server refresh must not undo them mid-request. */
const inFlight = new Set<string>();
const RECONCILE_MIN_INTERVAL_MS = 60_000;
let lastReconcileAt = 0;
let reconcilePromise: Promise<void> | null = null;

/** Replaces the local copy with the server's list. A failed request keeps what is already shown. */
async function reconcileWithServer(uid: string): Promise<void> {
  if (!eventsApi?.listUserEventReminders) return;
  let remote: string[];
  try {
    remote = await eventsApi.listUserEventReminders();
  } catch {
    return;
  }
  if (hydratedForUserId !== uid) return; // signed out or switched account while waiting

  const remoteSet = new Set(remote);
  const next: Record<string, string> = {};
  for (const id of remoteSet) next[id] = SERVER_MARKER;
  // Keep the optimistic state of anything the user is changing right now.
  for (const id of inFlight) {
    if (id in memoryCache) next[id] = memoryCache[id];
    else delete next[id];
  }

  const legacy = Object.values(memoryCache).filter((marker) => marker && !marker.startsWith('backend-') && marker !== SERVER_MARKER);
  const changed =
    Object.keys(next).length !== Object.keys(memoryCache).length ||
    Object.keys(next).some((id) => !(id in memoryCache));
  memoryCache = next;
  lastReconcileAt = Date.now();
  if (changed) notify();
  void writeRaw(scopedKey(uid), JSON.stringify(memoryCache));
  void cancelLegacyDeviceReminders(legacy);
}

/** Hydrates the eventId -> marker map for the current account, then refreshes it from the server. */
export async function hydrateEventReminders(): Promise<Record<string, string>> {
  const uid = await currentUserId();
  if (!(isHydrated && hydratedForUserId === uid)) {
    try {
      const raw = await readRaw(scopedKey(uid));
      const parsed = raw ? JSON.parse(raw) : null;
      memoryCache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      memoryCache = {};
    }
    isHydrated = true;
    hydratedForUserId = uid;
    lastReconcileAt = 0;
    notify();
  }

  if (uid && !reconcilePromise && Date.now() - lastReconcileAt > RECONCILE_MIN_INTERVAL_MS) {
    reconcilePromise = reconcileWithServer(uid).finally(() => {
      reconcilePromise = null;
    });
  }

  return memoryCache;
}

/** Synchronous read of the already-hydrated map - for render without awaiting. */
export function getEventReminderNotificationIdSync(eventId: string): string | null {
  return memoryCache[eventId] ?? null;
}

async function persist(): Promise<void> {
  try {
    const uid = await currentUserId();
    await writeRaw(scopedKey(uid), JSON.stringify(memoryCache));
  } catch {
    // Non-blocking
  }
}

/**
 * Turns the reminder for `eventId` on or off. The bell updates at once; if the server refuses (offline, event gone,
 * too many reminders) the change is rolled back and the error is thrown so the caller can say so.
 */
export async function setEventReminderState(eventId: string, on: boolean): Promise<void> {
  await hydrateEventReminders();
  const had = eventId in memoryCache;
  const previousMarker = memoryCache[eventId];
  inFlight.add(eventId);
  if (on) memoryCache = { ...memoryCache, [eventId]: SERVER_MARKER };
  else {
    const next = { ...memoryCache };
    delete next[eventId];
    memoryCache = next;
  }
  notify();
  try {
    if (!eventsApi?.setEventReminderOnServer) throw new Error('Reminders are unavailable right now.');
    await eventsApi.setEventReminderOnServer(eventId, on);
    await persist();
  } catch (err) {
    if (had) memoryCache = { ...memoryCache, [eventId]: previousMarker };
    else {
      const next = { ...memoryCache };
      delete next[eventId];
      memoryCache = next;
    }
    notify();
    throw err;
  } finally {
    inFlight.delete(eventId);
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

  const reminderOn = !!getEventReminderNotificationIdSync(eventId);

  /** Flips the reminder and returns the new state. Throws (after rolling the bell back) when the server refuses. */
  const toggleReminder = useCallback(async (): Promise<boolean> => {
    const next = !getEventReminderNotificationIdSync(eventId);
    await setEventReminderState(eventId, next);
    return next;
  }, [eventId]);

  return { reminderOn, toggleReminder };
}

/**
 * Signing out (or being signed out) must also stop THIS device from firing the previous account's
 * "event starts soon" alerts, which live in the OS scheduler and outlast the JS session.
 */
export async function cancelAllEventReminders(): Promise<void> {
  memoryCache = {};
  isHydrated = false;
  hydratedForUserId = null;
  notify();
  await cancelAllScheduledDeviceNotifications();
}
