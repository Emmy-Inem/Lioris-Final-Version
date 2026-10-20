import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// @ts-ignore TS5097
import { createBatchLoader } from './batchLoader.ts';

describe('createBatchLoader', () => {
  it('answers many callers in one window with a single loadMany over the union of keys', async () => {
    const calls: string[][] = [];
    const loader = createBatchLoader<string>({
      windowMs: 5,
      loadMany: async (keys: string[]) => {
        calls.push([...keys].sort());
        return new Map(keys.filter((k) => k !== 'missing').map((k) => [k, k.toUpperCase()]));
      },
    });
    const [a, b, c] = await Promise.all([
      loader.load(['x', 'y']),
      loader.load(['y', 'z']),
      loader.load(['missing']),
    ]);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], ['missing', 'x', 'y', 'z']);
    assert.equal(a.get('x'), 'X');
    assert.equal(a.get('y'), 'Y');
    assert.equal(b.get('z'), 'Z');
    assert.equal(c.get('missing'), undefined);
  });

  it('reuses answers (including "not found") until the ttl passes', async () => {
    let clock = 0;
    let loads = 0;
    const loader = createBatchLoader<string>({
      windowMs: 1,
      ttlMs: 1000,
      now: () => clock,
      loadMany: async (keys: string[]) => {
        loads += 1;
        return new Map(keys.filter((k) => k === 'a').map((k) => [k, 'A']));
      },
    });
    await loader.load(['a', 'b']);
    await loader.load(['a', 'b']);
    assert.equal(loads, 1);
    clock = 1500;
    await loader.load(['a']);
    assert.equal(loads, 2);
  });

  it('does not cache a failed load', async () => {
    let attempts = 0;
    const loader = createBatchLoader<string>({
      windowMs: 1,
      loadMany: async (keys: string[]) => {
        attempts += 1;
        if (attempts === 1) throw new Error('offline');
        return new Map(keys.map((k) => [k, 'ok']));
      },
    });
    await assert.rejects(loader.load(['k']), /offline/);
    const result = await loader.load(['k']);
    assert.equal(result.get('k'), 'ok');
    assert.equal(attempts, 2);
  });

  it('shares an in-flight key between callers instead of loading it twice', async () => {
    let loads = 0;
    const loader = createBatchLoader<number>({
      windowMs: 5,
      loadMany: async (keys: string[]) => {
        loads += 1;
        return new Map(keys.map((k) => [k, 1]));
      },
    });
    await Promise.all([loader.load(['same']), loader.load(['same'])]);
    assert.equal(loads, 1);
  });
});
