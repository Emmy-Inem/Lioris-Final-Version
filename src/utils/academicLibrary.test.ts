import test from 'node:test';
import assert from 'node:assert/strict';
// Node's type stripping needs the explicit .ts extension; tsc does not allow it without allowImportingTsExtensions.
// @ts-ignore TS5097
import { CURATED_TEXTBOOKS, getCuratedLibraryCatalog, searchAcademicLibrary } from '../api/academicLibrary.ts';
// @ts-ignore TS5097
import { isSafeHttpUrl } from './safeUrl.ts';

test('academic library and open-access catalog integrity', async (t) => {
  await t.test('curated textbook collection contains at least 20 comprehensive open-access textbooks', () => {
    const catalog = getCuratedLibraryCatalog();
    assert.ok(catalog.length >= 20, `Expected at least 20 curated books, got ${catalog.length}`);
    assert.equal(catalog.length, CURATED_TEXTBOOKS.length);
  });

  await t.test('every curated textbook is 100% free with verified open-access URLs', () => {
    const idSet = new Set<string>();

    for (const book of CURATED_TEXTBOOKS) {
      assert.ok(book.id, 'Every book must have an id');
      assert.ok(!idSet.has(book.id), `Duplicate book id found: ${book.id}`);
      idSet.add(book.id);

      assert.ok(book.title && book.title.trim().length > 0, `Book ${book.id} missing title`);
      assert.ok(Array.isArray(book.authors) && book.authors.length > 0, `Book ${book.id} missing authors`);
      assert.ok(Array.isArray(book.subjects) && book.subjects.length > 0, `Book ${book.id} missing subjects`);

      // Must be marked free and fulltext accessible
      assert.equal(book.isFree, true, `Book ${book.id} must be marked free`);
      assert.equal(book.hasFulltext, true, `Book ${book.id} must have fulltext`);

      // Must have safe, valid open-access URL
      assert.ok(book.openAccessUrl, `Book ${book.id} missing openAccessUrl`);
      assert.ok(isSafeHttpUrl(book.openAccessUrl), `Book ${book.id} openAccessUrl is invalid: ${book.openAccessUrl}`);
      assert.ok(
        book.openAccessUrl.startsWith('https://') || book.openAccessUrl.startsWith('http://'),
        `Book ${book.id} openAccessUrl must be http(s)`
      );

      // If PDF url provided, verify safety
      if (book.pdfUrl) {
        assert.ok(isSafeHttpUrl(book.pdfUrl), `Book ${book.id} pdfUrl is invalid: ${book.pdfUrl}`);
      }

      // Ensure open-access source is valid
      assert.ok(
        ['OpenStax', 'OpenAlex', 'arXiv', 'Curated OER'].includes(book.source),
        `Book ${book.id} has invalid source: ${book.source}`
      );
    }
  });

  await t.test('covers all major faculties and disciplines', () => {
    const allSubjects = CURATED_TEXTBOOKS.flatMap((b) => b.subjects.map((s) => s.toLowerCase()));
    
    assert.ok(allSubjects.some((s) => s.includes('computer') || s.includes('operating systems')), 'Must include computer science');
    assert.ok(allSubjects.some((s) => s.includes('calculus') || s.includes('statistics')), 'Must include mathematics');
    assert.ok(allSubjects.some((s) => s.includes('physics') || s.includes('chemistry') || s.includes('biology')), 'Must include natural sciences');
    assert.ok(allSubjects.some((s) => s.includes('anatomy') || s.includes('medicine') || s.includes('nursing')), 'Must include medicine/health');
    assert.ok(allSubjects.some((s) => s.includes('electrical') || s.includes('mechanical') || s.includes('engineering')), 'Must include engineering');
    assert.ok(allSubjects.some((s) => s.includes('economics') || s.includes('accounting') || s.includes('business')), 'Must include economics/business');
    assert.ok(allSubjects.some((s) => s.includes('law') || s.includes('sociology') || s.includes('psychology')), 'Must include law/social sciences');
  });

  await t.test('searchAcademicLibrary local filtering works accurately', async () => {
    // Empty search should return curated catalog
    const all = await searchAcademicLibrary('');
    assert.equal(all.length, CURATED_TEXTBOOKS.length);

    // Searching 'calculus' should find calculus books
    const calculusBooks = await searchAcademicLibrary('calculus');
    assert.ok(calculusBooks.length > 0);
    assert.ok(calculusBooks.some((b) => b.title.toLowerCase().includes('calculus')));

    // Searching 'operating systems' should find OSTEP
    const osBooks = await searchAcademicLibrary('operating systems');
    assert.ok(osBooks.length > 0);
    assert.ok(osBooks.some((b) => b.title.includes('Operating Systems')));

    // Searching author 'Strang' should match Gilbert Strang calculus books
    const strangBooks = await searchAcademicLibrary('Strang');
    assert.ok(strangBooks.length > 0);
    assert.ok(strangBooks.some((b) => b.authors.some((a) => a.includes('Strang'))));
  });
});
