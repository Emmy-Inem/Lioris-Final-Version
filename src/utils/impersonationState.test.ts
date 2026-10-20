import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMPERSONATION_MAX_MS,
  clampImpersonationExpiry,
  decideStartupImpersonation,
  isImpersonationExpired,
  parsePersistedImpersonation,
  serializeImpersonation,
  // @ts-ignore TS5097
} from './impersonationState.ts';

const now = Date.parse('2026-10-20T10:00:00.000Z');
const rec = { targetId: 't1', adminId: 'a1', expiresAt: new Date(now + 60_000).toISOString(), targetName: 'Ada' };

test('expiry is clamped to 15 minutes', () => {
  assert.equal(clampImpersonationExpiry(new Date(now + 60 * 60_000).toISOString(), now), new Date(now + IMPERSONATION_MAX_MS).toISOString());
  assert.equal(clampImpersonationExpiry(new Date(now + 60_000).toISOString(), now), new Date(now + 60_000).toISOString());
  assert.equal(clampImpersonationExpiry(undefined, now), new Date(now + IMPERSONATION_MAX_MS).toISOString());
  assert.equal(clampImpersonationExpiry('nonsense', now), new Date(now + IMPERSONATION_MAX_MS).toISOString());
});

test('persisted record round-trips and rejects junk', () => {
  assert.deepEqual(parsePersistedImpersonation(serializeImpersonation(rec)), rec);
  assert.equal(parsePersistedImpersonation(null), null);
  assert.equal(parsePersistedImpersonation('{'), null);
  assert.equal(parsePersistedImpersonation(JSON.stringify({ targetId: 't', adminId: 'a', expiresAt: 'x' })), null);
  assert.equal(parsePersistedImpersonation(JSON.stringify({ active: false, ...rec })), null);
  assert.equal(parsePersistedImpersonation(JSON.stringify({ expiresAt: rec.expiresAt })), null);
});

test('startup decision', () => {
  assert.equal(decideStartupImpersonation(null, 't1', now), 'none');
  assert.equal(decideStartupImpersonation(rec, 't1', now), 'resume');
  assert.equal(decideStartupImpersonation(rec, 't1', now + 120_000), 'end');
  assert.equal(decideStartupImpersonation(rec, 'a1', now), 'discard');
  assert.equal(decideStartupImpersonation(rec, null, now), 'discard');
  assert.equal(isImpersonationExpired(rec, now), false);
  assert.equal(isImpersonationExpired(rec, now + 60_000), true);
});
