import test from 'node:test';
import assert from 'node:assert/strict';
// The edge functions run on Deno, so only their dependency-free helpers (supabase/functions/_shared/*)
// can be exercised here; each one is imported by plain relative path.
// @ts-ignore TS5097
import { ROOT_ADMIN_EMAIL, isConfirmedRootUser, isRootEmail } from '../../supabase/functions/_shared/rootAdmin.ts';
// @ts-ignore TS5097
import { scrub } from '../../supabase/functions/_shared/scrub.ts';
// @ts-ignore TS5097
import { classifyTickets, nothingDelivered } from '../../supabase/functions/_shared/pushTickets.ts';
// @ts-ignore TS5097
import { isUsableOverpassResponse } from '../../supabase/functions/_shared/overpass.ts';

// ---- rootAdmin: the root-e-mail bootstrap needs a confirmed e-mail (parity with auth_is_super_admin()) ----

test('an UNCONFIRMED account on the root e-mail is not the root Super Admin', () => {
  assert.equal(isConfirmedRootUser({ email: ROOT_ADMIN_EMAIL, email_confirmed_at: null }), false);
  assert.equal(isConfirmedRootUser({ email: ROOT_ADMIN_EMAIL }), false);
  assert.equal(isConfirmedRootUser({ email: ROOT_ADMIN_EMAIL, email_confirmed_at: undefined, confirmed_at: null }), false);
});

test('a confirmed account on the root e-mail is, whatever the case or padding', () => {
  assert.equal(isConfirmedRootUser({ email: ROOT_ADMIN_EMAIL, email_confirmed_at: '2026-01-01T00:00:00Z' }), true);
  assert.equal(isConfirmedRootUser({ email: '  InemEmmanuel@Gmail.com ', email_confirmed_at: '2026-01-01T00:00:00Z' }), true);
  assert.equal(isConfirmedRootUser({ email: ROOT_ADMIN_EMAIL, confirmed_at: '2026-01-01T00:00:00Z' }), true);
});

test('the profile e-mail arm also needs the Auth user to be confirmed', () => {
  assert.equal(isConfirmedRootUser({ email: 'someone@else.com', email_confirmed_at: null }, ROOT_ADMIN_EMAIL), false);
  assert.equal(isConfirmedRootUser({ email: 'someone@else.com', email_confirmed_at: '2026-01-01T00:00:00Z' }, ROOT_ADMIN_EMAIL), true);
  assert.equal(isConfirmedRootUser({ email: 'someone@else.com', email_confirmed_at: '2026-01-01T00:00:00Z' }, 'x@y.com'), false);
  assert.equal(isConfirmedRootUser({ email: null, email_confirmed_at: '2026-01-01T00:00:00Z' }, null), false);
});

test('isRootEmail (used to PROTECT the root account) ignores confirmation', () => {
  assert.equal(isRootEmail(' INEMEMMANUEL@gmail.com'), true);
  assert.equal(isRootEmail('inememmanuel@gmail.com.evil.com'), false);
  assert.equal(isRootEmail(null), false);
});

// ---- scrub: still redacts, and stays linear-time on hostile input ----

test('scrub redacts e-mails, JWTs, bearer tokens, keys, query strings and token params', () => {
  assert.equal(scrub('failed for jane.doe+x@uni.edu.ng today'), 'failed for [email] today');
  assert.equal(scrub('a@b.co and c.d@e.org'), '[email] and [email]');
  assert.equal(scrub('jwt eyJhbGciOi.eyJzdWIiOiIx.sig_-x end'), 'jwt [jwt] end');
  assert.equal(scrub('Authorization: Bearer abcdefghij123'), 'Authorization: Bearer [token]');
  assert.equal(scrub('key sb_publishable_AbC123_-x here'), 'key [key] here');
  assert.equal(scrub('GET https://x.app/a/b?token=abc&x=1#frag ok'), 'GET https://x.app/a/b ok');
  assert.equal(scrub('refresh_token=abc123 password=hunter2'), 'refresh_token=[redacted] password=[redacted]');
  assert.equal(scrub('no secrets here: a@b'), 'no secrets here: a@b');
});

test('scrub does not take quadratic time on long runs of e-mail-local-part characters', () => {
  // Before the look-behind, each of these 15 KB inputs cost ~200 ms (and report-client-error scrubs
  // attacker-controlled text before any rate limit applies). Linear time is a few ms.
  for (const input of ['a'.repeat(15000), 'a.'.repeat(7500), 'a.b-c%d+'.repeat(1800)]) {
    const started = process.hrtime.bigint();
    const out = scrub(input);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(out, input);
    assert.ok(ms < 60, `scrub took ${ms.toFixed(1)} ms on a ${input.length}-char input`);
  }
});

// ---- pushTickets ----

test('classifyTickets counts accepted tickets and collects dead tokens by position', () => {
  const tokens = ['ExponentPushToken[a]', 'ExponentPushToken[b]', 'ExponentPushToken[c]', 'ExponentPushToken[d]'];
  const out = classifyTickets(tokens, [
    { status: 'ok', id: '1' },
    { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
    { status: 'error', details: { error: 'MessageRateExceeded' } },
    { status: 'error' },
  ]);
  assert.equal(out.sent, 1);
  assert.deepEqual(out.deadTokens, ['ExponentPushToken[b]']);
  assert.deepEqual(out.errors, ['MessageRateExceeded', 'unknown']);
});

test('classifyTickets never indexes past the batch (no "undefined" token is ever queued for deletion)', () => {
  const out = classifyTickets(['ExponentPushToken[a]'], [
    { status: 'ok' },
    { status: 'error', details: { error: 'DeviceNotRegistered' } },
  ]);
  assert.equal(out.sent, 1);
  assert.deepEqual(out.deadTokens, []);
  assert.deepEqual(classifyTickets(['ExponentPushToken[a]', 'ExponentPushToken[b]'], []), { sent: 0, deadTokens: [], errors: [] });
});

test('nothingDelivered: the de-duplication slot is only released when no batch at all was answered', () => {
  assert.equal(nothingDelivered(1, 0), true);
  assert.equal(nothingDelivered(3, 0), true);
  assert.equal(nothingDelivered(3, 1), false); // a retry would double-send to the devices already served
  assert.equal(nothingDelivered(1, 1), false);
  assert.equal(nothingDelivered(0, 0), false);
});

// ---- overpass ----

test('Overpass: a real result is usable, an empty one too', () => {
  assert.equal(isUsableOverpassResponse('{"version":0.6,"elements":[{"type":"node","id":1}]}'), true);
  assert.equal(isUsableOverpassResponse('{"elements":[]}'), true);
  assert.equal(isUsableOverpassResponse('{"elements":[],"remark":"note: something harmless"}'), true);
});

test('Overpass: 200 answers that carry a runtime error / timeout / non-result are rejected (never cached)', () => {
  assert.equal(isUsableOverpassResponse('{"elements":[],"remark":"runtime error: Query timed out in \\"query\\" at line 1 after 15 seconds."}'), false);
  assert.equal(isUsableOverpassResponse('{"elements":[],"remark":"runtime error: out of memory"}'), false);
  assert.equal(isUsableOverpassResponse('{"remark":"rate_limited"}'), false);
  assert.equal(isUsableOverpassResponse('<html>Bad gateway</html>'), false);
  assert.equal(isUsableOverpassResponse('[]'), false);
  assert.equal(isUsableOverpassResponse('null'), false);
  assert.equal(isUsableOverpassResponse('{"version":0.6}'), false);
});
