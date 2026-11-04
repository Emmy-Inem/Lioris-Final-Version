// Behaviour tests for supabase/migrations/20261115000000_security_audit_round6.sql, executed against an
// in-memory Postgres (PGlite). Nothing here touches a real database.
//
//   cd tools/sql-harness && npm install && node security-round6.mjs
//
// Same load order as engagement.mjs; the migration under test is applied strictly (one transaction, no failing
// statement) and a second time to prove idempotency. Every check below failed against the schema as it stood at
// 20261114000000 (that is how each hole was confirmed) and passes with the migration.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { newDb, bootstrap, applyFile, MIGRATIONS, ROOT } from './lib.mjs';

const ROUND6 = 'supabase/migrations/20261115000000_security_audit_round6.sql';
const ROOT_EXTRAS = [
  'supabase_campus_access_2026.sql',
  'supabase_account_email_change_2026.sql',
  'supabase_username_uniqueness_and_login_2026.sql',
  'supabase_portal_links_2026.sql',
  'supabase_fix_campus_selection_and_ui_leak_2026.sql',
];

const db = await newDb();
await bootstrap(db);
await db.exec(`CREATE PUBLICATION supabase_realtime`);
for (const m of MIGRATIONS) await applyFile(db, m.file, m.strict, () => {});
for (const f of ROOT_EXTRAS) await applyFile(db, f, false, () => {});
const migrationFiles = readdirSync(resolve(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
let migrationResult = null;
for (const f of migrationFiles) {
  const path = `supabase/migrations/${f}`;
  if (path === ROUND6) {
    try { migrationResult = await applyFile(db, path, true, () => {}); } catch (e) {
      console.log(`FATAL: round-6 migration did not apply: ${e.message}${e.detail ? ' | ' + e.detail : ''}${e.where ? ' | ' + e.where : ''}`);
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
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log(`FAIL  ${name}\n      -> ${String(e.message).slice(0, 400)}`); }
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
const sandbox = (fn) => as('postgres', fn);

// --------------------------------------------------------------------------- fixtures
const U = {
  root: id(1), admA: id(2), staffA: id(3), uvA: id(4), sA: id(5), sB: id(6), ambA: id(7), sA2: id(8), alumA: id(9),
  minA: id(10), admB: id(11), globU: id(12), botA: id(13), admOwn: id(14),
};
const ROOT_EMAIL = 'inememmanuel@gmail.com';
const dobAge = async (n) => (await db.query(`SELECT (current_date - interval '${n} years' - interval '1 day')::date::text d`)).rows[0].d;
async function mk(uid, email, campus, meta = {}) {
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ($1,$2,$3::jsonb, now())`,
    [uid, email, JSON.stringify({ campus_code: campus, full_name: email.split('@')[0], ...meta })]);
}
const ADULT = await dobAge(25);
const CAMPUS = { root: 'GLOBAL', admA: 'UNILAG', staffA: 'UNILAG', uvA: 'UNILAG', sA: 'UNILAG', sB: 'UI', ambA: 'UNILAG', sA2: 'UNILAG', alumA: 'UNILAG', minA: 'UNILAG', admB: 'UI', globU: 'GLOBAL', botA: 'UNILAG', admOwn: 'UNILAG' };
for (const [k, c] of Object.entries(CAMPUS)) {
  await mk(U[k], k === 'root' ? ROOT_EMAIL : `${k.toLowerCase()}@school.test`, c, { date_of_birth: k === 'minA' ? await dobAge(15) : ADULT });
}
const L = (...k) => k.map((x) => `'${U[x]}'`).join(',');
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
await db.exec(`UPDATE public.profiles SET onboarding_complete=true, verification_status='verified'`);
await db.exec(`UPDATE public.profiles SET role='admin', admin_role='super_admin' WHERE id=${L('root')}`);
await db.exec(`UPDATE public.profiles SET role='admin', admin_role='campus_admin' WHERE id IN (${L('admA', 'admB')})`);
await db.exec(`UPDATE public.profiles SET role='admin', admin_role='campus_admin', is_campus_ambassador=true WHERE id=${L('ambA')}`);
await db.exec(`UPDATE public.profiles SET role='staff' WHERE id=${L('staffA')}`);
await db.exec(`UPDATE public.profiles SET role='alumni' WHERE id=${L('alumA')}`);
await db.exec(`UPDATE public.profiles SET verification_status='unverified' WHERE id=${L('uvA')}`);
await db.exec(`UPDATE public.profiles SET is_bot=true WHERE id=${L('botA')}`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);
await db.exec(`ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT SELECT, INSERT, UPDATE ON storage.objects TO anon, authenticated;`);

async function row(table, vals) {
  const cols = (await db.query(`SELECT column_name c, data_type d, udt_name u, is_nullable n, column_default df FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table])).rows;
  const r = { ...vals };
  for (const c of cols) {
    if (c.c in r || c.n === 'YES' || c.df !== null) continue;
    if (c.d === 'uuid') r[c.c] = '00000000-0000-4000-8000-0000000000aa';
    else if (c.d === 'ARRAY') r[c.c] = '{}';
    else if (c.d === 'boolean') r[c.c] = false;
    else if (/int|numeric|double|real/.test(c.d)) r[c.c] = 0;
    else if (/timestamp/.test(c.d)) r[c.c] = new Date().toISOString();
    else if (c.d === 'jsonb' || c.d === 'json') r[c.c] = '{}';
    else if (c.d === 'USER-DEFINED') r[c.c] = (await db.query(`SELECT e.enumlabel l FROM pg_enum e JOIN pg_type ty ON ty.oid=e.enumtypid WHERE ty.typname=$1 ORDER BY e.enumsortorder LIMIT 1`, [c.u])).rows[0].l;
    else r[c.c] = 'x';
  }
  return r;
}
const insSql = (table, r) => {
  const keys = Object.keys(r);
  return [`INSERT INTO public.${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map((k) => r[k])];
};
async function ins(table, vals) {
  const r = await row(table, vals);
  const [sql, params] = insSql(table, r);
  await db.exec('SET session_replication_role = replica');
  try { await db.query(sql, params); } finally { await db.exec('SET session_replication_role = origin'); }
}
const FUT = new Date(Date.now() + 86400000 * 3).toISOString();
const FUT2 = new Date(Date.now() + 86400000 * 3 + 3600000).toISOString();
const P = (k) => ({ sub: U[k], email: `${k.toLowerCase()}@school.test` });
const ROOTP = { sub: U.root, email: ROOT_EMAIL };

const S = {
  pub: id(101), draft: id(102), sched: id(103), staffOnly: id(104), gDraft: id(105), gPub: id(106), uiPub: id(107),
  evPendU: id(201), evPendG: id(202), evOkG: id(203), evUI: id(204),
  jobPend: id(301), jobOk: id(302), jqPend: id(303), jqOk: id(304),
  mktRemoved: id(401), mktOk: id(402),
  sg: id(501), cmt: id(601), cmtUI: id(602),
  evPaidU: id(701), evPaidG: id(702),
};
await ins('posts', { id: S.pub, author_id: U.sA, campus_code: 'UNILAG', visibility_scope: 'campus', audience_scope: 'global', status: 'published', title: 'campus post' });
await ins('posts', { id: S.draft, author_id: U.sA, campus_code: 'UNILAG', visibility_scope: 'campus', audience_scope: 'global', status: 'draft', title: 'draft' });
await ins('posts', { id: S.sched, author_id: U.sA, campus_code: 'UNILAG', visibility_scope: 'campus', audience_scope: 'global', status: 'scheduled', scheduled_at: FUT, title: 'scheduled' });
await ins('posts', { id: S.staffOnly, author_id: U.sA, campus_code: 'UNILAG', visibility_scope: 'campus', audience_scope: 'staff', status: 'published', title: 'staff only' });
await ins('posts', { id: S.gDraft, author_id: U.sA, campus_code: 'UNILAG', visibility_scope: 'global', audience_scope: 'global', status: 'draft', title: 'global draft' });
await ins('posts', { id: S.gPub, author_id: U.sA, campus_code: 'UNILAG', visibility_scope: 'global', audience_scope: 'global', status: 'published', title: 'global post' });
await ins('posts', { id: S.uiPub, author_id: U.sB, campus_code: 'UI', visibility_scope: 'campus', audience_scope: 'global', status: 'published', title: 'ui post' });
await ins('events', { id: S.evPendU, creator_id: U.sA, campus_code: 'UNILAG', visibility_scope: 'campus', start_time: FUT, end_time: FUT2, status: 'pending_approval', title: 'pending campus event' });
await ins('events', { id: S.evPendG, creator_id: U.sA, campus_code: 'GLOBAL', visibility_scope: 'global', start_time: FUT, end_time: FUT2, status: 'pending_approval', title: 'pending global event' });
await ins('events', { id: S.evOkG, creator_id: U.root, campus_code: 'GLOBAL', visibility_scope: 'global', start_time: FUT, end_time: FUT2, status: 'upcoming', title: 'approved global event' });
await ins('events', { id: S.evUI, creator_id: U.sB, campus_code: 'UI', visibility_scope: 'campus', start_time: FUT, end_time: FUT2, status: 'upcoming', title: 'ui event' });
await ins('jobs', { id: S.jobPend, poster_id: U.alumA, campus_code: 'UNILAG', is_approved: false, accepts_in_app_applications: true, is_closed: false, expires_at: FUT, title: 'pending job' });
await ins('jobs', { id: S.jobOk, poster_id: U.alumA, campus_code: 'UNILAG', is_approved: true, accepts_in_app_applications: true, is_closed: false, expires_at: FUT, title: 'approved job' });
await ins('job_questions', { id: S.jqPend, job_id: S.jobPend, question_text: 'pending q' });
await ins('job_questions', { id: S.jqOk, job_id: S.jobOk, question_text: 'approved q' });
await ins('marketplace_listings', { id: S.mktRemoved, seller_id: U.sA, campus_code: 'UNILAG', title: 'removed listing', is_removed: true, takedown_reason: 'scam' });
await ins('marketplace_listings', { id: S.mktOk, seller_id: U.sA, campus_code: 'UNILAG', title: 'listing', expires_at: FUT });
await ins('study_groups', { id: S.sg, creator_id: U.sA, campus_code: 'UNILAG', name: 'Private pod', course_code: 'CSC101', max_members: 10, is_private: true, meeting_link: 'https://meet.example/secret-room', goal: 'secret goal' });
await ins('study_group_members', { group_id: S.sg, user_id: U.sA, role: 'owner', status: 'active' });
await ins('post_comments', { id: S.cmt, post_id: S.pub, author_id: U.sA, content: 'a comment' });
await ins('post_likes', { post_id: S.pub, user_id: U.sA2 });
await ins('post_likes', { post_id: S.uiPub, user_id: U.sB });
await ins('post_poll_votes', { post_id: S.pub, user_id: U.sA2, option_id: 'a' });

console.log('\n== SECURITY ROUND 6 ==');

await check('migration applies cleanly in a single transaction', async () => { assert(migrationResult && !migrationResult.failures?.length, 'did not apply'); });
await check('migration is idempotent (second run)', async () => { await db.exec(readFileSync(resolve(ROOT, ROUND6), 'utf8')); });
await check('every SECURITY DEFINER function in public / lioris_internal pins its search_path', async () => {
  const r = await db.query(`SELECT p.oid::regprocedure::text f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','lioris_internal') AND p.prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) s WHERE s LIKE 'search_path=%')`);
  eq(r.rows.map((x) => x.f), [], 'definer functions without a pinned search_path');
});

// --------------------------------------------------------------------------- 1. visibility
const titles = async (c, sql) => (await c.q(sql)).rows.map((r) => r.t).sort();
await check('posts: drafts, scheduled posts and staff-audience posts are not readable by campus peers (nor global drafts by other campuses)', async () => {
  const sql = `SELECT title t FROM public.posts WHERE id IN ('${S.pub}','${S.draft}','${S.sched}','${S.staffOnly}','${S.gDraft}','${S.gPub}') ORDER BY title`;
  await as(P('sA2'), async (c) => eq(await titles(c, sql), ['campus post', 'global post'], 'verified campus peer'));
  await as(P('sB'), async (c) => eq(await titles(c, sql), ['global post'], 'other campus (global draft must stay hidden)'));
  await as(P('sA'), async (c) => eq(await titles(c, sql), ['campus post', 'draft', 'global draft', 'global post', 'scheduled', 'staff only'], 'the author sees all of their own'));
  await as(P('admA'), async (c) => eq((await titles(c, sql)).length, 6, 'campus admin keeps moderation reach'));
});
await check('posts: the campus wall holds for an unverified account that only claims the campus; comments on a post you cannot see are refused', async () => {
  await as(P('uvA'), async (c) => {
    eq(await titles(c, `SELECT title t FROM public.posts WHERE id IN ('${S.pub}','${S.gPub}') ORDER BY title`), ['global post'], 'unverified sees only global');
    denied(await c.t(`INSERT INTO public.post_comments (post_id, author_id, content) VALUES ('${S.pub}','${U.uvA}','hi')`), /row-level security/, 'comment on a hidden campus post');
  });
});
await check('jobs: a posting still in review is read by its poster and staff / admins only; approved campus postings stay readable (and applyable)', async () => {
  const sql = `SELECT title t FROM public.jobs WHERE id IN ('${S.jobPend}','${S.jobOk}') ORDER BY title`;
  await as(P('sA2'), async (c) => eq(await titles(c, sql), ['approved job']));
  await as(P('alumA'), async (c) => eq(await titles(c, sql), ['approved job', 'pending job']));
  await as(P('admA'), async (c) => eq(await titles(c, sql), ['approved job', 'pending job']));
  await as(P('admB'), async (c) => eq(await titles(c, sql), [], 'other campus admin'));
});
await check('job_questions: no longer readable by anyone; visible exactly when the job is', async () => {
  const sql = `SELECT question_text t FROM public.job_questions WHERE id IN ('${S.jqPend}','${S.jqOk}') ORDER BY 1`;
  await as('anon', async (c) => { const r = await c.t(sql); assert(!r.ok || r.rows.length === 0, 'anon read job questions'); });
  await as(P('sA2'), async (c) => eq(await titles(c, sql), ['approved q']));
  await as(P('alumA'), async (c) => eq(await titles(c, sql), ['approved q', 'pending q']));
});
await check('marketplace: an admin-removed listing stays hidden from the campus (seller and staff still see it); the campus wall applies', async () => {
  const sql = `SELECT title t FROM public.marketplace_listings WHERE id IN ('${S.mktRemoved}','${S.mktOk}') ORDER BY title`;
  await as(P('sA2'), async (c) => eq(await titles(c, sql), ['listing']));
  await as(P('uvA'), async (c) => eq(await titles(c, sql), [], 'unverified claimant'));
  await as(P('sA'), async (c) => eq(await titles(c, sql), ['listing', 'removed listing']));
  await as(P('staffA'), async (c) => eq(await titles(c, sql), ['listing', 'removed listing']));
});
await check('study pods: a non-member cannot read the pod row (meeting link, goal) from the table; list_study_groups still shows the pod without the link', async () => {
  await as(P('sA2'), async (c) => {
    eq((await c.q(`SELECT meeting_link FROM public.study_groups WHERE id='${S.sg}'`)).rows, [], 'direct table read');
    const l = (await c.q(`SELECT name, meeting_link FROM public.list_study_groups(NULL, NULL, '${S.sg}', false)`)).rows;
    eq(l.map((r) => r.name), ['Private pod']); assert(l[0].meeting_link === null, 'meeting link leaked through list_study_groups');
  });
  await as(P('sA'), async (c) => eq((await c.q(`SELECT meeting_link FROM public.study_groups WHERE id='${S.sg}'`)).rows.length, 1, 'the owner reads the pod'));
  await as(P('admA'), async (c) => eq((await c.q(`SELECT 1 FROM public.study_groups WHERE id='${S.sg}'`)).rows.length, 1, 'campus admin'));
});
await check('events: a submission awaiting approval is hidden from campus peers, other campuses and signed-out visitors; creator / staff / admins see it', async () => {
  const sql = `SELECT title t FROM public.events WHERE id IN ('${S.evPendU}','${S.evPendG}','${S.evOkG}') ORDER BY title`;
  await as('anon', async (c) => eq(await titles(c, sql), ['approved global event'], 'anon'));
  await as(P('sA2'), async (c) => eq(await titles(c, sql), ['approved global event']));
  await as(P('sB'), async (c) => eq(await titles(c, sql), ['approved global event']));
  await as(P('sA'), async (c) => eq(await titles(c, sql), ['approved global event', 'pending campus event', 'pending global event'], 'creator'));
  await as(P('admA'), async (c) => eq((await titles(c, sql)).includes('pending campus event'), true, 'campus admin'));
  await as(ROOTP, async (c) => eq((await titles(c, sql)).length, 3, 'super admin'));
});
await check('likes / reposts / comment likes / poll votes / reminders follow the visibility of what they hang on', async () => {
  await as(P('sA2'), async (c) => {
    denied(await c.t(`INSERT INTO public.post_likes (post_id, user_id) VALUES ('${S.uiPub}','${U.sA2}')`), /row-level security/, 'like another campus post');
    denied(await c.t(`INSERT INTO public.post_reposts (post_id, user_id) VALUES ('${S.uiPub}','${U.sA2}')`), /row-level security/, 'repost another campus post');
    denied(await c.t(`INSERT INTO public.event_reminders (event_id, user_id) VALUES ('${S.evUI}','${U.sA2}')`), /row-level security/, 'reminder for an event you cannot see');
    assert((await c.t(`INSERT INTO public.event_reminders (event_id, user_id) VALUES ('${S.evOkG}','${U.sA2}')`)).ok, 'reminder for a visible event still works');
    assert((await c.t(`INSERT INTO public.post_reposts (post_id, user_id) VALUES ('${S.pub}','${U.sA2}')`)).ok, 'repost a visible post still works');
    eq((await c.q(`SELECT user_id FROM public.post_likes WHERE post_id='${S.uiPub}'`)).rows, [], 'who liked another campus post');
  });
  await as(P('sB'), async (c) => {
    eq((await c.q(`SELECT user_id FROM public.post_likes WHERE post_id='${S.pub}'`)).rows, [], 'who liked a post of another campus');
    eq((await c.q(`SELECT user_id FROM public.post_poll_votes WHERE post_id='${S.pub}'`)).rows, [], 'who voted in a poll of another campus');
  });
  await as(P('sA'), async (c) => eq((await c.q(`SELECT user_id FROM public.post_poll_votes WHERE post_id='${S.pub}'`)).rows.length, 1, 'own campus poll votes stay readable'));
  await as(P('sA'), async (c) => eq((await c.q(`SELECT user_id FROM public.post_likes WHERE post_id='${S.pub}'`)).rows.length, 1, 'own campus likes stay readable'));
  await as(P('sB'), async (c) => denied(await c.t(`INSERT INTO public.post_comment_likes (comment_id, user_id) VALUES ('${S.cmt}','${U.sB}')`), /row-level security/, 'like a comment on a post you cannot see'));
  await as(P('sA2'), async (c) => assert((await c.t(`INSERT INTO public.post_comment_likes (comment_id, user_id) VALUES ('${S.cmt}','${U.sA2}')`)).ok, 'like a visible comment'));
  await as(P('sA2'), async (c) => denied(await c.t(`INSERT INTO public.forum_community_members (community_id, user_id) VALUES ('${id(999)}','${U.sA2}')`), /row-level security|foreign key/, 'join a community you cannot see'));
});

// --------------------------------------------------------------------------- 2. counters / timestamps / flags
await check('a comment author cannot set likes_count (insert or update); a post author cannot set reposts_count', async () => {
  await as(P('sA'), async (c) => {
    await c.q(`UPDATE public.post_comments SET likes_count = 9999 WHERE id='${S.cmt}'`);
    eq((await c.q(`SELECT likes_count FROM public.post_comments WHERE id='${S.cmt}'`)).rows[0].likes_count, 0, 'update');
    await c.q(`INSERT INTO public.post_comments (id, post_id, author_id, content, likes_count) VALUES ('${id(603)}','${S.pub}','${U.sA}','x', 500)`);
    eq((await c.q(`SELECT likes_count FROM public.post_comments WHERE id='${id(603)}'`)).rows[0].likes_count, 0, 'insert');
    await c.q(`UPDATE public.posts SET reposts_count = 9999 WHERE id='${S.pub}'`);
    await c.q(`INSERT INTO public.posts (id, author_id, campus_code, content, status, reposts_count) VALUES ('${id(108)}','${U.sA}','UNILAG','x','published', 500)`);
    eq((await c.q(`SELECT reposts_count FROM public.posts WHERE id IN ('${S.pub}','${id(108)}')`)).rows.map((r) => r.reposts_count), [0, 0]);
  });
  // the legitimate counter-maintenance triggers still count
  await as(P('sA2'), async (c) => {
    await c.q(`INSERT INTO public.post_comment_likes (comment_id, user_id) VALUES ('${S.cmt}','${U.sA2}')`);
    await c.q(`INSERT INTO public.post_reposts (post_id, user_id) VALUES ('${S.pub}','${U.sA2}')`);
    eq((await c.su(`SELECT (SELECT likes_count FROM public.post_comments WHERE id='${S.cmt}') l, (SELECT reposts_count FROM public.posts WHERE id='${S.pub}') r`)).rows[0], { l: 1, r: 1 });
  });
});
await check('created_at cannot be post-dated by a member (posts, comments, jobs, listings, events); service-side writes are untouched', async () => {
  await as(P('sA'), async (c) => {
    await c.q(`INSERT INTO public.posts (id, author_id, campus_code, content, status, created_at) VALUES ('${id(109)}','${U.sA}','UNILAG','x','published', now() + interval '10 years')`);
    await c.q(`UPDATE public.posts SET created_at = now() + interval '10 years' WHERE id='${S.pub}'`);
    await c.q(`INSERT INTO public.post_comments (id, post_id, author_id, content, created_at) VALUES ('${id(604)}','${S.pub}','${U.sA}','x', now() + interval '10 years')`);
    await c.q(`UPDATE public.marketplace_listings SET created_at = now() + interval '10 years' WHERE id='${S.mktOk}'`);
    const r = (await c.su(`SELECT (SELECT max(created_at) FROM public.posts WHERE id IN ('${id(109)}','${S.pub}')) p, (SELECT created_at FROM public.post_comments WHERE id='${id(604)}') c, (SELECT created_at FROM public.marketplace_listings WHERE id='${S.mktOk}') m, now() n`)).rows[0];
    for (const k of ['p', 'c', 'm']) assert(new Date(r[k]) <= new Date(r.n), `${k} created_at is in the future: ${r[k]}`);
  });
  await as('postgres', async (c) => {
    await c.q(`UPDATE public.posts SET created_at = now() + interval '1 day' WHERE id='${S.pub}'`);
    assert(new Date((await c.q(`SELECT created_at FROM public.posts WHERE id='${S.pub}'`)).rows[0].created_at) > new Date(Date.now() + 3600000), 'a trusted writer was clamped');
  });
});
await check('an author cannot clear a moderation flag / takedown on their own row; staff and admins can set and clear them', async () => {
  await db.exec(`UPDATE public.posts SET is_flagged = true WHERE id='${S.pub}'`);
  await as(P('sA'), async (c) => {
    await c.q(`UPDATE public.posts SET is_flagged = false WHERE id='${S.pub}'`);
    eq((await c.su(`SELECT is_flagged FROM public.posts WHERE id='${S.pub}'`)).rows[0].is_flagged, true, 'is_flagged cleared by the author');
    await c.q(`UPDATE public.marketplace_listings SET is_removed = false, takedown_reason = NULL WHERE id='${S.mktRemoved}'`);
    eq((await c.su(`SELECT is_removed, takedown_reason FROM public.marketplace_listings WHERE id='${S.mktRemoved}'`)).rows[0], { is_removed: true, takedown_reason: 'scam' }, 'takedown undone by the seller');
  });
  await as(P('admA'), async (c) => {
    assert((await c.t(`UPDATE public.posts SET is_flagged = false WHERE id='${S.pub}'`)).n === 1, 'admin update');
    eq((await c.su(`SELECT is_flagged FROM public.posts WHERE id='${S.pub}'`)).rows[0].is_flagged, false, 'campus admin can clear the flag');
    await c.q(`UPDATE public.marketplace_listings SET is_removed = false WHERE id='${S.mktRemoved}'`);
    eq((await c.su(`SELECT is_removed FROM public.marketplace_listings WHERE id='${S.mktRemoved}'`)).rows[0].is_removed, false, 'campus admin can restore a listing');
  });
});

// --------------------------------------------------------------------------- 3. chat
await check('a channel cannot be created "by" somebody else (no forced enrolment of the victim)', async () => {
  await as(P('sA'), async (c) => {
    denied(await c.t(`INSERT INTO public.chat_channels (id, name, is_direct_message, created_by) VALUES ('${id(950)}','Verify your account now',true,'${U.sB}')`), /row-level security/, 'channel created by a victim');
    assert((await c.t(`INSERT INTO public.chat_channels (id, name, is_direct_message, created_by) VALUES ('${id(951)}','mine',true,'${U.sA}')`)).ok, 'own channel');
    eq((await c.q(`SELECT user_id FROM public.chat_channel_members WHERE channel_id='${id(951)}'`)).rows.map((r) => r.user_id), [U.sA], 'creator is enrolled');
  });
  await as(ROOTP, async (c) => assert((await c.t(`INSERT INTO public.chat_channels (id, name, is_direct_message, created_by) VALUES ('${id(952)}','system',false,NULL)`)).ok, 'super admin may create a creator-less channel'));
});

// --------------------------------------------------------------------------- 4. minors
const grp = (c, ch, creator) => c.t(`INSERT INTO public.chat_channels (id, name, is_direct_message, created_by) VALUES ('${ch}','study',false,'${creator}')`);
await check('minors: an adult cannot pull a limited minor into a GROUP channel, nor a minor an adult (the 1:1-only loophole)', async () => {
  await as(P('sA2'), async (c) => {
    assert((await grp(c, id(960), U.sA2)).ok);
    denied(await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${id(960)}','${U.minA}')`), /MINOR_RESTRICTED/, 'adult adds minor to a group');
  });
  await as(P('minA'), async (c) => {
    assert((await grp(c, id(961), U.minA)).ok, 'minor creates a group channel for themself');
    denied(await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${id(961)}','${U.sA2}')`), /MINOR_RESTRICTED/, 'minor adds an adult');
  });
});
await check('minors: group channels still work with staff / admins, accepted connections and other adults; system channels stay open; messages follow the same rule', async () => {
  await as(P('staffA'), async (c) => {
    assert((await grp(c, id(962), U.staffA)).ok);
    assert((await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${id(962)}','${U.minA}')`)).ok, 'staff may add a limited minor');
    denied(await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${id(962)}','${U.sA2}')`), /MINOR_RESTRICTED/, 'an unconnected adult cannot join a channel that has a limited minor');
    assert((await c.t(`INSERT INTO public.chat_messages (channel_id, sender_id, content) VALUES ('${id(962)}','${U.staffA}','welcome')`)).ok, 'staff message');
  });
  await db.exec(`INSERT INTO public.connections (requester_id, recipient_id, status) VALUES ('${U.minA}','${U.sA2}','accepted')`);
  await as(P('sA2'), async (c) => {
    assert((await grp(c, id(963), U.sA2)).ok);
    assert((await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${id(963)}','${U.minA}')`)).ok, 'accepted connection');
    assert((await c.t(`INSERT INTO public.chat_messages (channel_id, sender_id, content) VALUES ('${id(963)}','${U.sA2}','hi')`)).ok, 'message to a connected minor');
  });
  await db.exec(`INSERT INTO public.chat_channels (id, name, is_direct_message, created_by, campus_code) VALUES ('${id(964)}','campus',false,NULL,'UNILAG')`);
  await db.exec(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${id(964)}','${U.sA2}')`);
  await as(P('minA'), async (c) => assert((await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${id(964)}','${U.minA}')`)).ok, 'a limited minor may still join a creator-less campus channel'));
});
await check('minors cannot hold staff / administrator / Campus Ambassador roles (direct update and the ambassador RPC); adults still can; bots cannot be appointed', async () => {
  await as(P('admA'), async (c) => {
    denied(await c.t(`UPDATE public.profiles SET role='staff' WHERE id='${U.minA}'`), /MINOR_RESTRICTED/, 'promote a minor to staff');
    denied(await c.t(`SELECT public.set_campus_ambassador_status('${U.minA}', true)`), /MINOR_RESTRICTED|invalid_target/, 'appoint a minor');
    denied(await c.t(`SELECT public.set_campus_ambassador_status('${U.botA}', true)`), /invalid_target/, 'appoint a bot');
    assert((await c.t(`SELECT public.set_campus_ambassador_status('${U.sA2}', true)`)).ok, 'appoint an adult');
    assert((await c.t(`UPDATE public.profiles SET role='staff' WHERE id='${U.sA}'`)).ok, 'promote an adult to staff');
  });
  await as(ROOTP, async (c) => denied(await c.t(`SELECT public.set_campus_ambassador_status('${U.minA}', true)`), /MINOR_RESTRICTED|invalid_target/, 'super admin appointing a minor'));
  await as(P('ambA'), async (c) => {
    denied(await c.t(`SELECT public.set_campus_ambassador_status('${U.ambA}', false)`), /conflict_of_interest/, 'self revoke');
    denied(await c.t(`SELECT public.set_campus_ambassador_status('${U.sB}', true)`), /unauthorized_campus_scope/, 'cross-campus appointment');
    denied(await c.t(`SELECT public.set_campus_ambassador_status('${U.root}', false)`), /invalid_target/, 'un-appoint a super admin');
  });
});

// --------------------------------------------------------------------------- 5-7. privileges, storage, views
await check('TRUNCATE / TRIGGER / REFERENCES are no longer granted to anon or authenticated on any public table (service_role keeps its grants)', async () => {
  const r = await db.query(`SELECT c.relname t, g.role FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN (VALUES ('anon'),('authenticated')) g(role)
     WHERE n.nspname='public' AND c.relkind IN ('r','p')
       AND (has_table_privilege(g.role, c.oid, 'TRUNCATE') OR has_table_privilege(g.role, c.oid, 'TRIGGER') OR has_table_privilege(g.role, c.oid, 'REFERENCES'))`);
  eq(r.rows, [], 'tables with TRUNCATE / TRIGGER / REFERENCES for a client role');
  await as('anon', async (c) => denied(await c.t(`TRUNCATE public.notifications`), /permission denied/, 'anon TRUNCATE'));
  await as(P('sA'), async (c) => denied(await c.t(`TRUNCATE public.role_permissions`), /permission denied/, 'member TRUNCATE'));
  assert((await db.query(`SELECT has_table_privilege('service_role', 'public.notifications', 'TRUNCATE') x`)).rows[0].x, 'service_role lost TRUNCATE');
});
await check('storage: object names with "." / ".." path segments are refused; normal names inside the own folder still upload', async () => {
  await as(P('sA'), async (c) => {
    for (const name of [`${U.sA}/../${U.sB}/x.pdf`, `${U.sA}/./x.pdf`, `${U.sA}/a/../b.pdf`]) {
      denied(await c.t(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('resumes','${name}','${U.sA}')`), /row-level security/, `name ${name}`);
    }
    assert((await c.t(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('resumes','${U.sA}/cv.v1.final.pdf','${U.sA}')`)).ok, 'ordinary file name with dots');
    denied(await c.t(`UPDATE storage.objects SET name='${U.sA}/../${U.sB}/y.pdf' WHERE bucket_id='resumes' AND name='${U.sA}/cv.v1.final.pdf'`), /row-level security/, 'rename into a dot segment');
  });
});
await check('public_profiles view is security_invoker', async () => {
  const r = await db.query(`SELECT reloptions FROM pg_class WHERE oid='public.public_profiles'::regclass`);
  assert((r.rows[0].reloptions ?? []).includes('security_invoker=true'), `reloptions ${JSON.stringify(r.rows[0].reloptions)}`);
});

// --------------------------------------------------------------------------- 8. edge-function audit items
await db.exec(`ALTER TABLE public.events DISABLE TRIGGER USER`);
for (const [eid, campus] of [[S.evPaidU, 'UNILAG'], [S.evPaidG, 'GLOBAL']]) {
  await db.exec(`INSERT INTO public.events (id, creator_id, campus_code, title, description, venue, start_time, end_time, category, status, ticket_type, ticket_price, payment_method, reservation_held, payment_review_status)
    VALUES ('${eid}','${U.alumA}','${campus}','Paid ${campus}','d','Hall', now() + interval '10 days', now() + interval '11 days','Academic','pending_approval','paid',1000,'online',false,'pending')`);
  await db.exec(`INSERT INTO public.event_payment_details (event_id, payment_url, instructions) VALUES ('${eid}','https://paystack.com/pay/x','pay at the door please')`);
}
await db.exec(`ALTER TABLE public.events ENABLE TRIGGER USER`);
await check('admin_store_link_check / admin_save_partnership: the actor must administer the event campus and not be suspended', async () => {
  await as('service_role', async (c) => {
    const link = (ev, actor) => c.t(`SELECT public.admin_store_link_check('${ev}','${actor}','{"status":"ok"}'::jsonb)`);
    const part = (ev, actor) => c.t(`SELECT public.admin_save_partnership('${ev}','${actor}','proposed',NULL,NULL,NULL,NULL,NULL)`);
    for (const [name, fn] of [['link check', link], ['partnership', part]]) {
      denied(await fn(S.evPaidU, U.admB), /not_allowed/, `${name}: other campus admin`);
      denied(await fn(S.evPaidG, U.admA), /not_allowed/, `${name}: campus admin on a GLOBAL event`);
      denied(await fn(S.evPaidU, U.sA), /not_allowed/, `${name}: a student`);
      assert((await fn(S.evPaidU, U.admA)).ok, `${name}: own campus admin`);
      assert((await fn(S.evPaidG, U.root)).ok, `${name}: super admin on GLOBAL`);
      assert((await fn(S.evPaidU, U.root)).ok, `${name}: super admin anywhere`);
    }
    denied(await link(id(799), U.root), /not_found/, 'unknown event');
    await c.su(`UPDATE public.profiles SET is_suspended = true WHERE id='${U.admA}'`);
    denied(await link(S.evPaidU, U.admA), /not_allowed/, 'suspended campus admin: link check');
    denied(await part(S.evPaidU, U.admA), /not_allowed/, 'suspended campus admin: partnership');
  });
  for (const f of ['admin_store_link_check(uuid,uuid,jsonb)', 'admin_save_partnership(uuid,uuid,text,text,text,numeric,integer,text)']) {
    const r = (await db.query(`SELECT has_function_privilege('authenticated', '${f}', 'EXECUTE') a, has_function_privilege('anon', '${f}', 'EXECUTE') b, has_function_privilege('service_role', '${f}', 'EXECUTE') s`)).rows[0];
    eq(r, { a: false, b: false, s: true }, `${f} grants`);
  }
});
await check('lioris_actor_is_super: the root e-mail only counts with a confirmed auth e-mail, like auth_is_super_admin()', async () => {
  await sandbox(async (c) => {
    await c.q(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
    await c.q(`UPDATE public.profiles SET admin_role = NULL WHERE id='${U.root}'`);
    eq((await c.q(`SELECT public.lioris_actor_is_super('${U.root}') s`)).rows[0].s, true, 'confirmed root e-mail');
    await c.q(`UPDATE auth.users SET email_confirmed_at = NULL WHERE id='${U.root}'`);
    eq((await c.q(`SELECT public.lioris_actor_is_super('${U.root}') s`)).rows[0].s, false, 'unconfirmed root e-mail');
    eq((await c.q(`SELECT public.lioris_actor_is_super('${U.admA}') s`)).rows[0].s, false, 'a campus admin');
    await c.q(`UPDATE public.profiles SET admin_role = 'super_admin' WHERE id='${U.root}'`);
    eq((await c.q(`SELECT public.lioris_actor_is_super('${U.root}') s`)).rows[0].s, true, 'explicit super_admin role');
  });
});
await check('refund_rate_limit: service_role only; atomically gives back one unit, never below zero', async () => {
  const f = 'public.refund_rate_limit(text)';
  eq((await db.query(`SELECT has_function_privilege('authenticated','${f}','EXECUTE') a, has_function_privilege('anon','${f}','EXECUTE') b, has_function_privilege('service_role','${f}','EXECUTE') s`)).rows[0], { a: false, b: false, s: true });
  await as(P('sA'), async (c) => denied(await c.t(`SELECT public.refund_rate_limit('login:1')`), /permission denied/, 'member'));
  await as('service_role', async (c) => {
    for (let i = 0; i < 3; i++) await c.q(`SELECT public.consume_rate_limit_ex('login:u1', 5, 60)`);
    eq((await c.q(`SELECT public.refund_rate_limit('login:u1') n`)).rows[0].n, 2);
    for (let i = 0; i < 4; i++) await c.q(`SELECT public.refund_rate_limit('login:u1')`);
    eq((await c.q(`SELECT public.refund_rate_limit('login:u1') n`)).rows[0].n, 0, 'floor at zero');
    eq((await c.q(`SELECT public.refund_rate_limit('never-seen') n`)).rows[0].n, 0, 'unknown key');
    eq((await c.q(`SELECT (public.consume_rate_limit_ex('login:u1', 5, 60)) ->> 'count' n`)).rows[0].n, '1', 'next consume starts from the refunded count');
    denied(await c.t(`SELECT public.refund_rate_limit('')`), /invalid rate limit key/, 'empty key');
  });
});
await check('purge_user_data also erases the notification send log, rate-limit keys, notifications the member sent and a takedown claimant\'s contact details', async () => {
  await sandbox(async (c) => {
    await c.q(`INSERT INTO public.notification_send_log (sender_id) VALUES ('${U.sA2}'), ('${U.sA}')`);
    await c.q(`INSERT INTO public.api_rate_limits (key, window_start, count) VALUES ('login:${U.sA2}', now(), 2), ('login:${U.sA}', now(), 2), ('other:${U.sA2}:x', now(), 1)`);
    await c.q(`INSERT INTO public.notifications (recipient_id, sender_id, title, body, type) VALUES ('${U.sA}','${U.sA2}','Sam liked your post','Sam liked it','system'), ('${U.sA2}','${U.sA}','keep','keep','system')`);
    await ins('resource_takedown_requests', { id: id(880), resource_title: 'r', reporter_id: U.sA2, claim_type: 'inappropriate', claimant_name: 'Sam Reporter', claimant_email: 'sam@example.org', claimant_role: 'owner', details: 'details of the report', status: 'pending' });
    const res = (await c.q(`SELECT public.purge_user_data('${U.sA2}') r`)).rows[0].r;
    eq((await c.q(`SELECT count(*)::int n FROM public.notification_send_log WHERE sender_id='${U.sA2}'`)).rows[0].n, 0, 'send log');
    eq((await c.q(`SELECT count(*)::int n FROM public.notification_send_log WHERE sender_id='${U.sA}'`)).rows[0].n, 1, 'someone else\'s send log untouched');
    eq((await c.q(`SELECT key FROM public.api_rate_limits ORDER BY key`)).rows.map((r) => r.key), [`login:${U.sA}`, `other:${U.sA2}:x`], 'only keys ENDING in the member id go');
    eq((await c.q(`SELECT title FROM public.notifications WHERE sender_id IS NULL OR sender_id='${U.sA}'`)).rows.map((r) => r.title).includes('Sam liked your post'), false, 'a notification the member sent still carries their name');
    const t = (await c.q(`SELECT claimant_name, claimant_email, claimant_role FROM public.resource_takedown_requests WHERE id='${id(880)}'`)).rows[0];
    assert(t && t.claimant_name === 'Deleted user' && t.claimant_email === 'deleted@deleted.invalid' && t.claimant_role === null, `claimant details survived: ${JSON.stringify(t)}`);
    assert(res.deleted['notification_send_log.sender_id'] === 1 && res.deleted['notifications.sender_id'] === 1, `purge report: ${JSON.stringify(res.deleted)}`);
  });
});
await check('export_my_data includes analytics events, giving clicks and client errors tied to the member', async () => {
  await as(P('sA'), async (c) => {
    await c.su(`INSERT INTO public.analytics_events (user_id, event_type, name) VALUES ('${U.sA}','page_view','home')`);
    await c.su(`INSERT INTO public.client_errors (user_id, fingerprint, level) VALUES ('${U.sA}','fp1','error')`);
    const d = (await c.q(`SELECT public.export_my_data() d`)).rows[0].d.data;
    eq(d.analytics_events.length, 1, 'analytics_events'); eq(d.client_errors.length, 1, 'client_errors');
    assert(Array.isArray(d.giving_campaign_clicks), 'giving_campaign_clicks section missing');
    assert(Array.isArray(d.posts) && d.posts.length >= 1, 'existing sections still present');
  });
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
