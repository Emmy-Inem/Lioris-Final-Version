// Proves the hand-run script (supabase/manual/02_apply_all.sql) works as pasted into the SQL editor:
// builds a database with everything BEFORE the first generated part, executes the file as ONE multi-statement
// string (like the dashboard does), runs it a second time (idempotent), then checks the progress log and the
// anonymous-callable function list. Also proves the chain guard: with a part removed, later parts refuse to run.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { newDb, bootstrap, applyFile, MIGRATIONS, ROOT } from './lib.mjs';

const FIRST = '20261028000000';
const EXTRAS = [
  'supabase_campus_access_2026.sql',
  'supabase_account_email_change_2026.sql',
  'supabase_username_uniqueness_and_login_2026.sql',
  'supabase_portal_links_2026.sql',
  'supabase_fix_campus_selection_and_ui_leak_2026.sql',
];
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`PASS  ${name}`); }
  catch (e) { results.push(false); console.log(`FAIL  ${name}\n      -> ${String(e.message).slice(0, 300)}`); }
};
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

async function freshDb() {
  const db = await newDb();
  await bootstrap(db);
  for (const m of MIGRATIONS) await applyFile(db, m.file, m.strict, () => {});
  for (const f of EXTRAS) await applyFile(db, f, false, () => {});
  const files = readdirSync(resolve(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) if (f.slice(0, 14) < FIRST) await applyFile(db, `supabase/migrations/${f}`, false, () => {});
  return db;
}
const script = readFileSync(resolve(ROOT, 'supabase/manual/02_apply_all.sql'), 'utf8');

await check('02_apply_all.sql applies in one paste, records every part, and a second run changes nothing', async () => {
  const db = await freshDb();
  await db.exec(script);
  const first = (await db.query('SELECT count(*)::int n FROM public._manual_migration_log')).rows[0].n;
  const expected = readdirSync(resolve(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql') && f.slice(0, 14) >= FIRST).length;
  assert(first === expected, `logged ${first} of ${expected} parts`);
  await db.exec(script);
  const second = (await db.query('SELECT count(*)::int n FROM public._manual_migration_log')).rows[0].n;
  assert(second === expected, `second run logged ${second}`);
  const anon = (await db.query(`SELECT COALESCE(string_agg(p.proname, ',' ORDER BY p.proname), '') s FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public' WHERE p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')`)).rows[0].s;
  assert(anon === 'check_username_available,record_public_page_view', `anon-callable definer functions: ${anon}`);
});

await check('chain guard: when a part is missing, the parts after it refuse to run', async () => {
  const db = await freshDb();
  // Break the SECOND part so it fails, keep everything else.
  const broken = script.replace('-- ########## 20261029000000_admin_scope_completion.sql ##########', '-- ########## 20261029000000_admin_scope_completion.sql ##########\nSELECT 1/0;');
  try { await db.exec(broken); } catch { /* the whole string aborts in PGlite; the dashboard would continue, so run each part separately below */ }
  // Simulate the dashboard continuing after an error: run the remaining parts one by one.
  const parts = broken.split(/\n-- ########## /).slice(1);
  const db2 = await freshDb();
  const header = broken.split('\n-- ########## ')[0];
  await db2.exec(header);
  for (const part of parts) {
    try { await db2.exec('-- ########## ' + part); } catch { try { await db2.exec('ROLLBACK'); } catch { /* none open */ } }
  }
  const rows = (await db2.query('SELECT version FROM public._manual_migration_log ORDER BY version')).rows.map((r) => r.version);
  assert(rows.includes('20261028000000'), 'first part missing');
  assert(!rows.includes('20261029000000'), 'the broken part must not be recorded');
  assert(rows.length === 1, `later parts ran although an earlier one failed: ${rows.join(',')}`);
});

await check('supabase/manual/parts: pasting the parts one at a time, in order, gives the same result as the bundle; out of order is refused', async () => {
  const dir = resolve(ROOT, 'supabase/manual/parts');
  const parts = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const expected = readdirSync(resolve(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql') && f.slice(0, 14) >= FIRST).length;
  assert(parts.length === expected, `${parts.length} part files for ${expected} migrations`);
  const db = await freshDb();
  // A later part pasted first must refuse to run.
  let refused = false;
  try { await db.exec(readFileSync(resolve(dir, parts[2]), 'utf8')); } catch (e) { refused = /Stopped: migration/.test(String(e.message)); try { await db.exec('ROLLBACK'); } catch { /* none */ } }
  assert(refused, 'a later part ran although the earlier ones were not applied');
  for (const f of parts) await db.exec(readFileSync(resolve(dir, f), 'utf8'));
  const n = (await db.query('SELECT count(*)::int n FROM public._manual_migration_log')).rows[0].n;
  assert(n === expected, `logged ${n} of ${expected}`);
  // each part is safe to paste again
  for (const f of parts) await db.exec(readFileSync(resolve(dir, f), 'utf8'));
  assert((await db.query('SELECT count(*)::int n FROM public._manual_migration_log')).rows[0].n === expected, 'second pass changed the log');
});

const ok = results.filter(Boolean).length;
console.log(`${ok}/${results.length} checks passed`);
process.exit(ok === results.length ? 0 : 1);
