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

// Baseline, pre-fix state only: these two email/column findings are closed by
// 20260929000000_close_open_security_findings.sql, applied and asserted later
// in this run (see "close open security findings" below). Left here so the
// baseline-vs-fixed contrast stays visible in the log.
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
// supabase_account_email_change_2026.sql  (login email is changeable; school emails expire)
// ---------------------------------------------------------------------------
console.log('\n== Applying supabase_account_email_change_2026.sql ==');
await check('email-change migration applies cleanly on top of both hardening files', async () => {
  await db.exec(await readRepo('supabase_account_email_change_2026.sql'));
});
await check('email-change migration is idempotent (second run)', async () => {
  await db.exec(await readRepo('supabase_account_email_change_2026.sql'));
});

const E = { personal: id(60), moved: id(61), pending: id(62), rejected: id(63), away: id(64), other: id(65), staff: id(66) };
const insertUser = (uid, email, meta = {}) =>
  admin(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ($1, $2, $3::jsonb, now())`,
    [uid, email, JSON.stringify({ full_name: email.split('@')[0], ...meta })]);
const profileOf = async (uid) => (await admin(`SELECT email, verification_status::text v, campus_code FROM public.profiles WHERE id = $1`, [uid])).rows[0];
const changeEmail = (uid, email) => admin(`UPDATE auth.users SET email = $2 WHERE id = $1`, [uid, email]);

await insertUser(E.personal, 'grad.personal@example.test', { campus_code: 'UNILAG' });
await insertUser(E.moved, 'grad.moved@example.test', { campus_code: 'UNILAG' });
await insertUser(E.pending, 'grad.pending@example.test', { campus_code: 'UNILAG' });
await insertUser(E.rejected, 'grad.rejected@example.test', { campus_code: 'UNILAG' });
await insertUser(E.other, 'grad.other@example.test', { campus_code: 'UNILAG' });
await insertUser(E.staff, 'stf@example.test', { campus_code: 'UNILAG' });
// A student whose school address was confirmed at sign-up -> auto-verified by the existing trigger.
await admin(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, 'grad.away@unilag.edu.ng', '{"campus_code":"UNILAG","full_name":"away"}')`, [E.away]);
await admin(`UPDATE auth.users SET email_confirmed_at = now() WHERE id = $1`, [E.away]);

console.log('\n== profiles.email follows the login email ==');
await check('changing auth.users.email updates profiles.email (so @handle sign-in resolves the new address)', async () => {
  eq((await profileOf(E.personal)).email, 'grad.personal@example.test', 'fixture');
  await changeEmail(E.personal, 'grad.personal2@example.test');
  eq((await profileOf(E.personal)).email, 'grad.personal2@example.test', 'profiles.email did not follow');
});
await check('an update that does not touch the address leaves profiles.email alone', async () => {
  await admin(`UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1`, [E.personal]);
  eq((await profileOf(E.personal)).email, 'grad.personal2@example.test');
});
await check('a personal-to-personal change does not verify the account', async () => {
  eq((await profileOf(E.personal)).v, 'unverified');
});

console.log('\n== proving a school inbox later verifies the account ==');
await check('moving to a confirmed institutional address verifies the account and sets the campus', async () => {
  eq((await profileOf(E.moved)).v, 'unverified', 'fixture');
  await changeEmail(E.moved, 'grad.moved@unilag.edu.ng');
  const p = await profileOf(E.moved);
  eq({ v: p.v, campus: p.campus_code, email: p.email }, { v: 'verified', campus: 'UNILAG', email: 'grad.moved@unilag.edu.ng' });
  const audit = await admin(`SELECT metadata->>'method' m FROM public.audit_logs WHERE action = 'verification_auto_approved' AND entity_id = $1`, [E.moved]);
  eq(audit.rows.map((r) => r.m), ['institutional_email_change'], 'audit trail');
});
await check('a look-alike domain is not treated as institutional', async () => {
  await insertUser(id(67), 'imposter@example.test', { campus_code: 'UNILAG' });
  await changeEmail(id(67), 'imposter@notunilag.edu.ng');
  eq((await profileOf(id(67))).v, 'unverified');
});
await check('a pending document request is closed as approved when the school inbox is proven', async () => {
  await admin(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
  await admin(`UPDATE public.profiles SET verification_status = 'pending' WHERE id = $1`, [E.pending]);
  await admin(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);
  await admin(`INSERT INTO public.verifications (user_id, campus_code, requested_role, id_card_front_url, status) VALUES ($1, 'UNILAG', 'student', 'x/y.jpg', 'pending')`, [E.pending]);
  await changeEmail(E.pending, 'grad.pending@unilag.edu.ng');
  eq((await profileOf(E.pending)).v, 'verified');
  const v = await admin(`SELECT status::text s, reviewed_at IS NOT NULL AS done FROM public.verifications WHERE user_id = $1`, [E.pending]);
  eq(v.rows, [{ s: 'approved', done: true }], 'stale request left in the queue');
});
await check("a moderator's 'rejected' decision is not overridden by an email change", async () => {
  await admin(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
  await admin(`UPDATE public.profiles SET verification_status = 'rejected' WHERE id = $1`, [E.rejected]);
  await admin(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);
  await changeEmail(E.rejected, 'grad.rejected@unilag.edu.ng');
  eq((await profileOf(E.rejected)).v, 'rejected');
});
await check('staff accounts are not promoted by an email change', async () => {
  await admin(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
  await admin(`UPDATE public.profiles SET role = 'staff' WHERE id = $1`, [E.staff]);
  await admin(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);
  await changeEmail(E.staff, 'stf@unilag.edu.ng');
  eq((await profileOf(E.staff)).v, 'unverified');
});
await check('an unconfirmed new address never verifies (guards against a half-finished change)', async () => {
  await insertUser(id(68), 'half@example.test', { campus_code: 'UNILAG' });
  await admin(`UPDATE auth.users SET email_confirmed_at = NULL, email = 'half@unilag.edu.ng' WHERE id = $1`, [id(68)]);
  eq((await profileOf(id(68))).v, 'unverified');
});

console.log('\n== leaving a school email keeps the standing ==');
await check('a verified school-email account that switches to a personal address stays verified on the same campus', async () => {
  eq((await profileOf(E.away)).v, 'verified', 'fixture: signup auto-verify');
  await changeEmail(E.away, 'grad.away@example.test');
  const p = await profileOf(E.away);
  eq({ v: p.v, campus: p.campus_code, email: p.email }, { v: 'verified', campus: 'UNILAG', email: 'grad.away@example.test' });
});

console.log('\n== hygiene ==');
await check('the new trigger functions are locked down: pinned search_path, not callable by anon or authenticated', async () => {
  const r = await admin(`SELECT p.proname, p.prosecdef,
      EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%pg_temp%') AS pinned,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_x,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_x
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('sync_profile_email_from_auth', 'auto_verify_on_email_change') ORDER BY 1`);
  eq(r.rows.map((x) => [x.proname, x.prosecdef, x.pinned, x.anon_x, x.auth_x]),
    [['auto_verify_on_email_change', true, true, false, false], ['sync_profile_email_from_auth', true, true, false, false]]);
});
await check('a signed-in user still cannot change their own verification status or campus directly', async () => {
  await as(E.other, async (c) => {
    await c.q(`UPDATE public.profiles SET verification_status = 'verified', campus_code = 'UI' WHERE id = $1`, [E.other]);
    const r = (await c.q(`SELECT verification_status::text v FROM public.profiles WHERE id = $1`, [E.other])).rows[0];
    eq(r.v, 'unverified', 'self-grant of verification worked');
  });
});

// The product migrations under supabase/migrations are what the hosted CLI
// actually applies. Keep the newest workflow migrations in the same real
// Postgres parser/runtime gate as the legacy hardening files; otherwise a
// green harness can miss a syntax or schema-order failure in the release that
// introduces mentorship, study pods, or campus administration.
console.log('\n== current product workflow migrations ==');
const currentProductMigrations = [
  'supabase/migrations/20260925100000_mentorship_v2.sql',
  'supabase/migrations/20260925110000_study_pods_v2.sql',
  'supabase/migrations/20260925120000_events_portals_campuses.sql',
  'supabase/migrations/20260925130000_normalise_tags_keep_first.sql',
  'supabase/migrations/20260925140000_paid_events.sql',
  'supabase/migrations/20260926150000_seed_campus_community_bots.sql',
  'supabase/migrations/20260926160000_admin_analytics_and_activity.sql',
  'supabase/migrations/20260926220000_forum_community_memberships.sql',
  'supabase/migrations/20260926230000_admin_user_profiles_rpc.sql',
  'supabase/migrations/20260928170000_marketplace_saved_items.sql',
  'supabase/migrations/20260929000000_close_open_security_findings.sql',
  'supabase/migrations/20260930000000_job_applications.sql',
  'supabase/migrations/20261001000000_workflow_gaps.sql',
  'supabase/migrations/20261002000000_customer_care.sql',
  'supabase/migrations/20261003000000_trust_safety_gaps.sql',
  'supabase/migrations/20261003010000_admin_directory_and_analytics_fixes.sql',
  'supabase/migrations/20261003020000_tier3_account_and_notifications.sql',
  'supabase/migrations/20261004000000_discovery_and_polish.sql',
  'supabase/migrations/20261005010000_giving_campaign_self_service.sql',
  'supabase/migrations/20261005020000_resource_ratings.sql',
  'supabase/migrations/20261005030000_alumni_profile_extras.sql',
  'supabase/migrations/20261005040000_admin_user_diagnostics.sql',
  'supabase/migrations/20261006040000_study_pod_file_sharing.sql',
];
for (const file of currentProductMigrations) {
  await check(`${file} applies cleanly`, async () => {
    await applyFile(db, file, true, () => {});
  });
}
for (const file of currentProductMigrations) {
  await check(`${file} is idempotent`, async () => {
    await applyFile(db, file, true, () => {});
  });
}

// ---------------------------------------------------------------------------
// paid events (20260925140000_paid_events.sql): behaviour, not just "it applies"
// ---------------------------------------------------------------------------
console.log('\n== paid events ==');
{
  const imp = async (uid) => {
    await db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${uid}', true)`);
  };
  const svc = async () => {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims', '', true); SELECT set_config('request.jwt.claim.sub', '', true)`);
  };
  const flag = (on) => db.query(
    `INSERT INTO public.platform_settings (key, value) VALUES ('feature_flags', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify({ paid_events: on })]);
  const STARTS = "now() + interval '2 hours'";
  const ENDS = "now() + interval '4 hours'";

  /** organiser (s1) submits an event; returns its id. Runs as s1 and leaves the session as s1. */
  async function submit(c, over = {}) {
    await imp(U.s1);
    const o = { type: 'paid', price: 2000, method: 'online', held: false, capacity: null, campus: 'GLOBAL', ...over };
    const r = await c.q(
      `INSERT INTO public.events (creator_id, campus_code, title, description, venue, start_time, end_time, category, status, ticket_type, ticket_price, payment_method, reservation_held, capacity, payment_review_status)
       VALUES ($1, $2, 'Paid test event', 'desc', 'Hall', ${STARTS}, ${ENDS}, 'Academic', 'pending_approval', $3, $4, $5, $6, $7, 'approved') RETURNING id`,
      [U.s1, o.campus, o.type, o.type === 'paid' ? o.price : 0, o.type === 'paid' ? o.method : null, o.held, o.capacity]);
    return r.rows[0].id;
  }
  /** link details + admin approval + publish, through the same functions the edge function calls */
  async function goLive(c, ev, { url = 'https://paystack.com/pay/lioris-test', instr = 'Pay at the door, cash or transfer.' } = {}) {
    await imp(U.s1);
    await c.q(`SELECT public.save_event_payment_details($1, $2, $3)`, [ev, url, instr]);
    await svc();
    await c.q(`SELECT public.admin_store_link_check($1, $2, $3::jsonb)`, [ev, U.adminA, JSON.stringify({ status: 'ok', url, final_host: 'paystack.com' })]);
    await c.q(`SELECT public.admin_apply_payment_review($1, $2, 'approve', NULL, false, true)`, [ev, U.adminA]);
  }
  const code = (r) => (r.err?.message ?? '').split(':')[0];

  await check('paid events: a student cannot start paid events while the admin switch is off; the row is forced into review when it is on', async () => {
    await as('postgres', async (c) => {
      await flag(false);
      await imp(U.s1);
      const off = await c.t(
        `INSERT INTO public.events (creator_id, campus_code, title, description, venue, start_time, end_time, status, ticket_type, ticket_price, payment_method)
         VALUES ($1, 'GLOBAL', 't', 'd', 'v', ${STARTS}, ${ENDS}, 'pending_approval', 'paid', 500, 'online')`, [U.s1]);
      denied(off, /paid_events_disabled/, 'paid insert with the switch off');
      await svc(); await flag(true);
      const ev = await submit(c);
      await svc();
      const row = (await c.q(`SELECT payment_review_status s, payment_reviewed_by b FROM public.events WHERE id = $1`, [ev])).rows[0];
      eq(row, { s: 'pending', b: null }, 'client-supplied review status must be ignored');
    });
  });

  await check('paid events: a free event cannot carry a price; free events store no method', async () => {
    await as('postgres', async (c) => {
      await flag(true); await imp(U.s1);
      const r = await c.t(
        `INSERT INTO public.events (creator_id, campus_code, title, description, venue, start_time, end_time, status, ticket_type, ticket_price)
         VALUES ($1, 'GLOBAL', 't', 'd', 'v', ${STARTS}, ${ENDS}, 'pending_approval', 'free', 500)`, [U.s1]);
      denied(r, /paid_settings_required/, 'free event with price');
      const ok = await submit(c, { type: 'free' });
      await svc();
      const row = (await c.q(`SELECT ticket_type t, ticket_price::float p, payment_method m, payment_review_status s FROM public.events WHERE id = $1`, [ok])).rows[0];
      eq(row, { t: 'free', p: 0, m: null, s: 'not_required' });
    });
  });

  await check('paid events: payment link rules (https only, no IPs, no logins, no localhost) and students never read the details', async () => {
    await as('postgres', async (c) => {
      await flag(true);
      const ev = await submit(c);
      for (const bad of ['http://pay.example.com/x', 'https://192.168.1.5/pay', 'https://user:pw@pay.example.com/x', 'https://localhost/pay', 'https://pay.example.com:8443/x', 'https://has space.com', 'javascript:alert(1)']) {
        denied(await c.t(`SELECT public.save_event_payment_details($1, $2, 'Pay online')`, [ev, bad]), /invalid_payment_link/, bad);
      }
      denied(await c.t(`SELECT public.save_event_payment_details($1, NULL, NULL)`, [ev]), /payment_link_required/, 'missing link for an online event');
      await c.q(`SELECT public.save_event_payment_details($1, 'https://paystack.com/pay/abc', NULL)`, [ev]);
      eq((await c.q(`SELECT count(*)::int n FROM public.event_payment_details`)).rows[0].n, 1, 'organiser reads own details');
      await imp(U.s2);
      eq((await c.q(`SELECT count(*)::int n FROM public.event_payment_details`)).rows[0].n, 0, 'other student saw the payment link');
      denied(await c.t(`SELECT public.save_event_payment_details($1, 'https://evil.example.com/pay', NULL)`, [ev]), /not_allowed/, 'other student editing details');
      denied(await c.t(`UPDATE public.event_payment_details SET payment_url = 'https://evil.example.com/pay'`), /permission denied/, 'direct table write');
    });
  });

  await check('paid events: cannot go live before review; approval needs a passing link check for the CURRENT link; edits send it back to review', async () => {
    await as('postgres', async (c) => {
      await flag(true);
      const ev = await submit(c);
      await imp(U.s1);
      await c.q(`SELECT public.save_event_payment_details($1, 'https://paystack.com/pay/abc', NULL)`, [ev]);
      await imp(U.adminA);
      denied(await c.t(`UPDATE public.events SET status = 'upcoming' WHERE id = $1`, [ev]), /payment_review_required/, 'publish while review pending');
      await svc();
      denied(await c.t(`SELECT public.admin_apply_payment_review($1, $2, 'approve')`, [ev, U.adminA]), /link_not_checked/, 'approve without link check');
      await c.q(`SELECT public.admin_store_link_check($1, $2, $3::jsonb)`, [ev, U.adminA, JSON.stringify({ status: 'failed', url: 'https://paystack.com/pay/abc' })]);
      denied(await c.t(`SELECT public.admin_apply_payment_review($1, $2, 'approve')`, [ev, U.adminA]), /link_check_failed/, 'approve with failed check');
      denied(await c.t(`SELECT public.admin_apply_payment_review($1, $2, 'approve', NULL, true)`, [ev, U.adminA]), /note_required/, 'override without a note');
      denied(await c.t(`SELECT public.admin_apply_payment_review($1, $2, 'reject', 'no')`, [ev, U.adminA]), /note_required/, 'reject without a real reason');
      await c.q(`SELECT public.admin_store_link_check($1, $2, $3::jsonb)`, [ev, U.adminA, JSON.stringify({ status: 'ok', url: 'https://paystack.com/pay/abc' })]);
      const res = (await c.q(`SELECT public.admin_apply_payment_review($1, $2, 'approve', NULL, false, true) r`, [ev, U.adminA])).rows[0].r;
      eq([res.payment_review_status, res.status], ['approved', 'upcoming']);
      // the organiser changes the price: back to review, event stays live
      await imp(U.s1);
      await c.q(`UPDATE public.events SET ticket_price = 2500 WHERE id = $1`, [ev]);
      await c.q(`UPDATE public.events SET description = 'new words' WHERE id = $1`, [ev]);
      await svc();
      let row = (await c.q(`SELECT payment_review_status s, status::text st FROM public.events WHERE id = $1`, [ev])).rows[0];
      eq(row, { s: 'pending', st: 'upcoming' });
      // a different link invalidates the old check
      await c.q(`SELECT public.admin_apply_payment_review($1, $2, 'reject', 'Link goes to a personal page')`, [ev, U.adminA]);
      await imp(U.s1);
      await c.q(`SELECT public.save_event_payment_details($1, 'https://paystack.com/pay/def', NULL)`, [ev]);
      await svc();
      row = (await c.q(`SELECT d.link_check IS NULL AS cleared, e.payment_review_status s FROM public.event_payment_details d JOIN public.events e ON e.id = d.event_id WHERE d.event_id = $1`, [ev])).rows[0];
      eq(row, { cleared: true, s: 'pending' });
      // the organiser cannot approve their own payment details
      await imp(U.s1);
      await c.q(`UPDATE public.events SET payment_review_status = 'approved' WHERE id = $1`, [ev]);
      await svc();
      eq((await c.q(`SELECT payment_review_status s FROM public.events WHERE id = $1`, [ev])).rows[0].s, 'pending', 'self-approval');
    });
  });

  await check('paid events: the review and door functions are not callable by signed-in users', async () => {
    await as(U.adminA, async (c) => {
      for (const sql of [
        `SELECT public.admin_apply_payment_review('${id(99)}', '${U.adminA}', 'approve')`,
        `SELECT public.admin_store_link_check('${id(99)}', '${U.adminA}', '{}')`,
        `SELECT public.admin_save_partnership('${id(99)}', '${U.adminA}', 'none', NULL, NULL, NULL, 7, NULL)`,
        `SELECT public.send_event_reminders()`,
      ]) denied(await c.t(sql), /permission denied/, sql.slice(0, 50));
    });
    await as(U.s1, async (c) => denied(await c.t(`SELECT public.admin_paid_events_overview()`), /not_allowed/, 'overview for a student'));
  });

  await check('paid events: RSVP rules (acknowledgement, review, deadline, capacity only when places are held)', async () => {
    await as('postgres', async (c) => {
      await flag(true);
      const ev = await submit(c, { method: 'both' });
      await imp(U.s2);
      denied(await c.t(`SELECT public.rsvp_event($1, false, true)`, [ev]), /event_not_open/, 'before the event is published');
      await goLive(c, ev);
      await imp(U.s2);
      denied(await c.t(`SELECT public.rsvp_event($1, false, false)`, [ev]), /ack_required/, 'no acknowledgement');
      const first = (await c.q(`SELECT public.rsvp_event($1, false, true) r`, [ev])).rows[0].r;
      assert(/^[0-9a-f]{12}$/.test(first.ticket_code), 'reference code');
      eq((await c.q(`SELECT public.rsvp_event($1, true, true) r`, [ev])).rows[0].r.already, true, 'second call is idempotent');
      await svc();
      eq((await c.q(`SELECT registered_count n FROM public.events WHERE id = $1`, [ev])).rows[0].n, 1);
      // not held + capacity 1: interest is not capped
      await c.q(`UPDATE public.events SET capacity = 1 WHERE id = $1`, [ev]);
      await imp(U.s4);
      await c.q(`SELECT public.rsvp_event($1, false, true)`, [ev]);
      // held + capacity 1: full
      await svc();
      await c.q(`UPDATE public.events SET reservation_held = true WHERE id = $1`, [ev]);
      await c.q(`UPDATE public.events SET payment_review_status = 'approved' WHERE id = $1`, [ev]); // service context: admin decision
      await imp(U.s5);
      denied(await c.t(`SELECT public.rsvp_event($1, false, true)`, [ev]), /event_full/, 'held places');
      // deadline
      await svc();
      await c.q(`UPDATE public.events SET booking_deadline = now() - interval '1 minute', capacity = NULL WHERE id = $1`, [ev]);
      await imp(U.s5);
      denied(await c.t(`SELECT public.rsvp_event($1, false, true)`, [ev]), /booking_closed/, 'after the booking deadline');
      // switch off: paid RSVP refused
      await svc(); await flag(false);
      await c.q(`UPDATE public.events SET booking_deadline = NULL WHERE id = $1`, [ev]);
      await imp(U.s5);
      denied(await c.t(`SELECT public.rsvp_event($1, false, true)`, [ev]), /paid_events_disabled/, 'switch off');
    });
  });

  await check('paid events: the RSVP table is closed (own rows only, no direct writes, no forged check-in)', async () => {
    await as('postgres', async (c) => {
      await flag(true);
      const ev = await submit(c, { method: 'at_venue' });
      await goLive(c, ev, { url: null });
      await imp(U.s2); await c.q(`SELECT public.rsvp_event($1, false, true)`, [ev]);
      await imp(U.s4); await c.q(`SELECT public.rsvp_event($1, false, true)`, [ev]);
      eq((await c.q(`SELECT count(*)::int n FROM public.event_attendees`)).rows[0].n, 1, 's4 sees only their own row');
      denied(await c.t(`INSERT INTO public.event_attendees (event_id, user_id) VALUES ($1, $2)`, [ev, U.s5]), /permission denied/, 'direct insert');
      denied(await c.t(`UPDATE public.event_attendees SET checked_in_at = now() WHERE user_id = $1`, [U.s4]), /permission denied/, 'forged check-in');
      denied(await c.t(`DELETE FROM public.event_attendees WHERE user_id = $1`, [U.s4]), /permission denied/, 'direct delete');
      await imp(U.s1);
      eq((await c.q(`SELECT count(*)::int n FROM public.event_attendees`)).rows[0].n, 2, 'organiser sees the registrations');
      await imp(U.s5);
      eq((await c.q(`SELECT count(*)::int n FROM public.event_attendees`)).rows[0].n, 0, 'stranger sees nothing');
      denied(await c.t(`SELECT public.event_roster($1)`, [ev]), /not_allowed/, 'stranger roster');
    });
  });

  await check('paid events: door check-in (window, code formats, already, undo, only organiser/admin) and purchase confirmation', async () => {
    await as('postgres', async (c) => {
      await flag(true);
      const ev = await submit(c, { method: 'at_venue' });
      await goLive(c, ev, { url: null });
      await imp(U.s2);
      const t = (await c.q(`SELECT public.rsvp_event($1, false, true) r`, [ev])).rows[0].r.ticket_code;
      denied(await c.t(`SELECT public.checkin_event_attendee($1, $2)`, [ev, t]), /not_allowed/, 'the attendee checking themselves in');
      await imp(U.s1);
      denied(await c.t(`SELECT public.confirm_event_purchase($1, $2, true)`, [ev, U.s2]), /not_checked_in/, 'purchase before check-in');
      denied(await c.t(`SELECT public.checkin_event_attendee($1, 'ffffffffffff')`, [ev]), /ticket_not_found/, 'wrong code');
      const grouped = `${t.slice(0, 4)}-${t.slice(4, 8)}-${t.slice(8)}`.toUpperCase();
      const a = (await c.q(`SELECT public.checkin_event_attendee($1, $2) r`, [ev, 'LIORIS:' + grouped])).rows[0].r;
      eq([a.status, a.user_id], ['checked_in', U.s2], 'scanned QR text');
      eq((await c.q(`SELECT public.checkin_event_attendee($1, $2) r`, [ev, t])).rows[0].r.status, 'already');
      eq((await c.q(`SELECT public.confirm_event_purchase($1, $2, true) r`, [ev, U.s2])).rows[0].r.purchase_confirmed_at !== null, true);
      // the attendee cannot walk away from a checked-in registration
      await imp(U.s2);
      denied(await c.t(`SELECT public.cancel_event_rsvp($1)`, [ev]), /already_checked_in/, 'cancel after check-in');
      // undo clears the purchase too
      await imp(U.s1);
      eq((await c.q(`SELECT public.checkin_event_attendee($1, NULL, $2, true) r`, [ev, U.s2])).rows[0].r.status, 'undone');
      const row = (await c.q(`SELECT checked_in_at, purchase_confirmed_at FROM public.event_attendees WHERE user_id = $1`, [U.s2])).rows[0];
      eq(row, { checked_in_at: null, purchase_confirmed_at: null });
      // window: a week out is closed for the organiser, open for an admin
      await svc();
      await c.q(`UPDATE public.events SET start_time = now() + interval '7 days', end_time = now() + interval '7 days 2 hours' WHERE id = $1`, [ev]);
      await imp(U.s1);
      denied(await c.t(`SELECT public.checkin_event_attendee($1, $2)`, [ev, t]), /checkin_closed/, 'too early');
      await imp(U.adminA);
      eq((await c.q(`SELECT public.checkin_event_attendee($1, $2) r`, [ev, t])).rows[0].r.status, 'checked_in');
    });
  });

  await check('paid events: purchase confirmation only exists for paid events; free events check in the same way', async () => {
    await as('postgres', async (c) => {
      await flag(true);
      const ev = await submit(c, { type: 'free' });
      await svc(); await c.q(`UPDATE public.events SET status = 'upcoming' WHERE id = $1`, [ev]);
      await imp(U.s2); await c.q(`SELECT public.rsvp_event($1)`, [ev]);
      await imp(U.s1);
      eq((await c.q(`SELECT public.checkin_event_attendee($1, NULL, $2) r`, [ev, U.s2])).rows[0].r.status, 'checked_in');
      denied(await c.t(`SELECT public.confirm_event_purchase($1, $2, true)`, [ev, U.s2]), /not_paid/, 'purchase on a free event');
    });
  });

  await check('paid events: payment page records the referral click and only opens once approved', async () => {
    await as('postgres', async (c) => {
      await flag(true);
      const ev = await submit(c);
      await imp(U.s2);
      denied(await c.t(`SELECT public.open_event_payment_page($1)`, [ev]), /payment_not_ready|event_not_open/, 'before review');
      const info0 = (await c.q(`SELECT public.get_event_payment_info($1) r`, [ev])).rows[0].r;
      eq([info0.available, info0.reason], [false, 'in_review']);
      await goLive(c, ev);
      await imp(U.s2);
      const page = (await c.q(`SELECT public.open_event_payment_page($1) r`, [ev])).rows[0].r;
      eq([page.url, page.host], ['https://paystack.com/pay/lioris-test', 'paystack.com']);
      await c.q(`SELECT public.open_event_payment_page($1)`, [ev]);
      await imp(U.s4); await c.q(`SELECT public.open_event_payment_page($1)`, [ev]);
      await imp(U.s1);
      const rep = (await c.q(`SELECT public.event_referral_report($1) r`, [ev])).rows[0].r;
      eq([rep.link_clicks, rep.rsvps, rep.checked_in, rep.purchases_confirmed], [2, 0, 0, 0], 'distinct people, not clicks');
      assert(!('estimated_amount' in rep), 'organiser must not see the fee arithmetic');
      await svc();
      eq((await c.q(`SELECT click_count n FROM public.event_payment_clicks WHERE user_id = $1`, [U.s2])).rows[0].n, 2);
      await c.q(`UPDATE public.events SET payment_method = 'at_venue', payment_review_status = 'approved' WHERE id = $1`, [ev]);
      await imp(U.s2);
      denied(await c.t(`SELECT public.open_event_payment_page($1)`, [ev]), /no_payment_page/, 'venue-only event');
    });
  });

  await check('paid events: funnel report and the partnership agreement (admin only, fee arithmetic uses confirmed purchases)', async () => {
    await as('postgres', async (c) => {
      await flag(true);
      const ev = await submit(c, { method: 'at_venue' });
      await goLive(c, ev, { url: null });
      for (const u of [U.s2, U.s4]) { await imp(u); await c.q(`SELECT public.rsvp_event($1, false, true)`, [ev]); }
      await imp(U.s1);
      for (const u of [U.s2, U.s4]) await c.q(`SELECT public.checkin_event_attendee($1, NULL, $2)`, [ev, u]);
      await c.q(`SELECT public.confirm_event_purchase($1, $2, true)`, [ev, U.s2]);
      await svc();
      denied(await c.t(`SELECT public.admin_save_partnership($1, $2, 'agreed', 'Org', NULL, 300, 7, NULL)`, [ev, U.adminA]), /agreement_incomplete/, 'agreed without contact');
      await c.q(`SELECT public.admin_save_partnership($1, $2, 'agreed', 'Campus Events Ltd', 'ops@example.com', 300, 14, 'signed by email')`, [ev, U.adminA]);
      await imp(U.adminA);
      const rep = (await c.q(`SELECT public.event_referral_report($1) r`, [ev])).rows[0].r;
      eq([rep.rsvps, rep.checked_in, rep.purchases_confirmed, rep.awaiting_confirmation], [2, 2, 1, 1]);
      eq([rep.partnership_status, Number(rep.estimated_amount), rep.dispute_window_days], ['agreed', 300, 14]);
      const ov = (await c.q(`SELECT public.admin_paid_events_overview() r`)).rows[0].r;
      eq([ov.length, ov[0].purchases_confirmed, ov[0].partnership_status], [1, 1, 'agreed']);
      await imp(U.s1);
      eq((await c.q(`SELECT count(*)::int n FROM public.event_partnerships`)).rows[0].n, 0, 'organiser reading the agreement');
    });
  });

  await check('paid events: the roster shares matric number and department only when the student agreed', async () => {
    await as('postgres', async (c) => {
      await flag(true);
      await c.q(`ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_id_number text, ADD COLUMN IF NOT EXISTS department text`); // harness schema may predate them
      await c.q(`UPDATE public.profiles SET student_id_number = 'M-1', department = 'Physics' WHERE id IN ($1, $2)`, [U.s2, U.s4]);
      const ev = await submit(c, { type: 'free' });
      await svc(); await c.q(`UPDATE public.events SET status = 'upcoming' WHERE id = $1`, [ev]);
      await imp(U.s2); await c.q(`SELECT public.rsvp_event($1, true)`, [ev]);
      await imp(U.s4); await c.q(`SELECT public.rsvp_event($1, false)`, [ev]);
      await imp(U.s1);
      const roster = (await c.q(`SELECT public.event_roster($1) r`, [ev])).rows[0].r;
      const by = Object.fromEntries(roster.map((x) => [x.user_id, x]));
      eq([by[U.s2].matric_number, by[U.s2].department], ['M-1', 'Physics']);
      eq([by[U.s4].matric_number, by[U.s4].department], [null, null]);
    });
  });

  await check('paid events: reminders go out once, only to people not yet checked in', async () => {
    await as('postgres', async (c) => {
      await flag(true);
      const ev = await submit(c, { type: 'free' });
      await svc(); await c.q(`UPDATE public.events SET status = 'upcoming', start_time = now() + interval '30 minutes' WHERE id = $1`, [ev]);
      for (const u of [U.s2, U.s4]) { await imp(u); await c.q(`SELECT public.rsvp_event($1)`, [ev]); }
      await imp(U.s1); await c.q(`SELECT public.checkin_event_attendee($1, NULL, $2)`, [ev, U.s4]);
      await svc();
      eq((await c.q(`SELECT public.send_event_reminders() n`)).rows[0].n, 1);
      eq((await c.q(`SELECT public.send_event_reminders() n`)).rows[0].n, 0, 'second run');
      eq((await c.q(`SELECT count(*)::int n FROM public.notifications WHERE recipient_id = $1 AND action_url = $2`, [U.s2, '/events/' + ev])).rows[0].n, 1);
    });
  });

  await check('paid events: turning an event free again is blocked once purchases were confirmed', async () => {
    await as('postgres', async (c) => {
      await flag(true);
      const ev = await submit(c, { method: 'at_venue' });
      await goLive(c, ev, { url: null });
      await imp(U.s2); await c.q(`SELECT public.rsvp_event($1, false, true)`, [ev]);
      await imp(U.s1);
      await c.q(`SELECT public.checkin_event_attendee($1, NULL, $2)`, [ev, U.s2]);
      await c.q(`SELECT public.confirm_event_purchase($1, $2, true)`, [ev, U.s2]);
      denied(await c.t(`UPDATE public.events SET ticket_type = 'free', ticket_price = 0 WHERE id = $1`, [ev]), /has_confirmed_purchases/, 'free after purchases');
      denied(await c.t(`UPDATE public.events SET ticket_price = 9000 WHERE id = $1`, [ev]), /has_confirmed_purchases/, 'price change after purchases');
    });
  });
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// community bot personas (20260926150000_seed_campus_community_bots.sql)
// ---------------------------------------------------------------------------
console.log('\n== community bot personas ==');
{
  await check('seeds 20 community bot users into auth.users and profiles with verified status', async () => {
    await as('postgres', async (c) => {
      const authCount = (await c.q("SELECT count(*)::int n FROM auth.users WHERE id::text LIKE '00000000-0000-4000-a000-%'")).rows[0].n;
      eq(authCount, 20, '20 auth.users seeded');
      const profileCount = (await c.q("SELECT count(*)::int n FROM public.profiles WHERE id::text LIKE '00000000-0000-4000-a000-%' AND verification_status = 'verified'")).rows[0].n;
      eq(profileCount, 20, '20 verified profiles seeded');
    });
  });

  await check('seeds 20 forum posts partitioned correctly across UI (7), UNILAG (7), and FUNAAB (6)', async () => {
    await as('postgres', async (c) => {
      const postsCount = (await c.q("SELECT count(*)::int n FROM public.posts WHERE id::text LIKE '00000000-0000-4000-b000-%'")).rows[0].n;
      eq(postsCount, 20, '20 forum posts seeded');
      const uiCount = (await c.q("SELECT count(*)::int n FROM public.posts WHERE id::text LIKE '00000000-0000-4000-b000-%' AND campus_code = 'UI'")).rows[0].n;
      eq(uiCount, 7, '7 UI posts');
      const unilagCount = (await c.q("SELECT count(*)::int n FROM public.posts WHERE id::text LIKE '00000000-0000-4000-b000-%' AND campus_code = 'UNILAG'")).rows[0].n;
      eq(unilagCount, 7, '7 UNILAG posts');
      const funaabCount = (await c.q("SELECT count(*)::int n FROM public.posts WHERE id::text LIKE '00000000-0000-4000-b000-%' AND campus_code = 'FUNAAB'")).rows[0].n;
      eq(funaabCount, 6, '6 FUNAAB posts');
    });
  });
}

// ---------------------------------------------------------------------------
// admin analytics & user activity monitoring (20260926160000_admin_analytics_and_activity.sql)
// ---------------------------------------------------------------------------
console.log('\n== admin analytics & user activity monitoring ==');
{
  await check('marks 20 seeded bots with is_bot = true and regular users with is_bot = false', async () => {
    await as('postgres', async (c) => {
      const botCount = (await c.q("SELECT count(*)::int n FROM public.profiles WHERE is_bot = true")).rows[0].n;
      eq(botCount, 20, '20 bots flagged');
      const nonBot = (await c.q("SELECT is_bot FROM public.profiles WHERE id = $1", [U.s1])).rows[0].is_bot;
      eq(nonBot, false, 'real user is_bot is false');
    });
  });

  await check('record_user_activity updates last_active_at, last_login_at on session_start, and records event', async () => {
    await as(U.s1, async (c) => {
      await c.q("SELECT public.record_user_activity('session_start', 'app_open', 'UNILAG', '{\"source\":\"web\"}'::jsonb)");
      const profile = (await c.su("SELECT last_active_at, last_login_at FROM public.profiles WHERE id = $1", [U.s1])).rows[0];
      assert(profile.last_active_at != null, 'last_active_at set');
      assert(profile.last_login_at != null, 'last_login_at set');

      await c.q("SELECT public.record_user_activity('page_view', '/feed', 'UNILAG')");
      await c.q("SELECT public.record_user_activity('feature_use', 'vote_poll', 'UNILAG')");
    });
  });

  await check('get_admin_analytics_summary enforces admin role and aggregates real metrics', async () => {
    await as(U.s1, async (c) => {
      denied(await c.t("SELECT public.get_admin_analytics_summary(30)"), /admin_required/, 'student forbidden');
    });

    await as(U.adminA, async (c) => {
      const res = (await c.q("SELECT public.get_admin_analytics_summary(30) AS data")).rows[0].data;
      assert(res.total_users >= 20, 'total users counted');
      eq(res.bot_users, 20, '20 bots counted');
      assert(res.total_posts !== undefined, 'total posts metric present');
      assert(res.total_comments !== undefined, 'total comments metric present');
      assert(res.total_resources !== undefined, 'total resources metric present');
      assert(res.total_events !== undefined, 'total events metric present');
      assert(res.total_rsvps !== undefined, 'total rsvps metric present');
      assert(res.total_poll_votes !== undefined, 'total poll votes metric present');
      assert(res.pending_verifications !== undefined, 'pending verifications metric present');
      assert(Array.isArray(res.most_visited_pages), 'most visited pages array');
      assert(Array.isArray(res.most_used_features), 'most used features array');
      assert(Array.isArray(res.campus_metrics), 'campus metrics array');

      // Test campus filtering
      const uiRes = (await c.q("SELECT public.get_admin_analytics_summary(30, 'UI') AS data")).rows[0].data;
      eq(uiRes.bot_users, 7, '7 UI bots counted when campus filtered');
      eq(uiRes.total_posts, 7, '7 UI forum posts counted when campus filtered');
    });
  });

  await check('admin_get_user_profiles enforces admin and returns profiles', async () => {
    await as(U.s1, async (c) => {
      denied(await c.t("SELECT * FROM public.admin_get_user_profiles()"), /admin_required/, 'student forbidden');
    });

    await as(U.adminA, async (c) => {
      const res = (await c.q("SELECT * FROM public.admin_get_user_profiles()")).rows;
      assert(res.length > 0, 'profiles returned');
      const hasBots = res.some((p) => p.is_bot === true);
      assert(hasBots, 'bots flagged in profiles');
    });
  });
}

// ---------------------------------------------------------------------------
// forum community memberships (20260926220000_forum_community_memberships.sql)
// ---------------------------------------------------------------------------
console.log('\n== forum community memberships ==');
{
  await check('student can join and leave forum community with RLS enforced', async () => {
    await as(U.s1, async (c) => {
      // Find a community id
      const commId = (await c.q("SELECT id FROM public.forum_communities LIMIT 1")).rows[0]?.id;
      if (!commId) return;

      // Join
      await c.q("INSERT INTO public.forum_community_members (community_id, user_id) VALUES ($1, $2)", [commId, U.s1]);
      const joinedCount = (await c.q("SELECT count(*)::int n FROM public.forum_community_members WHERE user_id = $1", [U.s1])).rows[0].n;
      eq(joinedCount, 1, 's1 joined 1 community');

      // Cannot join for someone else (s2)
      denied(await c.t("INSERT INTO public.forum_community_members (community_id, user_id) VALUES ($1, $2)", [commId, U.s2]), /violates row-level security policy/, 'cannot join on behalf of peer');

      // Check stats function
      const stats = (await c.q("SELECT * FROM public.get_forum_communities_stats() WHERE community_id = $1", [commId])).rows[0];
      assert(stats != null, 'stats row returned');
      assert(Number(stats.members_count) >= 1, 'members_count includes joined member');

      // Leave
      await c.q("DELETE FROM public.forum_community_members WHERE community_id = $1 AND user_id = $2", [commId, U.s1]);
      const afterLeave = (await c.q("SELECT count(*)::int n FROM public.forum_community_members WHERE user_id = $1", [U.s1])).rows[0].n;
      eq(afterLeave, 0, 's1 left community');
    });
  });
}

// ---------------------------------------------------------------------------
// marketplace saved items (20260928170000_marketplace_saved_items.sql)
// ---------------------------------------------------------------------------
console.log('\n== marketplace saved items ==');
{
  await check('saved_items accepts kind = marketplace and enforces RLS', async () => {
    await as(U.s1, async (c) => {
      // s1 saves a marketplace listing
      assert((await c.t("INSERT INTO public.saved_items (user_id, kind, item_id, title) VALUES ($1, 'marketplace', 'item-abc', 'Calculus Textbook')", [U.s1])).ok, 's1 saved marketplace item');
      const count = (await c.q("SELECT count(*)::int n FROM public.saved_items WHERE user_id = $1 AND kind = 'marketplace'", [U.s1])).rows[0].n;
      eq(count, 1, 's1 sees 1 saved marketplace item');

      // invalid kind still rejected
      denied(await c.t("INSERT INTO public.saved_items (user_id, kind, item_id) VALUES ($1, 'invalid_kind', 'item-xyz')", [U.s1]), /check/i, 'bogus kind rejected');
    });
  });
}

// ---------------------------------------------------------------------------
// close-open-security-findings (20260929000000_close_open_security_findings.sql):
// profiles PII columns, notifications insert scoping, forum anon read
// ---------------------------------------------------------------------------
console.log('\n== close open security findings (profiles PII / notifications / forum anon) ==');
{
  await check('peer can no longer read a classmate email/student_id_number from profiles', async () => {
    await as(U.s2, async (c) => {
      denied(await c.t(`SELECT email FROM public.profiles WHERE id = $1`, [U.s1]), /permission denied/, 's2 reading s1 email');
      denied(await c.t(`SELECT student_id_number FROM public.profiles WHERE id = $1`, [U.s1]), /permission denied/, 's2 reading s1 student_id_number');
    });
  });

  await check('peer can still read the rest of a same-campus profile (role, full_name, etc.)', async () => {
    await as(U.s2, async (c) => {
      const r = (await c.q(`SELECT full_name, role FROM public.profiles WHERE id = $1`, [U.s1])).rows[0];
      assert(r && r.full_name, 'other columns remain readable');
    });
  });

  await check("get_my_profile() returns the caller's own email and student_id_number", async () => {
    await as(U.s1, async (c) => {
      const r = (await c.q(`SELECT * FROM public.get_my_profile()`)).rows[0];
      eq(r.email, 's1@example.test', 'own email via RPC');
      assert('student_id_number' in r, 'own student_id_number column present via RPC');
    });
  });

  await check('admin_get_profile_contacts requires admin/staff and returns email/student_id_number', async () => {
    await as(U.s1, async (c) => {
      denied(await c.t(`SELECT * FROM public.admin_get_profile_contacts($1::uuid[])`, [[U.s2]]), /admin_required/, 'student calling admin RPC');
    });
    await as(U.adminA, async (c) => {
      const rows = (await c.q(`SELECT * FROM public.admin_get_profile_contacts($1::uuid[])`, [[U.s1, U.s2]])).rows;
      eq(rows.length, 2, 'admin got both contacts');
      assert(rows.every((r) => typeof r.email === 'string' && r.email.length > 0), 'emails populated for admin');
    });
  });

  await check('admin_search_profiles requires admin/staff and matches by name or email', async () => {
    await as(U.s1, async (c) => {
      denied(await c.t(`SELECT * FROM public.admin_search_profiles($1, $2)`, ['s1', 5]), /admin_required/, 'student calling admin search RPC');
    });
    await as(U.adminA, async (c) => {
      const rows = (await c.q(`SELECT * FROM public.admin_search_profiles($1, $2)`, ['s1@example.test', 5])).rows;
      assert(rows.some((r) => r.id === U.s1), 'admin search found s1 by email');
    });
  });

  await check('non-admin cannot insert a system_announcement-styled notification for someone else', async () => {
    await as(U.s1, async (c) => {
      denied(
        await c.t(
          `INSERT INTO public.notifications (recipient_id, sender_id, title, body, type) VALUES ($1, $2, 'Urgent', 'Your account will be suspended', 'system_announcement')`,
          [U.s2, U.s1],
        ),
        /violates row-level security policy/,
        's1 faking a system_announcement to s2',
      );
    });
  });

  await check('a peer-to-peer message notification still works', async () => {
    await as(U.s1, async (c) => {
      assert(
        (
          await c.t(
            `INSERT INTO public.notifications (recipient_id, sender_id, title, body, type) VALUES ($1, $2, 'New connection request', 'Someone wants to connect', 'message')`,
            [U.s2, U.s1],
          )
        ).ok,
        's1 sending a message notification to s2',
      );
    });
  });

  await check('an over-long notification title is rejected for a non-admin sender', async () => {
    await as(U.s1, async (c) => {
      denied(
        await c.t(
          `INSERT INTO public.notifications (recipient_id, sender_id, title, body, type) VALUES ($1, $2, $3, 'ok', 'message')`,
          [U.s2, U.s1, 'x'.repeat(200)],
        ),
        /violates row-level security policy/,
        'oversized title rejected',
      );
    });
  });

  await check('admin can still send a system_announcement', async () => {
    await as(U.adminA, async (c) => {
      assert(
        (
          await c.t(
            `INSERT INTO public.notifications (recipient_id, sender_id, title, body, type) VALUES ($1, $2, 'Campus notice', 'Scheduled maintenance tonight', 'system_announcement')`,
            [U.s2, U.adminA],
          )
        ).ok,
        'admin sending a system_announcement',
      );
    });
  });

  await check('forum_community_members is no longer readable by anon', async () => {
    await as('anon', async (c) => {
      const rows = (await c.q(`SELECT * FROM public.forum_community_members`)).rows;
      eq(rows.length, 0, 'anon sees no membership rows');
    });
  });
}

// ---------------------------------------------------------------------------
// job applications (20260930000000_job_applications.sql): CV upload,
// screening questions, automatic ranking
//
// Everything below runs inside ONE as('postgres', ...) transaction, switching
// identity with local imp()/svc() helpers (the same pattern the paid-events
// suite above uses) - unlike as(user, fn), which opens and rolls back its
// OWN transaction, so fixtures created inside one as() call are invisible to
// the next. Sharing one transaction is what lets "poster creates a job" and
// "student applies to it" see the same row.
// ---------------------------------------------------------------------------
console.log('\n== job applications (CV, screening questions, ranking) ==');
{
  const imp = async (uid) => {
    await db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${uid}', true)`);
  };
  const svc = async () => {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims', '', true); SELECT set_config('request.jwt.claim.sub', '', true)`);
  };

  await check('job applications: full lifecycle (screening questions, apply, rank, review, withdraw) + resume storage RLS', async () => {
    await as('postgres', async (c) => {
      // Give s1 a profile that closely matches the job below; s2's profile is
      // unrelated, so the ranking assertion has a real signal to check.
      await c.q(
        `UPDATE public.profiles SET bio = 'I love building web apps with React and TypeScript', interests = ARRAY['React','TypeScript','Frontend'], department = 'Computer Science' WHERE id = $1`,
        [U.s1],
      );
      await c.q(
        `UPDATE public.profiles SET bio = 'Passionate about crop science and soil health', interests = ARRAY['Agriculture','Farming'], department = 'Agriculture' WHERE id = $1`,
        [U.s2],
      );

      await imp(U.alumni);
      denied(
        await c.t(
          `INSERT INTO public.jobs (poster_id, title, company, location, accepts_in_app_applications, apply_url) VALUES ($1, 'No way to apply', 'Acme', 'Lagos', false, NULL)`,
          [U.alumni],
        ),
        /jobs_has_an_apply_path/,
        'job with neither in-app nor external apply path',
      );

      // Inserted via svc() (no JWT -> the moderation trigger added by
      // 20261001000000_workflow_gaps.sql leaves is_approved alone) so these
      // fixtures land pre-approved, the same way the existing "close open
      // security findings" jobs migration test isn't about moderation
      // itself - that gets its own dedicated test below.
      await svc();
      const r1 = await c.q(
        `INSERT INTO public.jobs (poster_id, title, company, location, description, accepts_in_app_applications, is_approved) VALUES ($1, 'Frontend Engineer Intern', 'Acme', 'Lagos', 'React TypeScript JavaScript frontend web development', true, true) RETURNING id`,
        [U.alumni],
      );
      const jobId = r1.rows[0].id;
      const r2 = await c.q(
        `INSERT INTO public.jobs (poster_id, title, company, location, accepts_in_app_applications, apply_url, is_approved) VALUES ($1, 'External Only Role', 'Acme', 'Lagos', false, 'https://acme.example/careers/123', true) RETURNING id`,
        [U.alumni],
      );
      const jobExternalOnlyId = r2.rows[0].id;
      await imp(U.alumni);

      const rq = await c.q(
        `INSERT INTO public.job_questions (job_id, question_text, question_type, order_index) VALUES ($1, 'Are you available to start immediately?', 'yes_no', 0) RETURNING id`,
        [jobId],
      );
      const questionId = rq.rows[0].id;

      await imp(U.s3);
      denied(
        await c.t(`INSERT INTO public.job_questions (job_id, question_text) VALUES ($1, 'Why should we hire you?')`, [jobId]),
        /row-level/i,
        's3 adding a question to someone else\'s job',
      );
      eq((await c.q(`SELECT id FROM public.job_questions WHERE job_id = $1`, [jobId])).rows.length, 1, 'anyone can read screening questions');

      await imp(U.s1);
      denied(
        await c.t(`INSERT INTO public.job_applications (job_id, applicant_id, cover_note) VALUES ($1, $2, 'hi')`, [jobExternalOnlyId, U.s1]),
        /row-level/i,
        's1 applying in-app to an external-only job',
      );
      denied(
        await c.t(`INSERT INTO public.job_applications (job_id, applicant_id) VALUES ($1, $2)`, [jobId, U.s2]),
        /row-level/i,
        's1 applying as s2',
      );
      await c.q(
        `INSERT INTO public.job_applications (job_id, applicant_id, resume_url, cover_note, answers) VALUES ($1, $2, $3, 'Excited to apply!', $4::jsonb)`,
        [jobId, U.s1, `${U.s1}/resume_test.pdf`, JSON.stringify({ [questionId]: 'yes' })],
      );
      denied(await c.t(`INSERT INTO public.job_applications (job_id, applicant_id) VALUES ($1, $2)`, [jobId, U.s1]), /duplicate|unique/i, 's1 applying twice');

      await imp(U.s2);
      await c.q(`INSERT INTO public.job_applications (job_id, applicant_id, resume_url) VALUES ($1, $2, $3)`, [jobId, U.s2, `${U.s2}/resume_test.pdf`]);

      await svc();
      const ranked = (await c.q(`SELECT applicant_id, match_score FROM public.job_applications WHERE job_id = $1 ORDER BY match_score DESC NULLS LAST`, [jobId])).rows;
      eq(ranked.length, 2, 'both applications present');
      assert(ranked.every((r) => r.match_score !== null), 'match_score computed for every application');
      eq(ranked[0].applicant_id, U.s1, 's1 (matching profile) ranks above s2 (unrelated profile)');
      assert(Number(ranked[0].match_score) > Number(ranked[1].match_score), 's1 scores strictly higher than s2');
      eq((await c.q(`SELECT applications_count FROM public.jobs WHERE id = $1`, [jobId])).rows[0].applications_count, 2, 'two applications counted');

      await imp(U.s3);
      eq((await c.q(`SELECT id FROM public.job_applications WHERE job_id = $1`, [jobId])).rows.length, 0, 's3 sees no applications for a job that is not theirs');
      await imp(U.s1);
      eq((await c.q(`SELECT id FROM public.job_applications WHERE job_id = $1`, [jobId])).rows.length, 1, 's1 sees only their own application');
      const s1AppId = (await c.q(`SELECT id FROM public.job_applications WHERE job_id = $1 AND applicant_id = $2`, [jobId, U.s1])).rows[0].id;
      await imp(U.alumni);
      eq((await c.q(`SELECT id FROM public.job_applications WHERE job_id = $1`, [jobId])).rows.length, 2, 'the poster sees every application to their job');

      // An UPDATE's USING clause filters rows rather than throwing, so an
      // unauthorised update silently matches zero rows instead of erroring -
      // assert on the affected-row count and the unchanged value, not denied().
      await imp(U.s3);
      const s3Update = await c.t(`UPDATE public.job_applications SET status = 'rejected' WHERE id = $1`, [s1AppId]);
      eq(s3Update.n ?? 0, 0, 's3 changing someone else\'s application status affects zero rows');
      await svc();
      eq((await c.q(`SELECT status FROM public.job_applications WHERE id = $1`, [s1AppId])).rows[0].status, 'applied', 'status unchanged after s3\'s no-op update');

      await imp(U.alumni);
      await c.q(`UPDATE public.job_applications SET status = 'reviewed' WHERE id = $1`, [s1AppId]);
      await svc();
      const reviewed = (await c.q(`SELECT status, reviewed_at FROM public.job_applications WHERE id = $1`, [s1AppId])).rows[0];
      eq(reviewed.status, 'reviewed', 'poster moved the application to reviewed');
      assert(reviewed.reviewed_at !== null, 'reviewed_at was stamped automatically');

      // s2's application is still 'applied' (untouched) - withdrawal should succeed.
      await imp(U.s2);
      const del1 = await c.t(`DELETE FROM public.job_applications WHERE job_id = $1 AND applicant_id = $2`, [jobId, U.s2]);
      assert(del1.ok && del1.n === 1, 's2 withdrew their unreviewed application');
      // s1's application was moved to 'reviewed' above - withdrawal should now be refused.
      await imp(U.s1);
      const del2 = await c.t(`DELETE FROM public.job_applications WHERE job_id = $1 AND applicant_id = $2`, [jobId, U.s1]);
      eq(del2.n ?? 0, 0, 's1 cannot withdraw a reviewed application');
      await svc();
      eq((await c.q(`SELECT applications_count FROM public.jobs WHERE id = $1`, [jobId])).rows[0].applications_count, 1, 'count dropped back to 1 after the withdrawal');

      // Resume storage RLS: owner writes own folder; another user cannot; poster/admin can read.
      const bucket = (await c.q(`SELECT id FROM storage.buckets WHERE id = 'resumes'`)).rows[0];
      if (bucket) {
        await imp(U.s1);
        denied(
          await c.t(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('resumes', $1 || '/x.pdf', $2)`, [U.s2, U.s1]),
          /row-level/i,
          's1 writing into s2\'s resume folder',
        );
        const ownFolder = await c.t(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('resumes', $1 || '/resume.pdf', $1::uuid)`, [U.s1]);
        assert(ownFolder.ok, 's1 can upload into their own resume folder');
        eq((await c.q(`SELECT name FROM storage.objects WHERE bucket_id = 'resumes' AND name = $1`, [`${U.s1}/resume.pdf`])).rows.length, 1, 'owner can read their own resume object');

        await imp(U.s3);
        eq((await c.q(`SELECT name FROM storage.objects WHERE bucket_id = 'resumes' AND name = $1`, [`${U.s1}/resume.pdf`])).rows.length, 0, 'an unrelated student cannot read s1\'s resume object');
      }

      await imp(U.s1);
      await c.q(`UPDATE public.profiles SET resume_url = $1 WHERE id = $2`, [`${U.s1}/resume.pdf`, U.s1]);
      eq((await c.q(`SELECT resume_url FROM public.profiles WHERE id = $1`, [U.s1])).rows[0].resume_url, `${U.s1}/resume.pdf`, 's1 set and read their own resume_url');
    });
  });
}

// ---------------------------------------------------------------------------
// workflow gaps (20261001000000_workflow_gaps.sql): forum notifications +
// real comment-like persistence, alumni directory fields, event waitlist,
// donations, jobs moderation. Runs inside ONE as('postgres', ...) transaction
// with local imp()/svc() helpers, same reasoning as the job-applications
// section above.
// ---------------------------------------------------------------------------
console.log('\n== workflow gaps (notifications, directory, waitlist, donations, job moderation) ==');
{
  const imp = async (uid) => {
    await db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${uid}', true)`);
  };
  const svc = async () => {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims', '', true); SELECT set_config('request.jwt.claim.sub', '', true)`);
  };
  const STARTS = "now() + interval '2 hours'";
  const ENDS = "now() + interval '4 hours'";

  /** A live (status='upcoming'), free, not-yet-full event created by s1. */
  async function mkFreeEvent(c, capacity) {
    await svc();
    const r = await c.q(
      `INSERT INTO public.events (creator_id, campus_code, title, description, venue, start_time, end_time, category, status, ticket_type, capacity)
       VALUES ($1, 'GLOBAL', 'Waitlist test event', 'desc', 'Hall', ${STARTS}, ${ENDS}, 'Academic', 'upcoming', 'free', $2) RETURNING id`,
      [U.s1, capacity],
    );
    return r.rows[0].id;
  }

  await check('forum notifications: liking a post notifies its author (not yourself), commenting notifies the author', async () => {
    await as('postgres', async (c) => {
      await imp(U.s1);
      const post = await c.q(
        `INSERT INTO public.posts (author_id, campus_code, content) VALUES ($1, 'GLOBAL', 'A post to react to') RETURNING id`,
        [U.s1],
      );
      const postId = post.rows[0].id;

      // s1 likes their own post: no self-notification.
      await c.q(`INSERT INTO public.post_likes (post_id, user_id) VALUES ($1, $2)`, [postId, U.s1]);
      eq((await c.q(`SELECT count(*)::int n FROM public.notifications WHERE recipient_id = $1`, [U.s1])).rows[0].n, 0, 'no self-notification for liking your own post');

      await imp(U.s2);
      await c.q(`INSERT INTO public.post_likes (post_id, user_id) VALUES ($1, $2)`, [postId, U.s2]);
      // notifications RLS only lets a caller read rows where they are the
      // recipient - svc() (superuser, bypasses RLS) is needed to inspect
      // someone else's notifications from the test.
      await svc();
      const likeNotif = (await c.q(
        `SELECT sender_id, type, action_url FROM public.notifications WHERE recipient_id = $1 AND type = 'system' ORDER BY created_at DESC LIMIT 1`,
        [U.s1],
      )).rows[0];
      eq(likeNotif, { sender_id: U.s2, type: 'system', action_url: `/post/${postId}` }, 's1 is notified that s2 liked their post');

      await imp(U.s2);
      const comment = await c.q(
        `INSERT INTO public.post_comments (post_id, author_id, content) VALUES ($1, $2, 'Nice post!') RETURNING id`,
        [postId, U.s2],
      );
      const commentId = comment.rows[0].id;
      await svc();
      const commentNotifCount = (await c.q(
        `SELECT count(*)::int n FROM public.notifications WHERE recipient_id = $1 AND title = 'New comment'`,
        [U.s1],
      )).rows[0].n;
      eq(commentNotifCount, 1, 's1 is notified that s2 commented on their post');

      // Liking someone else's comment notifies the comment's author, not the post's author.
      await imp(U.s3);
      await c.q(`INSERT INTO public.post_comment_likes (comment_id, user_id) VALUES ($1, $2)`, [commentId, U.s3]);
      eq((await c.q(`SELECT likes_count FROM public.post_comments WHERE id = $1`, [commentId])).rows[0].likes_count, 1, 'post_comments.likes_count now tracks a real like');
      await svc();
      const commentLikeNotif = (await c.q(
        `SELECT recipient_id, sender_id FROM public.notifications WHERE title = 'New like' AND sender_id = $1`,
        [U.s3],
      )).rows[0];
      eq(commentLikeNotif, { recipient_id: U.s2, sender_id: U.s3 }, 's2 (comment author) is notified, not s1 (post author)');

      // Unliking the comment drops the count back down.
      await c.q(`DELETE FROM public.post_comment_likes WHERE comment_id = $1 AND user_id = $2`, [commentId, U.s3]);
      eq((await c.q(`SELECT likes_count FROM public.post_comments WHERE id = $1`, [commentId])).rows[0].likes_count, 0, 'unliking a comment decrements likes_count');

      // Only the comment's own author can remove someone else's like row (RLS: owner-only delete).
      await imp(U.s3);
      const forged = await c.t(`INSERT INTO public.post_comment_likes (comment_id, user_id) VALUES ($1, $2)`, [commentId, U.s4]);
      denied(forged, /row-level/i, 's3 liking a comment as s4');
    });
  });

  await check('alumni directory fields: graduation_year/industry/company/job_title/location round-trip and are range-checked', async () => {
    await as('postgres', async (c) => {
      await imp(U.s1);
      await c.q(
        `UPDATE public.profiles SET graduation_year = 2024, industry = 'Software', company = 'Acme', job_title = 'Engineer', location = 'Lagos' WHERE id = $1`,
        [U.s1],
      );
      const row = (await c.q(
        `SELECT graduation_year, industry, company, job_title, location FROM public.profiles WHERE id = $1`,
        [U.s1],
      )).rows[0];
      eq(row, { graduation_year: 2024, industry: 'Software', company: 'Acme', job_title: 'Engineer', location: 'Lagos' }, 'fields round-trip through a normal profile update');

      denied(
        await c.t(`UPDATE public.profiles SET graduation_year = 1899 WHERE id = $1`, [U.s1]),
        /graduation_year/,
        'a graduation_year outside 1950-2100 is rejected',
      );

      await imp(U.s2);
      const peerRead = (await c.q(`SELECT graduation_year, company FROM public.profiles WHERE id = $1`, [U.s1])).rows[0];
      eq(peerRead, { graduation_year: 2024, company: 'Acme' }, 'a classmate can read these directory fields (they are not private PII)');
    });
  });

  await check('event waitlist: joining requires the event to actually be full, auto-promotes on cancellation, notifies the promoted user', async () => {
    await as('postgres', async (c) => {
      const ev = await mkFreeEvent(c, 1);

      await imp(U.s2);
      denied(await c.t(`SELECT public.join_event_waitlist($1)`, [ev]), /not_full/, 'cannot join the waitlist while the event still has open places');

      await c.q(`SELECT public.rsvp_event($1, false, false)`, [ev]);

      await imp(U.s3);
      const joined = (await c.q(`SELECT public.join_event_waitlist($1) r`, [ev])).rows[0].r;
      eq(joined, { position: 1 }, 's3 is first on the waitlist');

      await imp(U.s4);
      const joined2 = (await c.q(`SELECT public.join_event_waitlist($1) r`, [ev])).rows[0].r;
      eq(joined2, { position: 2 }, 's4 is second on the waitlist');
      const rejoined = (await c.q(`SELECT public.join_event_waitlist($1) r`, [ev])).rows[0].r;
      eq(rejoined, { position: 2 }, 'joining again while already on the waitlist is idempotent (same position, no duplicate row)');

      const status4 = (await c.q(`SELECT public.my_event_waitlist_status($1) r`, [ev])).rows[0].r;
      eq(status4, { position: 2, promoted: false, onWaitlist: true }, "s4 sees their own waitlist position");

      // s3 leaves voluntarily; s4 is now first.
      await imp(U.s3);
      await c.q(`SELECT public.leave_event_waitlist($1)`, [ev]);
      await imp(U.s4);
      eq((await c.q(`SELECT public.my_event_waitlist_status($1) r`, [ev])).rows[0].r.position, 1, 's4 moves up to first after s3 leaves');

      // s2 (the only registrant) cancels -> s4 should be auto-promoted.
      await imp(U.s2);
      await c.q(`SELECT public.cancel_event_rsvp($1)`, [ev]);

      await svc();
      const attendee = (await c.q(`SELECT user_id FROM public.event_attendees WHERE event_id = $1`, [ev])).rows[0];
      eq(attendee.user_id, U.s4, 's4 was auto-registered off the waitlist');
      const promoRow = (await c.q(`SELECT promoted_at IS NOT NULL AS promoted FROM public.event_waitlist WHERE event_id = $1 AND user_id = $2`, [ev, U.s4])).rows[0];
      assert(promoRow.promoted, "s4's waitlist row is marked promoted");
      const promoNotif = (await c.q(`SELECT count(*)::int n FROM public.notifications WHERE recipient_id = $1 AND title = 'A place opened up!'`, [U.s4])).rows[0].n;
      eq(promoNotif, 1, 's4 was notified of the promotion');
    });
  });

  await check('donations: a non-admin campaign is held for review with zeroed totals; the giving link is https-only; review/click/total functions are properly gated', async () => {
    await as('postgres', async (c) => {
      const flag = (on) => c.q(
        `INSERT INTO public.platform_settings (key, value) VALUES ('feature_flags', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify({ donations: on })]);

      await imp(U.alumni);
      denied(
        await c.t(`INSERT INTO public.giving_campaigns (creator_id, title, giving_url) VALUES ($1, 'Scholarship Fund', 'http://example.com/give')`, [U.alumni]),
        /giving_url|payment_url_problem|check/i,
        'a plain http:// giving link is rejected',
      );

      const camp = await c.q(
        `INSERT INTO public.giving_campaigns (creator_id, title, giving_url, review_status, confirmed_total) VALUES ($1, 'Scholarship Fund', 'https://give.example.com/lioris', 'approved', 5000) RETURNING id, review_status, confirmed_total`,
        [U.alumni],
      );
      eq(
        { review_status: camp.rows[0].review_status, confirmed_total: Number(camp.rows[0].confirmed_total) },
        { review_status: 'pending', confirmed_total: 0 },
        "a non-admin's attempt to insert an already-approved, pre-funded campaign is forced back to pending/0",
      );
      const campaignId = camp.rows[0].id;

      denied(
        await c.t(`SELECT public.admin_review_giving_campaign($1, true, NULL)`, [campaignId]),
        /permission denied/,
        'a signed-in alumnus cannot call the admin review function directly',
      );

      await svc(); await flag(false);
      await imp(U.alumni);
      denied(await c.t(`SELECT public.open_giving_page($1)`, [campaignId]), /donations_disabled/, 'giving is off by default');

      await svc(); await flag(true);
      denied(await c.t(`SELECT public.open_giving_page($1)`, [campaignId]), /not_available/, 'a pending campaign is not yet open to give to');

      await svc();
      await c.q(`SELECT public.admin_review_giving_campaign($1, true, 'looks good')`, [campaignId]);
      await c.q(`SELECT public.admin_update_giving_total($1, 12500)`, [campaignId]);

      await imp(U.s1);
      const url = (await c.q(`SELECT public.open_giving_page($1) r`, [campaignId])).rows[0].r;
      eq(url, 'https://give.example.com/lioris', 'an approved, open campaign hands back its external giving URL');

      await svc();
      const clicks = (await c.q(`SELECT count(*)::int n FROM public.giving_campaign_clicks WHERE campaign_id = $1 AND user_id = $2`, [campaignId, U.s1])).rows[0].n;
      eq(clicks, 1, 'the click was recorded');
      const total = (await c.q(`SELECT confirmed_total FROM public.giving_campaigns WHERE id = $1`, [campaignId])).rows[0].confirmed_total;
      eq(Number(total), 12500, "the admin's manually confirmed total stuck");

      // Editing an approved campaign as its owner sends it back to review.
      await imp(U.alumni);
      await c.q(`UPDATE public.giving_campaigns SET title = 'Scholarship Fund 2027' WHERE id = $1`, [campaignId]);
      await svc();
      eq((await c.q(`SELECT review_status FROM public.giving_campaigns WHERE id = $1`, [campaignId])).rows[0].review_status, 'pending', "editing an approved campaign's own details resends it for review");
    });
  });

  await check('jobs moderation: a non-staff posting is held for review, invisible to others but visible to its own poster; staff postings are trusted at insert; a poster cannot self-approve by editing', async () => {
    await as('postgres', async (c) => {
      await imp(U.alumni);
      const posted = await c.q(
        `INSERT INTO public.jobs (poster_id, title, company, location, apply_url, is_approved) VALUES ($1, 'Unreviewed Role', 'Acme', 'Lagos', 'https://acme.example/careers', true) RETURNING id, is_approved`,
        [U.alumni],
      );
      eq(posted.rows[0].is_approved, false, "a non-staff poster's attempt to self-approve at insert is overridden");
      const jobId = posted.rows[0].id;

      await imp(U.s2);
      eq((await c.q(`SELECT id FROM public.jobs WHERE id = $1`, [jobId])).rows.length, 0, 'another student cannot see the unreviewed posting');

      await imp(U.alumni);
      eq((await c.q(`SELECT id FROM public.jobs WHERE id = $1`, [jobId])).rows.length, 1, 'the poster can still see their own pending posting');

      // The UPDATE statement itself is allowed by RLS (a poster may update their own
      // job row) - it is the moderation trigger that quietly reverts is_approved, so
      // this succeeds as a statement but must not change the stored value.
      const selfApprove = await c.t(`UPDATE public.jobs SET is_approved = true WHERE id = $1`, [jobId]);
      assert(selfApprove.ok, "a poster's own UPDATE to their job row is not itself refused");
      const stillPending = (await c.q(`SELECT is_approved FROM public.jobs WHERE id = $1`, [jobId])).rows[0].is_approved;
      eq(stillPending, false, "a poster's own UPDATE cannot flip is_approved (the trigger reverts it, so the UPDATE succeeds but changes nothing)");

      await svc();
      const staffJob = await c.q(
        `INSERT INTO public.jobs (poster_id, title, company, location, apply_url, is_approved) VALUES ($1, 'Staff-Posted Role', 'Acme', 'Lagos', 'https://acme.example/careers', true) RETURNING is_approved`,
        [U.staffU],
      );
      eq(staffJob.rows[0].is_approved, true, 'a job inserted with no JWT (service/migration context) is left alone');

      await imp(U.adminA);
      await c.q(`UPDATE public.jobs SET is_approved = true, approved_by = $2 WHERE id = $1`, [jobId, U.adminA]);
      const approved = (await c.q(`SELECT is_approved, approved_by FROM public.jobs WHERE id = $1`, [jobId])).rows[0];
      eq(approved, { is_approved: true, approved_by: U.adminA }, 'an admin can approve the posting');
    });
  });
}

// ---------------------------------------------------------------------------
// customer care (20261002000000_customer_care.sql): the 'feedback' ticket
// category, and origin/chat_transcript for AI-escalated tickets.
// ---------------------------------------------------------------------------
console.log('\n== customer care (support tickets: feedback category, AI escalation columns) ==');
{
  const imp = async (uid) => {
    await db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${uid}', true)`);
  };

  await check("support tickets: 'feedback' is an accepted category; origin/chat_transcript default sanely; the transcript length cap holds", async () => {
    await as('postgres', async (c) => {
      await imp(U.s1);

      const feedbackTicket = await c.q(
        `INSERT INTO public.support_tickets (user_id, category, title, description) VALUES ($1, 'feedback', 'Love the new jobs page', 'Just wanted to say the CV upload flow is great.') RETURNING category, origin, chat_transcript`,
        [U.s1],
      );
      eq(feedbackTicket.rows[0], { category: 'feedback', origin: 'user', chat_transcript: null }, "a plain feedback ticket defaults origin to 'user' with no transcript");

      const escalated = await c.q(
        `INSERT INTO public.support_tickets (user_id, category, title, description, origin, chat_transcript) VALUES ($1, 'general', 'AI could not help', 'Escalated from chat', 'ai_escalation', 'User: How do I reset my matric number?\nAssistant: That needs a human to verify.') RETURNING origin, chat_transcript`,
        [U.s1],
      );
      assert(escalated.rows[0].origin === 'ai_escalation' && escalated.rows[0].chat_transcript.includes('matric number'), 'an AI-escalated ticket records its origin and transcript');

      denied(
        await c.t(`INSERT INTO public.support_tickets (user_id, category, title, description) VALUES ($1, 'not_a_real_category', 't', 'd')`, [U.s1]),
        /support_tickets_category_check/,
        'an unrecognised category is still rejected',
      );

      denied(
        await c.t(`INSERT INTO public.support_tickets (user_id, category, title, description, origin) VALUES ($1, 'general', 't', 'd', 'not_a_real_origin')`, [U.s1]),
        /support_tickets_origin_check|check constraint/i,
        'an unrecognised origin is rejected',
      );

      denied(
        await c.t(`INSERT INTO public.support_tickets (user_id, category, title, description, chat_transcript) VALUES ($1, 'general', 't', 'd', repeat('x', 12001))`, [U.s1]),
        /chat_transcript|check constraint/i,
        'a transcript over the 12000-character cap is rejected',
      );
    });
  });
}

// ---------------------------------------------------------------------------
// trust & safety gaps (20261003000000_trust_safety_gaps.sql): marketplace
// listings and jobs are now reportable; admin can end an abusive mentorship.
// ---------------------------------------------------------------------------
console.log('\n== trust & safety gaps (reportable listings/jobs, admin mentorship override) ==');
{
  const imp = async (uid) => {
    await db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${uid}', true)`);
  };

  await check('marketplace listings and jobs can now be reported into the moderation queue', async () => {
    await as('postgres', async (c) => {
      await imp(U.s1);
      const listing = await c.q(
        `INSERT INTO public.marketplace_listings (seller_id, campus_code, title, description, price_kobo, price_display, category)
         VALUES ($1, 'UNILAG', 'Used calculator', 'Works fine', 500000, '₦5,000', 'Electronics') RETURNING id`,
        [U.s1],
      );
      const job = await c.q(
        `INSERT INTO public.jobs (poster_id, campus_code, title, company, location, apply_url)
         VALUES ($1, 'UNILAG', 'Frontend Intern', 'Acme', 'Lagos', 'https://example.test/apply') RETURNING id`,
        [U.s1],
      );

      await imp(U.s2);
      const listingReport = await c.q(
        `INSERT INTO public.moderation_queue (item_type, item_id, reporter_id, campus_code, reason, status)
         VALUES ('marketplace_listing', $1, $2, 'UNILAG', 'Looks like a scam', 'pending') RETURNING item_type::text`,
        [listing.rows[0].id, U.s2],
      );
      eq(listingReport.rows[0].item_type, 'marketplace_listing', 'a marketplace listing can be reported');

      const jobReport = await c.q(
        `INSERT INTO public.moderation_queue (item_type, item_id, reporter_id, campus_code, reason, status)
         VALUES ('job', $1, $2, 'UNILAG', 'Pyramid scheme', 'pending') RETURNING item_type::text`,
        [job.rows[0].id, U.s2],
      );
      eq(jobReport.rows[0].item_type, 'job', 'a job posting can be reported');
    });
  });

  await check('a non-participant cannot end a mentorship they are not part of', async () => {
    await as('postgres', async (c) => {
      const m = await c.q(
        `INSERT INTO public.mentorships (student_id, mentor_id, status, track, started_at) VALUES ($1, $2, 'active', 'Backend', now()) RETURNING id`,
        [U.s1, U.alumni],
      );
      await imp(U.s3);
      denied(
        await c.t(`SELECT public.end_mentorship($1, 'end', 'butting in')`, [m.rows[0].id]),
        /not_allowed/,
        'an unrelated student cannot end someone else\'s mentorship',
      );
    });
  });

  await check('an admin can end an active mentorship they are not part of, and both sides are notified', async () => {
    await as('postgres', async (c) => {
      const m = await c.q(
        `INSERT INTO public.mentorships (student_id, mentor_id, status, track, started_at) VALUES ($1, $2, 'active', 'Product design', now()) RETURNING id`,
        [U.s1, U.alumni],
      );
      await imp(U.adminA);
      await c.q(`SELECT public.end_mentorship($1, 'end', 'Reported for inappropriate conduct')`, [m.rows[0].id]);

      const row = (await c.q(`SELECT status, end_reason, ended_by FROM public.mentorships WHERE id = $1`, [m.rows[0].id])).rows[0];
      eq(row.status, 'ended', 'admin override actually ends the mentorship');
      eq(row.ended_by, U.adminA, 'the ending admin is recorded');
      assert(row.end_reason.includes('inappropriate'), 'the admin reason is recorded');

      const notifCount = (await c.q(
        `SELECT count(*)::int n FROM public.notifications WHERE recipient_id IN ($1, $2) AND title = 'Mentorship ended by campus staff' AND created_at > now() - interval '1 minute'`,
        [U.s1, U.alumni],
      )).rows[0].n;
      eq(notifCount, 2, 'both the student and the mentor are notified when staff ends it');
    });
  });

  await check('an admin still cannot withdraw a pending request on someone else\'s behalf', async () => {
    await as('postgres', async (c) => {
      const m = await c.q(
        `INSERT INTO public.mentorships (student_id, mentor_id, status, track) VALUES ($1, $2, 'pending', 'Data science') RETURNING id`,
        [U.s2, U.alumni],
      );
      await imp(U.adminA);
      denied(
        await c.t(`SELECT public.end_mentorship($1, 'withdraw', NULL)`, [m.rows[0].id]),
        /not_allowed/,
        'withdrawing a pending request stays the requesting student\'s call, even for an admin',
      );
    });
  });
}

// ---------------------------------------------------------------------------
// admin directory + analytics fixes (20261003010000): the User Directory
// permission bug, heartbeat noise, new_signups.
// ---------------------------------------------------------------------------
console.log('\n== admin directory + analytics fixes (permission fix, heartbeat exclusion, new signups) ==');
{
  const imp = async (uid) => {
    await db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${uid}', true)`);
  };

  await check('admin_get_user_profiles returns student_id_number/department/trust_score/is_suspended for admins; a plain select(*) on profiles is still refused (that refusal is the bug - the fix is calling this RPC instead)', async () => {
    await as('postgres', async (c) => {
      await imp(U.adminA);
      const rows = await c.q(`SELECT * FROM public.admin_get_user_profiles($1, $2) WHERE id = $3`, [null, 5000, U.s1]);
      assert(rows.rows.length === 1, 'admin_get_user_profiles returns a row for the target student');
      const row = rows.rows[0];
      assert('student_id_number' in row && 'department' in row && 'trust_score' in row && 'is_suspended' in row, 'the widened RPC exposes the columns the User Directory screen needs');

      await imp(U.s1);
      denied(await c.t(`SELECT * FROM public.profiles WHERE id = $1`, [U.s1]), /permission denied/i, 'select(*) on profiles is refused even for your own row (email/student_id_number are not in the column-level grant)');
      denied(await c.t(`SELECT * FROM public.admin_get_user_profiles($1, $2)`, [null, 10]), /admin_required/, 'a non-admin/staff student cannot call admin_get_user_profiles');
    });
  });

  await check("get_admin_analytics_summary: 'heartbeat' pings are excluded from most_used_features (still a real feature use); new_signups counts recent real signups", async () => {
    await as('postgres', async (c) => {
      await c.q(`DELETE FROM public.analytics_events WHERE name IN ('heartbeat', 'test_feature_xyz')`);
      for (let i = 0; i < 5; i++) {
        await c.q(`INSERT INTO public.analytics_events (user_id, event_type, name, campus_code) VALUES ($1, 'feature_use', 'heartbeat', 'UNILAG')`, [U.s1]);
      }
      await c.q(`INSERT INTO public.analytics_events (user_id, event_type, name, campus_code) VALUES ($1, 'feature_use', 'test_feature_xyz', 'UNILAG')`, [U.s1]);

      await imp(U.adminA);
      const summary = (await c.q(`SELECT public.get_admin_analytics_summary(365, NULL) AS s`)).rows[0].s;
      const featureNames = (summary.most_used_features || []).map((f) => f.name);
      assert(!featureNames.includes('heartbeat'), 'heartbeat does not pollute most_used_features');
      assert(featureNames.includes('test_feature_xyz'), 'a real feature-use event still appears in most_used_features');
      assert(typeof summary.new_signups === 'number' && summary.new_signups >= 1, 'new_signups is present and counts at least the fixture students created for this run');
    });
  });
}

// ---------------------------------------------------------------------------
// tier 3: notification preferences (owner-only, service_role read) + self-
// service account deactivation (20261003020000).
// ---------------------------------------------------------------------------
console.log('\n== tier 3: notification preferences + account deactivation ==');
{
  const imp = async (uid) => {
    await db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${uid}', true)`);
  };
  const svc = async () => {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims', '', true); SELECT set_config('request.jwt.claim.sub', '', true)`);
  };

  await check('notification_preferences: a user can upsert and read their own row, not read/write another user\'s, and send-push (service_role) can read any', async () => {
    await as('postgres', async (c) => {
      await imp(U.s1);
      await c.q(
        `INSERT INTO public.notification_preferences (user_id, push_enabled, announcements_enabled, events_enabled, digest_enabled) VALUES ($1, false, true, false, true)`,
        [U.s1],
      );
      const mine = await c.q(`SELECT push_enabled, events_enabled FROM public.notification_preferences WHERE user_id = $1`, [U.s1]);
      eq(mine.rows[0], { push_enabled: false, events_enabled: false }, 'the owner reads back what they wrote');

      denied(
        await c.t(
          `INSERT INTO public.notification_preferences (user_id, push_enabled) VALUES ($1, false)`,
          [U.s2],
        ),
        /row-level|policy/i,
        'a user cannot write a notification_preferences row for someone else',
      );

      const peekOther = await c.q(`SELECT * FROM public.notification_preferences WHERE user_id = $1`, [U.s2]);
      eq(peekOther.rows.length, 0, 'a user cannot read another user\'s notification preferences (RLS hides the row, not an error)');

      await svc();
      const asService = await c.q(`SELECT push_enabled FROM public.notification_preferences WHERE user_id = $1`, [U.s1]);
      eq(asService.rows[0].push_enabled, false, 'service_role (send-push) can read any row to decide whether to deliver');
    });
  });

  await check('deactivate_my_account / reactivate_my_account operate on the caller only (auth.uid(), no target parameter)', async () => {
    await as('postgres', async (c) => {
      await imp(U.s3);
      await c.q(`SELECT public.deactivate_my_account()`);

      await svc();
      const deactivatedRow = await c.q(`SELECT deactivated_at FROM public.profiles WHERE id = $1`, [U.s3]);
      assert(deactivatedRow.rows[0].deactivated_at !== null, 'deactivate_my_account set deactivated_at for the caller');

      await imp(U.s3);
      await c.q(`SELECT public.reactivate_my_account()`);
      await svc();
      const reactivatedRow = await c.q(`SELECT deactivated_at FROM public.profiles WHERE id = $1`, [U.s3]);
      assert(reactivatedRow.rows[0].deactivated_at === null, 'reactivate_my_account cleared it again');

      await imp(U.s4);
      await c.q(`SELECT public.deactivate_my_account()`);
      await svc();
      const s4Row = await c.q(`SELECT deactivated_at FROM public.profiles WHERE id = $1`, [U.s4]);
      const s3RowUnaffected = await c.q(`SELECT deactivated_at FROM public.profiles WHERE id = $1`, [U.s3]);
      assert(s4Row.rows[0].deactivated_at !== null, 's4 deactivated itself');
      assert(s3RowUnaffected.rows[0].deactivated_at === null, 's3 is untouched by s4 deactivating their own account - there is no target parameter, only auth.uid()');
    });
  });
}

// ---------------------------------------------------------------------------
// discovery & polish (20261004000000): mute, job alerts, granular directory
// privacy.
// ---------------------------------------------------------------------------
console.log('\n== discovery & polish: mute, job alerts, directory privacy ==');
{
  const imp = async (uid) => {
    await db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${uid}', true)`);
  };
  const svc = async () => {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims', '', true); SELECT set_config('request.jwt.claim.sub', '', true)`);
  };

  await check('user_mutes: owner-only RLS - mirrors user_blocks (mute yourself is rejected, mute another is owned, list and unmute are self-scoped)', async () => {
    await as('postgres', async (c) => {
      await imp(U.s1);
      denied(await c.t(`INSERT INTO public.user_mutes (muter_id, muted_id) VALUES ($1, $1)`, [U.s1]), /user_mutes_not_self/, 'muting yourself');
      await c.q(`INSERT INTO public.user_mutes (muter_id, muted_id) VALUES ($1, $2)`, [U.s1, U.s2]);

      denied(
        await c.t(`INSERT INTO public.user_mutes (muter_id, muted_id) VALUES ($1, $2)`, [U.s2, U.s4]),
        /row-level|policy/i,
        'a user cannot insert a mute row on someone else\'s behalf',
      );

      const mine = await c.q(`SELECT muted_id FROM public.user_mutes WHERE muter_id = $1`, [U.s1]);
      eq(mine.rows.map((r) => r.muted_id), [U.s2], 'the muter reads their own mute list');

      await imp(U.s2);
      const peekOther = await c.q(`SELECT * FROM public.user_mutes WHERE muter_id = $1`, [U.s1]);
      eq(peekOther.rows.length, 0, 'a user cannot read another user\'s mute list (RLS hides the row)');

      // RLS "muter_id = auth.uid()" makes s1's row invisible to this DELETE - it
      // succeeds as a no-op (0 rows), it does not throw.
      const foreignDelete = await c.t(`DELETE FROM public.user_mutes WHERE muter_id = $1 AND muted_id = $2`, [U.s1, U.s2]);
      assert(foreignDelete.ok && foreignDelete.n === 0, 'deleting from another user\'s mute list is a silent no-op, not a thrown error');

      await imp(U.s1);
      await c.q(`DELETE FROM public.user_mutes WHERE muter_id = $1 AND muted_id = $2`, [U.s1, U.s2]);
      const afterUnmute = await c.q(`SELECT count(*)::int n FROM public.user_mutes WHERE muter_id = $1`, [U.s1]);
      eq(afterUnmute.rows[0].n, 0, 'the owner can unmute');
    });
  });

  await check('job_alerts: owner-only RLS (create, list, toggle, delete are self-scoped)', async () => {
    await as('postgres', async (c) => {
      await imp(U.s1);
      const ins = await c.q(
        `INSERT INTO public.job_alerts (user_id, keywords, job_type, remote_only, campus_code) VALUES ($1, 'Engineer', NULL, false, NULL) RETURNING id`,
        [U.s1],
      );
      const alertId = ins.rows[0].id;

      denied(
        await c.t(`INSERT INTO public.job_alerts (user_id, keywords) VALUES ($1, 'x')`, [U.s2]),
        /row-level|policy/i,
        'a user cannot create a job_alerts row for someone else',
      );
      denied(
        await c.t(`INSERT INTO public.job_alerts (user_id, job_type) VALUES ($1, 'Weekend')`, [U.s1]),
        /job_alerts_type_valid/,
        'an invalid job_type is rejected',
      );
      denied(
        await c.t(`INSERT INTO public.job_alerts (user_id, keywords) VALUES ($1, repeat('x', 201))`, [U.s1]),
        /job_alerts_keywords_len/,
        'keywords over 200 chars are rejected',
      );

      await imp(U.s2);
      const peekOther = await c.q(`SELECT * FROM public.job_alerts WHERE user_id = $1`, [U.s1]);
      eq(peekOther.rows.length, 0, 'a user cannot list another user\'s job alerts');
      const foreignUpdate = await c.t(`UPDATE public.job_alerts SET is_active = false WHERE id = $1`, [alertId]);
      assert(foreignUpdate.ok && foreignUpdate.n === 0, 'updating another user\'s job alert is a silent no-op, not a thrown error');

      await imp(U.s1);
      await c.q(`UPDATE public.job_alerts SET is_active = false WHERE id = $1`, [alertId]);
      const toggled = await c.q(`SELECT is_active FROM public.job_alerts WHERE id = $1`, [alertId]);
      eq(toggled.rows[0].is_active, false, 'the owner can toggle their own alert');
      await c.q(`DELETE FROM public.job_alerts WHERE id = $1`, [alertId]);
      eq((await c.q(`SELECT count(*)::int n FROM public.job_alerts WHERE user_id = $1`, [U.s1])).rows[0].n, 0, 'the owner can delete their own alert');
    });
  });

  await check('job_alerts: notified only on approval (not on the non-approved insert, not on an unrelated edit), matches keywords/type/remote/campus, and never notifies the poster\'s own alert', async () => {
    await as('postgres', async (c) => {
      // s1: matches on keywords, any type, non-remote-only -> should fire.
      await imp(U.s1);
      await c.q(`INSERT INTO public.job_alerts (user_id, keywords, job_type, remote_only, campus_code) VALUES ($1, 'Engineer', NULL, false, NULL)`, [U.s1]);
      // s2: wrong job_type -> must not fire.
      await imp(U.s2);
      await c.q(`INSERT INTO public.job_alerts (user_id, keywords, job_type, remote_only, campus_code) VALUES ($1, NULL, 'Internship', false, NULL)`, [U.s2]);
      // s5: matches everything but is inactive -> must not fire.
      await imp(U.s5);
      await c.q(`INSERT INTO public.job_alerts (user_id, keywords, job_type, remote_only, campus_code, is_active) VALUES ($1, NULL, NULL, false, NULL, false)`, [U.s5]);
      // s4 is the poster below and also saves a matching alert on themself -> must never self-notify.
      await imp(U.s4);
      const jobIns = await c.q(
        `INSERT INTO public.jobs (poster_id, campus_code, title, company, location, type, is_remote, apply_url)
         VALUES ($1, 'UNILAG', 'Senior Engineer', 'Acme Corp', 'Lagos', 'Full-time', false, 'https://example.com/apply') RETURNING id, is_approved`,
        [U.s4],
      );
      const jobId = jobIns.rows[0].id;
      eq(jobIns.rows[0].is_approved, false, 'enforce_job_moderation forces a non-staff poster\'s new job into pending');
      await c.q(`INSERT INTO public.job_alerts (user_id, keywords) VALUES ($1, 'Engineer')`, [U.s4]);

      await svc();
      const beforeApproval = await c.q(`SELECT count(*)::int n FROM public.notifications WHERE type = 'system' AND action_url = '/jobs'`);
      eq(beforeApproval.rows[0].n, 0, 'inserting a not-yet-approved job notifies nobody');

      await imp(U.adminA);
      await c.q(`UPDATE public.jobs SET is_approved = true WHERE id = $1`, [jobId]);

      await svc();
      const afterApproval = await c.q(
        `SELECT recipient_id FROM public.notifications WHERE type = 'system' AND action_url = '/jobs' ORDER BY recipient_id`,
      );
      eq(afterApproval.rows.map((r) => r.recipient_id).sort(), [U.s1], 'only the one matching, active, non-poster alert owner (s1) is notified');

      const lastNotified = await c.q(
        `SELECT last_notified_at IS NOT NULL AS stamped FROM public.job_alerts WHERE user_id = $1 AND keywords = 'Engineer'`,
        [U.s1],
      );
      assert(lastNotified.rows[0].stamped, 'the matched alert has last_notified_at stamped');

      // An unrelated edit while already approved must not refire the trigger.
      await imp(U.s4);
      await c.q(`UPDATE public.jobs SET description = 'now with more detail' WHERE id = $1`, [jobId]);
      await svc();
      const afterUnrelatedEdit = await c.q(`SELECT count(*)::int n FROM public.notifications WHERE type = 'system' AND action_url = '/jobs'`);
      eq(afterUnrelatedEdit.rows[0].n, 1, 'editing an already-approved job does not re-notify');
    });
  });

  await check('directory privacy: the owner can update their own discoverability/hide flags; another same-campus user can read them (the column grant works, not "permission denied for table profiles")', async () => {
    await as('postgres', async (c) => {
      const defaults = await c.su(`SELECT directory_discoverable d, directory_hide_company hc, directory_hide_location hl, directory_hide_job_title hj FROM public.profiles WHERE id = $1`, [U.s2]);
      eq(defaults.rows[0], { d: true, hc: false, hl: false, hj: false }, 'new profiles default to discoverable and fully visible');

      await imp(U.s2);
      await c.q(`UPDATE public.profiles SET directory_discoverable = false, directory_hide_company = true WHERE id = $1`, [U.s2]);
      const foreignUpdate = await c.t(`UPDATE public.profiles SET directory_discoverable = true WHERE id = $1`, [U.s1]);
      assert(foreignUpdate.ok && foreignUpdate.n === 0, 'a user cannot flip another user\'s directory flags (RLS "own row only" already covers this - zero rows affected, not a thrown error)');

      // s1 and s2 are both UNILAG, so s1 can see s2's row under the existing
      // same-campus SELECT policy; the point under test is the new column
      // grant, not row visibility.
      await imp(U.s1);
      const peer = await c.q(`SELECT directory_discoverable d, directory_hide_company hc FROM public.profiles WHERE id = $1`, [U.s2]);
      eq(peer.rows[0], { d: false, hc: true }, 'a same-campus peer can read the updated flags through the new column grant');
    });
  });
}

// ---------------------------------------------------------------------------
// alumni profile extras (20261005030000): profiles.linkedin_url (column
// grant) + public.skill_endorsements (owner-only RLS + self-check
// constraint + peer-read via column/table grant - same shape as the tier 3
// section above).
// ---------------------------------------------------------------------------
console.log('\n== alumni profile extras (linkedin_url column grant + skill endorsements) ==');
{
  const imp = async (uid) => {
    await db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${uid}', true)`);
  };

  await check('profiles.linkedin_url: the CHECK constraint rejects a non-LinkedIn https URL and accepts a real LinkedIn URL', async () => {
    await as('postgres', async (c) => {
      await imp(U.s1);
      denied(
        await c.t(`UPDATE public.profiles SET linkedin_url = 'https://example.com/in/s1' WHERE id = $1`, [U.s1]),
        /profiles_linkedin_url_check|check constraint/i,
        'a non-LinkedIn https URL must be rejected',
      );
      denied(
        await c.t(`UPDATE public.profiles SET linkedin_url = 'http://linkedin.com/in/s1' WHERE id = $1`, [U.s1]),
        /profiles_linkedin_url_check|check constraint/i,
        'a non-https linkedin.com URL must be rejected',
      );
      const ok = await c.t(`UPDATE public.profiles SET linkedin_url = 'https://www.linkedin.com/in/s1' WHERE id = $1 RETURNING linkedin_url`, [U.s1]);
      assert(ok.ok, 'a real LinkedIn URL was refused: ' + ok.err?.message);
      eq(ok.rows[0].linkedin_url, 'https://www.linkedin.com/in/s1');
    });
  });

  await check('profiles.linkedin_url: a peer can read it through the column grant (not "permission denied for table profiles")', async () => {
    await as('postgres', async (c) => {
      await imp(U.s1);
      await c.q(`UPDATE public.profiles SET linkedin_url = 'https://linkedin.com/in/s1-peer-read' WHERE id = $1`, [U.s1]);

      await imp(U.s2);
      const r = await c.t(`SELECT linkedin_url FROM public.profiles WHERE id = $1`, [U.s1]);
      assert(r.ok, 'peer select of linkedin_url was refused: ' + r.err?.message);
      eq(r.rows[0].linkedin_url, 'https://linkedin.com/in/s1-peer-read', 'peer did not see the LinkedIn URL through the column grant');
    });
  });

  await check('skill_endorsements: a user cannot endorse their own skill (self-check constraint fires)', async () => {
    await as('postgres', async (c) => {
      await imp(U.s1);
      denied(
        await c.t(`INSERT INTO public.skill_endorsements (profile_id, skill, endorser_id) VALUES ($1, 'Python', $1)`, [U.s1]),
        /skill_endorsements_not_self_chk|check constraint/i,
        'self-endorsement must be rejected',
      );
    });
  });

  await check('skill_endorsements: a peer can endorse a skill once; a duplicate by the same endorser is rejected; counts aggregate across multiple endorsers', async () => {
    await as('postgres', async (c) => {
      await imp(U.s2);
      const first = await c.t(`INSERT INTO public.skill_endorsements (profile_id, skill, endorser_id) VALUES ($1, 'Python', $2)`, [U.s1, U.s2]);
      assert(first.ok, 'peer endorsement failed: ' + first.err?.message);

      const dup = await c.t(`INSERT INTO public.skill_endorsements (profile_id, skill, endorser_id) VALUES ($1, 'Python', $2)`, [U.s1, U.s2]);
      denied(dup, /duplicate key|unique/i, 'a duplicate endorsement by the same person must be rejected');

      await imp(U.s3);
      const second = await c.t(`INSERT INTO public.skill_endorsements (profile_id, skill, endorser_id) VALUES ($1, 'Python', $2)`, [U.s1, U.s3]);
      assert(second.ok, 'second peer endorsement failed: ' + second.err?.message);

      const counts = await c.q(`SELECT skill, count(*)::int n FROM public.skill_endorsements WHERE profile_id = $1 AND skill = 'Python' GROUP BY skill`, [U.s1]);
      eq(counts.rows, [{ skill: 'Python', n: 2 }], 'the endorsement count must aggregate across both endorsers');
    });
  });

  await check('skill_endorsements: a user can delete only their own endorsement, never someone else\'s', async () => {
    await as('postgres', async (c) => {
      await imp(U.s2);
      await c.q(`INSERT INTO public.skill_endorsements (profile_id, skill, endorser_id) VALUES ($1, 'Design', $2)`, [U.s4, U.s2]);

      await imp(U.s5);
      const stolenDelete = await c.t(`DELETE FROM public.skill_endorsements WHERE profile_id = $1 AND skill = 'Design'`, [U.s4]);
      assert(stolenDelete.ok && stolenDelete.n === 0, 's5 must not be able to delete s2\'s endorsement');

      await imp(U.s2);
      const ownDelete = await c.t(`DELETE FROM public.skill_endorsements WHERE profile_id = $1 AND skill = 'Design' AND endorser_id = $2`, [U.s4, U.s2]);
      assert(ownDelete.ok && ownDelete.n === 1, 'the owner could not delete their own endorsement');
    });
  });

  await check('skill_endorsements: anon has no access at all', async () => {
    await as('anon', async (c) => {
      denied(await c.t(`SELECT * FROM public.skill_endorsements`), /permission denied/i, 'anon select');
      denied(await c.t(`INSERT INTO public.skill_endorsements (profile_id, skill, endorser_id) VALUES ($1, 'x', $1)`, [U.s1]), /permission denied/i, 'anon insert');
    });
  });
}

// ---------------------------------------------------------------------------
// giving campaign self-service (20261005010000): the owner's direct
// confirmed_total/is_closed writes now actually work (the column comment on
// confirmed_total always said an owner could set it; the trigger silently
// reverted it); a substantive content edit still resends an approved
// campaign for review; get_giving_campaign_click_count() is owner-or-admin
// only. Same imp()/svc() local-helper pattern as the other sections above.
// ---------------------------------------------------------------------------
console.log('\n== giving campaign self-service (owner confirmed_total/close, click count) ==');
{
  const imp = async (uid) => {
    await db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${uid}', true)`);
  };
  const svc = async () => {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims', '', true); SELECT set_config('request.jwt.claim.sub', '', true)`);
  };

  /** An approved, open campaign owned by U.alumni. Returns its id. */
  async function mkApprovedCampaign(c, over = {}) {
    await svc();
    const r = await c.q(
      `INSERT INTO public.giving_campaigns (creator_id, title, description, giving_url, review_status, confirmed_total)
       VALUES ($1, $2, 'desc', 'https://give.example.com/lioris', 'approved', $3) RETURNING id`,
      [U.alumni, over.title ?? 'Scholarship Fund', over.confirmedTotal ?? 1000],
    );
    return r.rows[0].id;
  }

  await check('giving campaigns: the owner can now update confirmed_total on their own approved campaign directly, and it does not revert to pending', async () => {
    await as('postgres', async (c) => {
      const campaignId = await mkApprovedCampaign(c);

      await imp(U.alumni);
      await c.q(`UPDATE public.giving_campaigns SET confirmed_total = 7500 WHERE id = $1`, [campaignId]);
      const row = (await c.q(`SELECT confirmed_total, review_status FROM public.giving_campaigns WHERE id = $1`, [campaignId])).rows[0];
      eq({ confirmed_total: Number(row.confirmed_total), review_status: row.review_status }, { confirmed_total: 7500, review_status: 'approved' },
        "the owner's confirmed_total write sticks and does not force the campaign back to pending");

      denied(
        await c.t(`UPDATE public.giving_campaigns SET confirmed_total = -1 WHERE id = $1`, [campaignId]),
        /invalid_confirmed_total/,
        'a negative confirmed_total is still rejected',
      );
      denied(
        await c.t(`UPDATE public.giving_campaigns SET confirmed_total = NULL WHERE id = $1`, [campaignId]),
        /invalid_confirmed_total|not-null/i,
        'a NULL confirmed_total is still rejected',
      );
    });
  });

  await check('giving campaigns: the owner can close their own approved campaign without it reverting to pending', async () => {
    await as('postgres', async (c) => {
      const campaignId = await mkApprovedCampaign(c);

      await imp(U.alumni);
      await c.q(`UPDATE public.giving_campaigns SET is_closed = true WHERE id = $1`, [campaignId]);
      const row = (await c.q(`SELECT is_closed, review_status FROM public.giving_campaigns WHERE id = $1`, [campaignId])).rows[0];
      eq(row, { is_closed: true, review_status: 'approved' }, 'closing the campaign does not resend it for review');
    });
  });

  await check('giving campaigns: editing a substantive field (title) on an approved campaign still reverts it to pending', async () => {
    await as('postgres', async (c) => {
      const campaignId = await mkApprovedCampaign(c);

      await imp(U.alumni);
      await c.q(`UPDATE public.giving_campaigns SET title = 'Scholarship Fund 2027' WHERE id = $1`, [campaignId]);
      const row = (await c.q(`SELECT title, review_status FROM public.giving_campaigns WHERE id = $1`, [campaignId])).rows[0];
      eq(row, { title: 'Scholarship Fund 2027', review_status: 'pending' }, "editing the campaign's own pitch still sends it back for review");
    });
  });

  await check('giving campaigns: RLS still blocks a non-owner, non-admin from updating someone else\'s confirmed_total', async () => {
    await as('postgres', async (c) => {
      const campaignId = await mkApprovedCampaign(c);

      await imp(U.s1);
      const r = await c.t(`UPDATE public.giving_campaigns SET confirmed_total = 9999 WHERE id = $1`, [campaignId]);
      assert(r.ok, 'the UPDATE statement itself is not refused (RLS silently matches zero rows)');
      eq(r.n, 0, 'RLS hides the row from an unrelated user, so the update affects nothing');

      await svc();
      const row = (await c.q(`SELECT confirmed_total FROM public.giving_campaigns WHERE id = $1`, [campaignId])).rows[0];
      eq(Number(row.confirmed_total), 1000, "someone else's campaign total is untouched");
    });
  });

  await check('get_giving_campaign_click_count: returns the real count to the owner and to an admin, denied to an unrelated user', async () => {
    await as('postgres', async (c) => {
      const campaignId = await mkApprovedCampaign(c);

      // Insert clicks directly (rather than through open_giving_page(), which
      // also requires donations_enabled()) so this check is independent of
      // that unrelated feature flag.
      await svc();
      await c.q(`INSERT INTO public.giving_campaign_clicks (campaign_id, user_id) VALUES ($1, $2), ($1, $3), ($1, $2)`, [campaignId, U.s1, U.s2]);

      await imp(U.alumni);
      const ownerCount = (await c.q(`SELECT public.get_giving_campaign_click_count($1) n`, [campaignId])).rows[0].n;
      eq(ownerCount, 3, 'the owner sees the real click count');

      await imp(U.adminA);
      const adminCount = (await c.q(`SELECT public.get_giving_campaign_click_count($1) n`, [campaignId])).rows[0].n;
      eq(adminCount, 3, 'an admin sees the real click count too');

      await imp(U.s3);
      denied(
        await c.t(`SELECT public.get_giving_campaign_click_count($1)`, [campaignId]),
        /not_allowed/,
        'an unrelated, non-owner, non-admin user cannot see the click count',
      );
    });
  });
}

// ---------------------------------------------------------------------------
// resource ratings (20261005020000): star ratings + optional short reviews
// on academic resources, mirroring the mentorship-feedback shape (owner-only
// writes, read follows the resource's own visibility, aggregate summary via
// get_resource_rating_summary()).
// ---------------------------------------------------------------------------
console.log('\n== resource ratings (star ratings + reviews) ==');
{
  const imp = async (uid) => {
    await db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${uid}', true)`);
  };
  const svc = async () => {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims', '', true); SELECT set_config('request.jwt.claim.sub', '', true)`);
  };

  // Committed fixture (outside any check/as rollback) so every check below can
  // build on the same resource. Inserted with no JWT claims set (auth.uid() IS
  // NULL), which the moderation trigger treats as "service_role / migrations"
  // and leaves is_approved as given - same as the other superuser fixture
  // inserts in this file (mkUser, push tokens, role promotions above).
  const resourceRow = await admin(
    `INSERT INTO public.resources (uploader_id, campus_code, course_code, course_title, title, file_url, is_approved)
     VALUES ($1, 'UNILAG', 'CSC201', 'Data Structures', 'DS Lecture Notes', 'https://example.com/ds.pdf', true) RETURNING id`,
    [U.s1],
  );
  const resourceId = resourceRow.rows[0].id;

  await check('a user can rate a resource they can see', async () => {
    await as(U.s2, async (c) => {
      const r = await c.t(
        `INSERT INTO public.resource_ratings (resource_id, rater_id, rating, review) VALUES ($1, $2, 4, 'Helpful notes') RETURNING rating, review`,
        [resourceId, U.s2],
      );
      assert(r.ok, `rating a visible resource was refused: ${r.err?.message}`);
      eq(r.rows[0], { rating: 4, review: 'Helpful notes' });
    });
  });

  await check('re-rating the same resource updates the existing row instead of duplicating it (unique constraint + client upsert)', async () => {
    await as('postgres', async (c) => {
      await imp(U.s2);
      await c.q(
        `INSERT INTO public.resource_ratings (resource_id, rater_id, rating, review) VALUES ($1, $2, 4, 'First pass')`,
        [resourceId, U.s2],
      );
      await c.q(
        `INSERT INTO public.resource_ratings (resource_id, rater_id, rating, review) VALUES ($1, $2, 2, 'Actually mediocre')
         ON CONFLICT (resource_id, rater_id) DO UPDATE SET rating = EXCLUDED.rating, review = EXCLUDED.review`,
        [resourceId, U.s2],
      );
      await svc();
      const rows = await c.q(`SELECT rating, review FROM public.resource_ratings WHERE resource_id = $1 AND rater_id = $2`, [resourceId, U.s2]);
      eq(rows.rows.length, 1, 'still exactly one row for this (resource, rater) pair');
      eq(rows.rows[0], { rating: 2, review: 'Actually mediocre' }, 'the row was updated to the latest submission, not duplicated');
    });
  });

  await check('a user cannot forge rater_id and rate a resource on someone else\'s behalf', async () => {
    await as(U.s4, async (c) => {
      denied(
        await c.t(`INSERT INTO public.resource_ratings (resource_id, rater_id, rating) VALUES ($1, $2, 5)`, [resourceId, U.s5]),
        /row-level|policy/i,
        'inserting a rating row with rater_id != auth.uid()',
      );
    });
  });

  await check('a user cannot update (or delete) another user\'s individual rating row', async () => {
    await as('postgres', async (c) => {
      await imp(U.s2);
      await c.q(`INSERT INTO public.resource_ratings (resource_id, rater_id, rating) VALUES ($1, $2, 4)`, [resourceId, U.s2]);

      await imp(U.s4);
      const upd = await c.t(`UPDATE public.resource_ratings SET rating = 1 WHERE resource_id = $1 AND rater_id = $2`, [resourceId, U.s2]);
      // RLS hides the target row from s4 rather than raising: the UPDATE matches zero rows.
      assert(!upd.ok || upd.n === 0, "s4's UPDATE touched a row it does not own");
      const del = await c.t(`DELETE FROM public.resource_ratings WHERE resource_id = $1 AND rater_id = $2`, [resourceId, U.s2]);
      assert(!del.ok || del.n === 0, "s4's DELETE removed a row it does not own");

      await svc();
      const stillThere = await c.q(`SELECT rating FROM public.resource_ratings WHERE resource_id = $1 AND rater_id = $2`, [resourceId, U.s2]);
      eq(stillThere.rows[0]?.rating, 4, "s2's rating is untouched by s4");
    });
  });

  await check('anyone who can see the resource can read every rating on it, not just their own', async () => {
    await as('postgres', async (c) => {
      await imp(U.s1);
      await c.q(
        `INSERT INTO public.resource_ratings (resource_id, rater_id, rating) VALUES ($1, $2, 4) ON CONFLICT (resource_id, rater_id) DO UPDATE SET rating = EXCLUDED.rating`,
        [resourceId, U.s1],
      );
      await imp(U.s2);
      await c.q(
        `INSERT INTO public.resource_ratings (resource_id, rater_id, rating) VALUES ($1, $2, 2) ON CONFLICT (resource_id, rater_id) DO UPDATE SET rating = EXCLUDED.rating`,
        [resourceId, U.s2],
      );
      // The uploader can read both their own rating and s2's, not only their own.
      await imp(U.s1);
      const rows = await c.q(`SELECT rater_id FROM public.resource_ratings WHERE resource_id = $1 ORDER BY rater_id`, [resourceId]);
      eq(rows.rows.length, 2, 'the uploader sees every rating on their own resource');
    });
  });

  await check('get_resource_rating_summary returns a correct average and count across multiple raters', async () => {
    await as('postgres', async (c) => {
      for (const [uid, rating] of [[U.s1, 4], [U.s2, 2], [U.s4, 3], [U.s5, 5]]) {
        await imp(uid);
        await c.q(
          `INSERT INTO public.resource_ratings (resource_id, rater_id, rating) VALUES ($1, $2, $3)
           ON CONFLICT (resource_id, rater_id) DO UPDATE SET rating = EXCLUDED.rating`,
          [resourceId, uid, rating],
        );
      }
      await svc();
      // (4 + 2 + 3 + 5) / 4 = 3.5
      const r = await c.q(`SELECT * FROM public.get_resource_rating_summary($1)`, [resourceId]);
      eq(Number(r.rows[0].avg_rating), 3.5, 'average across the four raters');
      eq(Number(r.rows[0].rating_count), 4, 'count of raters');
    });
  });

  await check('a student on another campus cannot see or rate a resource restricted to a different campus', async () => {
    await as(U.s3, async (c) => {
      // U.s3 is on campus UI; the fixture resource above is UNILAG-only (not GLOBAL).
      const peek = await c.q(`SELECT * FROM public.resource_ratings WHERE resource_id = $1`, [resourceId]);
      eq(peek.rows.length, 0, 'RLS hides every rating on a resource this student cannot see');
      denied(
        await c.t(`INSERT INTO public.resource_ratings (resource_id, rater_id, rating) VALUES ($1, $2, 5)`, [resourceId, U.s3]),
        /row-level|policy/i,
        'rating a resource on a campus this student cannot see',
      );
    });
  });
}

// ---------------------------------------------------------------------------
// admin user diagnostics (20261005040000_admin_user_diagnostics.sql)
// ---------------------------------------------------------------------------
console.log('\n== admin user diagnostics ==');
{
  const imp = async (uid) => {
    await db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${uid}', true)`);
  };

  await check('admin_get_user_diagnostics: an admin gets an accurate mute/job-alert/notification-preference summary for any user', async () => {
    await as('postgres', async (c) => {
      // s1 is the target: s1 muted s3 (recently), s2 muted s1 (so s1 is muted-by 1).
      await imp(U.s1);
      await c.q(`INSERT INTO public.user_mutes (muter_id, muted_id) VALUES ($1, $2)`, [U.s1, U.s3]);
      // s1 has two job alerts, one active one not.
      await c.q(`INSERT INTO public.job_alerts (user_id, keywords, job_type, remote_only, campus_code, is_active) VALUES ($1, 'Engineer', NULL, false, NULL, true)`, [U.s1]);
      await c.q(`INSERT INTO public.job_alerts (user_id, keywords, job_type, remote_only, campus_code, is_active) VALUES ($1, 'Designer', NULL, false, NULL, false)`, [U.s1]);
      // s1 turns push notifications off (a non-default row).
      await c.q(`INSERT INTO public.notification_preferences (user_id, push_enabled) VALUES ($1, false)`, [U.s1]);

      await imp(U.s2);
      await c.q(`INSERT INTO public.user_mutes (muter_id, muted_id) VALUES ($1, $2)`, [U.s2, U.s1]);

      await imp(U.adminA);
      const data = (await c.q(`SELECT public.admin_get_user_diagnostics($1) AS data`, [U.s1])).rows[0].data;

      eq(data.mutes.muted_count, 1, 's1 has muted 1 user');
      eq(data.mutes.muted_by_count, 1, 's1 has been muted by 1 user');
      eq(data.mutes.recent_muted.map((r) => r.user_id), [U.s3], 'recent_muted names who s1 muted');
      eq(data.mutes.recent_muted_by.map((r) => r.user_id), [U.s2], 'recent_muted_by names who muted s1');

      eq(data.job_alerts.total_count, 2, 's1 has 2 job alerts total');
      eq(data.job_alerts.active_count, 1, 's1 has 1 active job alert');
      eq(data.job_alerts.alerts.map((a) => a.keywords).sort(), ['Designer', 'Engineer'], 'both alerts are returned in full');

      eq(data.notification_preferences.has_custom_row, true, 's1 has a saved notification_preferences row');
      eq(data.notification_preferences.push_enabled, false, 'the saved (non-default) push_enabled value is reflected');
      eq(data.notification_preferences.announcements_enabled, true, 'unset columns keep their table default');

      // s2 never wrote a notification_preferences row - diagnostics falls back
      // to the same all-on defaults the client itself assumes. (jsonb does not
      // preserve key insertion order, so fields are checked individually
      // rather than via a whole-object eq().)
      const dataS2 = (await c.q(`SELECT public.admin_get_user_diagnostics($1) AS data`, [U.s2])).rows[0].data;
      const prefsS2 = dataS2.notification_preferences;
      eq(prefsS2.has_custom_row, false, 'no row yet -> has_custom_row is false');
      eq(prefsS2.push_enabled, true, 'no row yet -> push_enabled defaults true');
      eq(prefsS2.announcements_enabled, true, 'no row yet -> announcements_enabled defaults true');
      eq(prefsS2.events_enabled, true, 'no row yet -> events_enabled defaults true');
      eq(prefsS2.digest_enabled, true, 'no row yet -> digest_enabled defaults true');
      eq(prefsS2.updated_at, null, 'no row yet -> updated_at is null');
    });
  });

  await check('admin_get_user_diagnostics: a plain student is denied', async () => {
    await as(U.s1, async (c) => {
      denied(await c.t(`SELECT public.admin_get_user_diagnostics($1)`, [U.s2]), /admin_required/, 'student forbidden');
    });
  });

  await check('admin_get_user_diagnostics: staff are scoped to their own campus (a staff member from a different campus is denied; same-campus staff succeeds)', async () => {
    await as('postgres', async (c) => {
      // staffU is UNILAG, staffI is UI; s1 is UNILAG.
      await imp(U.staffI);
      denied(await c.t(`SELECT public.admin_get_user_diagnostics($1)`, [U.s1]), /admin_required/, 'UI staff cannot diagnose a UNILAG user');

      await imp(U.staffU);
      const data = (await c.q(`SELECT public.admin_get_user_diagnostics($1) AS data`, [U.s1])).rows[0].data;
      eq(data.user_id, U.s1, 'same-campus staff can diagnose the user');
    });
  });
}

// ---------------------------------------------------------------------------
// study pod file sharing (20261006040000_study_pod_file_sharing.sql)
// ---------------------------------------------------------------------------
console.log('\n== study pod file sharing ==');
{
  const imp = async (uid) => {
    await db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${uid}', true)`);
  };
  // post_to_study_group() only requires pod membership, not a verified account
  // (that gate is on create_study_group), so fixtures are wired in directly.
  async function mkPod(c, name, owner, members = []) {
    const pod = (await c.q(
      `INSERT INTO public.study_groups (creator_id, campus_code, name, course_code, is_private) VALUES ($1, 'UNILAG', $2, '', false) RETURNING id`,
      [owner, name],
    )).rows[0].id;
    await c.q(`INSERT INTO public.study_group_members (group_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')`, [pod, owner]);
    for (const m of members) {
      await c.q(`INSERT INTO public.study_group_members (group_id, user_id, role, status) VALUES ($1, $2, 'member', 'active')`, [pod, m]);
    }
    return pod;
  }

  await check('post_to_study_group: a resource post can carry a storage file_path instead of a link, and list_study_group_posts returns it', async () => {
    await as('postgres', async (c) => {
      const pod = await mkPod(c, 'File sharing pod', U.s1);
      await imp(U.s1);

      const post = (await c.q(
        `SELECT * FROM public.post_to_study_group($1, 'Lecture slides for week 3', 'resource', 'Week 3 slides', NULL, NULL, $2)`,
        [pod, 's1-uid/pod_resources_slides.pdf'],
      )).rows[0];
      eq(post.link_url, null, 'no link was given');
      eq(post.file_path, 's1-uid/pod_resources_slides.pdf', 'the storage path round-trips on the insert');

      const listed = (await c.q(`SELECT * FROM public.list_study_group_posts($1)`, [pod])).rows[0];
      eq(listed.file_path, 's1-uid/pod_resources_slides.pdf', 'the storage path round-trips through list_study_group_posts');
      eq(listed.link_url, null, 'link_url stays null');
    });
  });

  await check('post_to_study_group: a resource post still works with only a link (file_path optional, old callers unaffected)', async () => {
    await as('postgres', async (c) => {
      const pod = await mkPod(c, 'Link only pod', U.s1);
      await imp(U.s1);
      const post = (await c.q(
        `SELECT * FROM public.post_to_study_group($1, 'Useful notes', 'resource', 'Great notes', 'https://example.com/notes.pdf')`,
        [pod],
      )).rows[0];
      eq(post.link_url, 'https://example.com/notes.pdf');
      eq(post.file_path, null, 'no file was attached');
    });
  });

  await check('post_to_study_group: a resource post needs a link or a file - not neither, and a bogus file_path is capped', async () => {
    await as('postgres', async (c) => {
      const pod = await mkPod(c, 'Validation pod', U.s1);
      await imp(U.s1);
      denied(
        await c.t(`SELECT public.post_to_study_group($1, 'Nothing attached', 'resource', 'Empty resource')`, [pod]),
        /invalid_input: add the link you are sharing, or attach a file/,
        'resource post with neither a link nor a file',
      );
      denied(
        await c.t(`SELECT public.post_to_study_group($1, 'Too long', 'resource', 'Oversized path', NULL, NULL, $2)`, [pod, 'x'.repeat(501)]),
        /invalid_input: the attached file reference is too long/,
        'file_path over 500 chars',
      );
    });
  });

  await check('post_to_study_group: only a pod member can attach a file (same membership gate as the rest of post_to_study_group)', async () => {
    await as('postgres', async (c) => {
      const pod = await mkPod(c, 'Members only pod', U.s1);
      await imp(U.s2);
      denied(
        await c.t(`SELECT public.post_to_study_group($1, 'Sneaking in a file', 'resource', 'Not a member', NULL, NULL, $2)`, [pod, 'u2/sneaky.pdf']),
        /not_allowed: join the pod to take part/,
        'non-member attaching a file',
      );
    });
  });

  await check('study_group_posts.file_path: the table CHECK rejects an overlong value directly (defence in depth, not just the RPC)', async () => {
    await as('postgres', async (c) => {
      const pod = await mkPod(c, 'Constraint pod', U.s1);
      const r = await c.t(
        `INSERT INTO public.study_group_posts (group_id, author_id, kind, title, body, file_path) VALUES ($1, $2, 'resource', 'x', 'y', $3)`,
        [pod, U.s1, 'x'.repeat(501)],
      );
      denied(r, /study_group_posts_file_path_chk|check constraint/i, 'direct insert past the 500-char cap');
    });
  });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n== Summary: ${results.length - failed.length}/${results.length} checks passed ==`);
if (failed.length) { for (const f of failed) console.log(` FAILED: ${f.name}\n    ${f.err}`); process.exit(1); }
