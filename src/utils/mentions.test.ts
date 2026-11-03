import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { extractMentionHandles, lookupMention } from './mentions.ts';

test('a mention followed by a full stop still resolves to the handle', () => {
  const handles = extractMentionHandles('Thanks @Ada.');
  assert.ok(handles.includes('ada'), String(handles));
});

test('usernames that really contain dots keep the literal handle too', () => {
  const handles = extractMentionHandles('cc @ada.k and @ada_k.');
  assert.ok(handles.includes('ada.k'));
  assert.ok(handles.includes('ada_k'));
});

test('e-mail addresses are not mentions', () => {
  assert.deepEqual(extractMentionHandles('write to ada@uni.edu.ng please'), []);
  assert.deepEqual(extractMentionHandles('a@@b.cc'), []);
});

test('mentions at the start, after punctuation and after unicode text are found once', () => {
  assert.deepEqual(extractMentionHandles('@bola, hi (@Tunde) \u{1F600}@sade @bola'), ['bola', 'tunde', 'sade']);
});

test('lookup falls back to the handle without trailing dots', () => {
  const m = new Map([['ada', { id: '1' }]]);
  assert.deepEqual(lookupMention(m, '@Ada.'), { id: '1' });
  assert.equal(lookupMention(m, '@ghost'), undefined);
});
