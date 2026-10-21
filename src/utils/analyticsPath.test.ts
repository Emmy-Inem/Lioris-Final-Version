import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { normalizeAnalyticsPath, isPublicAnalyticsPath } from './analyticsPath.ts';

const UUID = '3f2a9c1e-7b4d-4e8a-9c55-0a1b2c3d4e5f';

test('normalizeAnalyticsPath replaces dynamic segments with placeholders', () => {
  assert.equal(normalizeAnalyticsPath(`/messages/${UUID}`), '/messages/[id]');
  assert.equal(normalizeAnalyticsPath(`/(student)/post/${UUID}`), '/(student)/post/[id]');
  assert.equal(normalizeAnalyticsPath('/events/812'), '/events/[id]');
  assert.equal(normalizeAnalyticsPath(`/profile/${UUID}`), '/profile/[id]');
  assert.equal(normalizeAnalyticsPath('/pod/abc'), '/pod/[id]');
  assert.equal(normalizeAnalyticsPath('/mentorship-space/xyz'), '/mentorship-space/[id]');
  assert.equal(normalizeAnalyticsPath(`/events/${UUID}/tickets`), '/events/[id]/tickets');
});

test('normalizeAnalyticsPath keeps static pages and drops query/hash', () => {
  assert.equal(normalizeAnalyticsPath('/dashboard'), '/dashboard');
  assert.equal(normalizeAnalyticsPath('/events'), '/events');
  assert.equal(normalizeAnalyticsPath('/events/create'), '/events/create');
  assert.equal(normalizeAnalyticsPath('/profile/edit'), '/profile/edit');
  assert.equal(normalizeAnalyticsPath('/(auth)/login?next=/messages/123#x'), '/(auth)/login');
  assert.equal(normalizeAnalyticsPath('/'), '/');
  assert.equal(normalizeAnalyticsPath(''), '/');
  assert.equal(normalizeAnalyticsPath(null), '/');
});

test('normalizeAnalyticsPath catches id-looking segments under unknown parents', () => {
  assert.equal(normalizeAnalyticsPath(`/something/${UUID}`), '/something/[id]');
  assert.equal(normalizeAnalyticsPath('/something/12345'), '/something/[id]');
  assert.equal(normalizeAnalyticsPath('/resources'), '/resources');
});

test('isPublicAnalyticsPath only accepts pages that need no account', () => {
  for (const ok of ['/', '/login', '/(auth)/login', '/register?next=/messages/1', '/privacy', '/terms', '/community-rules']) {
    assert.equal(isPublicAnalyticsPath(ok), true, ok);
  }
  for (const no of ['/dashboard', '/(student)/feed', `/messages/${UUID}`, '/login/extra', '/admin', '', null, undefined]) {
    assert.equal(isPublicAnalyticsPath(no as any), false, String(no));
  }
});
