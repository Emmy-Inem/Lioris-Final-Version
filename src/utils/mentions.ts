// Pure @mention parsing shared by src/api/posts.ts (notifications, lookup) and the post renderers.

const MENTION_REGEX = /@([a-zA-Z0-9_.]{2,40})/g;
const WORD_CHAR = /[A-Za-z0-9_.@]/;

/**
 * Unique, lower-cased @handles found in `content`.
 *
 *  - An "@" glued to a preceding word character is not a mention: "ada@uni.edu.ng" used to yield the handle
 *    "uni.edu.ng" (a lookup, and possibly a notification, for whoever owns that username).
 *  - A handle that ends in "." usually has sentence punctuation stuck to it ("Thanks @ada."): the handle without the
 *    trailing dots is returned as well, so the mention still resolves, notifies and highlights. (Usernames may
 *    legitimately end in "." so the literal form stays in the list.)
 */
export function extractMentionHandles(content: string): string[] {
  const out = new Set<string>();
  for (const m of content.matchAll(MENTION_REGEX)) {
    const at = m.index ?? 0;
    if (at > 0 && WORD_CHAR.test(content[at - 1])) continue;
    const handle = m[1].toLowerCase();
    out.add(handle);
    const trimmed = handle.replace(/\.+$/, '');
    if (trimmed.length >= 2 && trimmed !== handle) out.add(trimmed);
  }
  return Array.from(out);
}

/** The resolved user for a rendered "@handle" token, trying the literal handle first and then without trailing dots. */
export function lookupMention<T>(byHandle: ReadonlyMap<string, T>, token: string): T | undefined {
  const handle = token.replace(/^@/, '').toLowerCase();
  return byHandle.get(handle) ?? byHandle.get(handle.replace(/\.+$/, ''));
}
