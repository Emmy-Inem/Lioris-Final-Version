// Shared helpers for the PGlite SQL harness. No network, no real database.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..', '..');

/**
 * Order in which the repo's SQL files are applied. Legacy fix files may fail
 * partially (they are re-applied statement by statement and failures reported);
 * the two 2026 hardening files must apply cleanly (strict).
 */
export const MIGRATIONS = [
  { file: 'supabase_schema.sql', strict: false },
  // supabase_migration_align.sql is deliberately NOT applied: it repairs a drifted production DB
  // (drops 4 stale empty tables BEFORE supabase_schema.sql). On a fresh DB it would drop the
  // tables the schema just created. Production had the drift; the harness starts clean.
  { file: 'supabase_fix_profiles_rls.sql', strict: false },
  { file: 'supabase_fix_chat_rls.sql', strict: false },
  { file: 'supabase_fix_audit_2026.sql', strict: false },
  { file: 'supabase_fix_events_2026.sql', strict: false },
  { file: 'supabase_fix_events_admin_policy.sql', strict: false },
  { file: 'supabase_fix_admin_support_2026.sql', strict: false },
  { file: 'supabase_fix_chat_message_read_status_2026.sql', strict: false },
  { file: 'supabase_add_post_audience.sql', strict: false },
  { file: 'supabase_add_onboarding_complete_2026.sql', strict: false },
  { file: 'supabase_fix_verification_self_submit_2026.sql', strict: false },
  { file: 'supabase_fix_signup_search_path_2026.sql', strict: false },
  { file: 'supabase_backfill_profiles.sql', strict: false },
  { file: 'supabase_fix_rls_db_entity_audit_2026.sql', strict: false },
  { file: 'supabase_email_confirmation_2026.sql', strict: false },
  { file: 'supabase_security_hardening_2026.sql', strict: true },
  { file: 'supabase_launch_hardening_2026.sql', strict: true },
];

export async function newDb() {
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await db.waitReady;
  return db;
}

export function readRepoFile(name) {
  const p = resolve(ROOT, name);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

/**
 * Split a SQL script into statements with the real Postgres parser when
 * available (libpg-query); falls back to a naive dollar-quote aware splitter.
 */
export async function splitStatements(sql) {
  try {
    const lpq = await import('libpg-query');
    if (lpq.loadModule) await lpq.loadModule();
    const parse = lpq.parseSync ?? lpq.parse;
    const tree = await parse(sql);
    const bytes = Buffer.from(sql, 'utf8');
    const out = [];
    for (const s of tree.stmts) {
      const start = s.stmt_location ?? 0;
      const len = s.stmt_len ?? bytes.length - start;
      out.push(bytes.subarray(start, start + len).toString('utf8').trim());
    }
    return out.filter(Boolean);
  } catch {
    return naiveSplit(sql);
  }
}

export function naiveSplit(sql) {
  const out = []; let cur = ''; let i = 0; let tag = null; let inLine = false; let inBlock = false; let inStr = false;
  while (i < sql.length) {
    const c = sql[i], n = sql[i + 1];
    if (inLine) { cur += c; if (c === '\n') inLine = false; i++; continue; }
    if (inBlock) { cur += c; if (c === '*' && n === '/') { cur += n; i += 2; inBlock = false; continue; } i++; continue; }
    if (tag) { if (sql.startsWith(tag, i)) { cur += tag; i += tag.length; tag = null; continue; } cur += c; i++; continue; }
    if (inStr) { cur += c; if (c === "'") { if (n === "'") { cur += n; i += 2; continue; } inStr = false; } i++; continue; }
    if (c === '-' && n === '-') { inLine = true; cur += c; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; cur += c; i++; continue; }
    if (c === "'") { inStr = true; cur += c; i++; continue; }
    if (c === '$') { const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i)); if (m) { tag = m[0]; cur += tag; i += tag.length; continue; } }
    if (c === ';') { cur += c; out.push(cur.trim()); cur = ''; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((s) => s && !/^(--[^\n]*\n?)*$/.test(s));
}

/** Apply a file in one go; if strict=false, fall back to statement-by-statement and report failures. */
export async function applyFile(db, name, strict, log = console.log) {
  const sql = readRepoFile(name);
  if (sql == null) { log(`  [skip] ${name} (not found)`); return { name, skipped: true, failures: [] }; }
  try {
    await db.exec(sql);
    log(`  [ok]   ${name}`);
    return { name, failures: [] };
  } catch (e) {
    try { await db.exec('ROLLBACK'); } catch { /* not in a transaction */ }
    if (strict) { log(`  [FAIL] ${name}: ${e.message}`); throw e; }
    const failures = [];
    const stmts = await splitStatements(sql);
    let ok = 0;
    for (const st of stmts) {
      if (/^(BEGIN|COMMIT|START TRANSACTION)\b/i.test(st)) continue;
      try { await db.exec(st); ok++; } catch (err) {
        try { await db.exec('ROLLBACK'); } catch { /* ignore */ }
        failures.push({ stmt: st.replace(/\s+/g, ' ').slice(0, 110), error: err.message });
      }
    }
    log(`  [part] ${name}: ${ok}/${stmts.length} statements ok, ${failures.length} failed`);
    for (const f of failures) log(`         - ${f.error} :: ${f.stmt}`);
    return { name, failures };
  }
}

export async function bootstrap(db) {
  await db.exec(readFileSync(resolve(HERE, 'bootstrap.sql'), 'utf8'));
}

export async function loadAll(db, { upTo = null, log = console.log } = {}) {
  await bootstrap(db);
  const report = [];
  for (const m of MIGRATIONS) {
    if (upTo && m.file === upTo) break;
    report.push(await applyFile(db, m.file, m.strict, log));
  }
  return report;
}
