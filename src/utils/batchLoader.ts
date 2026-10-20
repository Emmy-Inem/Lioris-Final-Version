// A tiny request coalescer: many callers each ask for a few keys within a short window and ONE `loadMany` call
// answers all of them. Used so a page of 20 post cards resolves its @mentions with one query instead of one per card.
// Pure (no react-native / supabase imports) so node --test can run it.

export interface BatchLoaderOptions<V> {
  /** Loads every key in one go. Keys it does not return count as "not found" (undefined). */
  loadMany: (keys: string[]) => Promise<Map<string, V>>;
  /** How long to collect keys before loading. */
  windowMs?: number;
  /** How long a loaded answer (including "not found") is reused. */
  ttlMs?: number;
  now?: () => number;
}

export interface BatchLoader<V> {
  load(keys: string[]): Promise<Map<string, V | undefined>>;
  clear(): void;
}

interface Deferred<V> {
  promise: Promise<V | undefined>;
  resolve: (value: V | undefined) => void;
  reject: (reason: unknown) => void;
}

export function createBatchLoader<V>(options: BatchLoaderOptions<V>): BatchLoader<V> {
  const windowMs = options.windowMs ?? 25;
  const ttlMs = options.ttlMs ?? 5 * 60_000;
  const now = options.now ?? (() => Date.now());

  const cache = new Map<string, { value: V | undefined; at: number }>();
  const inflight = new Map<string, Deferred<V>>();
  let queue: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    timer = null;
    const keys = queue;
    queue = [];
    if (keys.length === 0) return;
    try {
      const loaded = await options.loadMany(keys);
      for (const key of keys) {
        const value = loaded.get(key);
        cache.set(key, { value, at: now() });
        const d = inflight.get(key);
        inflight.delete(key);
        d?.resolve(value);
      }
    } catch (err) {
      // A failed load is not cached: the next caller tries again.
      for (const key of keys) {
        const d = inflight.get(key);
        inflight.delete(key);
        d?.reject(err);
      }
    }
  };

  return {
    load(keys) {
      const unique = [...new Set(keys)];
      const pending: Promise<void>[] = [];
      const result = new Map<string, V | undefined>();
      for (const key of unique) {
        const hit = cache.get(key);
        if (hit && now() - hit.at < ttlMs) {
          result.set(key, hit.value);
          continue;
        }
        let d = inflight.get(key);
        if (!d) {
          let resolve!: (value: V | undefined) => void;
          let reject!: (reason: unknown) => void;
          const promise = new Promise<V | undefined>((res, rej) => {
            resolve = res;
            reject = rej;
          });
          d = { promise, resolve, reject };
          inflight.set(key, d);
          queue.push(key);
        }
        pending.push(d.promise.then((value) => { result.set(key, value); }));
      }
      if (queue.length > 0 && !timer) timer = setTimeout(() => { void flush(); }, windowMs);
      return Promise.all(pending).then(() => result);
    },
    clear() {
      cache.clear();
    },
  };
}
