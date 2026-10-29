import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

// Web-only `Foo.web.tsx` shadow files (see src/components/lazyWeb.tsx and src/notifications/push.web.ts) replace
// `Foo.tsx` on web only, so TypeScript never checks that they export everything the real file does. A missing export
// would silently be `undefined` in the browser, so this test compares the value exports of every pair.

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.web\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function valueExports(source: string, typeNames: Set<string>): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
  for (const m of source.matchAll(/^export\s*\{([^}]*)\}(\s*from\b)?/gm)) {
    for (const part of m[1].split(',')) {
      const [local, exported = local] = part.trim().split(/\s+as\s+/).map((x) => x.trim());
      if (!exported || exported.startsWith('type ') || typeNames.has(exported)) continue;
      // `export { X }` of an imported binding is usually a type re-export; only count real values.
      const declaredHere = new RegExp(`^(?:export\\s+)?(?:async\\s+)?(?:function|const|let|class)\\s+${local}\\b`, 'm').test(source);
      if (m[2] || declaredHere) names.add(exported);
    }
  }
  return [...names].sort();
}

function importedTypes(source: string): Set<string> {
  const types = new Set<string>();
  for (const m of source.matchAll(/import\s+type\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) types.add(part.trim().split(/\s+as\s+/).pop()!.trim());
  }
  return types;
}

describe('web shadow files', () => {
  const shadows = walk(root).filter((file) => readFileSync(file, 'utf8').includes('Web only'));

  it('finds the shadow files', () => {
    assert.ok(shadows.length > 10);
  });

  for (const shadow of shadows) {
    const real = shadow.replace(/\.web(\.tsx?)$/, '$1');
    it(`${shadow.slice(root.length + 1)} exports what its native file exports`, () => {
      assert.ok(existsSync(real), `${real} is missing`);
      const realSource = readFileSync(real, 'utf8');
      const shadowSource = readFileSync(shadow, 'utf8');
      assert.deepEqual(
        valueExports(shadowSource, importedTypes(shadowSource)),
        valueExports(realSource, importedTypes(realSource)),
      );
    });
  }
});
