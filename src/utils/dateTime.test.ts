import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { addDays, endTimeOf, nextSaturday, parseLocalDateTime, relativeTime, toDateInput } from './dateTime.ts';

test('parseLocalDateTime accepts real dates and rejects impossible ones', () => {
  const ok = parseLocalDateTime('2026-09-26', '15:30');
  assert.ok(ok);
  assert.equal(ok!.getFullYear(), 2026);
  assert.equal(ok!.getMonth(), 8);
  assert.equal(ok!.getDate(), 26);
  assert.equal(ok!.getHours(), 15);
  assert.equal(ok!.getMinutes(), 30);
  assert.equal(parseLocalDateTime('2026-02-31', '10:00'), null);
  assert.equal(parseLocalDateTime('2026-9-26', '10:00'), null);
  assert.equal(parseLocalDateTime('2026-09-26', '25:00'), null);
  assert.equal(parseLocalDateTime('2026-09-26', '9:5'), null);
  assert.ok(parseLocalDateTime(' 2026-09-26 ', ' 9:05 '));
});

test('toDateInput round-trips and addDays crosses month ends', () => {
  const d = new Date(2026, 0, 31, 12);
  assert.equal(toDateInput(d), '2026-01-31');
  assert.equal(toDateInput(addDays(d, 1)), '2026-02-01');
});

test('nextSaturday is always a future Saturday', () => {
  for (let i = 0; i < 14; i++) {
    const from = new Date(2026, 8, 20 + i, 10);
    const sat = nextSaturday(from);
    assert.equal(sat.getDay(), 6);
    assert.ok(sat.getTime() > from.getTime());
  }
});

test('relativeTime is coarse and directional', () => {
  const now = Date.parse('2026-09-26T12:00:00Z');
  assert.equal(relativeTime('2026-09-26T12:00:20Z', now), 'now');
  assert.equal(relativeTime('2026-09-26T12:30:00Z', now), 'in 30 min');
  assert.equal(relativeTime('2026-09-26T09:00:00Z', now), '3 hours ago');
  assert.equal(relativeTime('2026-09-27T12:00:00Z', now), 'tomorrow');
  assert.equal(relativeTime('2026-09-23T12:00:00Z', now), '3 days ago');
});

test('endTimeOf adds minutes', () => {
  assert.equal(endTimeOf('2026-09-26T12:00:00.000Z', 90), '2026-09-26T13:30:00.000Z');
});
