import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { base64UrlToBuffer, bufferToBase64Url, classifyPasswordCheckError, describeBiometricMethod } from './webauthnEncoding.ts';

test('base64url round-trips ids that contain - and _ (the ones atob used to reject)', () => {
  // 0xfb 0xff 0xfe encodes to "-__-" in base64url and "+//+" in standard base64.
  const bytes = new Uint8Array([0xfb, 0xff, 0xfe, 0x01, 0x02, 0x03, 0x04]);
  const encoded = bufferToBase64Url(bytes);
  assert.ok(/[-_]/.test(encoded), 'fixture should exercise the URL-safe alphabet');
  assert.ok(!/[+/=]/.test(encoded), 'no standard-base64 characters or padding');
  assert.deepEqual([...new Uint8Array(base64UrlToBuffer(encoded))], [...bytes]);
});

test('base64url decoding tolerates missing padding for every length', () => {
  for (let len = 1; len <= 40; len++) {
    const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) & 0xff);
    assert.deepEqual([...new Uint8Array(base64UrlToBuffer(bufferToBase64Url(bytes)))], [...bytes]);
  }
});

test('a captcha rejection is never reported as a wrong password', () => {
  assert.equal(
    classifyPasswordCheckError({ code: 'captcha_failed', message: 'captcha protection: request disallowed (no captcha_token found)' }),
    'captcha',
  );
  assert.equal(classifyPasswordCheckError({ message: 'captcha verification process failed' }), 'captcha');
});

test('wrong password, rate limit, network and unknown failures are told apart', () => {
  assert.equal(classifyPasswordCheckError({ code: 'invalid_credentials', message: 'Invalid login credentials' }), 'invalid_credentials');
  assert.equal(classifyPasswordCheckError({ message: 'Invalid login credentials' }), 'invalid_credentials');
  assert.equal(classifyPasswordCheckError({ code: 'over_request_rate_limit', message: 'Request rate limit reached' }), 'rate_limited');
  assert.equal(classifyPasswordCheckError({ status: 429, message: 'x' }), 'rate_limited');
  assert.equal(classifyPasswordCheckError({ message: 'Failed to fetch' }), 'network');
  assert.equal(classifyPasswordCheckError({ message: 'something else' }), 'unknown');
  assert.equal(classifyPasswordCheckError(null), 'unknown');
});

test('the unlock method is named for the device, not always Face ID', () => {
  assert.equal(describeBiometricMethod('Mozilla/5.0 (Linux; Android 14; SM-S911B) Chrome/124'), 'fingerprint or screen lock');
  assert.equal(describeBiometricMethod('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'Face ID or Touch ID');
  assert.equal(describeBiometricMethod('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'Windows Hello');
  assert.equal(describeBiometricMethod('curl/8'), 'device biometrics');
});
