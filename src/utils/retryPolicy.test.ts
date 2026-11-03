import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { isPermanentQueryError, shouldRetryQuery } from '../api/queryClient.ts';

test('a Postgrest permission refusal (no http status on the error) is not retried', () => {
  // This is the shape supabase-js hands back for an RLS refusal: code + message, no `status`.
  const rls = { code: '42501', message: 'new row violates row-level security policy for table "posts"' };
  assert.equal(isPermanentQueryError(rls), true);
  assert.equal(shouldRetryQuery(0, rls), false);
});

test('bad requests, missing relations and constraint errors are permanent', () => {
  for (const code of ['PGRST116', 'PGRST200', 'PGRST205', '42P01', '22P02', '23505', '28000']) {
    assert.equal(isPermanentQueryError({ code, message: 'x' }), true, code);
  }
});

test('client http errors are permanent except timeout and rate limit', () => {
  assert.equal(isPermanentQueryError({ status: 401 }), true);
  assert.equal(isPermanentQueryError({ status: 404 }), true);
  assert.equal(isPermanentQueryError({ status: 408 }), false);
  assert.equal(isPermanentQueryError({ status: 429 }), false);
});

test('network failures, timeouts, pool errors and 5xx still retry twice', () => {
  const net = new TypeError('Failed to fetch');
  assert.equal(shouldRetryQuery(0, net), true);
  assert.equal(shouldRetryQuery(1, net), true);
  assert.equal(shouldRetryQuery(2, net), false);
  assert.equal(shouldRetryQuery(0, { status: 503 }), true);
  assert.equal(shouldRetryQuery(0, { code: 'PGRST003', message: 'pool timeout' }), true);
  assert.equal(shouldRetryQuery(0, new Error('Request timed out. Check your connection and try again.')), true);
  assert.equal(shouldRetryQuery(0, null), true);
});
