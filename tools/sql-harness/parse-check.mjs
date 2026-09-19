// Syntax-only verification with the real Postgres parser (libpg-query, PG17).
// Fallback when PGlite cannot be used. It proves the SQL PARSES; it does NOT prove behaviour.
//   node parse-check.mjs [file ...]      (default: every supabase_*.sql in the repo root)
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './lib.mjs';
import * as lpq from 'libpg-query';

await lpq.loadModule?.();
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(ROOT).filter((f) => /^supabase_.*\.sql$/.test(f));

let bad = 0;
for (const f of files) {
  try {
    const tree = await lpq.parse(readFileSync(resolve(ROOT, f), 'utf8'));
    console.log(`OK    ${f} (${tree.stmts.length} top-level statements)`);
  } catch (e) {
    bad++;
    console.log(`FAIL  ${f}: ${e.message}`);
  }
}
process.exit(bad ? 1 : 0);
