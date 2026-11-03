// Registry of module-level, account-bound caches. A module that keeps anything per account in memory (locally
// created rows merged into list results, profile cache, ...) registers a clearer here once; sign-out and account
// switches call clearAllSessionCaches(). Pure TypeScript (no react-native) so node --test can run it.

type Clearer = () => void;

const clearers = new Map<string, Clearer>();

/** Registers (or replaces, by name) the function that drops one module's per-account in-memory state. */
export function registerSessionCacheClearer(name: string, clear: Clearer): void {
  clearers.set(name, clear);
}

/**
 * Runs every registered clearer. One clearer throwing must not leave the others holding the previous account's
 * data, so each runs in its own try/catch. Returns the names of the clearers that threw.
 */
export function clearAllSessionCaches(): string[] {
  const failed: string[] = [];
  for (const [name, clear] of [...clearers]) {
    try {
      clear();
    } catch {
      failed.push(name);
    }
  }
  return failed;
}

export function registeredSessionCacheNames(): string[] {
  return [...clearers.keys()];
}
