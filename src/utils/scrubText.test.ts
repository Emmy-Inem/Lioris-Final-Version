import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { scrubBreadcrumbs, scrubText } from './scrubText.ts';

test('scrubs e-mails, JWTs, bearer tokens and url query strings', () => {
  assert.equal(scrubText('failed for ada@uni.edu.ng'), 'failed for [email]');
  assert.equal(scrubText('auth eyJhbGciOiJI.eyJzdWIiOiIx.sig_ok'), 'auth [jwt]');
  assert.equal(scrubText('Authorization: Bearer abcdefgh12345'), 'Authorization: Bearer [token]');
  assert.equal(scrubText('GET https://x.co/cb?access_token=zzz#frag'), 'GET https://x.co/cb');
});

test('scrubs JSON-serialised credentials that the key=value rule cannot see', () => {
  const out = scrubText('{"email_ok":1,"password":"hunter2 with space","access_token":"abc.def"}');
  assert.ok(!out.includes('hunter2'), out);
  assert.ok(!out.includes('abc.def'), out);
});

test('breadcrumbs are scrubbed before they ride along in a report', () => {
  const crumbs = [
    {
      category: 'api',
      message: 'profiles.update failed for ada@uni.edu.ng',
      data: { message: 'duplicate key (email)=(ada@uni.edu.ng)', count: 3 },
      t: 5,
    },
  ];
  const out = scrubBreadcrumbs(crumbs);
  assert.ok(!JSON.stringify(out).includes('ada@uni.edu.ng'));
  assert.equal(out[0].data?.count, 3);
  assert.equal(out[0].t, 5);
});
