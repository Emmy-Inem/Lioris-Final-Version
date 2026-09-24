import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isViewedNotificationExpired, VIEWED_NOTIFICATION_RETENTION_DAYS } from './notificationExpiry.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-24T12:00:00Z');

describe('isViewedNotificationExpired', () => {
  it('keeps a notification that has not been viewed, however old', () => {
    assert.equal(isViewedNotificationExpired(null, NOW), false);
    assert.equal(isViewedNotificationExpired(undefined, NOW), false);
  });

  it('keeps a notification viewed within the last 30 days', () => {
    assert.equal(isViewedNotificationExpired(new Date(NOW - 1 * DAY).toISOString(), NOW), false);
    assert.equal(isViewedNotificationExpired(new Date(NOW - 29 * DAY).toISOString(), NOW), false);
  });

  it('drops a notification once it was viewed more than 30 days ago', () => {
    assert.equal(VIEWED_NOTIFICATION_RETENTION_DAYS, 30);
    assert.equal(isViewedNotificationExpired(new Date(NOW - 30 * DAY - 1000).toISOString(), NOW), true);
    assert.equal(isViewedNotificationExpired(new Date(NOW - 90 * DAY).toISOString(), NOW), true);
  });

  it('does not hide a notification because of an unreadable timestamp', () => {
    assert.equal(isViewedNotificationExpired('not-a-date', NOW), false);
  });
});
