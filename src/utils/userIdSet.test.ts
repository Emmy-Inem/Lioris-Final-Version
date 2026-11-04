import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { createUserIdSet } from './userIdSet.ts';

test('a load started by the previous account cannot repopulate the set after sign-out', () => {
  const blocked = createUserIdSet();
  const tokenA = blocked.beginLoad(); // account A's request is in flight...
  blocked.clear(); // ...A signs out, B signs in
  const applied = blocked.applyLoad(tokenA, ['a-blocked-1', 'a-blocked-2']);
  assert.equal(applied, false);
  assert.deepEqual(blocked.values(), []);
});

test('someone unblocked elsewhere disappears on the next load (the old code only ever added)', () => {
  const blocked = createUserIdSet();
  blocked.applyLoad(blocked.beginLoad(), ['u1', 'u2']);
  assert.deepEqual(blocked.values().sort(), ['u1', 'u2']);
  blocked.applyLoad(blocked.beginLoad(), ['u2']);
  assert.deepEqual(blocked.values(), ['u2']);
});

test('a block made while a load is in flight survives that load\'s older answer', () => {
  const blocked = createUserIdSet();
  blocked.applyLoad(blocked.beginLoad(), ['u1']);
  const token = blocked.beginLoad();
  blocked.add('new-block'); // member blocks someone while the request is running
  blocked.remove('u1'); // ...and unblocks someone
  blocked.applyLoad(token, ['u1']); // the server answered before either write landed
  assert.equal(blocked.has('new-block'), true);
  assert.equal(blocked.has('u1'), false);
});

test('an aborted load stops tracking and does not affect later loads', () => {
  const s = createUserIdSet();
  const t = s.beginLoad();
  s.abortLoad(t);
  s.add('x');
  assert.deepEqual(s.values(), ['x']);
});
