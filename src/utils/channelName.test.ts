import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { uniqueChannelName } from './channelName.ts';

test('re-opening a channel never reuses the name of one that may still be leaving', () => {
  const names = new Set<string>();
  for (let i = 0; i < 1000; i += 1) names.add(uniqueChannelName('app_public_realtime_changes'));
  assert.equal(names.size, 1000);
  for (const n of names) assert.ok(n.startsWith('app_public_realtime_changes:'));
});
