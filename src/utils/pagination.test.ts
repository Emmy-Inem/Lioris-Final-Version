import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { dedupeById, pageMayHaveMore } from './pagination.ts';

test('a full database page that filtered down to nothing still has more behind it', () => {
  // 20 rows came back, all 20 were bot posts hidden on the client: the page is empty but the feed is not over.
  assert.equal(pageMayHaveMore(20, 20), true);
  assert.equal(pageMayHaveMore(7, 20), false);
  assert.equal(pageMayHaveMore(0, 20), false);
  assert.equal(pageMayHaveMore(5, 0), false);
});

test('rows that slid across a page boundary are listed once', () => {
  // A new post was inserted between loading page 0 and page 1, so row "c" is the last of page 0 and the first of page 1.
  const page0 = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const page1 = [{ id: 'c' }, { id: 'd' }, { id: 'e' }];
  assert.deepEqual(
    dedupeById([page0, page1]).map((p) => p.id),
    ['a', 'b', 'c', 'd', 'e'],
  );
});
