import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMarkerForLinkType,
  hasAnyLiveMarker,
  isTrustedAuthLinkOrigin,
  jwtSubject,
  mayReplaceCurrentSession,
  parseAuthLink,
  parsePendingMarkers,
  sanitizeLinkErrorDescription,
  withPendingMarker,
  // @ts-ignore TS5097
} from './authLinkValidation.ts';

const SITE = 'https://lioris-campus.vercel.app';
const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub: string) => `${b64url({ alg: 'HS256' })}.${b64url({ sub })}.sig`;

test('origin: only lioris: or https on the site host', () => {
  assert.equal(isTrustedAuthLinkOrigin('lioris://reset-password#a=b', SITE), true);
  assert.equal(isTrustedAuthLinkOrigin('https://lioris-campus.vercel.app/verify-email#a=b', SITE), true);
  assert.equal(isTrustedAuthLinkOrigin('https://LIORIS-campus.vercel.app:443/x', SITE), true);
  assert.equal(isTrustedAuthLinkOrigin('https://evil.example/x', SITE), false);
  assert.equal(isTrustedAuthLinkOrigin('https://lioris-campus.vercel.app@evil.example/x', SITE), false);
  assert.equal(isTrustedAuthLinkOrigin('https://lioris-campus.vercel.app.evil.example/x', SITE), false);
  assert.equal(isTrustedAuthLinkOrigin('http://lioris-campus.vercel.app/x', SITE), false);
  assert.equal(isTrustedAuthLinkOrigin('exp://192.168.1.2:8081/--/x', SITE), false);
  assert.equal(isTrustedAuthLinkOrigin('javascript:alert(1)', SITE), false);
  // default site url when the env var is unset
  assert.equal(isTrustedAuthLinkOrigin('https://lioris-campus.vercel.app/x', undefined), true);
  assert.equal(isTrustedAuthLinkOrigin('https://other.example/x', 'https://other.example'), true);
});

test('parse: tokens only from the fragment, with a known type', () => {
  const ok = parseAuthLink('lioris://reset-password#access_token=AT&refresh_token=RT&type=recovery&expires_in=3600', SITE);
  assert.deepEqual(ok, { kind: 'tokens', accessToken: 'AT', refreshToken: 'RT', type: 'recovery' });

  // tokens in the query string are ignored entirely
  assert.deepEqual(parseAuthLink('lioris://x?access_token=AT&refresh_token=RT&type=recovery', SITE), { kind: 'none' });
  // a token in the query cannot be smuggled in beside a fragment either
  assert.deepEqual(parseAuthLink('lioris://x?access_token=EVIL#type=recovery', SITE), { kind: 'none' });

  assert.deepEqual(parseAuthLink('lioris://x#access_token=AT&refresh_token=RT', SITE), { kind: 'rejected', reason: 'unsupported_type' });
  assert.deepEqual(parseAuthLink('lioris://x#access_token=AT&refresh_token=RT&type=bogus', SITE), { kind: 'rejected', reason: 'unsupported_type' });
  assert.deepEqual(parseAuthLink('https://evil.example/x#access_token=AT&refresh_token=RT&type=signup', SITE), { kind: 'rejected', reason: 'untrusted_origin' });
  assert.deepEqual(parseAuthLink('lioris://x#access_token=AT&type=signup', SITE), { kind: 'none' });
  assert.deepEqual(parseAuthLink('lioris://home', SITE), { kind: 'none' });
  assert.deepEqual(parseAuthLink(null, SITE), { kind: 'none' });
  for (const type of ['signup', 'recovery', 'magiclink', 'invite', 'email_change']) {
    assert.equal(parseAuthLink(`lioris://x#access_token=A&refresh_token=R&type=${type}`, SITE).kind, 'tokens');
  }
});

test('parse: provider errors are sanitised and limited', () => {
  const r = parseAuthLink('lioris://x#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid', SITE);
  assert.equal(r.kind, 'error');
  assert.match((r as any).message, /expired or was already used/);

  const nasty = `<b>Call 555-0100</b>\n${'x'.repeat(500)}`;
  const e = parseAuthLink(`lioris://x#error=server_error&error_description=${encodeURIComponent(nasty)}`, SITE) as any;
  assert.equal(e.kind, 'error');
  assert.ok(e.message.length <= 200);
  assert.ok(!/[<>\n]/.test(e.message));

  assert.equal(sanitizeLinkErrorDescription('  hello   world  '), 'hello world');
  assert.equal(sanitizeLinkErrorDescription(''), 'This link is not valid. Request a new one.');
  assert.equal(sanitizeLinkErrorDescription('a'.repeat(300)).length, 200);
});

test('markers: expiry, kind matching and one marker per kind', () => {
  const now = 1_000_000;
  let m = withPendingMarker({}, 'recovery', now);
  assert.equal(m.recovery?.expiresAt, now + 2 * 60 * 60 * 1000);
  assert.ok(findMarkerForLinkType(m, 'recovery', now + 1000));
  assert.equal(findMarkerForLinkType(m, 'signup', now + 1000), null);
  assert.equal(findMarkerForLinkType(m, 'recovery', now + 2 * 60 * 60 * 1000 + 1), null);
  assert.equal(findMarkerForLinkType(m, 'invite', now), null);

  m = withPendingMarker(m, 'signup', now);
  assert.equal(findMarkerForLinkType(m, 'magiclink', now)?.kind, 'signup');
  assert.equal(findMarkerForLinkType(m, 'recovery', now)?.kind, 'recovery');
  assert.equal(hasAnyLiveMarker({}, now), false);
  assert.equal(hasAnyLiveMarker(m, now), true);

  const round = parsePendingMarkers(JSON.stringify(m), now + 10);
  assert.ok(round.recovery && round.signup);
  assert.deepEqual(parsePendingMarkers(JSON.stringify(m), now + 3 * 60 * 60 * 1000), {});
  assert.deepEqual(parsePendingMarkers('not json', now), {});
  assert.deepEqual(parsePendingMarkers(null, now), {});
});

test('account swap guard', () => {
  assert.equal(jwtSubject(jwt('user-a')), 'user-a');
  assert.equal(jwtSubject('garbage'), null);
  const rec = { expiresAt: 2 };
  assert.equal(mayReplaceCurrentSession(null, jwt('user-a'), rec), true);
  assert.equal(mayReplaceCurrentSession('user-a', jwt('user-a'), rec), true);
  assert.equal(mayReplaceCurrentSession('user-b', jwt('user-a'), rec), false);
  assert.equal(mayReplaceCurrentSession('user-b', 'garbage', rec), false);
  assert.equal(mayReplaceCurrentSession('user-b', jwt('user-a'), { expiresAt: 2, allowAccountSwitch: true }), true);
});
