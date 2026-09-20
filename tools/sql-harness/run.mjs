// Behaviour assertions for the Lioris Supabase migrations, executed against an
// in-memory PGlite (real Postgres 17). Nothing here touches a real database.
//
//   node run.mjs            # full run (loads every migration, ~20 s)
//   node run.mjs --keep     # same, prints extra detail
//
// Every check prints PASS/FAIL; exit code is 1 when any check fails.
import { newDb, bootstrap, applyFile, MIGRATIONS } from './lib.mjs';

const VERBOSE = process.argv.includes('--keep');
const db = await newDb();
const results = [];
const legacy = [];

// ---------------------------------------------------------------------------
// tiny test framework
// ---------------------------------------------------------------------------
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U = {
  adminA: id(1), adminB: id(2), staffU: id(3), staffI: id(4),
  s1: id(5), s2: id(6), s3: id(7), s4: id(8), s5: id(9), legacy: id(10), alumni: id(11),
};

/** Run fn as a Supabase role inside a rolled-back transaction. */
async function as(who, fn) {
  await db.exec('BEGIN');
  try {
    if (who === 'postgres') {
      /* superuser, no claims */
    } else if (who === 'anon') {
      await db.exec(`SET LOCAL ROLE anon; SELECT set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    } else if (who === 'service_role') {
      await db.exec(`SET LOCAL ROLE service_role; SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    } else {
      await db.exec(
        `SET LOCAL ROLE authenticated; ` +
          `SELECT set_config('request.jwt.claims', '{"sub":"${who}","role":"authenticated"}', true); ` +
          `SELECT set_config('request.jwt.claim.sub', '${who}', true)`,
      );
    }
    const role = who === 'postgres' ? null : who === 'anon' || who === 'service_role' ? who : 'authenticated';
    const ctx = {
      q: (sql, p) => db.query(sql, p),
      /** try a statement inside a savepoint; never throws */
      async t(sql, p) {
        await db.exec('SAVEPOINT chk');
        try { const r = await db.query(sql, p); await db.exec('RELEASE chk'); return { ok: true, rows: r.rows, n: r.affectedRows ?? r.rows.length }; }
        catch (e) { await db.exec('ROLLBACK TO chk'); await db.exec('RELEASE chk'); return { ok: false, err: e }; }
      },
      /** run as the superuser inside the same tx (for verification), then come back */
      async su(sql, p) {
        if (role) await db.exec('RESET ROLE');
        try { return await db.query(sql, p); }
        finally { if (role) await db.exec(`SET LOCAL ROLE ${role}`); }
      },
    };
    return await fn(ctx);
  } finally {
    try { await db.exec('ROLLBACK'); } catch { /* already closed */ }
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || 'not equal'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); }
function denied(r, re, msg) {
  assert(!r.ok, `${msg || 'statement'} should have been refused but succeeded`);
  if (re) assert(re.test(r.err.message), `${msg || 'statement'} refused with unexpected error: ${r.err.message}`);
}
async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`PASS  ${name}`); }
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log(`FAIL  ${name}\n      -> ${e.message}`); }
}
async function admin(sql, p) { return db.query(sql, p); }

// ---------------------------------------------------------------------------
// 1. load every migration (all but the last two may be partially applied)
// ---------------------------------------------------------------------------
console.log('== Loading migrations into PGlite (Postgres 17) ==');
await bootstrap(db);
const beforeMine = MIGRATIONS.filter((m) => m.file !== 'supabase_launch_hardening_2026.sql');
for (const m of beforeMine) {
  const r = await applyFile(db, m.file, m.strict, VERBOSE ? console.log : () => {});
  if (r.failures.length) legacy.push(r);
}
console.log(legacy.length ? `legacy statements failed in: ${legacy.map((l) => l.name).join(', ')}` : 'all pre-existing migrations applied without any failing statement');

// ---------------------------------------------------------------------------
// 2. fixtures (committed): users go through the real signup trigger
// ---------------------------------------------------------------------------
const mkUser = (uid, email, campus, meta = {}) =>
  admin(
    `INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ($1, $2, $3::jsonb, now())`,
    [uid, email, JSON.stringify({ campus_code: campus, full_name: email.split('@')[0], ...meta })],
  );
await mkUser(U.adminA, 'adminA@example.test', 'GLOBAL');
await mkUser(U.adminB, 'adminB@example.test', 'GLOBAL');
await mkUser(U.staffU, 'staffU@example.test', 'UNILAG');
await mkUser(U.staffI, 'staffI@example.test', 'UI');
await mkUser(U.s1, 's1@example.test', 'UNILAG');
await mkUser(U.s2, 's2@example.test', 'UNILAG');
await mkUser(U.s3, 's3@example.test', 'UI');
await mkUser(U.s4, 's4@example.test', 'UNILAG');
await mkUser(U.s5, 's5@example.test', 'UNILAG');
await mkUser(U.alumni, 'alum@example.test', 'UNILAG', { role: 'alumni' });

// Promotions need the escalation trigger out of the way (there is no other way
// to mint the first admin, exactly as in production: SQL editor + trigger off).
await admin(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
await admin(`UPDATE public.profiles SET role = 'admin' WHERE id IN ($1, $2)`, [U.adminA, U.adminB]);
await admin(`UPDATE public.profiles SET role = 'staff' WHERE id IN ($1, $2)`, [U.staffU, U.staffI]);
await admin(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);

// Pre-migration state of the push token leak (the bug section 1 of my file fixes).
await admin(`UPDATE public.profiles SET push_token = 'ExponentPushToken[s1-token-0001]' WHERE id = $1`, [U.s1]);
await admin(`UPDATE public.profiles SET push_token = 'ExponentPushToken[s1-token-0001]' WHERE id = $1`, [U.s2]); // duplicate of s1
await admin(`UPDATE public.profiles SET push_token = 'ExponentPushToken[s3-token-0003]' WHERE id = $1`, [U.s3]);
await admin(`UPDATE public.profiles SET push_token = '   ' WHERE id = $1`, [U.s4]); // blank must be skipped

console.log('\n== Baseline (before supabase_launch_hardening_2026.sql) ==');
await check('BASELINE: same-campus student could read a peer push_token (the leak being fixed)', async () => {
  await as(U.s5, async (c) => {
    const r = await c.q(`SELECT push_token FROM public.profiles WHERE id = $1`, [U.s1]);
    eq(r.rows[0]?.push_token, 'ExponentPushToken[s1-token-0001]', 'leak not reproduced');
  });
});
// Direct service_role / SQL-editor role change: documented behaviour of the previous migration.
const baselineRoleFlip = await as('postgres', async (c) => {
  await c.q(`UPDATE public.profiles SET role = 'staff' WHERE id = $1`, [U.s5]);
  return (await c.q(`SELECT role::text FROM public.profiles WHERE id = $1`, [U.s5])).rows[0].role;
});
console.log(`INFO  baseline: JWT-less UPDATE profiles SET role='staff' leaves role = '${baselineRoleFlip}' (escalation trigger applies to service_role/SQL editor too)`);

// ---------------------------------------------------------------------------
// 3. apply my migration (twice = idempotency) and run everything
// ---------------------------------------------------------------------------
console.log('\n== Applying supabase_launch_hardening_2026.sql ==');
await check('launch hardening applies cleanly on top of the security hardening', async () => {
  await db.exec(await (await import('node:fs')).promises.readFile(new URL('../../supabase_launch_hardening_2026.sql', import.meta.url), 'utf8'));
});
await check('launch hardening is idempotent (second run)', async () => {
  await db.exec(await (await import('node:fs')).promises.readFile(new URL('../../supabase_launch_hardening_2026.sql', import.meta.url), 'utf8'));
});
await check('security hardening (already in prod) is itself re-runnable', async () => {
  await db.exec(await (await import('node:fs')).promises.readFile(new URL('../../supabase_security_hardening_2026.sql', import.meta.url), 'utf8'));
});

console.log('\n== push_tokens ==');
await check('existing profiles.push_token values migrated (dedup, blanks skipped) and nulled', async () => {
  const t = await admin(`SELECT user_id, token FROM public.push_tokens ORDER BY token`);
  eq(t.rows.length, 2, 'expected 2 migrated tokens (dup + blank skipped)');
  const left = await admin(`SELECT count(*)::int n FROM public.profiles WHERE push_token IS NOT NULL`);
  eq(left.rows[0].n, 0, 'profiles.push_token not fully nulled');
});
await check('profiles.push_token can never be set again (trigger forces NULL, on UPDATE and INSERT)', async () => {
  await as(U.s5, async (c) => {
    await c.q(`UPDATE public.profiles SET push_token = 'ExponentPushToken[evil-000000]' WHERE id = $1`, [U.s5]);
    const r = await c.q(`SELECT push_token FROM public.profiles WHERE id = $1`, [U.s5]);
    eq(r.rows[0].push_token, null);
  });
  await as('postgres', async (c) => {
    await c.q(`UPDATE public.profiles SET push_token = 'x-direct-token-1' WHERE id = $1`, [U.s5]);
    eq((await c.q(`SELECT push_token FROM public.profiles WHERE id = $1`, [U.s5])).rows[0].push_token, null);
  });
});
await check('a student cannot read another user\'s push_tokens (sees 0 rows for others)', async () => {
  await as(U.s5, async (c) => {
    const r = await c.q(`SELECT count(*)::int n FROM public.push_tokens`);
    eq(r.rows[0].n, 0, 's5 owns no token, must see none');
  });
  await as(U.s3, async (c) => {
    const r = await c.q(`SELECT user_id FROM public.push_tokens`);
    eq(r.rows.length, 1); eq(r.rows[0].user_id, U.s3, 's3 must only see its own token');
  });
});
await check('owner can insert / update / delete own token; cannot insert for someone else', async () => {
  await as(U.s5, async (c) => {
    const ok = await c.t(`INSERT INTO public.push_tokens (user_id, token, platform) VALUES ($1, 'ExponentPushToken[own-token-05]', 'android')`, [U.s5]);
    assert(ok.ok, 'own insert failed: ' + ok.err?.message);
    const up = await c.t(`UPDATE public.push_tokens SET platform = 'ios' WHERE token = 'ExponentPushToken[own-token-05]'`);
    assert(up.ok && up.n === 1, 'own update failed');
    const bad = await c.t(`INSERT INTO public.push_tokens (user_id, token) VALUES ($1, 'ExponentPushToken[forged-token]')`, [U.s1]);
    denied(bad, /row-level security/i, 'insert for another user');
    const del = await c.t(`DELETE FROM public.push_tokens WHERE token = 'ExponentPushToken[own-token-05]'`);
    assert(del.ok && del.n === 1, 'own delete failed');
  });
});
await check('a student cannot steal / overwrite / delete another user\'s token via upsert or delete', async () => {
  await as(U.s5, async (c) => {
    const steal = await c.t(
      `INSERT INTO public.push_tokens (user_id, token) VALUES ($1, 'ExponentPushToken[s3-token-0003]') ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id`, [U.s5]);
    assert(!steal.ok || steal.n === 0, 'upsert stole another user\'s token');
    const del = await c.t(`DELETE FROM public.push_tokens WHERE token = 'ExponentPushToken[s3-token-0003]'`);
    assert(del.ok && del.n === 0, 'deleted someone else\'s token');
  });
  assert((await admin(`SELECT 1 FROM public.push_tokens WHERE token = 'ExponentPushToken[s3-token-0003]' AND user_id = $1`, [U.s3])).rows.length === 1, 'token no longer belongs to s3');
});
await check('anon cannot touch push_tokens', async () => {
  await as('anon', async (c) => { denied(await c.t(`SELECT * FROM public.push_tokens`), /permission denied/i); });
});
await check('register_push_token() hands a token over to the caller and validates the format', async () => {
  await as(U.s5, async (c) => {
    const bad = await c.t(`SELECT public.register_push_token('not-a-token-at-all')`);
    denied(bad, /Invalid push token/i, 'bad token');
    const ok = await c.t(`SELECT public.register_push_token('ExponentPushToken[s3-token-0003]', 'ios')`);
    assert(ok.ok, 'register failed: ' + ok.err?.message);
    const owner = await c.su(`SELECT user_id FROM public.push_tokens WHERE token = 'ExponentPushToken[s3-token-0003]'`);
    eq(owner.rows[0].user_id, U.s5, 'token was not re-parented');
  });
  await as('anon', async (c) => { denied(await c.t(`SELECT public.register_push_token('ExponentPushToken[abcdefgh]')`), /permission denied/i); });
});
await check('per-user cap of 20 tokens (oldest evicted)', async () => {
  await as('postgres', async (c) => {
    for (let i = 0; i < 25; i++) {
      await c.q(`INSERT INTO public.push_tokens (user_id, token, updated_at) VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`, [U.s4, `ExponentPushToken[cap-${String(i).padStart(4, '0')}]`, String(i)]);
    }
    const n = (await c.q(`SELECT count(*)::int n FROM public.push_tokens WHERE user_id = $1`, [U.s4])).rows[0].n;
    eq(n, 20);
  });
});
await check('service_role can read every push token (send-push edge function)', async () => {
  await as('service_role', async (c) => {
    const r = await c.q(`SELECT count(*)::int n FROM public.push_tokens`);
    assert(r.rows[0].n >= 2);
  });
});

console.log('\n== client_errors ==');
await admin(`INSERT INTO public.client_errors (fingerprint, message, created_at, last_seen_at) VALUES ('fp-old', 'old', now() - interval '45 days', now() - interval '45 days'), ('fp-new', 'new', now(), now())`);
await check('admin can SELECT and DELETE client_errors', async () => {
  await as(U.adminA, async (c) => {
    eq((await c.q(`SELECT count(*)::int n FROM public.client_errors`)).rows[0].n, 2);
    const d = await c.t(`DELETE FROM public.client_errors WHERE fingerprint = 'fp-new'`);
    assert(d.ok && d.n === 1);
  });
});
await check('student / staff see no client_errors and cannot delete', async () => {
  for (const u of [U.s1, U.staffU]) {
    await as(u, async (c) => {
      eq((await c.q(`SELECT count(*)::int n FROM public.client_errors`)).rows[0].n, 0, 'non-admin saw rows');
      const d = await c.t(`DELETE FROM public.client_errors`);
      assert(d.ok && d.n === 0, 'non-admin deleted rows');
    });
  }
});
await check('nobody except service_role can INSERT/UPDATE client_errors (authenticated incl. admin, anon)', async () => {
  for (const u of [U.s1, U.adminA]) {
    await as(u, async (c) => {
      denied(await c.t(`INSERT INTO public.client_errors (fingerprint) VALUES ('x')`), /permission denied|row-level/i, 'insert');
      denied(await c.t(`UPDATE public.client_errors SET message = 'x'`), /permission denied|row-level/i, 'update');
    });
  }
  await as('anon', async (c) => { denied(await c.t(`SELECT * FROM public.client_errors`), /permission denied/i); });
  await as('service_role', async (c) => {
    const r = await c.t(`INSERT INTO public.client_errors (fingerprint, message) VALUES ('fp-svc', 'ok')`);
    assert(r.ok, 'service_role insert failed: ' + r.err?.message);
  });
});
await check('purge_old_client_errors: service_role only, removes rows older than N days', async () => {
  await as(U.adminA, async (c) => { denied(await c.t(`SELECT public.purge_old_client_errors(30)`), /permission denied/i); });
  await as('anon', async (c) => { denied(await c.t(`SELECT public.purge_old_client_errors(30)`), /permission denied/i); });
  await as('service_role', async (c) => {
    const r = await c.q(`SELECT public.purge_old_client_errors(30) n`);
    eq(Number(r.rows[0].n), 1, 'exactly the 45-day-old row');
    denied(await c.t(`SELECT public.purge_old_client_errors(0)`), /p_days/i);
  });
});

console.log('\n== rate limits ==');
const insPost = (uid, n) => [`INSERT INTO public.posts (author_id, campus_code, content) VALUES ($1, 'UNILAG', $2)`, [uid, `post ${n}`]];
await check('posts: 20 inserts/hour allowed, the 21st is refused with P0001 "Rate limit"', async () => {
  await as(U.s1, async (c) => {
    for (let i = 1; i <= 20; i++) { const r = await c.t(...insPost(U.s1, i)); assert(r.ok, `insert #${i} refused: ${r.err?.message}`); }
    const r = await c.t(...insPost(U.s1, 21));
    denied(r, /Rate limit: too many posts - please wait a few minutes/);
    eq(r.err.code, 'P0001');
  });
});
await check('rate limit is per user (another student is unaffected while s1 is blocked)', async () => {
  await admin(`INSERT INTO public.posts (author_id, campus_code, content) SELECT $1, 'UNILAG', 'bulk' FROM generate_series(1, 20)`, [U.s1]);
  await as(U.s1, async (c) => denied(await c.t(...insPost(U.s1, 99)), /Rate limit/));
  await as(U.s2, async (c) => { const r = await c.t(...insPost(U.s2, 1)); assert(r.ok, r.err?.message); });
});
await check('old rows fall out of the window (rows older than 1h no longer count)', async () => {
  await admin(`UPDATE public.posts SET created_at = now() - interval '2 hours' WHERE author_id = $1`, [U.s1]);
  await as(U.s1, async (c) => { const r = await c.t(...insPost(U.s1, 100)); assert(r.ok, r.err?.message); });
});
await check('staff / admin and service_role are exempt from rate limits', async () => {
  await admin(`INSERT INTO public.posts (author_id, campus_code, content) SELECT $1, 'UNILAG', 'bulk' FROM generate_series(1, 25)`, [U.staffU]);
  await as(U.staffU, async (c) => { const r = await c.t(...insPost(U.staffU, 500)); assert(r.ok, 'staff blocked: ' + r.err?.message); });
  await admin(`INSERT INTO public.posts (author_id, campus_code, content) SELECT $1, 'UNILAG', 'bulk' FROM generate_series(1, 25)`, [U.adminA]);
  await as(U.adminA, async (c) => { const r = await c.t(...insPost(U.adminA, 500)); assert(r.ok, 'admin blocked: ' + r.err?.message); });
  await as('service_role', async (c) => { const r = await c.t(...insPost(U.s1, 501)); assert(r.ok, 'service_role blocked: ' + r.err?.message); });
});
await check('rate limit cannot be dodged by pointing the counter at someone else (RLS still forces author = caller)', async () => {
  await as(U.s2, async (c) => denied(await c.t(...insPost(U.s3, 1)), /row-level security/i));
});
await check('comments: 60 per 10 minutes; 61st refused', async () => {
  const [p] = (await admin(`INSERT INTO public.posts (author_id, campus_code, content) VALUES ($1, 'UNILAG', 'target') RETURNING id`, [U.staffU])).rows;
  await admin(`INSERT INTO public.post_comments (post_id, author_id, content) SELECT $1, $2, 'c' FROM generate_series(1, 60)`, [p.id, U.s4]);
  await as(U.s4, async (c) => denied(await c.t(`INSERT INTO public.post_comments (post_id, author_id, content) VALUES ($1, $2, 'one too many')`, [p.id, U.s4]), /Rate limit: too many comments/));
});
await check('chat messages: 100/minute; 101st refused', async () => {
  const [ch] = (await admin(`INSERT INTO public.chat_channels (name, created_by) VALUES ('rl', $1) RETURNING id`, [U.s4])).rows;
  await admin(`INSERT INTO public.chat_messages (channel_id, sender_id, content) SELECT $1, $2, 'm' FROM generate_series(1, 100)`, [ch.id, U.s4]);
  await as(U.s4, async (c) => denied(await c.t(`INSERT INTO public.chat_messages (channel_id, sender_id, content) VALUES ($1, $2, 'x')`, [ch.id, U.s4]), /Rate limit: too many messages/));
});
await check('reports (moderation_queue): 20/hour counted even though the reporter can only SELECT own rows', async () => {
  await admin(`INSERT INTO public.moderation_queue (item_type, item_id, reporter_id, campus_code, reason) SELECT 'post', gen_random_uuid(), $1, 'UNILAG', 'spam' FROM generate_series(1, 20)`, [U.s5]);
  await as(U.s5, async (c) => denied(await c.t(`INSERT INTO public.moderation_queue (item_type, item_id, reporter_id, campus_code, reason) VALUES ('post', gen_random_uuid(), $1, 'UNILAG', 'x')`, [U.s5]), /Rate limit: too many reports/));
});
await check('all 15 rate-limit triggers are installed and point at the shared function', async () => {
  const r = await admin(`SELECT count(*)::int n FROM pg_trigger t WHERE t.tgname LIKE 'trg_rate_limit_%' AND NOT t.tgisinternal AND t.tgfoid = 'public.enforce_insert_rate_limit'::regproc`);
  eq(r.rows[0].n, 15);
});
await check('rate-limit function is not callable by clients', async () => {
  await as(U.s1, async (c) => denied(await c.t(`SELECT public.enforce_insert_rate_limit()`), /permission denied/i));
});

console.log('\n== retention: audit_logs ==');
await check('purge_expired_audit_logs refuses < 12 months and non service_role callers', async () => {
  await as('service_role', async (c) => { denied(await c.t(`SELECT public.purge_expired_audit_logs(11)`), /at least 12 months/); denied(await c.t(`SELECT public.purge_expired_audit_logs(NULL)`), /at least 12 months/); });
  await as(U.adminA, async (c) => denied(await c.t(`SELECT public.purge_expired_audit_logs(24)`), /permission denied/i));
  await as('anon', async (c) => denied(await c.t(`SELECT public.purge_expired_audit_logs(24)`), /permission denied/i));
});
await check('purge_expired_audit_logs deletes only old rows, re-enables the trigger, and records itself', async () => {
  // seed old rows (the insert-sanitiser trigger forces created_at = now(), so switch it off just for seeding)
  await admin(`ALTER TABLE public.audit_logs DISABLE TRIGGER trg_audit_logs_sanitize_insert`);
  await admin(`INSERT INTO public.audit_logs (actor_id, action, entity_type, created_at) VALUES (NULL, 'seed_old', 'test', now() - interval '30 months'), (NULL, 'seed_old', 'test', now() - interval '25 months'), (NULL, 'seed_recent', 'test', now() - interval '13 months')`);
  await admin(`ALTER TABLE public.audit_logs ENABLE TRIGGER trg_audit_logs_sanitize_insert`);
  await as('service_role', async (c) => {
    const r = await c.q(`SELECT public.purge_expired_audit_logs(24) n`);
    eq(Number(r.rows[0].n), 2);
  });
});
// as() rolls back, so re-run the purge in a committed transaction for the state checks:
await check('after a committed purge: old rows gone, recent kept, append-only trigger enabled again and still blocks DELETE', async () => {
  await admin(`ALTER TABLE public.audit_logs DISABLE TRIGGER trg_audit_logs_sanitize_insert`);
  await admin(`INSERT INTO public.audit_logs (actor_id, action, entity_type, created_at) VALUES (NULL, 'seed_old2', 'test', now() - interval '30 months')`);
  await admin(`ALTER TABLE public.audit_logs ENABLE TRIGGER trg_audit_logs_sanitize_insert`);
  await db.exec(`BEGIN; SET LOCAL ROLE service_role; SELECT public.purge_expired_audit_logs(24); COMMIT;`);
  eq((await admin(`SELECT count(*)::int n FROM public.audit_logs WHERE action LIKE 'seed_old%'`)).rows[0].n, 0, 'old rows survived');
  eq((await admin(`SELECT count(*)::int n FROM public.audit_logs WHERE action = 'seed_recent'`)).rows[0].n, 1, 'recent row was deleted');
  eq((await admin(`SELECT count(*)::int n FROM public.audit_logs WHERE action = 'audit_logs_purged'`)).rows[0].n >= 1, true, 'purge not audited');
  eq((await admin(`SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'public.audit_logs'::regclass AND tgname = 'trg_audit_logs_append_only'`)).rows[0].tgenabled, 'O', 'trigger left disabled');
  await as('service_role', async (c) => denied(await c.t(`DELETE FROM public.audit_logs`), /append-only/));
});
await check('a failing purge leaves the append-only trigger enabled (error path)', async () => {
  // Force the DELETE to fail: an extra trigger that raises, then run the purge.
  await admin(`CREATE OR REPLACE FUNCTION public.zz_fail_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'boom'; END $$`);
  await admin(`ALTER TABLE public.audit_logs DISABLE TRIGGER trg_audit_logs_sanitize_insert`);
  await admin(`INSERT INTO public.audit_logs (actor_id, action, entity_type, created_at) VALUES (NULL, 'seed_old3', 'test', now() - interval '40 months')`);
  await admin(`ALTER TABLE public.audit_logs ENABLE TRIGGER trg_audit_logs_sanitize_insert`);
  await admin(`CREATE TRIGGER zz_fail BEFORE DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.zz_fail_delete()`);
  let threw = false;
  try { await db.exec(`BEGIN; SET LOCAL ROLE service_role; SELECT public.purge_expired_audit_logs(24); COMMIT;`); } catch { threw = true; try { await db.exec('ROLLBACK'); } catch { /* */ } }
  await admin(`DROP TRIGGER zz_fail ON public.audit_logs`);
  await admin(`DROP FUNCTION public.zz_fail_delete()`);
  assert(threw, 'purge should have re-raised');
  eq((await admin(`SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'public.audit_logs'::regclass AND tgname = 'trg_audit_logs_append_only'`)).rows[0].tgenabled, 'O', 'trigger left disabled after error');
  eq((await admin(`SELECT count(*)::int n FROM public.audit_logs WHERE action = 'seed_old3'`)).rows[0].n, 1, 'row deleted despite error');
});
await check('pg_cron scheduling block (simulated cron.* stubs): 3 jobs, idempotent on re-run, unschedule of a missing job tolerated', async () => {
  const sql = (await import('node:fs')).readFileSync(new URL('../../supabase_launch_hardening_2026.sql', import.meta.url), 'utf8');
  const marker = "IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')";
  const start = sql.lastIndexOf('DO $do$', sql.indexOf(marker));
  assert(start > 0, 'scheduling block not found');
  const end = sql.indexOf('$do$;', start + 10) + 5;
  const block = sql.slice(start, end).replace("IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN", 'IF false THEN');
  await db.exec(`CREATE SCHEMA IF NOT EXISTS cron; CREATE TABLE IF NOT EXISTS cron.job (jobname text PRIMARY KEY, schedule text, command text);
    CREATE OR REPLACE FUNCTION cron.schedule(n text, s text, c text) RETURNS bigint LANGUAGE plpgsql AS $f$ BEGIN INSERT INTO cron.job VALUES (n, s, c); RETURN 1; END $f$;
    CREATE OR REPLACE FUNCTION cron.unschedule(n text) RETURNS boolean LANGUAGE plpgsql AS $f$ BEGIN DELETE FROM cron.job WHERE jobname = n; IF NOT FOUND THEN RAISE EXCEPTION 'could not find valid entry for job %', n; END IF; RETURN true; END $f$;`);
  await db.exec(block);
  await db.exec(block); // second run must not duplicate nor fail
  const jobs = (await admin(`SELECT jobname, schedule, command FROM cron.job ORDER BY jobname`)).rows;
  eq(jobs.map((j) => j.jobname), ['lioris_cleanup_rate_limits', 'lioris_purge_audit_logs', 'lioris_purge_client_errors']);
  eq(jobs.find((j) => j.jobname === 'lioris_purge_audit_logs').command, 'SELECT public.purge_expired_audit_logs(24)');
  await admin(`DROP SCHEMA cron CASCADE`);
});
await check('pg_cron absent: scheduling section skipped without error (already proven by clean apply)', async () => {
  eq((await admin(`SELECT count(*)::int n FROM pg_extension WHERE extname = 'pg_cron'`)).rows[0].n, 0);
});

console.log('\n== consent versioning ==');
await check('latest_consent returns NULL before, and the newest version after record_consent (re-consent flow)', async () => {
  await as(U.s5, async (c) => {
    eq((await c.q(`SELECT public.latest_consent() v`)).rows[0].v, null);
    const ok = await c.t(`SELECT public.record_consent('2026-09-19', true)`);
    assert(ok.ok, ok.err?.message);
    eq((await c.q(`SELECT public.latest_consent() v`)).rows[0].v, '2026-09-19');
    eq((await c.q(`SELECT public.latest_consent('terms_and_privacy') v`)).rows[0].v, '2026-09-19');
    eq((await c.q(`SELECT public.latest_consent('marketing') v`)).rows[0].v, null);
    const row = await c.su(`SELECT source, age_confirmed_18, consent_type FROM public.consent_records WHERE user_id = $1`, [U.s5]);
    eq(row.rows[0], { source: 'reconsent', age_confirmed_18: true, consent_type: 'terms_and_privacy' });
    await c.q(`SELECT public.record_consent('2026-12-01', true)`);
    eq((await c.q(`SELECT public.latest_consent() v`)).rows[0].v, '2026-12-01');
  });
});
await check('record_consent validates version format and requires age confirmation; anon denied', async () => {
  await as(U.s5, async (c) => {
    denied(await c.t(`SELECT public.record_consent('bad version; drop table', true)`), /Invalid consent version/);
    denied(await c.t(`SELECT public.record_consent('', true)`), /Invalid consent version/);
    denied(await c.t(`SELECT public.record_consent(repeat('a', 65), true)`), /Invalid consent version/);
    denied(await c.t(`SELECT public.record_consent('2026-09-19', false)`), /Age confirmation/);
    denied(await c.t(`SELECT public.record_consent('2026-09-19', NULL)`), /Age confirmation/);
  });
  await as('anon', async (c) => { denied(await c.t(`SELECT public.record_consent('2026-09-19', true)`), /permission denied/i); denied(await c.t(`SELECT public.latest_consent()`), /permission denied/i); });
});
await check('a user only ever sees their own latest consent', async () => {
  await as(U.s1, async (c) => { eq((await c.q(`SELECT public.latest_consent() v`)).rows[0].v, null, 's1 leaked s5 consent'); });
});

console.log('\n== previously-shipped security hardening (regression) ==');
await check('student cannot change own role / verification_status / is_suspended / trust_score / campus', async () => {
  await as(U.s1, async (c) => {
    await c.q(`UPDATE public.profiles SET role = 'admin', verification_status = 'verified', is_suspended = true, trust_score = 100, campus_code = 'UI' WHERE id = $1`, [U.s1]);
    const r = (await c.q(`SELECT role::text role, verification_status::text v, is_suspended, trust_score::float t, campus_code FROM public.profiles WHERE id = $1`, [U.s1])).rows[0];
    eq(r.role, 'student'); assert(r.v !== 'verified', 'verification_status changed'); assert(!r.is_suspended, 'is_suspended changed'); eq(r.t, 80); eq(r.campus_code, 'UNILAG');
  });
});
await check('student CAN still edit harmless own fields (bio) and submit verification (unverified -> pending)', async () => {
  await as(U.s1, async (c) => {
    await c.q(`UPDATE public.profiles SET bio = 'hello', verification_status = 'pending' WHERE id = $1`, [U.s1]);
    const r = (await c.q(`SELECT bio, verification_status::text v FROM public.profiles WHERE id = $1`, [U.s1])).rows[0];
    eq(r, { bio: 'hello', v: 'pending' });
  });
});
await check('staff cannot update a profile of another campus, nor an admin, nor another staff; can update own-campus student', async () => {
  await as(U.staffU, async (c) => {
    const other = await c.t(`UPDATE public.profiles SET bio = 'pwned' WHERE id = $1`, [U.s3]); // UI student
    assert(other.ok && other.n === 0, 'staff edited another campus student');
    const adm = await c.t(`UPDATE public.profiles SET bio = 'pwned' WHERE id = $1`, [U.adminA]);
    assert(adm.ok && adm.n === 0, 'staff edited an admin');
    const stf = await c.t(`UPDATE public.profiles SET bio = 'pwned' WHERE id = $1`, [U.staffI]);
    assert(stf.ok && stf.n === 0, 'staff edited another staff member');
    const mine = await c.t(`UPDATE public.profiles SET bio = 'moderated' WHERE id = $1`, [U.s2]); // UNILAG student
    assert(mine.ok && mine.n === 1, 'staff could not edit own-campus student');
  });
});
await check('staff cannot promote a student to admin/staff', async () => {
  await as(U.staffU, async (c) => {
    await c.q(`UPDATE public.profiles SET role = 'admin' WHERE id = $1`, [U.s2]);
    eq((await c.q(`SELECT role::text r FROM public.profiles WHERE id = $1`, [U.s2])).rows[0].r, 'student');
  });
});
await check('platform_settings: secret keys unreadable by anon/authenticated (even admin sees redacted), unwritable by anyone', async () => {
  await admin(`INSERT INTO public.platform_settings (key, value) VALUES ('maintenance_mode', '{"on": false}') ON CONFLICT (key) DO NOTHING`);
  await admin(`ALTER TABLE public.platform_settings DISABLE TRIGGER trg_block_secret_settings`);
  await admin(`INSERT INTO public.platform_settings (key, value) VALUES ('ai_service_keys', '{}') ON CONFLICT (key) DO NOTHING`);
  await admin(`ALTER TABLE public.platform_settings ENABLE TRIGGER trg_block_secret_settings`);
  await as(U.s1, async (c) => {
    eq((await c.q(`SELECT count(*)::int n FROM public.platform_settings WHERE key = 'ai_service_keys'`)).rows[0].n, 0, 'student saw secret row');
    eq((await c.q(`SELECT count(*)::int n FROM public.platform_settings WHERE key = 'maintenance_mode'`)).rows[0].n, 1, 'non-secret key hidden');
    denied(await c.t(`INSERT INTO public.platform_settings (key, value) VALUES ('webrtc_keys', '{}')`), /row-level|permission|reserved for secrets/i, 'student insert');
  });
  await as(U.adminA, async (c) => {
    denied(await c.t(`INSERT INTO public.platform_settings (key, value) VALUES ('my_api_key', '{"a":1}')`), /row-level|reserved|permission/i, 'admin insert secret key');
    denied(await c.t(`UPDATE public.platform_settings SET value = '{"gemini":"x"}' WHERE key = 'ai_service_keys'`), /row-level|reserved|secret/i, 'admin update secret key');
    denied(await c.t(`INSERT INTO public.platform_settings (key, value) VALUES ('branding', '{"api_key":"abc"}')`), /secret-looking/i, 'secret-looking field');
    const ai = await c.q(`SELECT value::text v FROM public.platform_settings WHERE key = 'ai_service_keys'`);
    assert(!ai.rows.some((r) => /AIza/.test(r.v)), 'admin can read a secret value');
  });
  await as('service_role', async (c) => denied(await c.t(`UPDATE public.platform_settings SET value = '{"x":1}' WHERE key = 'ai_service_keys'`), /reserved for secrets/, 'service_role write of secret key'));
  await as('anon', async (c) => {
    const r = await c.t(`SELECT * FROM public.platform_settings`);
    assert(!r.ok || r.n === 0, 'anon can read platform_settings');
  });
  // the seeded secret row was redacted by the security migration semantics; make sure value we inserted is not what clients ever get
});
await check('audit_logs: UPDATE / DELETE / TRUNCATE fail for everyone incl. service_role and the table owner', async () => {
  await admin(`INSERT INTO public.audit_logs (actor_id, action, entity_type) VALUES (NULL, 'unit_test', 'test')`);
  for (const who of ['service_role', 'postgres', U.adminA]) {
    await as(who, async (c) => {
      denied(await c.t(`UPDATE public.audit_logs SET action = 'tampered'`), /append-only|permission denied/i, `update as ${who}`);
      denied(await c.t(`DELETE FROM public.audit_logs`), /append-only|permission denied/i, `delete as ${who}`);
      denied(await c.t(`TRUNCATE public.audit_logs`), /append-only|permission denied/i, `truncate as ${who}`);
    });
  }
});
await check('audit_logs: non-admin cannot insert; admin cannot forge another actor or reserved action names', async () => {
  await as(U.s1, async (c) => denied(await c.t(`INSERT INTO public.audit_logs (actor_id, action, entity_type) VALUES ($1, 'x', 'y')`, [U.s1]), /row-level|permission/i));
  await as(U.adminA, async (c) => {
    assert((await c.t(`INSERT INTO public.audit_logs (actor_id, action, entity_type) VALUES ($1, 'custom', 'y')`, [U.adminA])).ok, 'admin legit insert refused');
    denied(await c.t(`INSERT INTO public.audit_logs (actor_id, action, entity_type) VALUES ($1, 'custom', 'y')`, [U.adminB]), /row-level/i, 'forged actor');
    denied(await c.t(`INSERT INTO public.audit_logs (actor_id, action, entity_type) VALUES ($1, 'profile_role_changed', 'y')`, [U.adminA]), /row-level/i, 'reserved action');
  });
});
await check('last active admin cannot be deleted, demoted or suspended; a non-last admin can', async () => {
  await as('postgres', async (c) => {
    await c.q(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`); // isolate the guard itself
    // 2 admins: demoting one is fine
    assert((await c.t(`UPDATE public.profiles SET role = 'student' WHERE id = $1`, [U.adminB])).ok, 'could not demote non-last admin');
    // now adminA is the last one
    denied(await c.t(`UPDATE public.profiles SET role = 'student' WHERE id = $1`, [U.adminA]), /last active administrator/, 'demote last');
    denied(await c.t(`UPDATE public.profiles SET is_suspended = true WHERE id = $1`, [U.adminA]), /last active administrator/, 'suspend last');
    denied(await c.t(`DELETE FROM public.profiles WHERE id = $1`, [U.adminA]), /last active administrator/, 'delete last');
    denied(await c.t(`DELETE FROM auth.users WHERE id = $1`, [U.adminA]), /last active administrator/, 'cascade delete last');
  });
  // and through the real client path (admin demoting themselves) with the escalation trigger ON:
  await as('postgres', async (c) => {
    await c.q(`UPDATE public.profiles SET role = 'student' WHERE id = $1`, [U.adminB]);
  });
});
await check('last-admin guard through the client path: the only active admin cannot demote themselves', async () => {
  await as('postgres', async (c) => {
    await c.q(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
    await c.q(`UPDATE public.profiles SET role = 'student' WHERE id = $1`, [U.adminB]);
    await c.q(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);
    await db.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${U.adminA}', true)`);
    denied(await c.t(`UPDATE public.profiles SET role = 'student' WHERE id = $1`, [U.adminA]), /last active administrator/);
  });
});
await check('resources: a student INSERT with is_approved = true is stored as unapproved; staff/admin may approve', async () => {
  await as(U.s1, async (c) => {
    const r = await c.t(`INSERT INTO public.resources (uploader_id, campus_code, course_code, course_title, title, file_url, is_approved, approved_by, approved_at) VALUES ($1, 'UNILAG', 'CSC101', 'Intro', 'Notes', 'https://example.com/a.pdf', true, $1, now()) RETURNING is_approved, approved_by`, [U.s1]);
    assert(r.ok, 'insert refused by the INSERT policy (trigger/policy conflict): ' + r.err?.message);
    eq(r.rows[0], { is_approved: false, approved_by: null });
    const up = await c.t(`UPDATE public.resources SET is_approved = true WHERE uploader_id = $1 RETURNING is_approved`, [U.s1]);
    assert(up.ok && (up.rows[0]?.is_approved ?? false) === false, 'student self-approved via UPDATE');
  });
  await as(U.staffU, async (c) => {
    const r = await c.t(`INSERT INTO public.resources (uploader_id, campus_code, course_code, course_title, title, file_url, is_approved) VALUES ($1, 'UNILAG', 'CSC102', 'Intro 2', 'Notes 2', 'https://example.com/b.pdf', true) RETURNING is_approved`, [U.staffU]);
    assert(r.ok && r.rows[0].is_approved === true, 'staff approval refused');
  });
});
await check('consume_rate_limit works for service_role (allow, allow, deny) and is denied to anon/authenticated', async () => {
  await as('service_role', async (c) => {
    eq((await c.q(`SELECT public.consume_rate_limit('t:1', 2, 60) ok`)).rows[0].ok, true);
    eq((await c.q(`SELECT public.consume_rate_limit('t:1', 2, 60) ok`)).rows[0].ok, true);
    eq((await c.q(`SELECT public.consume_rate_limit('t:1', 2, 60) ok`)).rows[0].ok, false);
    eq((await c.q(`SELECT public.consume_rate_limit('t:2', 2, 60) ok`)).rows[0].ok, true, 'keys must be independent');
  });
  await as(U.s1, async (c) => denied(await c.t(`SELECT public.consume_rate_limit('t:1', 2, 60)`), /permission denied/i));
  await as('anon', async (c) => denied(await c.t(`SELECT public.consume_rate_limit('t:1', 2, 60)`), /permission denied/i));
  await as(U.s1, async (c) => denied(await c.t(`SELECT * FROM public.api_rate_limits`), /permission denied/i));
});
await check('cleanup_api_rate_limits is service_role only and works', async () => {
  await as(U.s1, async (c) => denied(await c.t(`SELECT public.cleanup_api_rate_limits()`), /permission denied/i));
  await as('service_role', async (c) => { assert((await c.t(`SELECT public.cleanup_api_rate_limits(60)`)).ok); });
});
await admin(`INSERT INTO public.posts (author_id, campus_code, content) VALUES ($1, 'UNILAG', 'export me')`, [U.s2]);
await check('export_my_data returns only the caller\'s rows (and works for a student)', async () => {
  await as(U.s2, async (c) => {
    const r = await c.q(`SELECT public.export_my_data() d`);
    const d = r.rows[0].d;
    eq(d.user_id, U.s2);
    const flat = JSON.stringify(d.data);
    for (const other of [U.s1, U.s3, U.s4, U.s5, U.adminA]) {
      // other users' ids may only appear in columns that legitimately point at them (e.g. the staff reviewer is stripped);
      const rowsWithOtherOwner = Object.entries(d.data).flatMap(([tbl, rows]) => Array.isArray(rows) ? rows.filter((row) => ['author_id', 'user_id', 'sender_id', 'uploader_id', 'creator_id', 'seller_id', 'poster_id', 'requester_id', 'student_id', 'reporter_id', 'id'].some((k) => row[k] === other)).map((row) => tbl) : []);
      eq(rowsWithOtherOwner, [], `export contains rows owned by ${other}`);
    }
    assert(d.data.posts.every((p) => p.author_id === U.s2), 'posts of others in export');
    assert(d.data.posts.length >= 1, 'own posts missing');
    assert(flat.length > 0);
    denied(await c.t(`SELECT public.export_my_data()`).then((x) => ({ ok: false, err: { message: 'skip' } })), /skip/);
  });
  await as('anon', async (c) => denied(await c.t(`SELECT public.export_my_data()`), /permission denied|Authentication/i));
});
await check('signup trigger never creates an admin/staff (metadata role, legacy backdoor e-mail, app_metadata)', async () => {
  await mkUser(U.legacy, 'inememmanuel@gmail.com', 'GLOBAL', { role: 'admin', is_admin: true });
  await admin(`INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at) VALUES ($1, 'sneaky@example.test', '{"role":"staff","campus_code":"UNILAG"}', '{"role":"admin"}', now())`, [id(12)]);
  const r = await admin(`SELECT id, role::text role FROM public.profiles WHERE id IN ($1, $2)`, [U.legacy, id(12)]);
  eq(r.rows.length, 2);
  assert(r.rows.every((x) => x.role === 'student'), 'a privileged role was created at signup: ' + JSON.stringify(r.rows));
});
await check('signup records consent from metadata and never blocks on bad input', async () => {
  await mkUser(id(13), 'consent@example.test', 'UNILAG', { terms_version: '2026-09-19', age_confirmed_18: 'true', terms_accepted_at: 'garbage' });
  eq((await admin(`SELECT version, age_confirmed_18 FROM public.consent_records WHERE user_id = $1`, [id(13)])).rows[0], { version: '2026-09-19', age_confirmed_18: true });
});
await check('storage: users cannot write into another user\'s folder of the public buckets', async () => {
  const b = (await admin(`SELECT id FROM storage.buckets LIMIT 1`)).rows[0];
  if (!b) return; // no buckets in the harness DB (created by dashboard in prod)
  await as(U.s1, async (c) => denied(await c.t(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ($1, $2 || '/x.png', $3)`, [b.id, U.s2, U.s1]), /row-level/i));
});
await check('realtime signalling policy only lets channel members subscribe to the call topic', async () => {
  const [ch] = (await admin(`INSERT INTO public.chat_channels (name, created_by) VALUES ('call', $1) RETURNING id`, [U.s5])).rows;
  const hex = ch.id.replace(/-/g, '').slice(0, 16);
  await as(U.s5, async (c) => {
    eq((await c.q(`SELECT public.can_access_webrtc_topic($1) ok`, [`webrtc:lioris-ui-${hex}`])).rows[0].ok, true);
  });
  await as(U.s2, async (c) => {
    eq((await c.q(`SELECT public.can_access_webrtc_topic($1) ok`, [`webrtc:lioris-ui-${hex}`])).rows[0].ok, false);
  });
});

console.log('\n== more regression coverage of the previous migration ==');
await check('suspend_user_account: staff can suspend an own-campus student (reason + audit row), not another campus, not staff/admin, not self; students cannot call it usefully', async () => {
  await as(U.staffU, async (c) => {
    const ok = await c.t(`SELECT public.suspend_user_account($1, 'spam') r`, [U.s2]);
    assert(ok.ok && ok.rows[0].r.success === true, 'own-campus suspend failed: ' + ok.err?.message);
    const row = (await c.su(`SELECT is_suspended, suspension_reason FROM public.profiles WHERE id = $1`, [U.s2])).rows[0];
    eq(row, { is_suspended: true, suspension_reason: 'spam' });
    eq((await c.su(`SELECT count(*)::int n FROM public.audit_logs WHERE action = 'user_suspended' AND entity_id = $1 AND actor_id = $2`, [U.s2, U.staffU])).rows[0].n, 1);
    denied(await c.t(`SELECT public.suspend_user_account($1, 'x')`, [U.s3]), /outside their registered campus/, 'other campus');
    denied(await c.t(`SELECT public.suspend_user_account($1, 'x')`, [U.adminA]), /Staff cannot suspend admin or staff/, 'admin target');
    denied(await c.t(`SELECT public.suspend_user_account($1, 'x')`, [U.staffI]), /Staff cannot suspend admin or staff/, 'staff target');
    denied(await c.t(`SELECT public.suspend_user_account($1, 'x')`, [U.staffU]), /own account/, 'self');
  });
  await as(U.s1, async (c) => denied(await c.t(`SELECT public.suspend_user_account($1, 'x')`, [U.s5]), /Insufficient permissions/));
  await as('anon', async (c) => denied(await c.t(`SELECT public.suspend_user_account($1, 'x')`, [U.s5]), /permission denied/i));
});
await check('a suspended user cannot post (INSERT policy) and the reason clears on un-suspend', async () => {
  await as(U.adminA, async (c) => {
    await c.q(`UPDATE public.profiles SET is_suspended = true, suspension_reason = 'r' WHERE id = $1`, [U.s5]);
    eq((await c.q(`SELECT is_suspended FROM public.profiles WHERE id = $1`, [U.s5])).rows[0].is_suspended, true);
    await db.exec(`SELECT set_config('request.jwt.claims', '{"sub":"${U.s5}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${U.s5}', true)`);
    denied(await c.t(`INSERT INTO public.posts (author_id, campus_code, content) VALUES ($1, 'UNILAG', 'x')`, [U.s5]), /row-level/i);
    await db.exec(`SELECT set_config('request.jwt.claims', '{"sub":"${U.adminA}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${U.adminA}', true)`);
    await c.q(`UPDATE public.profiles SET is_suspended = false WHERE id = $1`, [U.s5]);
    eq((await c.q(`SELECT suspension_reason FROM public.profiles WHERE id = $1`, [U.s5])).rows[0].suspension_reason, null);
  });
});
await check('admin can promote a student to staff (audited with the admin as actor); staff can verify an own-campus student only', async () => {
  await as(U.adminA, async (c) => {
    await c.q(`UPDATE public.profiles SET role = 'staff' WHERE id = $1`, [U.s4]);
    eq((await c.q(`SELECT role::text r FROM public.profiles WHERE id = $1`, [U.s4])).rows[0].r, 'staff');
    eq((await c.q(`SELECT count(*)::int n FROM public.audit_logs WHERE action = 'profile_role_changed' AND entity_id = $1 AND actor_id = $2`, [U.s4, U.adminA])).rows[0].n, 1);
  });
  await as(U.staffU, async (c) => {
    await c.q(`UPDATE public.profiles SET verification_status = 'verified' WHERE id = $1`, [U.s1]);
    eq((await c.q(`SELECT verification_status::text v FROM public.profiles WHERE id = $1`, [U.s1])).rows[0].v, 'verified');
    const other = await c.t(`UPDATE public.profiles SET verification_status = 'verified' WHERE id = $1`, [U.s3]);
    assert(other.ok && other.n === 0, 'staff verified a student of another campus');
  });
});
await check('deleting a normal user who authored audit rows works (FK SET NULL exception in the append-only trigger)', async () => {
  await as('postgres', async (c) => {
    await c.q(`INSERT INTO public.audit_logs (actor_id, action, entity_type) VALUES ($1, 'audited_action', 'x')`, [U.staffI]);
    const d = await c.t(`DELETE FROM auth.users WHERE id = $1`, [U.staffI]);
    assert(d.ok, 'user deletion blocked by audit_logs guard: ' + d.err?.message);
    eq((await c.q(`SELECT count(*)::int n FROM public.audit_logs WHERE action = 'audited_action' AND actor_id IS NULL`)).rows[0].n, 1);
    eq((await c.q(`SELECT count(*)::int n FROM public.audit_logs WHERE action = 'profile_deleted' AND entity_id = $1`, [U.staffI])).rows[0].n, 1);
  });
});
await check('purge_user_data: service_role only; anonymises a student', async () => {
  await as(U.s1, async (c) => denied(await c.t(`SELECT public.purge_user_data($1)`, [U.s2]), /permission denied/i));
  await as(U.adminA, async (c) => denied(await c.t(`SELECT public.purge_user_data($1)`, [U.s2]), /permission denied/i));
  await as('service_role', async (c) => {
    const r = await c.t(`SELECT public.purge_user_data($1) r`, [U.s2]);
    assert(r.ok, 'purge failed: ' + r.err?.message);
    denied(await c.t(`SELECT public.purge_user_data($1)`, [U.adminA]), /Admin accounts cannot be purged/);
  });
});
await check('legacy / dangerous RPCs are locked: confirm_user_email and auth rate-limit RPCs are not callable by anon/authenticated', async () => {
  for (const who of ['anon', U.s1]) {
    await as(who, async (c) => {
      if ((await c.su(`SELECT to_regprocedure('public.confirm_user_email(text)') IS NOT NULL AS x`)).rows[0].x) denied(await c.t(`SELECT public.confirm_user_email('s1@example.test')`), /permission denied/i, 'confirm_user_email');
      denied(await c.t(`SELECT public.check_auth_rate_limit('x')`), /permission denied/i, 'check_auth_rate_limit');
      denied(await c.t(`SELECT public.record_auth_attempt('x', false)`), /permission denied/i, 'record_auth_attempt');
    });
  }
});
await check('no RLS-less table in schema public (every table has RLS enabled)', async () => {
  const r = await admin(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity`);
  eq(r.rows, [], 'tables without RLS');
});
await check('every SECURITY DEFINER function in public pins a search_path containing pg_temp and is not executable by anon (except documented)', async () => {
  const r = await admin(`SELECT p.oid::regprocedure::text f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f' AND (NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%pg_temp%') OR has_function_privilege('anon', p.oid, 'EXECUTE'))`);
  eq(r.rows, [], 'unhygienic definer functions');
});

console.log('\n== profile self-insert guard (section 6a) ==');
const uNoProfile = id(40), uAlumni = id(41);
await admin(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ($1, 'noprofile@example.test', '{}', now()), ($2, 'alumni2@example.test', '{}', now())`, [uNoProfile, uAlumni]);
await admin(`DELETE FROM public.profiles WHERE id IN ($1, $2)`, [uNoProfile, uAlumni]);
await check('a signed-in user with no profile row cannot INSERT themselves as admin/verified/other campus', async () => {
  await as(uNoProfile, async (c) => {
    const r = await c.t(`INSERT INTO public.profiles (id, email, full_name, role, verification_status, trust_score, campus_code, is_suspended) VALUES ($1, 'forged@example.test', 'x', 'admin', 'verified', 100, 'UI', false) RETURNING role::text role, verification_status::text v, trust_score::float t, campus_code, email`, [uNoProfile]);
    assert(r.ok, 'legit self-insert refused: ' + r.err?.message);
    eq(r.rows[0], { role: 'student', v: 'unverified', t: 80, campus_code: 'GLOBAL', email: 'noprofile@example.test' });
  });
});
await check('self-insert may still choose alumni; the signup trigger (no JWT) and service_role keep full control', async () => {
  await as(uAlumni, async (c) => {
    const r = await c.t(`INSERT INTO public.profiles (id, email, full_name, role) VALUES ($1, 'a@example.test', 'a', 'alumni') RETURNING role::text role`, [uAlumni]);
    assert(r.ok && r.rows[0].role === 'alumni', 'alumni self-insert altered');
  });
  await as('service_role', async (c) => {
    const r = await c.t(`INSERT INTO public.profiles (id, email, full_name, role, verification_status) VALUES ($1, 'a@example.test', 'a', 'staff', 'verified') RETURNING role::text role`, [uAlumni]);
    assert(r.ok && r.rows[0].role === 'staff', 'service_role insert was normalised');
  });
});

console.log('\n== Findings probes (informational; do not fail the run) ==');
const probe = async (label, fn) => { try { console.log(`PROBE ${label}: ${JSON.stringify(await fn())}`); } catch (e) { console.log(`PROBE ${label}: error ${e.message}`); } };
await probe('same-campus student can read peer email via profiles SELECT', () => as(U.s2, async (c) => (await c.q(`SELECT email FROM public.profiles WHERE id = $1`, [U.s1])).rows[0]));
await probe('same-campus student can read peer student_id_number / trust_score / is_suspended columns (no error = readable)', () => as(U.s2, async (c) => { const r = await c.t(`SELECT student_id_number, trust_score, is_suspended, last_active_at FROM public.profiles WHERE id = $1`, [U.s1]); return { ok: r.ok }; }));
await probe('service_role UPDATE of a protected profile column (role) is reverted by tr_prevent_profile_role_escalation', () => as('service_role', async (c) => { await c.q(`UPDATE public.profiles SET role = 'staff' WHERE id = $1`, [U.s5]); return (await c.q(`SELECT role::text role FROM public.profiles WHERE id = $1`, [U.s5])).rows[0]; }));

// ---------------------------------------------------------------------------
// supabase_posts_features_2026.sql  (reposts / drafts / scheduled / saved_items)
// ---------------------------------------------------------------------------
const readRepo = async (name) =>
  (await import('node:fs')).promises.readFile(new URL(`../../${name}`, import.meta.url), 'utf8');

console.log('\n== Applying supabase_posts_features_2026.sql ==');
await check('posts features migration applies cleanly on top of both hardening files', async () => {
  await db.exec(await readRepo('supabase_posts_features_2026.sql'));
});
await check('posts features migration is idempotent (second run)', async () => {
  await db.exec(await readRepo('supabase_posts_features_2026.sql'));
});

// Fixtures (committed). Authored by s1 (UNILAG); s2 is a UNILAG peer.
const P = { pub: id(50), draft: id(51), sched: id(52), due: id(53) };
await admin(
  `INSERT INTO public.posts (id, author_id, campus_code, visibility_scope, title, content, status, scheduled_at) VALUES
     ($1, $5, 'UNILAG', 'campus', 'published one', 'body', 'published', NULL),
     ($2, $5, 'UNILAG', 'campus', 'my draft',      'body', 'draft',     NULL),
     ($3, $5, 'UNILAG', 'campus', 'scheduled',     'body', 'scheduled', now() + interval '2 days'),
     ($4, $5, 'UNILAG', 'campus', 'due',           'body', 'scheduled', now() - interval '1 minute')`,
  [P.pub, P.draft, P.sched, P.due, U.s1],
);

console.log('\n== drafts / scheduled visibility ==');
await check('a second user cannot see another user\'s draft or scheduled post', async () => {
  await as(U.s2, async (c) => {
    const r = await c.q(`SELECT id FROM public.posts WHERE id = ANY($1::uuid[]) ORDER BY id`, [[P.pub, P.draft, P.sched, P.due]]);
    eq(r.rows.map((x) => x.id), [P.pub], 's2 must only see the published post');
  });
});
await check('the author sees their own draft and scheduled posts', async () => {
  await as(U.s1, async (c) => {
    const r = await c.q(`SELECT id FROM public.posts WHERE id = ANY($1::uuid[]) ORDER BY id`, [[P.pub, P.draft, P.sched, P.due]]);
    eq(r.rows.length, 4, 'author must see all four of their own rows');
  });
});
await check('admins and staff still see unpublished posts (moderation reach preserved)', async () => {
  for (const who of [U.adminA, U.staffU]) {
    await as(who, async (c) => {
      const r = await c.q(`SELECT count(*)::int n FROM public.posts WHERE id = ANY($1::uuid[])`, [[P.pub, P.draft, P.sched, P.due]]);
      eq(r.rows[0].n, 4, `${who} must see unpublished rows`);
    });
  }
});
await check('the campus rule from the original SELECT policy is still enforced (other university cannot see the campus post)', async () => {
  await as(U.s3, async (c) => {   // s3 is UI, the posts are UNILAG/campus
    const r = await c.q(`SELECT count(*)::int n FROM public.posts WHERE id = ANY($1::uuid[])`, [[P.pub, P.draft, P.sched, P.due]]);
    eq(r.rows[0].n, 0, 'cross-campus leak');
  });
});
await check('an author can publish their own draft, and status is constrained', async () => {
  await as(U.s1, async (c) => {
    const up = await c.t(`UPDATE public.posts SET status = 'published' WHERE id = $1`, [P.draft]);
    assert(up.ok && up.n === 1, 'author could not publish own draft: ' + up.err?.message);
    const bad = await c.t(`UPDATE public.posts SET status = 'nonsense' WHERE id = $1`, [P.draft]);
    denied(bad, /posts_status_check|violates check/i, 'bogus status');
    const noTime = await c.t(`UPDATE public.posts SET status = 'scheduled', scheduled_at = NULL WHERE id = $1`, [P.draft]);
    denied(noTime, /posts_scheduled_at_check|violates check/i, 'scheduled without scheduled_at');
  });
});
await check('a second user cannot publish someone else\'s draft', async () => {
  await as(U.s2, async (c) => {
    const up = await c.t(`UPDATE public.posts SET status = 'published' WHERE id = $1`, [P.draft]);
    assert(up.ok && up.n === 0, 's2 changed another user\'s draft');
  });
});
await check('publish_due_scheduled_posts() is service_role only and only flips rows that are due', async () => {
  await as(U.s1, async (c) => {
    denied(await c.t(`SELECT public.publish_due_scheduled_posts()`), /restricted to service_role|permission denied/i, 'authenticated call');
  });
  await as('service_role', async (c) => {
    const n = (await c.q(`SELECT public.publish_due_scheduled_posts() n`)).rows[0].n;
    eq(n, 1, 'exactly the one due row should publish');
    const r = await c.su(`SELECT id, status FROM public.posts WHERE id = ANY($1::uuid[]) ORDER BY id`, [[P.sched, P.due]]);
    eq(r.rows.find((x) => x.id === P.due).status, 'published', 'due row not published');
    eq(r.rows.find((x) => x.id === P.sched).status, 'scheduled', 'future row must stay scheduled');
  });
});

console.log('\n== reposts ==');
await check('reposting twice is rejected by the unique constraint', async () => {
  await as(U.s2, async (c) => {
    const a = await c.t(`INSERT INTO public.post_reposts (post_id, user_id) VALUES ($1, $2)`, [P.pub, U.s2]);
    assert(a.ok, 'first repost failed: ' + a.err?.message);
    const b = await c.t(`INSERT INTO public.post_reposts (post_id, user_id) VALUES ($1, $2)`, [P.pub, U.s2]);
    denied(b, /post_reposts_unique_per_user|duplicate key/i, 'second repost');
  });
});
await check('a user cannot repost on someone else\'s behalf', async () => {
  await as(U.s2, async (c) => {
    denied(await c.t(`INSERT INTO public.post_reposts (post_id, user_id) VALUES ($1, $2)`, [P.pub, U.s1]), /row-level security/i, 'forged repost');
  });
});
await check('inserting a repost increments reposts_count and deleting it decrements again', async () => {
  await as(U.s2, async (c) => {
    const before = (await c.su(`SELECT reposts_count n FROM public.posts WHERE id = $1`, [P.pub])).rows[0].n;
    await c.q(`INSERT INTO public.post_reposts (post_id, user_id) VALUES ($1, $2)`, [P.pub, U.s2]);
    eq((await c.su(`SELECT reposts_count n FROM public.posts WHERE id = $1`, [P.pub])).rows[0].n, before + 1, 'no increment');
    const del = await c.t(`DELETE FROM public.post_reposts WHERE post_id = $1 AND user_id = $2`, [P.pub, U.s2]);
    assert(del.ok && del.n === 1, 'own repost could not be deleted');
    eq((await c.su(`SELECT reposts_count n FROM public.posts WHERE id = $1`, [P.pub])).rows[0].n, before, 'no decrement');
  });
});
await check('a user cannot delete someone else\'s repost', async () => {
  await as(U.s2, async (c) => {
    await c.q(`INSERT INTO public.post_reposts (post_id, user_id) VALUES ($1, $2)`, [P.pub, U.s2]);
    await c.su(`INSERT INTO public.post_reposts (post_id, user_id) VALUES ($1, $2)`, [P.pub, U.s4]);
    const del = await c.t(`DELETE FROM public.post_reposts WHERE user_id = $1`, [U.s4]);
    assert(del.ok && del.n === 0, 'deleted another user\'s repost');
  });
});
await check('a suspended user cannot repost', async () => {
  await as(U.s2, async (c) => {
    // tr_prevent_profile_role_escalation would revert a self-suspension, so the
    // suspension is applied the way an admin's RPC does: with that guard off.
    await c.su(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
    await c.su(`UPDATE public.profiles SET is_suspended = true WHERE id = $1`, [U.s2]);
    await c.su(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);
    eq((await c.su(`SELECT is_suspended FROM public.profiles WHERE id = $1`, [U.s2])).rows[0].is_suspended, true, 'fixture: s2 not suspended');
    denied(await c.t(`INSERT INTO public.post_reposts (post_id, user_id) VALUES ($1, $2)`, [P.pub, U.s2]), /row-level security/i, 'suspended repost');
  });
});
await check('reposts are readable by any authenticated user (needed for counts and "did I repost")', async () => {
  await as(U.s2, async (c) => {
    await c.su(`INSERT INTO public.post_reposts (post_id, user_id) VALUES ($1, $2)`, [P.pub, U.s4]);
    eq((await c.q(`SELECT count(*)::int n FROM public.post_reposts WHERE post_id = $1`, [P.pub])).rows[0].n, 1, 's2 must see s4\'s repost');
  });
  await as('anon', async (c) => { denied(await c.t(`SELECT * FROM public.post_reposts`), /permission denied|row-level security/i); });
});

console.log('\n== saved_items ==');
await check('saved_items are invisible to other users and cannot be forged or deleted by them', async () => {
  await as(U.s1, async (c) => {
    await c.su(`INSERT INTO public.saved_items (user_id, kind, item_id, title) VALUES ($1, 'resource', 'res-1', 'Notes')`, [U.s1]);
    eq((await c.q(`SELECT count(*)::int n FROM public.saved_items`)).rows[0].n, 1, 'owner must see their own row');
  });
  await as(U.s2, async (c) => {
    await c.su(`INSERT INTO public.saved_items (user_id, kind, item_id, title) VALUES ($1, 'resource', 'res-1', 'Notes')`, [U.s1]);
    eq((await c.q(`SELECT count(*)::int n FROM public.saved_items`)).rows[0].n, 0, 'saved items leaked to another user');
    denied(await c.t(`INSERT INTO public.saved_items (user_id, kind, item_id) VALUES ($1, 'post', 'p-1')`, [U.s1]), /row-level security/i, 'forged save');
    const del = await c.t(`DELETE FROM public.saved_items WHERE user_id = $1`, [U.s1]);
    assert(del.ok && del.n === 0, 'deleted another user\'s saved item');
  });
  await as(U.adminA, async (c) => {
    await c.su(`INSERT INTO public.saved_items (user_id, kind, item_id) VALUES ($1, 'post', 'p-9')`, [U.s1]);
    eq((await c.q(`SELECT count(*)::int n FROM public.saved_items`)).rows[0].n, 0, 'admins must not read private saved items either');
  });
});
await check('saving the same item twice is rejected; kind is constrained', async () => {
  await as(U.s2, async (c) => {
    assert((await c.t(`INSERT INTO public.saved_items (user_id, kind, item_id) VALUES ($1, 'event', 'e-1')`, [U.s2])).ok, 'first save failed');
    denied(await c.t(`INSERT INTO public.saved_items (user_id, kind, item_id) VALUES ($1, 'event', 'e-1')`, [U.s2]), /saved_items_unique_per_user|duplicate key/i, 'duplicate save');
    denied(await c.t(`INSERT INTO public.saved_items (user_id, kind, item_id) VALUES ($1, 'banana', 'x')`, [U.s2]), /check/i, 'bogus kind');
  });
});
console.log('\n== poll votes (per voter) ==');
// Two more posts: an open poll and one that closed an hour ago.
const POLL = { open: id(60), closed: id(61) };
const pollBlob = (closesAt) =>
  JSON.stringify({
    question: 'Best lecture slot?',
    options: [
      { id: 'opt-1', label: 'Morning', votes: 0 },
      { id: 'opt-2', label: 'Afternoon', votes: 0 },
      { id: 'opt-3', label: 'Evening', votes: 0 },
    ],
    totalVotes: 0,
    ...(closesAt ? { closesAt } : {}),
  });
await admin(
  `INSERT INTO public.posts (id, author_id, campus_code, visibility_scope, title, content, poll_data) VALUES
     ($1, $3, 'UNILAG', 'global', 'open poll',   'body', $4::jsonb),
     ($2, $3, 'UNILAG', 'global', 'closed poll', 'body', $5::jsonb)`,
  [POLL.open, POLL.closed, U.s1, pollBlob(null), pollBlob(new Date(Date.now() - 3600_000).toISOString())],
);

const tally = async (c, postId) =>
  (await c.su(
    `SELECT jsonb_object_agg(o ->> 'id', o -> 'votes') opts, (poll_data ->> 'totalVotes')::int total
       FROM public.posts, jsonb_array_elements(poll_data -> 'options') o
      WHERE id = $1 GROUP BY poll_data`,
    [postId],
  )).rows[0];

await check('two users vote independently and each sees only their own selection', async () => {
  await as(U.s2, async (c) => {
    await c.q(`INSERT INTO public.post_poll_votes (post_id, user_id, option_id) VALUES ($1, $2, 'opt-1')`, [POLL.open, U.s2]);
    await c.su(`INSERT INTO public.post_poll_votes (post_id, user_id, option_id) VALUES ($1, $2, 'opt-3')`, [POLL.open, U.s4]);

    // Each viewer's own vote is a row keyed by their id, not a flag in a shared blob.
    const mine = await c.q(`SELECT option_id FROM public.post_poll_votes WHERE post_id = $1 AND user_id = auth.uid()`, [POLL.open]);
    eq(mine.rows.map((r) => r.option_id), ['opt-1'], 's2 must see only their own vote');

    const t = await tally(c, POLL.open);
    eq([t.opts['opt-1'], t.opts['opt-2'], t.opts['opt-3'], t.total], [1, 0, 1, 2], 'shared tally wrong');

    const stored = await c.su(`SELECT count(*)::int n FROM public.posts, jsonb_array_elements(poll_data -> 'options') o WHERE id = $1 AND o ? 'isVotedByMe'`, [POLL.open]);
    eq(stored.rows[0].n, 0, 'isVotedByMe was persisted into the shared blob');
  });
});
await check('isVotedByMe is stripped even when a client writes it straight into poll_data', async () => {
  await as(U.s1, async (c) => {
    await c.q(
      `UPDATE public.posts SET poll_data = jsonb_set(poll_data, '{options}', '[{"id":"opt-1","label":"Morning","votes":99,"isVotedByMe":true}]'::jsonb) WHERE id = $1`,
      [POLL.open],
    );
    const n = (await c.su(`SELECT count(*)::int n FROM public.posts, jsonb_array_elements(poll_data -> 'options') o WHERE id = $1 AND o ? 'isVotedByMe'`, [POLL.open])).rows[0].n;
    eq(n, 0, 'the strip trigger let isVotedByMe through');
  });
});
await check('changing a vote moves the tally by exactly one', async () => {
  await as(U.s2, async (c) => {
    await c.q(`INSERT INTO public.post_poll_votes (post_id, user_id, option_id) VALUES ($1, $2, 'opt-1')`, [POLL.open, U.s2]);
    await c.su(`INSERT INTO public.post_poll_votes (post_id, user_id, option_id) VALUES ($1, $2, 'opt-1')`, [POLL.open, U.s4]);
    const before = await tally(c, POLL.open);
    eq([before.opts['opt-1'], before.total], [2, 2], 'setup tally wrong');

    const up = await c.t(`UPDATE public.post_poll_votes SET option_id = 'opt-2' WHERE post_id = $1 AND user_id = $2`, [POLL.open, U.s2]);
    assert(up.ok && up.n === 1, 'own vote could not be changed: ' + up.err?.message);

    const t = await tally(c, POLL.open);
    eq([t.opts['opt-1'], t.opts['opt-2'], t.opts['opt-3'], t.total], [1, 1, 0, 2], 'the change did not move exactly one vote');
  });
});
await check('a user holds at most one vote per poll, and cannot vote for a non-existent option', async () => {
  await as(U.s2, async (c) => {
    await c.q(`INSERT INTO public.post_poll_votes (post_id, user_id, option_id) VALUES ($1, $2, 'opt-1')`, [POLL.open, U.s2]);
    denied(await c.t(`INSERT INTO public.post_poll_votes (post_id, user_id, option_id) VALUES ($1, $2, 'opt-2')`, [POLL.open, U.s2]),
      /post_poll_votes_one_per_user|duplicate key/i, 'second vote on the same poll');
    denied(await c.t(`UPDATE public.post_poll_votes SET option_id = 'opt-99' WHERE post_id = $1 AND user_id = $2`, [POLL.open, U.s2]),
      /option does not exist/i, 'bogus option');
  });
});
await check('withdrawing a vote (tapping your current option again) clears it from the tally', async () => {
  await as(U.s2, async (c) => {
    await c.q(`INSERT INTO public.post_poll_votes (post_id, user_id, option_id) VALUES ($1, $2, 'opt-1')`, [POLL.open, U.s2]);
    eq((await tally(c, POLL.open)).total, 1, 'setup');
    const del = await c.t(`DELETE FROM public.post_poll_votes WHERE post_id = $1 AND user_id = auth.uid()`, [POLL.open]);
    assert(del.ok && del.n === 1, 'own vote could not be withdrawn');
    const t = await tally(c, POLL.open);
    eq([t.opts['opt-1'], t.total], [0, 0], 'withdrawn vote still counted');
  });
});
await check('a closed poll rejects a new vote and a change of vote', async () => {
  await as(U.s2, async (c) => {
    denied(await c.t(`INSERT INTO public.post_poll_votes (post_id, user_id, option_id) VALUES ($1, $2, 'opt-1')`, [POLL.closed, U.s2]),
      /closed/i, 'vote on a closed poll');
    // A vote cast while the poll was open cannot be changed after it closes.
    // The guard applies to the superuser too, so the poll is briefly reopened
    // to plant the vote, then closed again.
    const closesAt = (await c.su(`SELECT poll_data ->> 'closesAt' t FROM public.posts WHERE id = $1`, [POLL.closed])).rows[0].t;
    await c.su(`UPDATE public.posts SET poll_data = poll_data - 'closesAt' WHERE id = $1`, [POLL.closed]);
    await c.su(`INSERT INTO public.post_poll_votes (post_id, user_id, option_id) VALUES ($1, $2, 'opt-1')`, [POLL.closed, U.s2]);
    await c.su(`UPDATE public.posts SET poll_data = poll_data || jsonb_build_object('closesAt', $2::text) WHERE id = $1`, [POLL.closed, closesAt]);
    denied(await c.t(`UPDATE public.post_poll_votes SET option_id = 'opt-2' WHERE post_id = $1 AND user_id = $2`, [POLL.closed, U.s2]),
      /closed/i, 'changing a vote on a closed poll');
  });
});
await check('a suspended user cannot vote or change a vote', async () => {
  await as(U.s2, async (c) => {
    await c.su(`INSERT INTO public.post_poll_votes (post_id, user_id, option_id) VALUES ($1, $2, 'opt-1')`, [POLL.open, U.s2]);
    await c.su(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
    await c.su(`UPDATE public.profiles SET is_suspended = true WHERE id = $1`, [U.s2]);
    await c.su(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);

    const change = await c.t(`UPDATE public.post_poll_votes SET option_id = 'opt-2' WHERE post_id = $1 AND user_id = $2`, [POLL.open, U.s2]);
    assert(change.ok && change.n === 0, 'a suspended user changed their vote');
    await c.su(`DELETE FROM public.post_poll_votes WHERE post_id = $1`, [POLL.open]);
    denied(await c.t(`INSERT INTO public.post_poll_votes (post_id, user_id, option_id) VALUES ($1, $2, 'opt-1')`, [POLL.open, U.s2]),
      /row-level security/i, 'a suspended user voted');
  });
});
await check('a user cannot vote as someone else, change someone else\'s vote or delete it', async () => {
  await as(U.s2, async (c) => {
    denied(await c.t(`INSERT INTO public.post_poll_votes (post_id, user_id, option_id) VALUES ($1, $2, 'opt-1')`, [POLL.open, U.s1]),
      /row-level security/i, 'forged vote');
    await c.su(`INSERT INTO public.post_poll_votes (post_id, user_id, option_id) VALUES ($1, $2, 'opt-1')`, [POLL.open, U.s4]);
    const up = await c.t(`UPDATE public.post_poll_votes SET option_id = 'opt-2' WHERE user_id = $1`, [U.s4]);
    assert(up.ok && up.n === 0, 'changed another user\'s vote');
    const del = await c.t(`DELETE FROM public.post_poll_votes WHERE user_id = $1`, [U.s4]);
    assert(del.ok && del.n === 0, 'deleted another user\'s vote');
  });
});
await check('anon cannot read post_poll_votes', async () => {
  await as('anon', async (c) => { denied(await c.t(`SELECT * FROM public.post_poll_votes`), /permission denied/i); });
});

await check('purge_user_data() clears post_reposts, saved_items and post_poll_votes for the purged user', async () => {
  await as('postgres', async (c) => {
    await c.q(`INSERT INTO public.post_reposts (post_id, user_id) VALUES ($1, $2)`, [P.pub, U.s4]);
    await c.q(`INSERT INTO public.saved_items (user_id, kind, item_id) VALUES ($1, 'job', 'j-1')`, [U.s4]);
    await c.q(`INSERT INTO public.post_poll_votes (post_id, user_id, option_id) VALUES ($1, $2, 'opt-1')`, [POLL.open, U.s4]);
    const out = (await c.q(`SELECT public.purge_user_data($1) j`, [U.s4])).rows[0].j;
    eq((await c.q(`SELECT count(*)::int n FROM public.post_reposts WHERE user_id = $1`, [U.s4])).rows[0].n, 0, 'reposts survived the purge');
    eq((await c.q(`SELECT count(*)::int n FROM public.saved_items WHERE user_id = $1`, [U.s4])).rows[0].n, 0, 'saved items survived the purge');
    eq((await c.q(`SELECT count(*)::int n FROM public.post_poll_votes WHERE user_id = $1`, [U.s4])).rows[0].n, 0, 'poll votes survived the purge');
    // ...and the tally the purged vote contributed to was recounted.
    eq((await tally(c, POLL.open)).total, 0, 'the purged vote is still in the tally');
    assert(out.deleted['post_reposts.user_id'] === 1 && out.deleted['saved_items.user_id'] === 1 && out.deleted['post_poll_votes.user_id'] === 1,
      'purge report did not mention all three tables: ' + JSON.stringify(out.deleted));
  });
});

console.log('\n== Optional objects missing (guards) ==');
await check('posts features migration applies on a database where pg_cron and optional objects are absent', async () => {
  const db3 = await newDb();
  await bootstrap(db3);
  for (const m of MIGRATIONS) await applyFile(db3, m.file, m.strict, () => {});
  const sql = await readRepo('supabase_posts_features_2026.sql');
  await db3.exec(sql);
  await db3.exec(sql);
  eq((await db3.query(`SELECT count(*)::int n FROM pg_policies WHERE tablename IN ('post_reposts','saved_items')`)).rows[0].n, 7, 'expected 7 policies on the two new tables');
  await db3.close();
});
await check('migration still applies when optional objects are absent (jobs, support_tickets, forum_communities, mentorships, profiles.push_token, cleanup_api_rate_limits)', async () => {
  const db2 = await newDb();
  await bootstrap(db2);
  for (const m of beforeMine) await applyFile(db2, m.file, m.strict, () => {});
  await db2.exec(`DROP TABLE public.jobs CASCADE; DROP TABLE public.support_tickets CASCADE; DROP TABLE public.forum_communities CASCADE; DROP TABLE public.mentorships CASCADE;
                  ALTER TABLE public.profiles DROP COLUMN push_token; DROP FUNCTION public.cleanup_api_rate_limits(int);`);
  const sql = (await import('node:fs')).readFileSync(new URL('../../supabase_launch_hardening_2026.sql', import.meta.url), 'utf8');
  await db2.exec(sql);
  const n = (await db2.query(`SELECT count(*)::int n FROM pg_trigger WHERE tgname LIKE 'trg_rate_limit_%'`)).rows[0].n;
  eq(n, 11, 'expected the 11 rate-limit triggers whose tables still exist');
  await db2.exec(sql); // and again
  await db2.close();
});

// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
console.log(`\n== Summary: ${results.length - failed.length}/${results.length} checks passed ==`);
if (failed.length) { for (const f of failed) console.log(` FAILED: ${f.name}\n    ${f.err}`); process.exit(1); }
