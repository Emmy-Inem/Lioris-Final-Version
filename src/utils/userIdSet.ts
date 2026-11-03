// An in-memory set of user ids mirrored from the server (blocked / muted users), safe against the three ways a plain
// `Set` + "load adds rows" goes wrong. Pure TypeScript so node --test can run it. Used by src/api/connections.ts.
//
//  1. A load that was in flight when the account signed out must not write the OLD account's list into the next one.
//  2. A load replaces the contents, so someone unblocked on another device disappears here too (it used to only add).
//  3. A block/unblock the member makes while a load is in flight is not undone by that load's (older) answer.

interface LoadToken {
  epoch: number;
  touched: Set<string>;
}

export interface UserIdSet {
  has(id: string): boolean;
  add(id: string): void;
  remove(id: string): void;
  values(): string[];
  /** Sign-out / account switch: forget everything and invalidate loads that are still running. */
  clear(): void;
  beginLoad(): LoadToken;
  /** Applies the server's answer. Returns false (and changes nothing) when the load belongs to a previous account. */
  applyLoad(token: LoadToken, serverIds: Iterable<string>): boolean;
  abortLoad(token: LoadToken): void;
}

export function createUserIdSet(): UserIdSet {
  const ids = new Set<string>();
  const active = new Set<LoadToken>();
  let epoch = 0;

  const touch = (id: string) => {
    active.forEach((token) => token.touched.add(id));
  };

  return {
    has: (id) => ids.has(id),
    add(id) {
      ids.add(id);
      touch(id);
    },
    remove(id) {
      ids.delete(id);
      touch(id);
    },
    values: () => Array.from(ids),
    clear() {
      ids.clear();
      active.clear();
      epoch += 1;
    },
    beginLoad() {
      const token: LoadToken = { epoch, touched: new Set() };
      active.add(token);
      return token;
    },
    applyLoad(token, serverIds) {
      active.delete(token);
      if (token.epoch !== epoch) return false;
      const next = new Set(serverIds);
      token.touched.forEach((id) => {
        if (ids.has(id)) next.add(id);
        else next.delete(id);
      });
      ids.clear();
      next.forEach((id) => ids.add(id));
      return true;
    },
    abortLoad(token) {
      active.delete(token);
    },
  };
}
