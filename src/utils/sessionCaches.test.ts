import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { clearAllSessionCaches, registerSessionCacheClearer, registeredSessionCacheNames } from './sessionCaches.ts';

test('every registered clearer runs even when an earlier one throws', () => {
  const ran: string[] = [];
  registerSessionCacheClearer('a-throws', () => {
    throw new Error('listener blew up');
  });
  registerSessionCacheClearer('b', () => ran.push('b'));
  registerSessionCacheClearer('c', () => ran.push('c'));
  const failed = clearAllSessionCaches();
  assert.deepEqual(ran, ['b', 'c']);
  assert.deepEqual(failed, ['a-throws']);
});

test('registering the same name twice replaces the clearer instead of running it twice', () => {
  let calls = 0;
  registerSessionCacheClearer('dup', () => {
    calls += 10;
  });
  registerSessionCacheClearer('dup', () => {
    calls += 1;
  });
  clearAllSessionCaches();
  assert.equal(calls, 1);
  assert.equal(registeredSessionCacheNames().filter((n) => n === 'dup').length, 1);
});
