import test from 'node:test';
import assert from 'node:assert/strict';
// Node's type stripping needs the explicit .ts extension; tsc does not allow it without allowImportingTsExtensions.
// @ts-ignore TS5097
import { VERIFIED_PUBLIC_RESOURCES } from '../data/verifiedPublicResources.ts';
// @ts-ignore TS5097
import { isSafeHttpUrl } from './safeUrl.ts';

test('verified public resources catalog integrity', async (t) => {
  await t.test('contains exactly 50 curated items', () => {
    assert.equal(VERIFIED_PUBLIC_RESOURCES.length, 50);
  });

  await t.test('every item has a valid, safe http(s) URL ending in .pdf', () => {
    for (const r of VERIFIED_PUBLIC_RESOURCES) {
      assert.ok(r.fileUrl, `Resource ${r.id} must have a fileUrl`);
      assert.ok(isSafeHttpUrl(r.fileUrl), `Resource ${r.id} fileUrl must be safe: ${r.fileUrl}`);
      assert.ok(r.fileUrl.toLowerCase().includes('.pdf'), `Resource ${r.id} must be a PDF: ${r.fileUrl}`);
    }
  });

  await t.test('every item has non-empty metadata fields', () => {
    const idSet = new Set<string>();
    for (const r of VERIFIED_PUBLIC_RESOURCES) {
      assert.ok(r.id, 'id required');
      assert.ok(!idSet.has(r.id), `duplicate id: ${r.id}`);
      idSet.add(r.id);

      assert.ok(r.title && r.title.trim().length > 0, `${r.id} missing title`);
      assert.ok(r.courseCode && r.courseCode.trim().length > 0, `${r.id} missing courseCode`);
      assert.ok(r.department && r.department.trim().length > 0, `${r.id} missing department`);
      assert.ok(r.category === 'Notes' || r.category === 'Past Questions', `${r.id} invalid category: ${r.category}`);
      assert.ok(r.fileSize && r.fileSize.trim().length > 0, `${r.id} missing fileSize`);
      assert.ok(r.campusCode === 'FUNAAB' || r.campusCode === 'GLOBAL', `${r.id} invalid campusCode: ${r.campusCode}`);
      assert.equal(r.fileType, 'PDF');
      assert.equal(r.approvalStatus, 'approved');
      assert.equal(r.authorRole, 'staff');
    }
  });

  await t.test('FUNAAB resources and GLOBAL resources are both properly partitioned', () => {
    const funaab = VERIFIED_PUBLIC_RESOURCES.filter(r => r.campusCode === 'FUNAAB');
    const globalResources = VERIFIED_PUBLIC_RESOURCES.filter(r => r.campusCode === 'GLOBAL');
    assert.equal(funaab.length, 25);
    assert.equal(globalResources.length, 25);
  });
});
