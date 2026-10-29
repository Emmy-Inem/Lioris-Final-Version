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

test('routes database notifications to the exact mentorship or pod', () => {
  const id = '3f2b8c1e-9a4d-4e7b-8c55-0d6e1f2a3b4c';
  assert.equal(resolveNotificationRoute('/mentorship/' + id, 'system', 'student'), '/(student)/mentorship-space/' + id);
  assert.equal(resolveNotificationRoute('/mentorship/' + id, 'system', 'alumni'), '/(alumni)/mentorship-space/' + id);
  assert.equal(resolveNotificationRoute('/mentorship/' + id, 'system', 'staff'), '/(staff)/dashboard');
  assert.equal(resolveNotificationRoute('/study-groups/' + id, 'system', 'student'), '/(student)/pod/' + id);
  assert.equal(resolveNotificationRoute('/study-groups/' + id, 'system', 'alumni'), '/(alumni)/dashboard');
  // the older list-level links still work
  assert.equal(resolveNotificationRoute('/(student)/study-groups', 'system', 'student'), '/(student)/study-groups');
});

// Every route the resolver can hand back must be a real screen in app/ (an unmatched route is a dead end).
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function appRoutes(): string[] {
  const root = join(process.cwd(), 'app');
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { walk(full, `${prefix}/${name}`); continue; }
      if (!/\.tsx?$/.test(name) || name.startsWith('_') || name.startsWith('+')) continue;
      out.push(`${prefix}/${name.replace(/\.tsx?$/, '')}`.replace(/\/index$/, ''));
    }
  };
  walk(root, '');
  return out;
}

test('resolveNotificationRoute only returns routes that exist for the recipient role', () => {
  if (!existsSync(join(process.cwd(), 'app'))) return;
  const routes = appRoutes().map(
    (r) =>
      new RegExp(
        '^' + r.split('/').map((part) => (/^\[.+\]$/.test(part) ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/') + '$',
      ),
  );
  const id = '3f2a9c1e-7b4d-4e8a-9c55-0a1b2c3d4e5f';
  const links = [
    '/feed', '/forum', '/forum/explore', '/connection-requests', '/connections', '/resources', '/study-groups', '/announcements',
    '/moderation', '/moderation-queue', '/jobs', '/mentorship', '/marketplace', '/marketplace-mine', '/giving', '/events', '/events-list',
    '/profile', '/dashboard', '/messages', '/settings', '/notifications', '/saved', '/search',
    `/post/${id}`, `/events/${id}`, `/event/${id}`, `/messages/${id}`, `/mentorship/${id}`, `/mentorship-space/${id}`, `/pod/${id}`, `/study-groups/${id}`,
  ];
  const missing: string[] = [];
  for (const role of ['student', 'staff', 'alumni', 'admin']) {
    for (const link of links) {
      const resolved = resolveNotificationRoute(link, 'system_announcement', role).split('?')[0];
      if (!routes.some((rx) => rx.test(resolved))) missing.push(`${role} ${link} -> ${resolved}`);
    }
  }
  assert.deepEqual(missing, []);
});
