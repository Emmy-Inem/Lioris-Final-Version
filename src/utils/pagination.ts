// Pure helpers for offset-paginated lists (src/api/posts.ts listFeedPostsPage, the forum feed's useInfiniteQuery).

/**
 * True when the database may still hold rows after this page. Decided from how many rows the DATABASE returned, not
 * from how many survived client-side filters (blocked/muted authors, hidden bots, drafts, "Polls"): a full page
 * that filters down to nothing used to read as "end of list" and silently stopped the feed after the first screen.
 */
export function pageMayHaveMore(rowsReturnedByDb: number, pageSize: number): boolean {
  return pageSize > 0 && rowsReturnedByDb >= pageSize;
}

/**
 * Flattens pages and drops repeated ids, keeping the first occurrence. Offset pages shift when a row is inserted
 * (or removed) between two page loads, so the last row of one page reappears at the top of the next; rendering it
 * twice gives duplicate React keys.
 */
export function dedupeById<T extends { id: string }>(pages: ReadonlyArray<ReadonlyArray<T>>): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages) {
    for (const item of page) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
