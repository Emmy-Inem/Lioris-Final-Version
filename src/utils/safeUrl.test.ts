import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeHttpUrl, isSafeContactLink, isSafeHttpUrl, sanitizeHttpUrl } from './safeUrl';

test('accepts plain http and https URLs', () => {
  assert.equal(isSafeHttpUrl('https://example.com'), true);
  assert.equal(isSafeHttpUrl('http://example.com/a?b=c#d'), true);
  assert.equal(isSafeHttpUrl('  https://example.com/path  '), true);
});

test('rejects dangerous and non-http schemes', () => {
  for (const u of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com',
    'blob:https://example.com/x',
    'mailto:a@b.com',
    'tel:+123456',
  ]) {
    assert.equal(isSafeHttpUrl(u), false, u);
  }
});

test('rejects credentials, malformed and non-string input', () => {
  assert.equal(isSafeHttpUrl('https://user:pass@example.com'), false);
  assert.equal(isSafeHttpUrl('https://user@example.com'), false);
  assert.equal(isSafeHttpUrl('not a url'), false);
  assert.equal(isSafeHttpUrl('//example.com'), false);
  assert.equal(isSafeHttpUrl(''), false);
  assert.equal(isSafeHttpUrl(null), false);
  assert.equal(isSafeHttpUrl(undefined), false);
  assert.equal(isSafeHttpUrl(42), false);
  assert.equal(isSafeHttpUrl({}), false);
});

test('assertSafeHttpUrl throws a friendly error and returns the trimmed URL', () => {
  assert.throws(() => assertSafeHttpUrl('javascript:alert(1)', 'Apply link'), /Apply link must be a valid/);
  assert.equal(assertSafeHttpUrl(' https://example.com ', 'Link'), 'https://example.com');
});

test('sanitizeHttpUrl maps bad values to undefined', () => {
  assert.equal(sanitizeHttpUrl('javascript:alert(1)'), undefined);
  assert.equal(sanitizeHttpUrl('https://example.com'), 'https://example.com');
});

test('isSafeContactLink only allows mailto and tel', () => {
  assert.equal(isSafeContactLink('mailto:a@b.com'), true);
  assert.equal(isSafeContactLink('tel:+2349076664049'), true);
  assert.equal(isSafeContactLink('javascript:alert(1)'), false);
  assert.equal(isSafeContactLink('https://example.com'), false);
});
