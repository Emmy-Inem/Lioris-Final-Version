import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const STORAGE_BOOKMARKS_KEY = 'lioris_bookmarked_resources_v1';
const isWeb = Platform.OS === 'web';

function webGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function webSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // quota exceeded or private mode
  }
}

let cachedBookmarks: string[] = [];
let hasHydrated = false;
const listeners = new Set<(ids: string[]) => void>();

function notifyListeners() {
  for (const listener of listeners) {
    listener([...cachedBookmarks]);
  }
}

export async function hydrateResourceBookmarks(): Promise<string[]> {
  if (hasHydrated) return cachedBookmarks;
  try {
    const raw = isWeb ? webGet(STORAGE_BOOKMARKS_KEY) : await SecureStore.getItemAsync(STORAGE_BOOKMARKS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        cachedBookmarks = parsed;
      }
    }
  } catch {
    cachedBookmarks = [];
  } finally {
    hasHydrated = true;
    notifyListeners();
  }
  return cachedBookmarks;
}

export async function saveResourceBookmarks(ids: string[]): Promise<void> {
  cachedBookmarks = ids;
  hasHydrated = true;
  notifyListeners();
  const raw = JSON.stringify(ids);
  try {
    if (isWeb) {
      webSet(STORAGE_BOOKMARKS_KEY, raw);
    } else {
      await SecureStore.setItemAsync(STORAGE_BOOKMARKS_KEY, raw);
    }
  } catch {
    // Ignore storage write failures
  }
}

export async function toggleResourceBookmark(id: string): Promise<boolean> {
  await hydrateResourceBookmarks();
  const exists = cachedBookmarks.includes(id);
  const next = exists ? cachedBookmarks.filter((x) => x !== id) : [...cachedBookmarks, id];
  await saveResourceBookmarks(next);
  return !exists;
}

export function isResourceBookmarked(id: string): boolean {
  return cachedBookmarks.includes(id);
}

export function useResourceBookmarks() {
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(cachedBookmarks);

  useEffect(() => {
    hydrateResourceBookmarks().then((ids) => {
      setBookmarkedIds([...ids]);
    });

    const handler = (ids: string[]) => {
      setBookmarkedIds([...ids]);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const toggle = async (id: string) => {
    return await toggleResourceBookmark(id);
  };

  const isBookmarked = (id: string) => bookmarkedIds.includes(id);

  return {
    bookmarkedIds,
    toggleBookmark: toggle,
    isBookmarked,
  };
}
