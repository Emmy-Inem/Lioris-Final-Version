/**
 * One saved/bookmark store for every kind of item, backed by public.saved_items
 * (supabase_posts_features_2026.sql). Replaces the per-device, resources-only
 * localStorage list in src/utils/resourceBookmarks.ts, which was lost on every
 * new device and cache clear.
 *
 * Signed out or offline the calls degrade to the local mirror below instead of
 * throwing, so a Save button never crashes a screen. The mirror is also what
 * makes `isItemSavedSync()` possible for list rows that cannot await.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';

export type SavedKind = 'post' | 'resource' | 'event' | 'job' | 'marketplace';

export interface SavedItem {
  /** Row id (or `${kind}:${itemId}` for a local-only entry). */
  id: string;
  kind: SavedKind;
  itemId: string;
  savedAt: string;
  /** Denormalised for the list; falls back to the item id when nothing was passed. */
  title: string;
  subtitle?: string;
  imageUrl?: string;
}

export interface SavedItemMeta {
  title?: string;
  subtitle?: string;
  imageUrl?: string;
}

/**
 * React Query key factory so every screen invalidates the same cache.
 * `SAVED_ITEMS_KEY()` is the parent of `SAVED_ITEMS_KEY('resource')`, so
 * invalidating the former refreshes every per-kind list too.
 */
export const SAVED_ITEMS_KEY = (kind?: SavedKind): (string | undefined)[] =>
  kind ? ['saved-items', kind] : ['saved-items'];

// ---------------------------------------------------------------------------
// Offline / signed-out mirror
// ---------------------------------------------------------------------------
// Namespaced by user id (see scopedLocalKey) so a shared/handed-down device,
// or an account switch before the next successful server round-trip, cannot
// show the previous account's cached saves.
const LOCAL_KEY_BASE = 'lioris_saved_items_v1';
const isWeb = Platform.OS === 'web';

function scopedLocalKey(userId: string | null): string {
  return userId ? `${LOCAL_KEY_BASE}:${userId}` : LOCAL_KEY_BASE;
}

let localItems: SavedItem[] = [];
let hydrated = false;
/** Which account the in-memory mirror currently holds - re-hydrated on a change. */
let hydratedForUserId: string | null = null;

const listeners = new Set<(items: SavedItem[]) => void>();

/** Clears the in-memory mirror and hydration flags on logout to prevent cross-account state leakage. */
export function clearSavedItemsMemoryCache(): void {
  localItems = [];
  hydrated = false;
  hydratedForUserId = null;
  notify();
}

/** Subscribe to local-mirror changes (used by useResourceBookmarks). */
export function subscribeSavedItems(fn: (items: SavedItem[]) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify() {
  const snapshot = [...localItems];
  for (const fn of listeners) fn(snapshot);
}

async function readLocalRaw(key: string): Promise<string | null> {
  try {
    if (isWeb) return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeLocalRaw(key: string, raw: string): Promise<void> {
  try {
    if (isWeb) {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, raw);
      return;
    }
    await SecureStore.setItemAsync(key, raw);
  } catch {
    // quota exceeded, private mode, locked keychain - the in-memory copy stands
  }
}

/**
 * Loads the local mirror for the CURRENT account once, re-hydrating if the
 * signed-in account changes (so a device handed to someone else, or an
 * account switch, never shows the previous account's cached saves). Also
 * migrates older, un-namespaced local data so nobody loses saves they
 * already made on this device: first this account's own pre-namespacing
 * saved_items list, then (only if that is empty too) the legacy
 * resources-only list from before saved_items existed at all.
 */
export async function hydrateSavedItems(): Promise<SavedItem[]> {
  const uid = await currentUserId();
  if (hydrated && hydratedForUserId === uid) return [...localItems];
  hydrated = true;
  hydratedForUserId = uid;

  const key = scopedLocalKey(uid);
  try {
    const raw = await readLocalRaw(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      localItems = Array.isArray(parsed) ? parsed.filter((x: any) => x && x.kind && x.itemId) : [];
    } else {
      const legacyRaw = await readLocalRaw(LOCAL_KEY_BASE);
      const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
      if (Array.isArray(legacy) && legacy.length > 0) {
        localItems = legacy.filter((x: any) => x && x.kind && x.itemId);
      } else {
        const oldResourcesRaw = isWeb
          ? typeof localStorage !== 'undefined'
            ? localStorage.getItem('lioris_bookmarked_resources_v1')
            : null
          : await SecureStore.getItemAsync('lioris_bookmarked_resources_v1').catch(() => null);
        const oldResources = oldResourcesRaw ? JSON.parse(oldResourcesRaw) : null;
        localItems = Array.isArray(oldResources)
          ? oldResources
              .filter((id: any) => typeof id === 'string')
              .map((id: string) => ({
                id: `resource:${id}`,
                kind: 'resource' as const,
                itemId: id,
                savedAt: new Date().toISOString(),
                title: id,
              }))
          : [];
      }
      if (localItems.length > 0) await writeLocalRaw(key, JSON.stringify(localItems));
    }
  } catch {
    localItems = [];
  }
  notify();
  return [...localItems];
}

async function setLocal(next: SavedItem[]): Promise<void> {
  const uid = await currentUserId();
  localItems = next;
  hydrated = true;
  hydratedForUserId = uid;
  notify();
  await writeLocalRaw(scopedLocalKey(uid), JSON.stringify(next));
}

function localUpsert(kind: SavedKind, itemId: string, meta?: SavedItemMeta): SavedItem[] {
  const without = localItems.filter((x) => !(x.kind === kind && x.itemId === itemId));
  return [
    {
      id: `${kind}:${itemId}`,
      kind,
      itemId,
      savedAt: new Date().toISOString(),
      title: meta?.title || itemId,
      subtitle: meta?.subtitle,
      imageUrl: meta?.imageUrl,
    },
    ...without,
  ];
}

/** Synchronous read of the local mirror - for list rows that cannot await. */
export function isItemSavedSync(kind: SavedKind, itemId: string): boolean {
  return localItems.some((x) => x.kind === kind && x.itemId === itemId);
}

/** Everything currently in the local mirror (already hydrated). */
export function getSavedItemsSync(kind?: SavedKind): SavedItem[] {
  return kind ? localItems.filter((x) => x.kind === kind) : [...localItems];
}

// ---------------------------------------------------------------------------
// Server-backed API
// ---------------------------------------------------------------------------
async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) return data.user.id;
  } catch {
    // offline - fall through to the stored session
  }
  try {
    const stored = await getSessionUser();
    return stored?.id ?? null;
  } catch {
    return null;
  }
}

function rowToItem(row: any): SavedItem {
  return {
    id: row.id,
    kind: row.kind,
    itemId: row.item_id,
    savedAt: row.created_at,
    title: row.title || row.item_id,
    subtitle: row.subtitle || undefined,
    imageUrl: row.image_url || undefined,
  };
}

/** Newest first. Falls back to the local mirror when signed out or offline. */
export async function listSavedItems(kind?: SavedKind): Promise<SavedItem[]> {
  await hydrateSavedItems();
  const uid = await currentUserId();
  if (!uid) return getSavedItemsSync(kind);

  try {
    let q = supabase.from('saved_items').select('*').eq('user_id', uid).order('created_at', { ascending: false });
    if (kind) q = q.eq('kind', kind);
    const { data, error } = await q;
    if (error) throw error;

    const items = (data ?? []).map(rowToItem);

    // If there are saved resources, enrich any that hold raw UUIDs or technical IDs with the human course name
    const resourceItems = items.filter((x) => x.kind === 'resource');
    if (resourceItems.length > 0) {
      try {
        const resourceIds = resourceItems.map((x) => x.itemId);
        const { data: resRows } = await supabase
          .from('resources')
          .select('id, title, course_title, course_code')
          .in('id', resourceIds);
        if (resRows && resRows.length > 0) {
          const resMap = new Map<string, any>(resRows.map((r: any) => [r.id, r]));
          for (const item of resourceItems) {
            const r = resMap.get(item.itemId);
            if (r) {
              const humanCourseName = r.course_title || r.title || r.course_code;
              const isTechnicalCode = !item.title || item.title === item.itemId || /^[0-9a-f-]{36}$/i.test(item.title);
              if (isTechnicalCode && humanCourseName) {
                item.title = humanCourseName;
              }
              if (!item.subtitle || /^[0-9a-f-]{36}$/i.test(item.subtitle)) {
                item.subtitle = r.course_code || 'Course Material';
              }
            }
          }
        }
      } catch {
        // Non-blocking enrichment
      }
    }

    // Keep the mirror in step so the sync helpers stay truthful offline. A
    // per-kind fetch only replaces that kind's slice of the mirror.
    const others = kind ? localItems.filter((x) => x.kind !== kind) : [];
    await setLocal([...items, ...others]);
    return items;
  } catch (err) {
    console.warn('[Bookmarks] listSavedItems failed, using the local mirror:', err);
    return getSavedItemsSync(kind);
  }
}

export async function isItemSaved(kind: SavedKind, itemId: string): Promise<boolean> {
  await hydrateSavedItems();
  const uid = await currentUserId();
  if (!uid) return isItemSavedSync(kind, itemId);

  try {
    const { data, error } = await supabase
      .from('saved_items')
      .select('id')
      .eq('user_id', uid)
      .eq('kind', kind)
      .eq('item_id', itemId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  } catch (err) {
    console.warn('[Bookmarks] isItemSaved failed, using the local mirror:', err);
    return isItemSavedSync(kind, itemId);
  }
}

/**
 * Saves or unsaves an item and returns the state it ended in. The local mirror
 * is updated first so the icon flips immediately; a failed write is logged and
 * the local state is kept (the row is reconciled on the next listSavedItems).
 */
export async function toggleSavedItem(
  kind: SavedKind,
  itemId: string,
  saved: boolean,
  meta?: SavedItemMeta,
): Promise<boolean> {
  await hydrateSavedItems();
  await setLocal(saved ? localUpsert(kind, itemId, meta) : localItems.filter((x) => !(x.kind === kind && x.itemId === itemId)));

  const uid = await currentUserId();
  if (!uid) return saved;

  try {
    if (saved) {
      // onConflict matches the (user_id, kind, item_id) unique constraint, so
      // double-tapping Save refreshes the denormalised title instead of failing.
      const { error } = await supabase.from('saved_items').upsert(
        {
          user_id: uid,
          kind,
          item_id: itemId,
          title: meta?.title ?? null,
          subtitle: meta?.subtitle ?? null,
          image_url: meta?.imageUrl ?? null,
        },
        { onConflict: 'user_id,kind,item_id' },
      );
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('saved_items')
        .delete()
        .eq('user_id', uid)
        .eq('kind', kind)
        .eq('item_id', itemId);
      if (error) throw error;
    }
  } catch (err) {
    console.warn('[Bookmarks] toggleSavedItem persistence failed (kept locally):', err);
  }
  return saved;
}

/**
 * "Which of these are saved?" in ONE query - used by the feed so a page of
 * posts costs a single round trip instead of one per card.
 */
export async function listSavedItemIds(kind: SavedKind, itemIds: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(itemIds)).filter(Boolean);
  if (ids.length === 0) return new Set();

  const uid = await currentUserId();
  if (!uid) {
    await hydrateSavedItems();
    return new Set(ids.filter((id) => isItemSavedSync(kind, id)));
  }

  try {
    const { data, error } = await supabase
      .from('saved_items')
      .select('item_id')
      .eq('user_id', uid)
      .eq('kind', kind)
      .in('item_id', ids);
    if (error) throw error;
    return new Set((data ?? []).map((r: any) => r.item_id as string));
  } catch (err) {
    console.warn('[Bookmarks] listSavedItemIds failed:', err);
    return new Set();
  }
}
