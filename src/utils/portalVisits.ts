const STORAGE_KEY_BASE = 'lioris_visited_portals_v1';

// Safe runtime detection without breaking Node test runner
let secureStore: any = null;
try {
  secureStore = require('expo-secure-store');
} catch {
  // Node.js test runner or environment without expo-secure-store
}

/** 90 days in milliseconds (~3 months) */
export const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

function scopedStorageKey(userId: string | null | undefined): string {
  return userId ? `${STORAGE_KEY_BASE}:${userId}` : STORAGE_KEY_BASE;
}

function normalizeUrlKey(url: string): string {
  return url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
}

let inMemoryVisits: Record<string, number> = {};
let currentUserIdKey: string | null = null;
const listeners = new Set<(visits: Record<string, number>) => void>();

export function subscribePortalVisits(listener: (visits: Record<string, number>) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  const snapshot = { ...inMemoryVisits };
  for (const fn of listeners) {
    try {
      fn(snapshot);
    } catch {
      // safe
    }
  }
}

async function readRaw(key: string): Promise<string | null> {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
    if (secureStore?.getItemAsync) return await secureStore.getItemAsync(key);
    return null;
  } catch {
    return null;
  }
}

async function writeRaw(key: string, value: string): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
    if (secureStore?.setItemAsync) {
      await secureStore.setItemAsync(key, value);
    }
  } catch {
    // quota exceeded, private mode, etc.
  }
}

/** Loads stored visits for the given user, populating the memory cache. */
export async function getVisitedPortalLinks(userId?: string | null): Promise<Record<string, number>> {
  const key = scopedStorageKey(userId);
  if (currentUserIdKey === key && Object.keys(inMemoryVisits).length > 0) {
    return { ...inMemoryVisits };
  }

  const raw = await readRaw(key);
  if (raw) {
    try {
      inMemoryVisits = JSON.parse(raw);
      currentUserIdKey = key;
      return { ...inMemoryVisits };
    } catch {
      inMemoryVisits = {};
    }
  } else {
    inMemoryVisits = {};
  }
  currentUserIdKey = key;
  return { ...inMemoryVisits };
}

/** Synchronous read of currently loaded visits. */
export function getVisitedPortalLinksSync(): Record<string, number> {
  return { ...inMemoryVisits };
}

/**
 * Records that a portal link was visited at the current timestamp.
 * Stored against both the portal ID and its normalized URL for resilient matching.
 */
export async function recordPortalLinkVisit(
  portalId: string,
  url: string,
  userId?: string | null,
): Promise<void> {
  const now = Date.now();
  const key = scopedStorageKey(userId);
  if (currentUserIdKey !== key) {
    await getVisitedPortalLinks(userId);
  }

  const normUrl = normalizeUrlKey(url);
  inMemoryVisits[portalId] = now;
  if (normUrl) {
    inMemoryVisits[normUrl] = now;
  }

  notify();
  await writeRaw(key, JSON.stringify(inMemoryVisits));
}

/**
 * Checks whether a portal link has been visited within the last 3 months (90 days).
 */
export function isPortalVisitedInLast3Months(
  portal: { id?: string; url?: string },
  visits: Record<string, number> = inMemoryVisits,
  now: number = Date.now(),
): boolean {
  if (!portal) return false;
  let lastVisited: number | undefined;

  if (portal.id && visits[portal.id]) {
    lastVisited = visits[portal.id];
  }

  if (portal.url) {
    const normUrl = normalizeUrlKey(portal.url);
    if (visits[normUrl] && (!lastVisited || visits[normUrl] > lastVisited)) {
      lastVisited = visits[normUrl];
    }
  }

  if (!lastVisited) return false;
  return (now - lastVisited) <= THREE_MONTHS_MS;
}

/** Clears memory cache on logout. */
export function clearPortalVisitsMemoryCache(): void {
  inMemoryVisits = {};
  currentUserIdKey = null;
  notify();
}
