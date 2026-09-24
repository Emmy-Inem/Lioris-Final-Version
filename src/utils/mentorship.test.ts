import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { describeAvailability, isOpenMentorship, matchLabel, mentorshipSortRank, mentorshipStatusLabel } from './mentorship.ts';

test('describeAvailability sorts days and adds the window', () => {
  assert.equal(describeAvailability({ days: ['wed', 'mon'], window: 'evenings' }), 'Mon, Wed · Evenings');
  assert.equal(describeAvailability({ days: [], window: 'flexible' }), '');
  assert.equal(describeAvailability({ days: ['sat'] }), 'Sat');
  assert.equal(describeAvailability({ window: 'weekends' }), 'Weekends');
  assert.equal(describeAvailability(null), '');
});

test('open statuses are pending and active only', () => {
  assert.equal(isOpenMentorship('pending'), true);
  assert.equal(isOpenMentorship('active'), true);
  for (const s of ['completed', 'declined', 'withdrawn', 'ended'] as const) assert.equal(isOpenMentorship(s), false);
});

test('match label thresholds', () => {
  assert.equal(matchLabel(0), null);
  assert.equal(matchLabel(2), null);
  assert.equal(matchLabel(3), 'Good match');
  assert.equal(matchLabel(9), 'Strong match');
});

test('pending sorts before active before history', () => {
  assert.ok(mentorshipSortRank('pending') < mentorshipSortRank('active'));
  assert.ok(mentorshipSortRank('active') < mentorshipSortRank('completed'));
  assert.equal(mentorshipStatusLabel('withdrawn'), 'Withdrawn');
});
