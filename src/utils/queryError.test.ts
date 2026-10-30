import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// @ts-ignore TS5097
import { classifyQueryError, isMissingRelationError, queryErrorCopy, queryErrorMode, refetchFailedQueries, summarizeQueryErrors } from './queryError.ts';

describe('classifyQueryError', () => {
  it('detects offline and network failures', () => {
    assert.equal(classifyQueryError(new TypeError('Network request failed')), 'offline');
    assert.equal(classifyQueryError(new Error('Failed to fetch')), 'offline');
    assert.equal(classifyQueryError({ message: 'TypeError: Load failed' }), 'offline');
    assert.equal(classifyQueryError('ETIMEDOUT'), 'offline');
  });

  it('detects permission refusals', () => {
    assert.equal(classifyQueryError({ code: '42501', message: 'x' }), 'permission');
    assert.equal(classifyQueryError({ message: 'new row violates row-level security policy for table "posts"' }), 'permission');
    assert.equal(classifyQueryError({ status: 403, message: 'Forbidden' }), 'permission');
    assert.equal(classifyQueryError({ message: 'JWT expired' }), 'permission');
  });

  it('treats everything else as generic', () => {
    assert.equal(classifyQueryError(null), 'generic');
    assert.equal(classifyQueryError(undefined), 'generic');
    assert.equal(classifyQueryError(new Error('relation "public.events" does not exist')), 'generic');
  });
});

describe('queryErrorCopy', () => {
  it('never echoes raw database text', () => {
    const copy = queryErrorCopy({ code: 'PGRST200', message: 'column events.foo does not exist' }, 'events');
    assert.equal(copy.kind, 'generic');
    assert.equal(copy.title, "Couldn't load events");
    assert.ok(!/column|PGRST|relation/i.test(copy.message));
  });

  it('uses offline and permission wording', () => {
    assert.equal(queryErrorCopy(new Error('Failed to fetch')).title, "You're offline");
    const denied = queryErrorCopy({ code: '42501', message: 'permission denied for table x' }, 'the calendar');
    assert.equal(denied.kind, 'permission');
    assert.ok(denied.message.includes('the calendar'));
    assert.ok(!/permission denied|table/i.test(denied.message));
  });
});

describe('queryErrorMode', () => {
  it('shows nothing while the query is healthy', () => {
    assert.equal(queryErrorMode({ isError: false, data: undefined }), 'none');
  });

  it('blocks only when there is nothing cached', () => {
    assert.equal(queryErrorMode({ isError: true, data: undefined }), 'blocking');
    assert.equal(queryErrorMode({ isError: true, data: [] }), 'inline');
    assert.equal(queryErrorMode({ isError: true, data: [] }, false), 'blocking');
    assert.equal(queryErrorMode({ isError: true, data: undefined }, true), 'inline');
  });
});

describe('summarizeQueryErrors', () => {
  it('is quiet when nothing failed', () => {
    assert.deepEqual(summarizeQueryErrors([{ isError: false, data: [] }, { isError: false }]), { mode: 'none', error: null });
  });

  it('blocks when every section failed or is empty', () => {
    const boom = new Error('Failed to fetch');
    const result = summarizeQueryErrors([{ isError: true, error: boom }, { isError: true, error: new Error('x') }, {}]);
    assert.equal(result.mode, 'blocking');
    assert.equal(result.error, boom);
  });

  it('shows an inline notice when other sections still have data', () => {
    const result = summarizeQueryErrors([{ isError: true, error: new Error('x') }, { isError: false, data: [1] }]);
    assert.equal(result.mode, 'inline');
    assert.equal(summarizeQueryErrors([{ isError: true, data: [] }]).mode, 'inline');
  });
});

describe('refetchFailedQueries', () => {
  it('retries only the failed queries', async () => {
    const calls: string[] = [];
    await refetchFailedQueries([
      { isError: true, refetch: () => calls.push('a') },
      { isError: false, refetch: () => calls.push('b') },
      { isError: true, refetch: async () => { calls.push('c'); } },
      { isError: true },
    ]);
    assert.deepEqual(calls, ['a', 'c']);
  });
});

describe('isMissingRelationError', () => {
  it('recognises a table that does not exist', () => {
    assert.equal(isMissingRelationError({ code: '42P01', message: 'relation "client_errors" does not exist' }), true);
    assert.equal(isMissingRelationError({ code: 'PGRST205', message: "Could not find the table 'public.client_errors' in the schema cache" }), true);
  });
  it('does not treat failed requests or permission refusals as a missing table', () => {
    assert.equal(isMissingRelationError({ code: '42501', message: 'permission denied for table client_errors' }), false);
    assert.equal(isMissingRelationError({ status: 500, message: 'Internal Server Error' }), false);
    assert.equal(isMissingRelationError(new Error('Failed to fetch')), false);
    assert.equal(isMissingRelationError(null), false);
  });
});
