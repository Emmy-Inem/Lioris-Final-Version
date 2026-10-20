import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// @ts-ignore TS5097
import { formatBadgeCount, sumUnreadMessages } from './unreadCounts.ts';

describe('sumUnreadMessages', () => {
  it('sums unread counts (numbers or numeric strings)', () => {
    assert.equal(
      sumUnreadMessages([
        { id: 'a', unread_count: 2 },
        { id: 'b', unread_count: '3' },
        { id: 'c', unread_count: null },
      ]),
      5,
    );
  });

  it('returns 0 for missing or malformed input', () => {
    assert.equal(sumUnreadMessages(null), 0);
    assert.equal(sumUnreadMessages(undefined), 0);
    assert.equal(sumUnreadMessages([{ id: 'a', unread_count: 'x' }, { id: 'b', unread_count: -4 }]), 0);
  });

  it('ignores a conversation archived after its newest message', () => {
    const summaries = [
      { id: 'a', unread_count: 4, last_message_at: '2026-01-02T00:00:00Z' },
      { id: 'b', unread_count: 1, last_message_at: '2026-01-02T00:00:00Z' },
    ];
    assert.equal(sumUnreadMessages(summaries, [{ channel_id: 'a', archived_at: '2026-01-03T00:00:00Z' }]), 1);
  });

  it('counts an archived conversation again once someone writes in it', () => {
    const summaries = [{ id: 'a', unread_count: 2, last_message_at: '2026-01-05T00:00:00Z' }];
    assert.equal(sumUnreadMessages(summaries, [{ channel_id: 'a', archived_at: '2026-01-03T00:00:00Z' }]), 2);
  });
});

describe('formatBadgeCount', () => {
  it('formats the badge', () => {
    assert.equal(formatBadgeCount(0), '');
    assert.equal(formatBadgeCount(7), '7');
    assert.equal(formatBadgeCount(99), '99');
    assert.equal(formatBadgeCount(150), '99+');
    assert.equal(formatBadgeCount(NaN), '');
  });
});
