import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { buildConsentVersion, isConsentCurrent, CONSENT_VERSION } from '../constants/legal.ts';

const same = { terms: '2026-09-24', privacy: '2026-09-24', communityRules: '2026-09-24', copyright: '2026-09-24' };

test('consent version is combined and fits the 64 character column', () => {
  assert.equal(buildConsentVersion(same), '2026-09-24|2026-09-24|2026-09-24|2026-09-24');
  assert.ok(CONSENT_VERSION.length <= 64);
  assert.notEqual(buildConsentVersion({ ...same, privacy: '2026-11-01' }), buildConsentVersion(same));
});

test('isConsentCurrent', () => {
  assert.equal(isConsentCurrent(buildConsentVersion(same), same), true);
  assert.equal(isConsentCurrent(null, same), false);
  assert.equal(isConsentCurrent('', same), false);
  // old plain terms record stays valid while nothing else moved
  assert.equal(isConsentCurrent('2026-09-24', same), true);
  // ...but is stale once any other document is bumped
  assert.equal(isConsentCurrent('2026-09-24', { ...same, privacy: '2026-11-01' }), false);
  assert.equal(isConsentCurrent('2026-09-24', { ...same, copyright: '2026-11-01' }), false);
  // a bump of any document invalidates the combined record
  assert.equal(isConsentCurrent(buildConsentVersion(same), { ...same, communityRules: '2026-12-01' }), false);
  // old terms record after a terms bump
  assert.equal(isConsentCurrent('2026-09-24', { ...same, terms: '2026-11-01' }), false);
});
