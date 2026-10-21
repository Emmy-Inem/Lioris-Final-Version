// Behaviour tests for supabase/migrations/20261112000000_reminders_and_public_analytics.sql, executed against an
// in-memory Postgres (PGlite). Nothing here touches a real database.
//
//   cd tools/sql-harness && npm install && node engagement.mjs
//
// Same load order as lifecycle.mjs; the migration under test is applied strictly (one transaction, no failing
// statement) and a second time to prove idempotency.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { newDb, bootstrap, applyFile, MIGRATIONS, ROOT } from './lib.mjs';

const LIFECYCLE = 'supabase/migrations/20261112000000_reminders_and_public_analytics.sql';
const ROOT_EXTRAS = [
  'supabase_campus_access_2026.sql',
  'supabase_account_email_change_2026.sql',
  'supabase_username_uniqueness_and_login_2026.sql',
  'supabase_portal_links_2026.sql',
  'supabase_fix_campus_selection_and_ui_leak_2026.sql',
];

const db = await newDb();
await bootstrap(db);
// Realtime publication as on Supabase (empty here; the checks below pre-publish one table).
await db.exec(`CREATE PUBLICATION supabase_realtime`);
for (const m of MIGRATIONS) await applyFile(db, m.file, m.strict, () => {});
for (const f of ROOT_EXTRAS) await applyFile(db, f, false, () => {});
const migrationFiles = readdirSync(resolve(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
let migrationResult = null;
for (const f of migrationFiles) {
  const path = `supabase/migrations/${f}`;
  if (path === LIFECYCLE) {
    try { migrationResult = await applyFile(db, path, true, () => {}); } catch (e) {
      console.log(`FATAL: engagement migration did not apply: ${e.message}${e.detail ? ' | ' + e.detail : ''}${e.where ? ' | ' + e.where : ''}`);
      process.exit(2);
    }
  } else {
    await applyFile(db, path, false, () => {});
  }
}

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
      const sub = typeof who === 'object' ? who.sub : who;
      const claims = { sub, role: 'authenticated', ...(typeof who === 'object' && who.email ? { email: who.email } : {}) };
      await db.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '${JSON.stringify(claims)}', true); SELECT set_config('request.jwt.claim.sub', '${sub}', true)`);
    }
    const role = who === 'postgres' ? null : who === 'anon' || who === 'service_role' ? who : 'authenticated';
    const c = {
      q: (sql, p) => db.query(sql, p),
      async t(sql, p) {
        await db.exec('SAVEPOINT chk');
        try { const r = await db.query(sql, p); await db.exec('RELEASE chk'); return { ok: true, rows: r.rows, n: r.affectedRows ?? r.rows.length }; }
        catch (e) { await db.exec('ROLLBACK TO chk'); await db.exec('RELEASE chk'); return { ok: false, err: e }; }
      },
      async su(sql, p) {
        if (role) await db.exec('RESET ROLE');
        try { return await db.query(sql, p); } finally { if (role) await db.exec(`SET LOCAL ROLE ${role}`); }
      },
    };
    return await fn(c);
  } finally { try { await db.exec('ROLLBACK'); } catch { /* closed */ } }
}
// Superuser work inside a transaction that is always rolled back.
const sandbox = (fn) => as('postgres', fn);

// --------------------------------------------------------------------------- fixtures
const U = { a: id(1), b: id(2), c: id(3), ui: id(4) };
async function mk(uid, email, campus) {
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ($1,$2,$3::jsonb, now())`,
    [uid, email, JSON.stringify({ campus_code: campus, full_name: email.split('@')[0] })]);
}
await mk(U.a, 'a@school.test', 'UNILAG');
await mk(U.b, 'b@school.test', 'UNILAG');
await mk(U.c, 'c@school.test', 'UNILAG');
await mk(U.ui, 'ui@school.test', 'UI');
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
await db.exec(`UPDATE public.profiles SET onboarding_complete=true, verification_status='verified'`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);

/** An event created by user a; start/end are SQL interval expressions relative to now(). */
async function mkEvent(c, { campus = 'UNILAG', start = "interval '30 minutes'", end = "interval '3 hours'", status = 'upcoming', scope = 'campus' } = {}) {
  const r = await c.q(
    `INSERT INTO public.events (creator_id, campus_code, title, description, venue, start_time, end_time, category, status, ticket_type, visibility_scope)
     VALUES ($1, $2, 'Reminder test event', 'desc', 'Hall', now() + ${start}, now() + ${end}, 'Academic', $3, 'free', $4) RETURNING id`,
    [U.a, campus, status, scope]);
  return r.rows[0].id;
}
async function impersonate(uid) {
  await db.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${uid}', true)`);
}
const code = (r) => (r.err?.message ?? '').split(':')[0];

console.log('\n== ENGAGEMENT ==');

await check('migration applies cleanly in a single transaction', async () => { assert(migrationResult && !migrationResult.failures?.length, 'did not apply'); });
await check('migration is idempotent (second run)', async () => { await db.exec(readFileSync(resolve(ROOT, LIFECYCLE), 'utf8')); });

// --------------------------------------------------------------------------- event reminders
await check('set_event_reminder is idempotent: on twice is one row, off twice is none, and the server reports the state', async () => {
  await as('postgres', async (c) => {
    const ev = await mkEvent(c);
    await impersonate(U.b);
    eq((await c.q(`SELECT public.set_event_reminder($1, true) r`, [ev])).rows[0].r.reminder_on, true);
    eq((await c.q(`SELECT public.set_event_reminder($1, true) r`, [ev])).rows[0].r.reminder_on, true);
    eq(Number((await c.q(`SELECT count(*) n FROM public.event_reminders WHERE user_id = $1`, [U.b])).rows[0].n), 1);
    eq((await c.q(`SELECT count(*)::int n FROM public.get_my_event_reminders()`)).rows[0].n, 1);
    eq((await c.q(`SELECT public.set_event_reminder($1, false) r`, [ev])).rows[0].r.reminder_on, false);
    eq((await c.q(`SELECT public.set_event_reminder($1, false) r`, [ev])).rows[0].r.reminder_on, false);
    eq((await c.q(`SELECT count(*)::int n FROM public.get_my_event_reminders()`)).rows[0].n, 0);
  });
});
await check('the legacy toggle still flips the reminder, through the same checks', async () => {
  await as('postgres', async (c) => {
    const ev = await mkEvent(c);
    await impersonate(U.b);
    eq((await c.q(`SELECT public.toggle_event_reminder($1) r`, [ev])).rows[0].r.reminder_on, true);
    eq((await c.q(`SELECT public.toggle_event_reminder($1) r`, [ev])).rows[0].r.reminder_on, false);
  });
});
await check('a reminder needs a signed-in user, a real event, an event that is visible to them and not over', async () => {
  await as('postgres', async (c) => {
    const mine = await mkEvent(c);
    const other = await mkEvent(c, { campus: 'UI' });
    const over = await mkEvent(c, { start: "interval '-5 hours'", end: "interval '-4 hours'" });
    const cancelled = await mkEvent(c, { status: 'cancelled' });
    await impersonate(U.b);
    denied(await c.t(`SELECT public.set_event_reminder($1, true)`, [id(999)]), /not_found/, 'unknown event');
    denied(await c.t(`SELECT public.set_event_reminder($1, true)`, [other]), /not_found/, 'another campus');
    denied(await c.t(`SELECT public.set_event_reminder($1, true)`, [over]), /event_over/, 'event over');
    denied(await c.t(`SELECT public.set_event_reminder($1, true)`, [cancelled]), /event_over/, 'cancelled event');
    eq((await c.q(`SELECT public.set_event_reminder($1, true) r`, [mine])).rows[0].r.reminder_on, true);
  });
  await as('anon', async (c) => denied(await c.t(`SELECT public.set_event_reminder($1, true)`, [id(999)]), /permission denied/i, 'anon'));
});
await check('a member can hold at most 200 active reminders', async () => {
  await as('postgres', async (c) => {
    const ev = await mkEvent(c);
    // 200 distinct events for user c
    const ids = [];
    for (let i = 0; i < 200; i += 1) ids.push(await mkEvent(c));
    await c.q(`INSERT INTO public.event_reminders (user_id, event_id) SELECT $1, unnest($2::uuid[])`, [U.c, ids]);
    await impersonate(U.c);
    denied(await c.t(`SELECT public.set_event_reminder($1, true)`, [ev]), /too_many/, '201st');
    eq((await c.q(`SELECT public.set_event_reminder($1, true) r`, [ids[0]])).rows[0].r.reminder_on, true, 'an existing reminder can be re-set');
  });
});
await check('get_my_event_reminders drops events that ended more than a day ago and never shows another member\'s reminders', async () => {
  await as('postgres', async (c) => {
    const live = await mkEvent(c);
    const old = await mkEvent(c, { start: "interval '-3 days'", end: "interval '-3 days' + interval '2 hours'" });
    await c.q(`INSERT INTO public.event_reminders (user_id, event_id) VALUES ($1,$2),($1,$3),($4,$2)`, [U.b, live, old, U.c]);
    await impersonate(U.b);
    eq((await c.q(`SELECT event_id FROM public.get_my_event_reminders()`)).rows.map((r) => r.event_id), [live]);
  });
});
await check('dispatch_event_reminders sends one in-app notification per due reminder, once', async () => {
  await as('postgres', async (c) => {
    const soon = await mkEvent(c, { start: "interval '30 minutes'" });
    const later = await mkEvent(c, { start: "interval '5 hours'", end: "interval '7 hours'" });
    await c.q(`INSERT INTO public.event_reminders (user_id, event_id) VALUES ($1,$2),($1,$3),($4,$2)`, [U.b, soon, later, U.c]);
    eq((await c.q(`SELECT public.dispatch_event_reminders() n`)).rows[0].n, 2, 'two members are due');
    const n = (await c.q(`SELECT recipient_id, type, action_url, title FROM public.notifications WHERE action_url = '/events/${soon}' ORDER BY recipient_id`)).rows;
    eq(n.map((r) => r.recipient_id).sort(), [U.b, U.c].sort(), 'recipients');
    assert(n.every((r) => r.type === 'system' && r.title === 'Starting soon'), 'type/title');
    eq((await c.q(`SELECT public.dispatch_event_reminders() n`)).rows[0].n, 0, 'second run sends nothing');
    eq(Number((await c.q(`SELECT count(*) n FROM public.event_reminders WHERE event_id = $1 AND notified_at IS NULL`, [later])).rows[0].n), 1, 'the later event stays armed');
  });
});
await check('reminders for events that already started, were cancelled, or belong to suspended members are closed without a ping', async () => {
  await as('postgres', async (c) => {
    const started = await mkEvent(c, { start: "interval '-10 minutes'" });
    const cancelled = await mkEvent(c, { status: 'cancelled' });
    const soon = await mkEvent(c);
    await c.q(`INSERT INTO public.event_reminders (user_id, event_id) VALUES ($1,$2),($1,$3),($4,$5)`, [U.b, started, cancelled, U.c, soon]);
    await c.q(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
    await c.q(`UPDATE public.profiles SET is_suspended = true WHERE id = $1`, [U.c]);
    await c.q(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
    eq((await c.q(`SELECT public.dispatch_event_reminders() n`)).rows[0].n, 0);
    eq(Number((await c.q(`SELECT count(*) n FROM public.notifications WHERE recipient_id IN ($1,$2) AND title = 'Starting soon'`, [U.b, U.c])).rows[0].n), 0, 'no pings');
    eq(Number((await c.q(`SELECT count(*) n FROM public.event_reminders WHERE event_id IN ($1,$2) AND notified_at IS NOT NULL`, [started, cancelled])).rows[0].n), 2, 'closed');
  });
});
await check('moving an event to a later time re-arms its reminders', async () => {
  await as('postgres', async (c) => {
    const ev = await mkEvent(c);
    await c.q(`INSERT INTO public.event_reminders (user_id, event_id) VALUES ($1,$2)`, [U.b, ev]);
    eq((await c.q(`SELECT public.dispatch_event_reminders() n`)).rows[0].n, 1);
    await c.q(`UPDATE public.events SET start_time = start_time + interval '1 day', end_time = end_time + interval '1 day' WHERE id = $1`, [ev]);
    eq(Number((await c.q(`SELECT count(*) n FROM public.event_reminders WHERE event_id = $1 AND notified_at IS NULL`, [ev])).rows[0].n), 1, 're-armed');
    await c.q(`UPDATE public.events SET start_time = start_time + interval '10 minutes' WHERE id = $1`, [ev]);
    eq(Number((await c.q(`SELECT count(*) n FROM public.event_reminders WHERE event_id = $1 AND notified_at IS NULL`, [ev])).rows[0].n), 1, 'still armed after a small shift');
  });
});
await check('dispatch_event_reminders is not callable by members or visitors', async () => {
  await as('anon', async (c) => denied(await c.t(`SELECT public.dispatch_event_reminders()`), /permission denied/i, 'anon'));
  await as(U.b, async (c) => denied(await c.t(`SELECT public.dispatch_event_reminders()`), /permission denied/i, 'authenticated'));
  await as('service_role', async (c) => { const r = await c.t(`SELECT public.dispatch_event_reminders()`); assert(r.ok, 'service_role'); });
});

// --------------------------------------------------------------------------- signed-out page views
await check('record_public_page_view stores an anonymous row for a public page and ignores anything else', async () => {
  await as('anon', async (c) => {
    await c.q(`SELECT public.record_public_page_view('/login')`);
    await c.q(`SELECT public.record_public_page_view('/privacy')`);
    for (const bad of ['/messages/123', '/(student)/feed', '', null, '/login?x=1', 'x'.repeat(500)]) {
      await c.q(`SELECT public.record_public_page_view($1)`, [bad]);
    }
    await c.su(`SELECT 1`);
    const rows = (await c.su(`SELECT name, user_id, event_type, campus_code, metadata FROM public.analytics_events WHERE metadata ->> 'signed_out' = 'true' ORDER BY name`)).rows;
    eq(rows.map((r) => r.name), ['/login', '/privacy']);
    assert(rows.every((r) => r.user_id === null && r.event_type === 'page_view' && r.campus_code === 'GLOBAL'), 'anonymous row shape');
  });
});
await check('record_public_page_view is capped at 600 rows a minute across all visitors', async () => {
  await as('postgres', async (c) => {
    await c.q(`INSERT INTO public.api_rate_limits (key, window_start, count) VALUES ('public_page_view', now(), 600)
               ON CONFLICT (key) DO UPDATE SET window_start = now(), count = 600`);
    const before = Number((await c.q(`SELECT count(*) n FROM public.analytics_events`)).rows[0].n);
    await db.exec(`SET LOCAL ROLE anon; SELECT set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await c.q(`SELECT public.record_public_page_view('/login')`);
    await c.q(`RESET ROLE`);
    eq(Number((await c.q(`SELECT count(*) n FROM public.analytics_events`)).rows[0].n), before, 'nothing stored while capped');
  });
});
await check('record_user_activity still ignores signed-out callers (the public endpoint is the only anonymous door)', async () => {
  await as('anon', async (c) => denied(await c.t(`SELECT public.record_user_activity('page_view', '/login')`), /permission denied/i, 'anon'));
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
