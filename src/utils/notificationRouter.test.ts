import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { resolveNotificationRoute } from './notificationRouter.ts';

test('adapts role prefix to recipient role correctly', () => {
  // Staff receiving a student dashboard notification
  assert.equal(
    resolveNotificationRoute('/(student)/dashboard', 'system_announcement', 'staff'),
    '/(staff)/dashboard',
  );

  // Alumni receiving a student dashboard notification
  assert.equal(
    resolveNotificationRoute('/(student)/dashboard', 'system_announcement', 'alumni'),
    '/(alumni)/dashboard',
  );

  // Student receiving a connection request
  assert.equal(
    resolveNotificationRoute('/(alumni)/connection-requests', 'system', 'student'),
    '/(student)/notifications',
  );

  // Staff receiving a feed link maps to forum
  assert.equal(
    resolveNotificationRoute('/(student)/feed', 'system', 'staff'),
    '/(staff)/forum',
  );
});

test('handles missing deepLinkPath with type-based fallback', () => {
  // Announcement fallback
  assert.equal(
    resolveNotificationRoute(undefined, 'announcement', 'student'),
    '/(student)/dashboard',
  );
  assert.equal(
    resolveNotificationRoute(undefined, 'announcement', 'staff'),
    '/(staff)/announcements',
  );

  // Event fallback
  assert.equal(
    resolveNotificationRoute(null, 'event', 'alumni'),
    '/(alumni)/events-list',
  );

  // Message fallback
  assert.equal(
    resolveNotificationRoute('', 'message', 'student'),
    '/(student)/messages',
  );

  // Moderation fallback
  assert.equal(
    resolveNotificationRoute(undefined, 'moderation', 'staff'),
    '/(staff)/moderation',
  );
  assert.equal(
    resolveNotificationRoute(undefined, 'moderation', 'admin'),
    '/(admin)/moderation-queue',
  );
});

test('preserves exact role route when recipient role matches', () => {
  assert.equal(
    resolveNotificationRoute('/(student)/resources', 'system', 'student'),
    '/(student)/resources',
  );
  assert.equal(
    resolveNotificationRoute('/(alumni)/mentorship', 'system', 'alumni'),
    '/(alumni)/mentorship',
  );
});
