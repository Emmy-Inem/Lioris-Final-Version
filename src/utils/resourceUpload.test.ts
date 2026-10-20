import test from 'node:test';
import assert from 'node:assert/strict';
// Node's type stripping needs the explicit .ts extension; tsc does not allow it without allowImportingTsExtensions.
// @ts-ignore TS5097
import { resolveResourceUpload } from './resourceUpload.ts';

test('resolveResourceUpload labels files by extension', () => {
  assert.deepEqual(resolveResourceUpload('Past Paper.PDF', 'application/pdf'), { fileType: 'PDF', mimeType: 'application/pdf' });
  assert.equal(resolveResourceUpload('notes.docx')?.fileType, 'DOC');
  assert.equal(resolveResourceUpload('slides.pptx')?.fileType, 'PPT');
  assert.equal(resolveResourceUpload('photo.jpeg')?.fileType, 'IMG');
});

test('resolveResourceUpload replaces a generic or mismatched reported type', () => {
  assert.equal(resolveResourceUpload('a.pdf', 'application/octet-stream')?.mimeType, 'application/pdf');
  assert.equal(resolveResourceUpload('a.pdf', 'image/png')?.mimeType, 'application/pdf');
  assert.equal(resolveResourceUpload('a.xlsx', '')?.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
});

test('resolveResourceUpload refuses unsupported files', () => {
  assert.equal(resolveResourceUpload('book.epub', 'application/epub+zip'), null);
  assert.equal(resolveResourceUpload('noextension'), null);
  assert.equal(resolveResourceUpload('image.webp', 'image/webp'), null);
});
