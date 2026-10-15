import test from 'node:test';
import assert from 'node:assert/strict';
// Node's type stripping needs the explicit .ts extension; tsc does not allow it without allowImportingTsExtensions.
// @ts-ignore TS5097
import { safeFileName, mimeTypeForFileName, resourceFileTypeFromMime, attachmentFileName } from './fileNames.ts';

test('safeFileName keeps a readable title and the real extension', () => {
  assert.equal(safeFileName('Intro to CSC 301 (notes)', 'pdf'), 'Intro_to_CSC_301_notes.pdf');
  assert.equal(safeFileName('Algebra.pdf', '.PDF'), 'Algebra.pdf');
  assert.equal(safeFileName('  ../../etc/passwd  ', 'txt'), 'etc_passwd.txt');
});

test('safeFileName never returns an empty or path-like name', () => {
  assert.equal(safeFileName('', 'pdf'), 'lioris-file.pdf');
  assert.equal(safeFileName('???', ''), 'lioris-file');
  assert.ok(!safeFileName('a/b\\c', 'pdf').includes('/'));
  assert.ok(safeFileName('x'.repeat(300), 'pdf').length <= 90);
});

test('mimeTypeForFileName maps the supported extensions', () => {
  assert.equal(mimeTypeForFileName('a.pdf'), 'application/pdf');
  assert.equal(mimeTypeForFileName('slides.PPTX'), 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  assert.equal(mimeTypeForFileName('photo.jpeg'), 'image/jpeg');
  assert.equal(mimeTypeForFileName('mystery.bin'), undefined);
});

test('resourceFileTypeFromMime labels files honestly (it used to say PDF for everything except zip)', () => {
  assert.equal(resourceFileTypeFromMime('application/pdf'), 'PDF');
  assert.equal(resourceFileTypeFromMime('application/zip'), 'ZIP');
  assert.equal(resourceFileTypeFromMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'DOC');
  assert.equal(resourceFileTypeFromMime('application/vnd.ms-powerpoint'), 'PPT');
  assert.equal(resourceFileTypeFromMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'XLS');
  assert.equal(resourceFileTypeFromMime('image/png'), 'IMG');
  assert.equal(resourceFileTypeFromMime('text/plain'), 'TXT');
  // falls back to the file extension when the mime type is missing
  assert.equal(resourceFileTypeFromMime(null, 'https://x.supabase.co/storage/v1/object/public/resources/u/notes.docx'), 'DOC');
  assert.equal(resourceFileTypeFromMime(undefined, undefined), 'PDF');
});

test('attachmentFileName keeps the stored file name and drops folders and signing tokens', () => {
  assert.equal(attachmentFileName('uid-1/resources_Week3_notes_1730.pdf?token=abc'), 'resources_Week3_notes_1730.pdf');
  assert.equal(attachmentFileName('https://x.supabase.co/storage/v1/object/sign/resources/u/My%20Notes.docx?token=1'), 'My Notes.docx');
  assert.equal(attachmentFileName('../../.hidden'), 'hidden');
  assert.equal(attachmentFileName('', 'file'), 'file');
});
