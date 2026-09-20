/**
 * Resource bookmarks. The exports here are unchanged so existing screens keep
 * working, but they are now a thin adapter over the server-backed saved_items
 * store in src/api/bookmarks.ts (kind = 'resource') instead of a per-device
 * localStorage list. Signed out or offline, bookmarks.ts falls back to the same
 * local mirror this file always used, so nothing here can throw or crash a
 * screen. The old 'lioris_bookmarked_resources_v1' key is migrated on first
 * hydrate, so nobody loses the resources they had already bookmarked.
 *
 * New code should use src/api/bookmarks.ts directly - it handles posts, events
 * and jobs too, and gives you the denormalised title for the Saved screen.
 */
import { useEffect, useState } from 'react';
import {
  getSavedItemsSync,
  hydrateSavedItems,
  isItemSavedSync,
  listSavedItems,
  subscribeSavedItems,
  toggleSavedItem,
  type SavedItem,
} from '../api/bookmarks';

function idsOf(items: SavedItem[]): string[] {
  return items.filter((x) => x.kind === 'resource').map((x) => x.itemId);
}

/** Loads the local mirror, then refreshes from the server in the background. */
export async function hydrateResourceBookmarks(): Promise<string[]> {
  const local = await hydrateSavedItems();
  // Never block the caller on the network: the subscription below pushes the
  // server list to every mounted component as soon as it lands.
  void listSavedItems('resource').catch(() => undefined);
  return idsOf(local);
}

/**
 * Replaces the whole bookmarked-resource list. Kept for API compatibility; it
 * is diffed against the current list and applied as individual toggles so the
 * server store stays authoritative.
 */
export async function saveResourceBookmarks(ids: string[]): Promise<void> {
  await hydrateSavedItems();
  const current = new Set(idsOf(getSavedItemsSync()));
  const next = new Set(ids);

  for (const id of next) {
    if (!current.has(id)) await toggleSavedItem('resource', id, true);
  }
  for (const id of current) {
    if (!next.has(id)) await toggleSavedItem('resource', id, false);
  }
}

/** Returns the state the bookmark ended in (true = now bookmarked). */
export async function toggleResourceBookmark(id: string): Promise<boolean> {
  await hydrateSavedItems();
  const exists = isItemSavedSync('resource', id);
  return await toggleSavedItem('resource', id, !exists);
}

export function isResourceBookmarked(id: string): boolean {
  return isItemSavedSync('resource', id);
}

export function useResourceBookmarks() {
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => idsOf(getSavedItemsSync()));

  useEffect(() => {
    let alive = true;
    const unsubscribe = subscribeSavedItems((items) => {
      if (alive) setBookmarkedIds(idsOf(items));
    });

    hydrateResourceBookmarks().then((ids) => {
      if (alive) setBookmarkedIds(ids);
    });

    return () => {
      alive = false;
      unsubscribe();
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
