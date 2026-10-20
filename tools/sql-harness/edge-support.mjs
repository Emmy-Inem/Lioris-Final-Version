// Behaviour tests for supabase/migrations/20261108000000_edge_support.sql, executed against an
// in-memory Postgres (PGlite). Nothing here touches a real database.
//
//   cd tools/sql-harness && npm install && node edge-support.mjs
//
// Load order: the harness's legacy root files (which create api_rate_limits, client_errors and
// consume_rate_limit), then the migration under test, applied STRICTLY (one transaction, no failed
// statement) and a second time to prove idempotency. The Supabase-managed auth.sessions /
// auth.refresh_tokens tables do not exist in the harness bootstrap, so they are stubbed here with the
// shape GoTrue uses (refresh_tokens.user_id is a varchar, sessions.user_id a uuid).
import { newDb, bootstrap, applyFile, MIGRATIONS, readRepoFile } from './lib.mjs';

const MIGRATION = 'supabase/migrations/20261108000000_edge_support.sql';

const db = await newDb();
await bootstrap(db);
for (const m of MIGRATIONS) await applyFile(db, m.file, m.strict, () => {});

// Stub the auth tables BEFORE the migration (as in production) ...
await db.exec(`
  CREATE TABLE IF NOT EXISTS auth.sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
    id bigserial PRIMARY KEY,
    user_id varchar(255),
    token text,
    session_id uuid REFERENCES auth.sessions(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
  );
`);
let applied = null;
try { applied = await applyFile(db, MIGRATION, true, () => {}); } catch (e) { console.log(`FATAL: edge_support did not apply: ${e.message}`); process.exit(2); }

// --------------------------------------------------------------------------- tiny framework
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`PASS  ${name}`); }
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log(`FAIL  ${name}\n      -> ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || 'not equal'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); }
function denied(r, re, msg) {
  assert(!r.ok, `${msg || 'statement'} should have been refused but succeeded`);
  if (re) assert(re.test(r.err.message), `${msg || 'statement'} refused with unexpected error: ${r.err.message}`);
}
async function as(who, fn) {
  await db.exec('BEGIN');
  try {
    if (who === 'postgres') { /* superuser */ }
    else if (who === 'anon') await db.exec(`SET LOCAL ROLE anon; SELECT set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    else if (who === 'service_role') await db.exec(`SET LOCAL ROLE service_role; SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    else {
      const claims = { sub: who, role: 'authenticated' };
      await db.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '${JSON.stringify(claims)}', true); SELECT set_config('request.jwt.claim.sub', '${who}', true)`);
    }
    const c = {
      q: (sql, p) => db.query(sql, p),
      async t(sql, p) {
        await db.exec('SAVEPOINT chk');
        try { const r = await db.query(sql, p); await db.exec('RELEASE chk'); return { ok: true, rows: r.rows }; }
        catch (e) { await db.exec('ROLLBACK TO chk'); await db.exec('RELEASE chk'); return { ok: false, err: e }; }
      },
    };
    return await fn(c);
  } finally { try { await db.exec('ROLLBACK'); } catch { /* closed */ } }
}

const U1 = id(101); // the user whose sessions are revoked
const U2 = id(102); // bystander
const S = { a: id(201), b: id(202), c: id(203), other: id(204) };
async function seedSessions(c) {
  await c.q(`INSERT INTO auth.sessions (id, user_id, created_at) VALUES
    ('${S.a}','${U1}', now() - interval '3 hours'),
    ('${S.b}','${U1}', now() - interval '10 minutes'),
    ('${S.c}','${U1}', now() - interval '1 minute'),
    ('${S.other}','${U2}', now())`);
  await c.q(`INSERT INTO auth.refresh_tokens (user_id, token, session_id) VALUES
    ('${U1}','t1','${S.a}'),('${U1}','t2','${S.b}'),('${U1}','t3','${S.c}'),('${U2}','t4','${S.other}')`);
}

// --------------------------------------------------------------------------- 1. application
await check('edge_support applies cleanly (strict) and is idempotent', async () => {
  assert(applied && !applied.failures?.length, 'did not apply');
  await db.exec(readRepoFile(MIGRATION));
});

// --------------------------------------------------------------------------- 2. admin_revoke_user_sessions
await check('admin_revoke_user_sessions deletes every session and refresh token of the user only', async () => {
  await as('postgres', async (c) => {
    await seedSessions(c);
    await c.q(`SET LOCAL ROLE service_role`);
    const r = (await c.q(`SELECT public.admin_revoke_user_sessions('${U1}') v`)).rows[0].v;
    eq([r.sessions, r.refresh_tokens], [3, 3], 'counts');
    await c.q(`RESET ROLE`);
    eq(Number((await c.q(`SELECT count(*) n FROM auth.sessions WHERE user_id='${U1}'`)).rows[0].n), 0, 'sessions left');
    eq(Number((await c.q(`SELECT count(*) n FROM auth.refresh_tokens WHERE user_id='${U1}'`)).rows[0].n), 0, 'tokens left');
    eq(Number((await c.q(`SELECT count(*) n FROM auth.sessions WHERE user_id='${U2}'`)).rows[0].n), 1, 'bystander session removed');
    eq(Number((await c.q(`SELECT count(*) n FROM auth.refresh_tokens WHERE user_id='${U2}'`)).rows[0].n), 1, 'bystander token removed');
  });
});
await check('admin_revoke_user_sessions(p_since) only revokes sessions created since then', async () => {
  await as('postgres', async (c) => {
    await seedSessions(c);
    await c.q(`SET LOCAL ROLE service_role`);
    const r = (await c.q(`SELECT public.admin_revoke_user_sessions('${U1}', now() - interval '1 hour') v`)).rows[0].v;
    eq([r.sessions, r.refresh_tokens], [2, 2], 'counts');
    await c.q(`RESET ROLE`);
    const left = (await c.q(`SELECT id FROM auth.sessions WHERE user_id='${U1}'`)).rows.map((x) => x.id);
    eq(left, [S.a], 'older session must survive');
    eq(Number((await c.q(`SELECT count(*) n FROM auth.refresh_tokens WHERE user_id='${U1}'`)).rows[0].n), 1, 'older token must survive');
  });
});
await check('admin_revoke_user_sessions with nothing to revoke returns zero counts', async () => {
  await as('service_role', async (c) => {
    const r = (await c.q(`SELECT public.admin_revoke_user_sessions('${id(999)}') v`)).rows[0].v;
    eq([r.sessions, r.refresh_tokens], [0, 0]);
  });
});
await check('admin_revoke_user_sessions is service_role only', async () => {
  await as('anon', async (c) => denied(await c.t(`SELECT public.admin_revoke_user_sessions('${U1}')`), /permission denied/i, 'anon'));
  await as(U2, async (c) => denied(await c.t(`SELECT public.admin_revoke_user_sessions('${U1}')`), /permission denied/i, 'authenticated'));
});
await check('admin_revoke_user_sessions is a no-op (not an error) when the auth tables are missing', async () => {
  await as('postgres', async (c) => {
    await c.q(`ALTER TABLE auth.refresh_tokens RENAME TO refresh_tokens_x`);
    await c.q(`ALTER TABLE auth.sessions RENAME TO sessions_x`);
    const r = (await c.q(`SELECT public.admin_revoke_user_sessions('${U1}') v`)).rows[0].v;
    eq([r.sessions, r.refresh_tokens], [0, 0]);
  });
});

// --------------------------------------------------------------------------- 3. consume_rate_limit_ex
await check('consume_rate_limit_ex returns allowed + running count and agrees with consume_rate_limit', async () => {
  await as('service_role', async (c) => {
    const v = async () => (await c.q(`SELECT public.consume_rate_limit_ex('ex:1', 2, 60) v`)).rows[0].v;
    const pick = (r) => [r.allowed, r.count];
    eq(pick(await v()), [true, 1]);
    eq(pick(await v()), [true, 2]);
    eq(pick(await v()), [false, 3], 'first denial has count = limit + 1');
    eq(pick(await v()), [false, 4]);
    eq((await c.q(`SELECT public.consume_rate_limit_ex('ex:2', 2, 60) v`)).rows[0].v.count, 1, 'keys must be independent');
    // the legacy function still works on the same table
    eq((await c.q(`SELECT public.consume_rate_limit('ex:3', 1, 60) ok`)).rows[0].ok, true);
    eq((await c.q(`SELECT public.consume_rate_limit('ex:3', 1, 60) ok`)).rows[0].ok, false);
  });
});
await check('consume_rate_limit_ex resets after the window and rejects bad input', async () => {
  await as('postgres', async (c) => {
    await c.q(`SET LOCAL ROLE service_role`);
    await c.q(`SELECT public.consume_rate_limit_ex('ex:w', 1, 60)`);
    await c.q(`RESET ROLE`);
    await c.q(`UPDATE public.api_rate_limits SET window_start = now() - interval '2 minutes' WHERE key='ex:w'`);
    await c.q(`SET LOCAL ROLE service_role`);
    const nw = (await c.q(`SELECT public.consume_rate_limit_ex('ex:w', 1, 60) v`)).rows[0].v;
    eq([nw.allowed, nw.count], [true, 1], 'new window');
    denied(await c.t(`SELECT public.consume_rate_limit_ex('', 1, 60)`), /invalid rate limit key/i, 'empty key');
    denied(await c.t(`SELECT public.consume_rate_limit_ex('k', 1, 0)`), /positive/i, 'zero window');
    eq((await c.q(`SELECT public.consume_rate_limit_ex('k', 0, 60) v`)).rows[0].v.allowed, false, 'zero limit');
  });
});
await check('consume_rate_limit_ex is service_role only', async () => {
  await as('anon', async (c) => denied(await c.t(`SELECT public.consume_rate_limit_ex('ex:a', 2, 60)`), /permission denied/i, 'anon'));
  await as(U2, async (c) => denied(await c.t(`SELECT public.consume_rate_limit_ex('ex:a', 2, 60)`), /permission denied/i, 'authenticated'));
});

// --------------------------------------------------------------------------- 4. bump_client_error
await check('bump_client_error increments the newest in-window row atomically and reports a miss', async () => {
  await as('postgres', async (c) => {
    await c.q(`INSERT INTO public.client_errors (fingerprint, message, occurrences, last_seen_at) VALUES
      ('fp1','old', 1, now() - interval '5 hours'), ('fp1','new', 1, now() - interval '5 minutes')`);
    await c.q(`SET LOCAL ROLE service_role`);
    eq((await c.q(`SELECT public.bump_client_error('fp1', 3600) ok`)).rows[0].ok, true);
    eq((await c.q(`SELECT public.bump_client_error('fp1', 3600) ok`)).rows[0].ok, true);
    eq((await c.q(`SELECT public.bump_client_error('nope', 3600) ok`)).rows[0].ok, false, 'unknown fingerprint');
    await c.q(`RESET ROLE`);
    const rows = (await c.q(`SELECT message, occurrences FROM public.client_errors WHERE fingerprint='fp1' ORDER BY message`)).rows;
    eq(rows, [{ message: 'new', occurrences: 3 }, { message: 'old', occurrences: 1 }], 'only the in-window row is bumped');
  });
});
await check('bump_client_error is service_role only', async () => {
  await as('anon', async (c) => denied(await c.t(`SELECT public.bump_client_error('fp1')`), /permission denied/i, 'anon'));
  await as(U2, async (c) => denied(await c.t(`SELECT public.bump_client_error('fp1')`), /permission denied/i, 'authenticated'));
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
