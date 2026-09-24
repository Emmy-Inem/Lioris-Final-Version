import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { parseRpcError, RpcError, throwIfRpcError } from './rpcErrors.ts';

test('a bare code maps to a friendly sentence', () => {
  assert.deepEqual(parseRpcError({ message: 'mentor_full' }), {
    code: 'mentor_full',
    message: 'This mentor has no free mentee slots at the moment.',
  });
  assert.equal(parseRpcError(new Error('cooldown')).code, 'cooldown');
});

test('a code with a sentence keeps the sentence, capitalised', () => {
  const r = parseRpcError({ message: 'invalid_input: tell the mentor a little about yourself (at least 20 characters)' });
  assert.equal(r.code, 'invalid_input');
  assert.equal(r.message, 'Tell the mentor a little about yourself (at least 20 characters)');
  assert.equal(parseRpcError({ message: 'wrong_state: this request has already been answered' }).message, 'This request has already been answered');
});

test('unknown text falls back instead of leaking database internals', () => {
  assert.equal(parseRpcError({ message: 'duplicate key value violates unique constraint "x"' }, 'Nope').message, 'Nope');
  assert.equal(parseRpcError(undefined).code, 'unknown');
});

test('network and permission failures are recognised', () => {
  assert.equal(parseRpcError(new TypeError('Failed to fetch')).code, 'network');
  assert.equal(parseRpcError({ message: 'permission denied for table mentorships' }).code, 'not_allowed');
  assert.equal(parseRpcError({ message: 'Could not find the function public.request_mentorship in the schema cache' }).code, 'not_deployed');
});

test('throwIfRpcError throws an RpcError carrying the code', () => {
  assert.doesNotThrow(() => throwIfRpcError(null));
  assert.throws(
    () => throwIfRpcError({ message: 'pod_full' }),
    (e: any) => e instanceof RpcError && e.code === 'pod_full' && /full/.test(e.message),
  );
});
