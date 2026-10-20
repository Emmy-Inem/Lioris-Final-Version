// Pure helpers behind src/realtime/useRealtimeChannel.ts: a per-key invalidation coalescer and the table ->
// query-key mapping. Kept free of react-native / supabase imports so node --test can run it.

/** Which cached queries an invalidation touches: every query whose key starts with `key`, minus excluded sub-keys. */
export interface InvalidationTarget {
  key: readonly unknown[];
  /** Skip queries whose key element right after `key` is one of these (e.g. event detail keys when refreshing event lists). */
  skipSubKeys?: readonly string[];
}

export interface InvalidationPlan {
  /** Coalescing id: plans with the same id inside one window collapse into one invalidation. */
  id: string;
  target: InvalidationTarget;
  delayMs: number;
}

/** True when `queryKey` is matched by `target`. */
export function matchesTarget(queryKey: readonly unknown[], target: InvalidationTarget): boolean {
  const { key, skipSubKeys } = target;
  if (queryKey.length < key.length) return false;
  for (let i = 0; i < key.length; i += 1) {
    if (queryKey[i] !== key[i]) return false;
  }
  if (skipSubKeys && queryKey.length > key.length) {
    const next = queryKey[key.length];
    if (typeof next === 'string' && skipSubKeys.includes(next)) return false;
  }
  return true;
}

interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const defaultTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface Coalescer {
  /** Runs `run` once, `delayMs` after the FIRST call for `id`; later calls for the same id inside that window are dropped. */
  schedule(id: string, run: () => void, delayMs: number): void;
  /** While paused nothing runs; ids are remembered and each runs exactly once when resumed. */
  setPaused(paused: boolean): void;
  /** Runs everything that is waiting, now. */
  flush(): void;
  /** Drops everything that is waiting. */
  cancel(): void;
  pendingCount(): number;
}

export function createCoalescer(timers: Timers = defaultTimers): Coalescer {
  const waiting = new Map<string, { run: () => void; handle: unknown }>();
  const parked = new Map<string, () => void>();
  let paused = false;

  const fire = (id: string) => {
    const entry = waiting.get(id);
    if (!entry) return;
    waiting.delete(id);
    entry.run();
  };

  return {
    schedule(id, run, delayMs) {
      if (paused) {
        if (!parked.has(id)) parked.set(id, run);
        return;
      }
      if (waiting.has(id)) return;
      const handle = timers.set(() => fire(id), Math.max(0, delayMs));
      waiting.set(id, { run, handle });
    },
    setPaused(next) {
      if (next === paused) return;
      paused = next;
      if (paused) {
        // Whatever was about to fire is parked instead: nothing invalidates in the background.
        waiting.forEach((entry, id) => {
          timers.clear(entry.handle);
          if (!parked.has(id)) parked.set(id, entry.run);
        });
        waiting.clear();
        return;
      }
      const toRun = [...parked.values()];
      parked.clear();
      toRun.forEach((run) => run());
    },
    flush() {
      [...waiting.keys()].forEach((id) => {
        const entry = waiting.get(id);
        if (entry) timers.clear(entry.handle);
        fire(id);
      });
    },
    cancel() {
      waiting.forEach((entry) => timers.clear(entry.handle));
      waiting.clear();
      parked.clear();
    },
    pendingCount() {
      return waiting.size + parked.size;
    },
  };
}

// Debounce windows (ms). Cheap, user-visible things refresh fast; whole lists refresh slowly because every
// signed-in client receives every write.
export const DELAY_THREAD_MS = 500;
export const DELAY_FAST_MS = 1500;
export const DELAY_LIST_MS = 5000;

const EVENT_NON_LIST_SUBKEYS = ['detail', 'waitlist', 'ticket', 'payment-info'] as const;

type Row = Record<string, any> | null | undefined;

function pickId(newRow: Row, oldRow: Row, column: string): string {
  const value = newRow?.[column] ?? oldRow?.[column];
  return value ? String(value) : '';
}

/**
 * Which queries to refresh when `table` changes. `newRow` / `oldRow` are the realtime payload's `new` / `old`.
 * A new comment on post X refreshes that post's comments only, an RSVP refreshes that event's detail quickly
 * and the event lists slowly, and so on. Unknown ids fall back to the broader (but still table-specific) key.
 */
export function planInvalidations(table: string, newRow: Row, oldRow: Row): InvalidationPlan[] {
  const plan = (id: string, key: readonly unknown[], delayMs: number, skipSubKeys?: readonly string[]): InvalidationPlan => ({
    id,
    target: skipSubKeys ? { key, skipSubKeys } : { key },
    delayMs,
  });

  switch (table) {
    case 'chat_messages': {
      const channelId = pickId(newRow, oldRow, 'channel_id');
      return [
        channelId
          ? plan(`messages:${channelId}`, ['messages', channelId], DELAY_THREAD_MS)
          : plan('messages', ['messages'], DELAY_THREAD_MS),
        plan('conversations', ['conversations'], DELAY_FAST_MS),
        plan('unread-counts', ['unread-counts'], DELAY_FAST_MS),
      ];
    }
    case 'chat_channels':
      return [plan('conversations', ['conversations'], DELAY_FAST_MS), plan('unread-counts', ['unread-counts'], DELAY_FAST_MS)];
    case 'notifications':
      return [plan('notifications', ['notifications'], DELAY_FAST_MS), plan('unread-counts', ['unread-counts'], DELAY_FAST_MS)];
    case 'connections':
      return [
        plan('connections', ['connections'], DELAY_FAST_MS),
        plan('directory', ['directory'], DELAY_LIST_MS),
      ];
    case 'events': {
      const eventId = pickId(newRow, oldRow, 'id');
      return [
        ...(eventId ? [plan(`events:detail:${eventId}`, ['events', 'detail', eventId], DELAY_FAST_MS)] : []),
        plan('events:list', ['events'], DELAY_LIST_MS, EVENT_NON_LIST_SUBKEYS),
      ];
    }
    case 'event_attendees': {
      const eventId = pickId(newRow, oldRow, 'event_id');
      return [
        ...(eventId
          ? [
              plan(`events:detail:${eventId}`, ['events', 'detail', eventId], DELAY_FAST_MS),
              plan(`event-roster:${eventId}`, ['event-roster', eventId], DELAY_FAST_MS),
            ]
          : [plan('events:detail', ['events', 'detail'], DELAY_FAST_MS)]),
        plan('events:list', ['events'], DELAY_LIST_MS, EVENT_NON_LIST_SUBKEYS),
      ];
    }
    case 'posts': {
      const postId = pickId(newRow, oldRow, 'id');
      return [
        ...(postId ? [plan(`post:${postId}`, ['post', postId], DELAY_FAST_MS)] : []),
        plan('feed', ['feed'], DELAY_LIST_MS),
        plan('posts', ['posts'], DELAY_LIST_MS),
      ];
    }
    case 'post_comments': {
      const postId = pickId(newRow, oldRow, 'post_id');
      if (!postId) {
        return [
          plan('post-comments', ['post-comments'], DELAY_FAST_MS),
          plan('comments', ['comments'], DELAY_FAST_MS),
        ];
      }
      return [
        plan(`post-comments:${postId}`, ['post-comments', postId], DELAY_FAST_MS),
        plan(`comments:${postId}`, ['comments', postId], DELAY_FAST_MS),
        plan(`post:${postId}`, ['post', postId], DELAY_FAST_MS),
      ];
    }
    case 'verifications':
      return [
        plan('verification-requests', ['verification-requests'], DELAY_FAST_MS * 2),
        plan('verifications', ['verifications'], DELAY_FAST_MS * 2),
      ];
    case 'moderation_queue':
      return [plan('reports', ['reports'], DELAY_FAST_MS * 2)];
    case 'marketplace_listings':
      return [plan('marketplace', ['marketplace'], DELAY_LIST_MS)];
    case 'mentorships':
      return [plan('mentorships', ['mentorships'], DELAY_FAST_MS * 2)];
    default:
      return [];
  }
}
