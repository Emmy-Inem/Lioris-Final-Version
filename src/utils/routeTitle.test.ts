import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// @ts-ignore TS5097
import { routeTitle, LEGAL_TITLES, DEFAULT_TITLE } from './routeTitle.ts';

const UUID = '3f2a9c1e-7b4d-4e8a-9c55-0a1b2c3d4e5f';

test('section routes get "<Section> | Lioris"', () => {
  assert.equal(routeTitle('/feed'), 'Feed | Lioris');
  assert.equal(routeTitle('/events-list'), 'Events | Lioris');
  assert.equal(routeTitle('/events'), 'Events | Lioris');
  assert.equal(routeTitle('/dashboard'), 'Dashboard | Lioris');
  assert.equal(routeTitle('/marketplace-mine'), 'My listings | Lioris');
  assert.equal(routeTitle('/forum/explore'), 'Explore forum | Lioris');
});

test('auth and onboarding routes are titled', () => {
  assert.equal(routeTitle('/login'), 'Sign in | Lioris');
  assert.equal(routeTitle('/register'), 'Create your account | Lioris');
  assert.equal(routeTitle('/onboarding/build-profile'), 'Build your profile | Lioris');
  assert.equal(routeTitle('/onboarding/nope'), DEFAULT_TITLE);
});

test('admin-only screens are prefixed with Admin', () => {
  assert.equal(routeTitle('/moderation-queue'), 'Admin | Moderation queue | Lioris');
  assert.equal(routeTitle('/audit-logs'), 'Admin | Audit logs | Lioris');
  assert.equal(routeTitle('/user-directory'), 'Admin | User directory | Lioris');
});

test('detail routes use the generic section name and never echo the id', () => {
  for (const [path, title] of [
    [`/events/${UUID}`, 'Event details | Lioris'],
    [`/messages/${UUID}`, 'Conversation | Lioris'],
    [`/post/${UUID}`, 'Post | Lioris'],
    [`/pod/${UUID}`, 'Study group | Lioris'],
    [`/mentorship-space/${UUID}`, 'Mentorship space | Lioris'],
  ] as const) {
    assert.equal(routeTitle(path), title);
    assert.ok(!String(routeTitle(path)).includes(UUID));
  }
});

test('route groups, case, trailing slashes and query strings are ignored', () => {
  assert.equal(routeTitle('/(student)/feed'), 'Feed | Lioris');
  assert.equal(routeTitle('/Feed/'), 'Feed | Lioris');
  assert.equal(routeTitle('/login?redirect=%2Ffeed#x'), 'Sign in | Lioris');
  assert.equal(routeTitle('/(admin)/moderation-queue'), 'Admin | Moderation queue | Lioris');
});

test('root and unknown paths fall back to the default title', () => {
  assert.equal(routeTitle('/'), DEFAULT_TITLE);
  assert.equal(routeTitle(''), DEFAULT_TITLE);
  assert.equal(routeTitle('/definitely-not-a-page'), DEFAULT_TITLE);
  assert.equal(routeTitle('/feed/extra/segments/here'), DEFAULT_TITLE);
  assert.equal(routeTitle('/constructor'), DEFAULT_TITLE);
  assert.equal(routeTitle('/__proto__'), DEFAULT_TITLE);
});

test('public legal pages use the same titles as public/pwa-boot.js', () => {
  const boot = readFileSync(new URL('../../public/pwa-boot.js', import.meta.url), 'utf8');
  const entries = [...boot.matchAll(/'(\/[a-z-]+)': \['([^']+)'/g)];
  assert.equal(entries.length, Object.keys(LEGAL_TITLES).length);
  for (const [, path, title] of entries) {
    assert.equal(LEGAL_TITLES[path], title, `pwa-boot title for ${path}`);
    assert.equal(routeTitle(path), title);
  }
  assert.equal(routeTitle('/Privacy/'), 'Privacy Policy | Lioris');
  assert.equal(routeTitle('/privacy?x=1'), 'Privacy Policy | Lioris');
  assert.equal(routeTitle('/privacy/other'), DEFAULT_TITLE);
});

test('privacy and login titles are distinct from each other and from the default', () => {
  assert.notEqual(routeTitle('/privacy'), routeTitle('/login'));
  assert.notEqual(routeTitle('/login'), routeTitle('/register'));
  assert.notEqual(routeTitle('/login'), DEFAULT_TITLE);
});
