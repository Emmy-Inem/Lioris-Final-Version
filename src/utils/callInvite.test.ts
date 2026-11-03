import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { CALL_INVITE_MAX_AGE_MS, inviteRingMsRemaining } from './callInvite.ts';

test('a fresh invitation rings for the rest of its window, then stops', () => {
  const now = Date.parse('2026-01-01T10:00:30Z');
  assert.equal(inviteRingMsRemaining('2026-01-01T10:00:00Z', now), CALL_INVITE_MAX_AGE_MS - 30_000);
  assert.equal(inviteRingMsRemaining('2026-01-01T09:00:00Z', now), 0);
});

test('clock skew in the future never extends the ring beyond one window', () => {
  const now = Date.parse('2026-01-01T10:00:00Z');
  assert.equal(inviteRingMsRemaining('2026-01-01T11:00:00Z', now), CALL_INVITE_MAX_AGE_MS);
});

test('a missing or garbage timestamp still has a finite ring time', () => {
  assert.equal(inviteRingMsRemaining(undefined, 1), CALL_INVITE_MAX_AGE_MS);
  assert.equal(inviteRingMsRemaining('not a date', 1), CALL_INVITE_MAX_AGE_MS);
});
