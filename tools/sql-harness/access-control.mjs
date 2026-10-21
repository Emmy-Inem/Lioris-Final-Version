// Behaviour tests for supabase/migrations/20261106000000_access_control_hardening.sql, executed against an
// in-memory Postgres (PGlite). Nothing here touches a real database.
//
//   cd tools/sql-harness && node access-control.mjs            # after: every check must pass
//   cd tools/sql-harness && node access-control.mjs --before   # same probes WITHOUT the migration: the "hole"
//                                                              # checks fail, which is the regression proof
//
// Load order is the same as audit-remediation.mjs: legacy root files, then every supabase/migrations/*.sql.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { newDb, bootstrap, applyFile, MIGRATIONS, ROOT as REPO_ROOT } from './lib.mjs';

const BEFORE = process.argv.includes('--before');
const MIGRATION = 'supabase/migrations/20261106000000_access_control_hardening.sql';
const ROOT_EXTRAS = [
  'supabase_campus_access_2026.sql',
  'supabase_account_email_change_2026.sql',
  'supabase_username_uniqueness_and_login_2026.sql',
  'supabase_portal_links_2026.sql',
  'supabase_fix_campus_selection_and_ui_leak_2026.sql',
];

const db = await newDb();
await bootstrap(db);
for (const m of MIGRATIONS) await applyFile(db, m.file, m.strict, () => {});
for (const f of ROOT_EXTRAS) await applyFile(db, f, false, () => {});
const migrationFiles = readdirSync(resolve(REPO_ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
let migrationResult = null;
for (const f of migrationFiles) {
  const path = `supabase/migrations/${f}`;
  if (path === MIGRATION) {
    if (BEFORE) continue;
    try { migrationResult = await applyFile(db, path, true, () => {}); } catch (e) {
      console.log(`FATAL: access-control migration did not apply: ${e.message}${e.detail ? ' | ' + e.detail : ''}${e.where ? ' | ' + e.where : ''}`);
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
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log(`FAIL  ${name}\n      -> ${String(e.message).slice(0, 380)}`); }
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
      const claims = { sub, role: 'authenticated', ...(typeof who === 'object' && who.email ? { email: who.email } : {}), ...(typeof who === 'object' && who.aal ? { aal: who.aal } : {}) };
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

// --------------------------------------------------------------------------- fixtures
const U = {
  root: id(1), campAdminU: id(2), staffU: id(3), unvU: id(4), verU: id(5), verI: id(6), glob: id(7),
  nullAdminU: id(8), campAdminI: id(9), staffI: id(10), unvU2: id(11),
  verU2: id(12), alumU: id(13), staffG: id(14), adminG: id(15), alumI: id(16), globStudent: id(17),
};
const ROOT_EMAIL = 'inememmanuel@gmail.com';
async function mk(uid, email, campus, meta = {}) {
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ($1,$2,$3::jsonb, now())`,
    [uid, email, JSON.stringify({ campus_code: campus, full_name: email.split('@')[0], ...meta })]);
}
await mk(U.root, ROOT_EMAIL, 'GLOBAL');
await mk(U.campAdminU, 'campadmin.u@school.test', 'UNILAG');
await mk(U.staffU, 'staff.u@school.test', 'UNILAG');
await mk(U.unvU, 'unv.u@gmail.test', 'UNILAG');
await mk(U.unvU2, 'unv2.u@gmail.test', 'UNILAG');
await mk(U.verU, 'ver.u@gmail.test', 'UNILAG');
await mk(U.verI, 'ver.i@gmail.test', 'UI');
await mk(U.glob, 'glob@gmail.test', 'GLOBAL');
await mk(U.nullAdminU, 'nulladmin.u@school.test', 'UNILAG');
await mk(U.campAdminI, 'campadmin.i@school.test', 'UI');
await mk(U.staffI, 'staff.i@school.test', 'UI');
await mk(U.verU2, 'ver2.u@gmail.test', 'UNILAG');
await mk(U.alumU, 'alum.u@gmail.test', 'UNILAG');
await mk(U.staffG, 'staff.g@school.test', 'GLOBAL');
await mk(U.adminG, 'admin.g@school.test', 'GLOBAL');
await mk(U.alumI, 'alum.i@gmail.test', 'UI');
await mk(U.globStudent, 'globstudent@gmail.test', 'GLOBAL');
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
await db.exec(`UPDATE public.profiles SET role='admin', admin_role='super_admin', campus_code='GLOBAL', verification_status='verified', onboarding_complete=true WHERE id='${U.root}'`);
await db.exec(`UPDATE public.profiles SET role='admin', admin_role='campus_admin', onboarding_complete=true WHERE id IN ('${U.campAdminU}','${U.campAdminI}','${U.adminG}')`);
await db.exec(`UPDATE public.profiles SET role='admin', admin_role=NULL, onboarding_complete=true WHERE id='${U.nullAdminU}'`);
await db.exec(`UPDATE public.profiles SET role='staff', onboarding_complete=true WHERE id IN ('${U.staffU}','${U.staffI}','${U.staffG}')`);
await db.exec(`UPDATE public.profiles SET role='alumni' WHERE id IN ('${U.alumU}','${U.alumI}')`);
await db.exec(`UPDATE public.profiles SET verification_status='verified', onboarding_complete=true WHERE id IN ('${U.verU}','${U.verU2}','${U.verI}','${U.alumU}','${U.alumI}','${U.globStudent}')`);
await db.exec(`UPDATE public.profiles SET onboarding_complete=true WHERE id IN ('${U.unvU}','${U.unvU2}')`);
await db.exec(`UPDATE public.profiles SET username='verified_u' WHERE id='${U.verU}'`);
await db.exec(`UPDATE public.profiles SET department='Computer Science' WHERE id IN ('${U.unvU}','${U.verU}')`);
await db.exec(`UPDATE public.profiles SET is_campus_ambassador=true WHERE id='${U.verU2}'`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);
await db.exec(`ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT SELECT ON storage.objects TO anon, authenticated;`);

const CAU = { sub: U.campAdminU, email: 'campadmin.u@school.test' };
const CAI = { sub: U.campAdminI, email: 'campadmin.i@school.test' };
const ROOT = { sub: U.root, email: ROOT_EMAIL };
const SU = { sub: U.staffU, email: 'staff.u@school.test' };
const SG = { sub: U.staffG, email: 'staff.g@school.test' };
const AG = { sub: U.adminG, email: 'admin.g@school.test' };

// generic row builder (fills NOT NULL columns that have no default) + a fixture inserter that bypasses triggers
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
// insert as the current role (RLS + triggers apply)
async function insAs(c, table, vals) { const r = await row(table, vals); const [sql, params] = insSql(table, r); return c.t(sql, params); }

const FUT = new Date(Date.now() + 86400000 * 3).toISOString();
const FUT2 = new Date(Date.now() + 86400000 * 3 + 3600000).toISOString();
const S = {
  postU: id(101), postI: id(102), evU: id(103), evI: id(104), evG: id(105), sgU: id(106), sgI: id(107), mentU: id(108),
  commI: id(109), commG: id(110), campI: id(111), campG: id(112), campU: id(113), jobU: id(114), jobClosed: id(115), jobExpired: id(116),
  resU: id(117), resUI: id(118), resGlob: id(119), tkI: id(120), tkG: id(121), tkU: id(122), mentI: id(123),
  chDM: id(130), chCross: id(131), chGroupU: id(132), chSys: id(133), msgDM: id(134), msgCross: id(135), msgGroupU: id(136),
  chDM2: id(137),
};
await ins('posts', { id: S.postU, author_id: U.verU, campus_code: 'UNILAG', visibility_scope: 'campus', audience_scope: 'global', status: 'published' });
await ins('posts', { id: S.postI, author_id: U.verI, campus_code: 'UI', visibility_scope: 'campus', audience_scope: 'global', status: 'published' });
await ins('events', { id: S.evU, creator_id: U.verU, campus_code: 'UNILAG', visibility_scope: 'campus', start_time: FUT, end_time: FUT2 });
await ins('events', { id: S.evI, creator_id: U.verI, campus_code: 'UI', visibility_scope: 'campus', start_time: FUT, end_time: FUT2 });
await ins('events', { id: S.evG, creator_id: U.glob, campus_code: 'GLOBAL', visibility_scope: 'global', start_time: FUT, end_time: FUT2 });
await ins('study_groups', { id: S.sgU, creator_id: U.verU, campus_code: 'UNILAG', name: 'U group', max_members: 10 });
await ins('study_groups', { id: S.sgI, creator_id: U.verI, campus_code: 'UI', name: 'I group', max_members: 10 });
await ins('mentorships', { id: S.mentU, student_id: U.verU, mentor_id: U.alumU, status: 'active' });
await ins('mentorships', { id: S.mentI, student_id: U.verI, mentor_id: U.alumI, status: 'active' });
await ins('forum_communities', { id: S.commI, created_by: U.verI, campus_code: 'UI', approval_status: 'approved', slug: 'ui-space', category: 'ui-space', label: 'UI space' });
await ins('forum_communities', { id: S.commG, created_by: U.glob, campus_code: 'GLOBAL', approval_status: 'approved', slug: 'g-space', category: 'g-space', label: 'G space' });
await ins('giving_campaigns', { id: S.campI, creator_id: U.verI, campus_code: 'UI', review_status: 'approved', title: 'Campaign title', giving_url: 'https://example.org/give' });
await ins('giving_campaigns', { id: S.campG, creator_id: U.glob, campus_code: 'GLOBAL', review_status: 'approved', title: 'Campaign title', giving_url: 'https://example.org/give' });
await ins('giving_campaigns', { id: S.campU, creator_id: U.verU, campus_code: 'UNILAG', review_status: 'approved', title: 'Campaign title', giving_url: 'https://example.org/give' });
await ins('jobs', { id: S.jobU, poster_id: U.alumU, campus_code: 'UNILAG', is_approved: true, accepts_in_app_applications: true, is_closed: false, expires_at: FUT });
await ins('jobs', { id: S.jobClosed, poster_id: U.alumU, campus_code: 'UNILAG', is_approved: true, accepts_in_app_applications: true, is_closed: true, expires_at: FUT });
await ins('jobs', { id: S.jobExpired, poster_id: U.alumU, campus_code: 'UNILAG', is_approved: true, accepts_in_app_applications: true, is_closed: false, expires_at: new Date(Date.now() - 86400000).toISOString() });
const furl = (uid, name) => `${uid}/${name}`;
await ins('resources', { id: S.resU, uploader_id: U.verU, campus_code: 'UNILAG', course_code: 'CSC1', course_title: 'C', title: 'U res', resource_type: 'lecture_note', file_url: furl(U.verU, 'u.pdf'), is_approved: true });
await ins('resources', { id: S.resUI, uploader_id: U.verI, campus_code: 'UI', course_code: 'CSC1', course_title: 'C', title: 'UI res', resource_type: 'lecture_note', file_url: furl(U.verI, 'ui.pdf'), is_approved: true });
await ins('resources', { id: S.resGlob, uploader_id: U.glob, campus_code: 'GLOBAL', course_code: 'GST1', course_title: 'G', title: 'G res', resource_type: 'lecture_note', file_url: furl(U.glob, 'g.pdf'), is_approved: true });
await ins('resource_takedown_requests', { id: S.tkI, resource_id: S.resUI, resource_title: 'UI res', resource_uploader: U.verI, reporter_id: U.verU, claim_type: 'inappropriate', claimant_name: 'Rep', claimant_email: 'r@x.com', details: 'details of the report', status: 'pending' });
await ins('resource_takedown_requests', { id: S.tkG, resource_id: S.resGlob, resource_title: 'G res', resource_uploader: U.glob, reporter_id: U.verU, claim_type: 'inappropriate', claimant_name: 'Rep', claimant_email: 'r@x.com', details: 'details of the report', status: 'pending' });
await ins('resource_takedown_requests', { id: S.tkU, resource_id: S.resU, resource_title: 'U res', resource_uploader: U.verU, reporter_id: U.alumU, claim_type: 'inappropriate', claimant_name: 'Rep', claimant_email: 'r@x.com', details: 'details of the report', status: 'pending' });
// chat: a UNILAG-only DM, a cross-campus DM, a UNILAG group, a creator-less system channel on UNILAG
await ins('chat_channels', { id: S.chDM, name: 'dm', is_direct_message: true, campus_code: 'UNILAG', created_by: U.verU });
await ins('chat_channels', { id: S.chCross, name: 'cross', is_direct_message: true, created_by: U.verU });
await ins('chat_channels', { id: S.chGroupU, name: 'grp', is_direct_message: false, campus_code: 'UNILAG', created_by: U.verU });
await ins('chat_channels', { id: S.chSys, name: 'sys', is_direct_message: false, campus_code: 'UNILAG', created_by: null });
await db.exec(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES
  ('${S.chDM}','${U.verU}'), ('${S.chDM}','${U.verU2}'),
  ('${S.chCross}','${U.verU}'), ('${S.chCross}','${U.verI}'),
  ('${S.chGroupU}','${U.verU}'), ('${S.chGroupU}','${U.verU2}')`);
await ins('chat_messages', { id: S.msgDM, channel_id: S.chDM, sender_id: U.verU, content: 'private dm' });
await ins('chat_messages', { id: S.msgCross, channel_id: S.chCross, sender_id: U.verU, content: 'cross dm' });
await ins('chat_messages', { id: S.msgGroupU, channel_id: S.chGroupU, sender_id: U.verU, content: 'group msg' });
await ins('notifications', { id: id(140), recipient_id: U.verU, sender_id: U.verU2, title: 'private notification', body: 'b', type: 'system' });
await ins('connections', { id: id(141), requester_id: U.verU, recipient_id: U.verU2, status: 'accepted' });
await ins('user_blocks', { blocker_id: U.verU2, blocked_id: U.glob });
for (const [b, pub] of [['avatars', true], ['resources', false], ['resumes', false], ['verifications', false], ['campus-media', false]]) {
  await db.exec(`INSERT INTO storage.buckets (id, name, public) VALUES ('${b}','${b}',${pub}) ON CONFLICT (id) DO UPDATE SET public=${pub}`);
}
await db.exec(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('avatars','${U.verU}/me.png','${U.verU}'), ('avatars','${U.verI}/me.png','${U.verI}')`);

console.log(`\n== ${BEFORE ? 'BEFORE (access-control migration NOT applied)' : 'AFTER (access-control migration applied)'} ==`);
if (!BEFORE) {
  await check('migration applies cleanly in one transaction', async () => { assert(migrationResult && !migrationResult.failures?.length, 'did not apply'); });
  await check('migration is idempotent (second run)', async () => { await db.exec(readFileSync(resolve(REPO_ROOT, MIGRATION), 'utf8')); });
}

// =========================================================================== item 1: anon / definer exposure
const ANON_DEFINER_ALLOWLIST = ['check_username_available'];
await check('1. anon cannot call any SECURITY DEFINER function outside the allow-list (sweep over pg_proc)', async () => {
  const r = await db.query(`
    SELECT p.oid::regprocedure::text AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
    WHERE p.prosecdef AND p.prokind='f' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
      AND has_function_privilege('anon', p.oid, 'EXECUTE') AND p.proname <> ALL ($1::text[]) ORDER BY 1`, [ANON_DEFINER_ALLOWLIST]);
  assert(r.rows.length === 0, `anon can execute: ${r.rows.map((x) => x.sig).join(', ')}`);
});
await check('1. PUBLIC has no EXECUTE on public functions either', async () => {
  const r = await db.query(`
    SELECT p.oid::regprocedure::text AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
    WHERE p.prosecdef AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
      AND EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type='EXECUTE')
    ORDER BY 1`);
  assert(r.rows.length === 0, `PUBLIC can execute: ${r.rows.map((x) => x.sig).join(', ')}`);
});
await check('1. anon is refused by the named exposure RPCs (permission denied)', async () => {
  await as('anon', async (c) => {
    denied(await c.t(`SELECT * FROM public.admin_get_profile_contacts(ARRAY['${U.verU}']::uuid[])`), /permission denied/i, 'admin_get_profile_contacts');
    denied(await c.t(`SELECT public.get_admin_analytics_summary(30, NULL)`), /permission denied/i, 'get_admin_analytics_summary');
    denied(await c.t(`SELECT * FROM public.admin_search_profiles('a', 5)`), /permission denied/i, 'admin_search_profiles');
    denied(await c.t(`SELECT public.get_scoped_admin_analytics_summary(30, NULL)`), /permission denied/i, 'get_scoped_admin_analytics_summary');
    denied(await c.t(`SELECT public.promote_event_waitlist('${S.evU}')`), /permission denied/i, 'promote_event_waitlist');
    denied(await c.t(`SELECT public.toggle_event_reminder('${S.evU}')`), /permission denied/i, 'toggle_event_reminder');
    denied(await c.t(`SELECT public.record_user_activity('page_view','/x','UI','{}')`), /permission denied/i, 'record_user_activity');
    denied(await c.t(`SELECT public.open_giving_page('${S.campU}')`), /permission denied/i, 'open_giving_page');
    denied(await c.t(`SELECT public.is_profile_verified('${U.verU}')`), /permission denied/i, 'is_profile_verified');
    denied(await c.t(`SELECT * FROM public.get_forum_communities_stats()`), /permission denied/i, 'get_forum_communities_stats');
  });
});
await check('1. the in-function guards also reject a caller with NO uid (NULL role bug), even if EXECUTE were granted', async () => {
  // run as the owner with anon claims: this is what a stray GRANT to anon would look like
  await as('postgres', async (c) => {
    await c.q(`SELECT set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    for (const sql of [
      `SELECT * FROM public.admin_get_profile_contacts(ARRAY['${U.verU}']::uuid[])`,
      `SELECT public.get_admin_analytics_summary(30, NULL)`,
      `SELECT * FROM public.admin_search_profiles('a', 5)`,
      `SELECT public.get_scoped_admin_analytics_summary(30, NULL)`,
      `SELECT public.admin_get_user_diagnostics('${U.verU}')`,
    ]) {
      const r = await c.t(sql);
      denied(r, /admin_required/, sql.slice(0, 60));
    }
  });
});
await check('1. anon keeps what the signed-out app needs: username check, campuses, GLOBAL events, platform settings', async () => {
  await as('anon', async (c) => {
    const u = await c.t(`SELECT public.check_username_available('brand_new_user') AS ok`);
    assert(u.ok && u.rows[0].ok === true, u.err?.message || 'username check failed');
    for (const t of ['campuses', 'events', 'platform_settings']) {
      const r = await c.t(`SELECT 1 FROM public.${t} LIMIT 1`);
      assert(r.ok, `${t}: ${r.err?.message}`);
    }
    const ev = await c.q(`SELECT id FROM public.events`);
    eq(ev.rows.map((x) => x.id), [S.evG], 'anon should see only the GLOBAL event');
  });
});
await check('1. signed-in members keep the client RPCs they call (sample)', async () => {
  await as(U.verU, async (c) => {
    for (const sql of [
      `SELECT * FROM public.get_my_profile()`,
      `SELECT public.check_username_available('some_free_name')`,
      `SELECT * FROM public.get_suggested_connections(5)`,
      `SELECT * FROM public.mentor_directory()`,
      `SELECT * FROM public.get_my_conversation_summaries()`,
      `SELECT * FROM public.list_my_mentorships()`,
      `SELECT public.users_have_block('${U.verU}', '${U.verU2}')`,
      `SELECT public.is_community_manager('ui-space')`,
      `SELECT * FROM public.get_forum_communities_stats()`,
      `SELECT public.record_user_activity('page_view','/dashboard',NULL,'{}')`,
      `SELECT public.toggle_event_reminder('${S.evU}')`,
      `SELECT public.open_giving_page('${S.campU}')`,
    ]) {
      const r = await c.t(sql);
      if (!r.ok && /donations_disabled/.test(r.err.message)) continue; // feature switch, not a permission problem
      assert(r.ok, `${sql.slice(0, 70)} -> ${r.err?.message}`);
    }
  });
});
await check('1. a function created from now on is NOT executable by anon (default privileges), but is by authenticated', async () => {
  await db.exec(`CREATE FUNCTION public._acl_probe() RETURNS int LANGUAGE sql AS 'SELECT 1'`);
  try {
    const r = await db.query(`SELECT has_function_privilege('anon','public._acl_probe()','EXECUTE') a, has_function_privilege('authenticated','public._acl_probe()','EXECUTE') u, has_function_privilege('service_role','public._acl_probe()','EXECUTE') s`);
    eq(r.rows[0], { a: false, u: true, s: true });
  } finally { await db.exec(`DROP FUNCTION public._acl_probe()`); }
});
await check('1. admin_get_profile_contacts: a Campus Admin sees only own-campus contacts, Super Admin all, a student none', async () => {
  const ids = `ARRAY['${U.verU}','${U.verI}','${U.glob}']::uuid[]`;
  await as(CAU, async (c) => eq((await c.q(`SELECT id FROM public.admin_get_profile_contacts(${ids})`)).rows.map((x) => x.id), [U.verU], 'campus admin scope'));
  await as(SG, async (c) => eq((await c.q(`SELECT id FROM public.admin_get_profile_contacts(${ids})`)).rows.length, 0, 'GLOBAL-campus staff must have no campus authority'));
  await as(ROOT, async (c) => eq((await c.q(`SELECT count(*)::int n FROM public.admin_get_profile_contacts(${ids})`)).rows[0].n, 3, 'super admin'));
  await as(U.verU, async (c) => denied(await c.t(`SELECT * FROM public.admin_get_profile_contacts(${ids})`), /admin_required/, 'student'));
});
await check('1/3. analytics: scoped admins are pinned to their campus (incl. the campus_metrics breakdown); Super Admin sees everything', async () => {
  await as(CAU, async (c) => {
    const j = (await c.q(`SELECT public.get_scoped_admin_analytics_summary(30, 'UI') AS j`)).rows[0].j;
    const codes = (j.campus_metrics || []).map((x) => x.campus_code);
    eq(codes, ['UNILAG'], 'campus_metrics leaked other campuses');
    const n = (await c.q(`SELECT count(*)::int n FROM public.profiles WHERE campus_code='UNILAG'`)).rows[0].n;
    eq(j.total_users, n, 'total_users should be the own-campus count');
  });
  await as(ROOT, async (c) => {
    const j = (await c.q(`SELECT public.get_scoped_admin_analytics_summary(30, NULL) AS j`)).rows[0].j;
    assert(j.campus_metrics.length >= 3, 'super admin should see every campus');
    const one = (await c.q(`SELECT public.get_scoped_admin_analytics_summary(30, 'UI') AS j`)).rows[0].j;
    eq(one.campus_metrics.map((x) => x.campus_code), ['UI'], 'super admin filtering by campus');
  });
  await as(SG, async (c) => denied(await c.t(`SELECT public.get_scoped_admin_analytics_summary(30, NULL)`), /campus_assignment_required/, 'GLOBAL staff'));
  await as(U.verU, async (c) => denied(await c.t(`SELECT public.get_scoped_admin_analytics_summary(30, NULL)`), /admin_required/, 'student'));
});
await check('1. admin_search_profiles: scoped to own campus, wildcard characters are literal', async () => {
  await as(CAU, async (c) => {
    const r = await c.q(`SELECT DISTINCT campus_code FROM public.admin_search_profiles('gmail', 50)`);
    eq(r.rows.map((x) => x.campus_code), ['UNILAG']);
    eq((await c.q(`SELECT count(*)::int n FROM public.admin_search_profiles('%', 50)`)).rows[0].n, 0, 'a bare % must not match everything');
  });
  await as(SG, async (c) => denied(await c.t(`SELECT * FROM public.admin_search_profiles('a', 5)`), /campus_assignment_required/, 'GLOBAL staff'));
});

// =========================================================================== item 2: chat & private data
await check('2. a Campus Admin cannot read private DMs, members or channels of conversations they are not in', async () => {
  for (const who of [CAU, AG]) {
    await as(who, async (c) => {
      eq((await c.q(`SELECT count(*)::int n FROM public.chat_messages`)).rows[0].n, 0, 'chat_messages visible');
      eq((await c.q(`SELECT count(*)::int n FROM public.chat_channels`)).rows[0].n, 0, 'chat_channels visible');
      eq((await c.q(`SELECT count(*)::int n FROM public.chat_channel_members`)).rows[0].n, 0, 'chat_channel_members visible');
      const del = await c.t(`DELETE FROM public.chat_messages WHERE id='${S.msgDM}'`);
      assert(!del.ok || del.n === 0, 'campus admin deleted a private message');
      const upd = await c.t(`UPDATE public.chat_messages SET is_read = true WHERE id='${S.msgDM}'`);
      assert(!upd.ok || upd.n === 0, 'campus admin updated a private message');
      const dch = await c.t(`DELETE FROM public.chat_channels WHERE id='${S.chDM}'`);
      assert(!dch.ok || dch.n === 0, 'campus admin deleted a channel');
      const dm = await c.t(`DELETE FROM public.chat_channel_members WHERE channel_id='${S.chDM}'`);
      assert(!dm.ok || dm.n === 0, 'campus admin removed members');
    });
  }
  const left = await db.query(`SELECT count(*)::int n FROM public.chat_messages WHERE id='${S.msgDM}'`);
  eq(left.rows[0].n, 1, 'message was deleted');
});
await check('2. members still read and delete their own chat content; Super Admin keeps the override', async () => {
  await as(U.verU2, async (c) => eq((await c.q(`SELECT content FROM public.chat_messages WHERE channel_id='${S.chDM}'`)).rows.map((x) => x.content), ['private dm']));
  await as(U.verU, async (c) => { const d = await c.t(`DELETE FROM public.chat_messages WHERE id='${S.msgDM}'`); assert(d.ok && d.n === 1, d.err?.message || 'sender could not delete own message'); });
  await as(U.unvU, async (c) => eq((await c.q(`SELECT count(*)::int n FROM public.chat_messages`)).rows[0].n, 0, 'a non-member saw messages'));
  await as(ROOT, async (c) => assert((await c.q(`SELECT count(*)::int n FROM public.chat_messages`)).rows[0].n >= 3, 'super admin lost chat access'));
});
await check('2. admin_delete_chat_message: Campus Admin only when sender AND every member are on their campus; Super Admin anywhere', async () => {
  await as(CAU, async (c) => {
    denied(await c.t(`SELECT public.admin_delete_chat_message('${S.msgCross}')`), /outside your campus/, 'cross-campus DM');
    const ok = await c.t(`SELECT public.admin_delete_chat_message('${S.msgGroupU}')`);
    assert(ok.ok, ok.err?.message || 'own-campus group message not moderatable');
  });
  await as(CAI, async (c) => denied(await c.t(`SELECT public.admin_delete_chat_message('${S.msgGroupU}')`), /outside your campus/, 'other-campus admin'));
  await as(AG, async (c) => denied(await c.t(`SELECT public.admin_delete_chat_message('${S.msgGroupU}')`), /outside your campus/, 'GLOBAL admin has no campus authority'));
  await as(U.verU2, async (c) => denied(await c.t(`SELECT public.admin_delete_chat_message('${S.msgGroupU}')`), /not_allowed/, 'student'));
  await as(ROOT, async (c) => { const ok = await c.t(`SELECT public.admin_delete_chat_message('${S.msgCross}')`); assert(ok.ok, ok.err?.message); });
});
await check('2. notifications / connections / blocks: a Campus Admin cannot read or delete other people\'s rows; owner and Super Admin can', async () => {
  await as(CAU, async (c) => {
    eq((await c.q(`SELECT count(*)::int n FROM public.notifications WHERE recipient_id='${U.verU}'`)).rows[0].n, 0, 'notifications');
    eq((await c.q(`SELECT count(*)::int n FROM public.connections`)).rows[0].n, 0, 'connections');
    eq((await c.q(`SELECT count(*)::int n FROM public.user_blocks`)).rows[0].n, 0, 'user_blocks');
    const d = await c.t(`DELETE FROM public.notifications WHERE recipient_id='${U.verU}'`);
    assert(!d.ok || d.n === 0, 'deleted someone else\'s notification');
    const dc = await c.t(`DELETE FROM public.connections WHERE id='${id(141)}'`);
    assert(!dc.ok || dc.n === 0, 'deleted a connection');
  });
  await as(U.verU, async (c) => eq((await c.q(`SELECT count(*)::int n FROM public.notifications WHERE recipient_id='${U.verU}'`)).rows[0].n, 1, 'owner'));
  await as(ROOT, async (c) => assert((await c.q(`SELECT count(*)::int n FROM public.notifications`)).rows[0].n >= 1, 'super admin'));
});
await check('2. mentorships: only the mentee\'s campus admin (or Super Admin) sees them besides the two participants', async () => {
  await as(CAU, async (c) => eq((await c.q(`SELECT id FROM public.mentorships`)).rows.map((x) => x.id), [S.mentU], 'UNILAG admin'));
  await as(CAI, async (c) => eq((await c.q(`SELECT id FROM public.mentorships`)).rows.map((x) => x.id), [S.mentI], 'UI admin'));
  await as(AG, async (c) => eq((await c.q(`SELECT count(*)::int n FROM public.mentorships`)).rows[0].n, 0, 'GLOBAL admin'));
  await as(U.alumU, async (c) => eq((await c.q(`SELECT id FROM public.mentorships`)).rows.map((x) => x.id), [S.mentU], 'mentor'));
  await as(ROOT, async (c) => eq((await c.q(`SELECT count(*)::int n FROM public.mentorships`)).rows[0].n, 2, 'super admin'));
});

// =========================================================================== item 3: campus scope in definer RPCs
await check('3. event_can_manage + event_roster / checkin / payment info follow the EVENT\'s campus', async () => {
  const can = async (who, ev) => as(who, async (c) => (await c.q(`SELECT public.event_can_manage('${ev}') v`)).rows[0].v);
  eq(await can(CAU, S.evU), true, 'campus admin own event');
  eq(await can(CAU, S.evI), false, 'campus admin other campus event');
  eq(await can(CAU, S.evG), false, 'campus admin GLOBAL event');
  eq(await can(SU, S.evU), true, 'staff own campus');
  eq(await can(SU, S.evI), false, 'staff other campus');
  eq(await can(SG, S.evU), false, 'GLOBAL staff');
  eq(await can(AG, S.evU), false, 'GLOBAL admin');
  eq(await can(ROOT, S.evI), true, 'super admin');
  eq(await can(U.verU, S.evU), true, 'creator');
  eq(await can(U.verU2, S.evU), false, 'other student');
  await as(CAU, async (c) => denied(await c.t(`SELECT public.event_roster('${S.evI}')`), /not_allowed/, 'roster of another campus event'));
  await as(CAU, async (c) => { const r = await c.t(`SELECT public.event_roster('${S.evU}')`); assert(r.ok, r.err?.message); });
});
await check('3. can_moderate_pod follows the study group\'s campus', async () => {
  const can = async (who, g) => as(who, async (c) => (await c.q(`SELECT public.can_moderate_pod('${g}') v`)).rows[0].v);
  eq(await can(CAU, S.sgU), true); eq(await can(CAU, S.sgI), false, 'other campus pod');
  eq(await can(CAI, S.sgI), true); eq(await can(AG, S.sgU), false); eq(await can(ROOT, S.sgI), true);
  eq(await can(U.verU, S.sgU), false, 'a plain creator is not automatically a moderator unless pod_role says so');
});
await check('3. is_mentorship_participant / list_my_mentorships / end_mentorship follow the mentee\'s campus', async () => {
  await as(CAU, async (c) => {
    eq((await c.q(`SELECT public.is_mentorship_participant('${S.mentU}') v`)).rows[0].v, true);
    eq((await c.q(`SELECT public.is_mentorship_participant('${S.mentI}') v`)).rows[0].v, false);
    eq((await c.q(`SELECT id FROM public.list_my_mentorships('${S.mentU}')`)).rows.map((x) => x.id), [S.mentU]);
    eq((await c.q(`SELECT count(*)::int n FROM public.list_my_mentorships('${S.mentI}')`)).rows[0].n, 0, 'other campus mentorship listed');
    denied(await c.t(`SELECT * FROM public.end_mentorship('${S.mentI}', 'end', 'x')`), /not_allowed/, 'end other campus mentorship');
  });
  await as(AG, async (c) => {
    eq((await c.q(`SELECT public.is_mentorship_participant('${S.mentU}') v`)).rows[0].v, false);
    denied(await c.t(`SELECT * FROM public.end_mentorship('${S.mentU}', 'end', 'x')`), /not_allowed/, 'GLOBAL admin');
  });
  await as(CAU, async (c) => { const r = await c.t(`SELECT status FROM public.end_mentorship('${S.mentU}', 'end', 'policy')`); assert(r.ok && r.rows[0].status === 'ended', r.err?.message || 'own campus end failed'); });
  await as(ROOT, async (c) => { const r = await c.t(`SELECT status FROM public.end_mentorship('${S.mentI}', 'end', 'policy')`); assert(r.ok, r.err?.message); });
});
await check('3. admin_get_user_diagnostics: own campus only (and no anon hole)', async () => {
  await as(CAU, async (c) => {
    assert((await c.t(`SELECT public.admin_get_user_diagnostics('${U.verU}')`)).ok, 'own campus');
    denied(await c.t(`SELECT public.admin_get_user_diagnostics('${U.verI}')`), /admin_required/, 'other campus');
  });
  await as(SG, async (c) => denied(await c.t(`SELECT public.admin_get_user_diagnostics('${U.verU}')`), /admin_required/, 'GLOBAL staff'));
  await as(ROOT, async (c) => assert((await c.t(`SELECT public.admin_get_user_diagnostics('${U.verI}')`)).ok, 'super admin'));
});
await check('3. assign / unassign forum community moderator: community owner or admin of the COMMUNITY\'s campus', async () => {
  await as(CAU, async (c) => denied(await c.t(`SELECT public.assign_forum_community_moderator('${S.commI}', '${U.verI}')`), /Only the community owner or an administrator/, 'other campus'));
  await as(AG, async (c) => denied(await c.t(`SELECT public.assign_forum_community_moderator('${S.commG}', '${U.verI}')`), /Only the community owner or an administrator/, 'GLOBAL admin on GLOBAL community'));
  await as(CAI, async (c) => {
    assert((await c.t(`SELECT public.assign_forum_community_moderator('${S.commI}', '${U.verI}')`)).ok, 'own campus admin');
    denied(await c.t(`SELECT public.assign_forum_community_moderator('${S.commI}', '${U.verU}')`), /must belong to that campus/, 'cross-campus moderator');
    assert((await c.t(`SELECT public.unassign_forum_community_moderator('${S.commI}', '${U.verI}')`)).ok, 'unassign');
  });
  await as(ROOT, async (c) => assert((await c.t(`SELECT public.assign_forum_community_moderator('${S.commG}', '${U.verU}')`)).ok, 'super admin'));
  await as(U.glob, async (c) => assert((await c.t(`SELECT public.assign_forum_community_moderator('${S.commG}', '${U.verU2}')`)).ok, 'community owner'));
});
await check('3. takedown requests: SELECT and resolve are scoped to the resource\'s campus; GLOBAL = Super Admin only', async () => {
  const seen = async (who) => as(who, async (c) => (await c.q(`SELECT id FROM public.resource_takedown_requests`)).rows.map((x) => x.id).sort());
  eq(await seen(CAU), [S.tkU].sort(), 'UNILAG admin');
  eq(await seen(CAI), [S.tkI].sort(), 'UI admin');
  eq(await seen(AG), [], 'GLOBAL admin');
  eq((await seen(ROOT)).length, 3, 'super admin');
  await as(CAU, async (c) => {
    denied(await c.t(`SELECT public.resolve_takedown_request('${S.tkI}', 'reject', 'x')`), /own campus/, 'other campus');
    denied(await c.t(`SELECT public.resolve_takedown_request('${S.tkG}', 'reject', 'x')`), /own campus|not found/i, 'GLOBAL resource');
    assert((await c.t(`SELECT public.resolve_takedown_request('${S.tkU}', 'reject', 'fine')`)).ok, 'own campus resolve');
  });
  await as(AG, async (c) => denied(await c.t(`SELECT public.resolve_takedown_request('${S.tkG}', 'reject', 'x')`), /own campus/, 'GLOBAL admin'));
  await as(ROOT, async (c) => assert((await c.t(`SELECT public.resolve_takedown_request('${S.tkG}', 'reject', 'ok')`)).ok, 'super admin'));
});
await check('3. get_giving_campaign_click_count / admin_campus_overview follow the campaign / campus', async () => {
  await as(CAU, async (c) => {
    assert((await c.t(`SELECT public.get_giving_campaign_click_count('${S.campU}')`)).ok, 'own campus');
    denied(await c.t(`SELECT public.get_giving_campaign_click_count('${S.campI}')`), /not_allowed/, 'other campus');
    denied(await c.t(`SELECT public.get_giving_campaign_click_count('${S.campG}')`), /not_allowed/, 'GLOBAL campaign');
    eq((await c.q(`SELECT code FROM public.admin_campus_overview()`)).rows.map((x) => x.code), ['UNILAG'], 'campus overview');
  });
  await as(U.verU, async (c) => assert((await c.t(`SELECT public.get_giving_campaign_click_count('${S.campU}')`)).ok, 'creator'));
  await as(ROOT, async (c) => {
    assert((await c.t(`SELECT public.get_giving_campaign_click_count('${S.campG}')`)).ok, 'super admin');
    assert((await c.q(`SELECT count(*)::int n FROM public.admin_campus_overview()`)).rows[0].n >= 3, 'super admin overview');
  });
  await as(U.verU, async (c) => denied(await c.t(`SELECT * FROM public.admin_campus_overview()`), /not_allowed/, 'student overview'));
});
await check('3. get_report_count_for_author refuses students and anonymous callers', async () => {
  await as(U.verU, async (c) => denied(await c.t(`SELECT public.get_report_count_for_author('post', '${S.postU}', NULL)`), /admin_required/, 'student'));
  await as('postgres', async (c) => {
    await c.q(`SELECT set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    denied(await c.t(`SELECT public.get_report_count_for_author('post', '${S.postU}', NULL)`), /admin_required/, 'no uid');
  });
  await as(CAU, async (c) => assert((await c.t(`SELECT public.get_report_count_for_author('post', '${S.postI}', NULL)`)).ok, 'admin call works'));
});
await check('3. suspend_user_account: GLOBAL / campus-less staff and admins gain no cross-campus power; own campus and Super Admin still work', async () => {
  const sus = (who, target) => as(who, async (c) => c.t(`SELECT public.suspend_user_account('${target}', 'test')`));
  denied(await sus(SG, U.verU), /outside their registered campus/, 'GLOBAL staff -> UNILAG');
  denied(await sus(AG, U.verU), /outside their registered campus/, 'GLOBAL admin -> UNILAG');
  denied(await sus(AG, U.globStudent), /outside their registered campus/, 'GLOBAL admin -> GLOBAL student');
  denied(await sus(SG, U.globStudent), /outside their registered campus/, 'GLOBAL staff -> GLOBAL student');
  denied(await sus(CAU, U.verI), /outside their registered campus/, 'UNILAG admin -> UI');
  denied(await sus(SU, U.verI), /outside their registered campus/, 'UNILAG staff -> UI');
  denied(await sus(CAU, U.nullAdminU), /cannot suspend administrator/, 'admin -> admin');
  assert((await sus(CAU, U.verU)).ok, 'own campus admin');
  assert((await sus(SU, U.unvU)).ok, 'own campus staff');
  assert((await sus(ROOT, U.verI)).ok, 'super admin');
  assert((await sus(ROOT, U.globStudent)).ok, 'super admin on GLOBAL');
});

// =========================================================================== item 4: résumé leak / applications
await check('4. job applications: résumé must be in the applicant\'s own folder; status is forced; closed / expired jobs refuse', async () => {
  await db.exec(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('resumes','${U.unvU}/cv.pdf','${U.unvU}'), ('resumes','${U.verU2}/secret.pdf','${U.verU2}')`);
  await as(U.unvU, async (c) => {
    const steal = await insAs(c, 'job_applications', { job_id: S.jobU, applicant_id: U.unvU, resume_url: `${U.verU2}/secret.pdf` });
    denied(steal, /own folder/, 'foreign résumé');
    const forced = await insAs(c, 'job_applications', { job_id: S.jobU, applicant_id: U.unvU, resume_url: `${U.unvU}/cv.pdf`, status: 'hired', reviewed_at: new Date().toISOString() });
    assert(forced.ok, forced.err?.message);
    const r = (await c.q(`SELECT status, reviewed_at FROM public.job_applications WHERE applicant_id='${U.unvU}' AND job_id='${S.jobU}'`)).rows[0];
    eq(r, { status: 'applied', reviewed_at: null }, 'client-chosen status / reviewed_at survived');
    denied(await insAs(c, 'job_applications', { job_id: S.jobClosed, applicant_id: U.unvU }), /row-level security|closed/i, 'closed job');
    denied(await insAs(c, 'job_applications', { job_id: S.jobExpired, applicant_id: U.unvU }), /row-level security|closed|expired/i, 'expired job');
  });
  await as(U.unvU2, async (c) => {
    const none = await insAs(c, 'job_applications', { job_id: S.jobU, applicant_id: U.unvU2 });
    assert(none.ok, none.err?.message || 'application without résumé must still work');
  });
  // a job poster can still decide, but cannot re-point the résumé or the applicant
  await ins('job_applications', { id: id(152), job_id: S.jobU, applicant_id: U.unvU2 });
  await as(U.alumU, async (c) => {
    const up = await c.t(`UPDATE public.job_applications SET status='interview', resume_url='${U.verU2}/secret.pdf' WHERE applicant_id='${U.unvU2}' RETURNING status, resume_url`);
    assert(up.ok && up.n === 1, up.err?.message || 'poster could not review');
    eq(up.rows[0], { status: 'interview', resume_url: null }, 'poster changed resume_url');
  });
});
await check('4. résumé storage: a job poster reads a résumé only when the application\'s file sits in the applicant\'s own folder', async () => {
  // an application row that predates the trigger and points at somebody else\'s file
  await ins('job_applications', { id: id(150), job_id: S.jobU, applicant_id: U.verI, resume_url: `${U.verU2}/secret.pdf` });
  await ins('job_applications', { id: id(151), job_id: S.jobU, applicant_id: U.unvU, resume_url: `${U.unvU}/cv.pdf` });
  await as(U.alumU, async (c) => {
    const n = (await c.q(`SELECT name FROM storage.objects WHERE bucket_id='resumes' ORDER BY name`)).rows.map((x) => x.name);
    assert(n.includes(`${U.unvU}/cv.pdf`), 'poster lost the legitimate résumé');
    assert(!n.includes(`${U.verU2}/secret.pdf`), 'poster can read a résumé from another member\'s folder');
  });
});

// =========================================================================== item 5: campus wall on INSERT, immutability
const postRow = (campus, extra = {}) => ({ author_id: U.verU, campus_code: campus, visibility_scope: 'campus', audience_scope: 'global', status: 'published', title: 't', content: 'c', ...extra });
await check('5. a verified student cannot INSERT into another campus (posts, marketplace, study groups, events, jobs, campaigns); own campus / GLOBAL still work', async () => {
  await as(U.verU, async (c) => {
    denied(await insAs(c, 'posts', postRow('UI')), /row-level security/, 'post into UI');
    assert((await insAs(c, 'posts', postRow('UNILAG'))).ok, 'post into own campus');
    assert((await insAs(c, 'posts', postRow('GLOBAL'))).ok, 'post into GLOBAL');
    denied(await insAs(c, 'marketplace_listings', { seller_id: U.verU, campus_code: 'UI', title: 'x', description: 'd' }), /row-level security/, 'listing into UI');
    assert((await insAs(c, 'marketplace_listings', { seller_id: U.verU, campus_code: 'UNILAG', title: 'x', description: 'd' })).ok, 'listing into own campus');
    denied(await insAs(c, 'study_groups', { creator_id: U.verU, campus_code: 'UI', name: 'Study group', max_members: 5 }), /row-level security/, 'study group into UI');
    assert((await insAs(c, 'study_groups', { creator_id: U.verU, campus_code: 'UNILAG', name: 'Study group', max_members: 5 })).ok, 'study group into own campus');
    denied(await insAs(c, 'giving_campaigns', { creator_id: U.verU, campus_code: 'UI', title: 'Campaign 1', giving_url: 'https://example.org/g' }), /row-level security/, 'campaign into UI');
    assert((await insAs(c, 'giving_campaigns', { creator_id: U.verU, campus_code: 'UNILAG', title: 'Campaign 1', giving_url: 'https://example.org/g' })).ok, 'campaign into own campus');
  });
  await as(U.verU2, async (c) => {   // a campus ambassador may propose events
    denied(await insAs(c, 'events', { creator_id: U.verU2, campus_code: 'UI', status: 'pending_approval', title: 'e', start_time: FUT, end_time: FUT2 }), /row-level security policy for table "events"/, 'event into UI');
    const r = await insAs(c, 'events', { creator_id: U.verU2, campus_code: 'UNILAG', status: 'pending_approval', title: 'e', start_time: FUT, end_time: FUT2 });
    assert(r.ok, 'event into own campus: ' + r.err?.message);
  });
  await as(U.alumU, async (c) => {
    denied(await insAs(c, 'jobs', { poster_id: U.alumU, campus_code: 'UI', title: 'j', company: 'c' }), /row-level security/, 'job into UI');
    assert((await insAs(c, 'jobs', { poster_id: U.alumU, campus_code: 'UNILAG', title: 'j', company: 'c' })).ok, 'job into own campus');
  });
  await as(CAU, async (c) => denied(await insAs(c, 'posts', postRow('UI', { author_id: U.campAdminU })), /row-level security/, 'campus admin into UI'));
  await as(ROOT, async (c) => assert((await insAs(c, 'posts', postRow('UI', { author_id: U.root }))).ok, 'super admin into UI'));
});
await check('5. campus_code is immutable for everyone but a Super Admin (posts, events, listings, groups, announcements, jobs, campaigns); visibility_scope for non-admins', async () => {
  await ins('announcements', { id: id(160), author_id: U.campAdminU, campus_code: 'UNILAG' });
  await ins('marketplace_listings', { id: id(161), seller_id: U.verU, campus_code: 'UNILAG' });
  const cases = [
    [U.verU, 'posts', S.postU], [U.verU, 'events', S.evU], [U.verU, 'marketplace_listings', id(161)], [U.verU, 'study_groups', S.sgU],
    [CAU, 'announcements', id(160)], [U.alumU, 'jobs', S.jobU], [U.verU, 'giving_campaigns', S.campU],
  ];
  for (const [who, t, rid] of cases) {
    await as(who, async (c) => {
      const up = await c.t(`UPDATE public.${t} SET campus_code='UI' WHERE id='${rid}'`);
      const now = (await c.su(`SELECT campus_code FROM public.${t} WHERE id='${rid}'`)).rows[0].campus_code;
      eq(now, 'UNILAG', `${t}: owner moved the row to another campus (${up.ok ? 'update accepted' : up.err.message})`);
    });
  }
  await as(U.verU, async (c) => {
    await c.t(`UPDATE public.posts SET visibility_scope='global' WHERE id='${S.postU}'`);
    eq((await c.su(`SELECT visibility_scope::text v FROM public.posts WHERE id='${S.postU}'`)).rows[0].v, 'campus', 'student changed visibility_scope');
    const ok = await c.t(`UPDATE public.posts SET title='edited' WHERE id='${S.postU}'`);
    assert(ok.ok && ok.n === 1, 'student can no longer edit own post');
  });
  await as(ROOT, async (c) => {
    await c.t(`UPDATE public.posts SET campus_code='UI' WHERE id='${S.postU}'`);
    eq((await c.q(`SELECT campus_code FROM public.posts WHERE id='${S.postU}'`)).rows[0].campus_code, 'UI', 'super admin must keep the ability');
  });
});
await check('5. 20261029 regression: the RESTRICTIVE update policy no longer lets a scoped admin move their own row to another campus (policy level)', async () => {
  await ins('posts', { id: id(162), author_id: U.campAdminU, campus_code: 'UNILAG', visibility_scope: 'campus', audience_scope: 'global', status: 'published' });
  await as(CAU, async (c) => {
    await c.su(`ALTER TABLE public.posts DISABLE TRIGGER trg_guard_campus_scope`).catch(() => {});   // isolate the policy from the trigger
    const mv = await c.t(`UPDATE public.posts SET campus_code='UI' WHERE id='${id(162)}'`);
    assert(!mv.ok || mv.n === 0, 'scoped admin moved their own row to another campus');
    const ok = await c.t(`UPDATE public.posts SET title='mine' WHERE id='${id(162)}'`);
    assert(ok.ok && ok.n === 1, ok.err?.message || 'scoped admin can no longer edit their own row');
  });
});

// =========================================================================== item 6: forged counters
await check('6. client-written counters are reset (posts, resources, jobs) on INSERT and UPDATE', async () => {
  await as(U.verU, async (c) => {
    const p = await insAs(c, 'posts', postRow('UNILAG', { likes_count: 999, comments_count: 999 }));
    assert(p.ok, p.err?.message);
    const mine = (await c.q(`SELECT likes_count, comments_count FROM public.posts WHERE author_id='${U.verU}' AND likes_count IS NOT NULL ORDER BY created_at DESC LIMIT 1`)).rows[0];
    eq(mine, { likes_count: 0, comments_count: 0 }, 'insert forged counters');
    await c.t(`UPDATE public.posts SET likes_count=500, comments_count=500, title='z' WHERE id='${S.postU}'`);
    eq((await c.su(`SELECT likes_count, comments_count FROM public.posts WHERE id='${S.postU}'`)).rows[0], { likes_count: 0, comments_count: 0 }, 'update forged counters');
    const r = await insAs(c, 'resources', { uploader_id: U.verU, campus_code: 'UNILAG', course_code: 'C', course_title: 'C', title: 'forged', resource_type: 'lecture_note', file_url: `${U.verU}/f.pdf`, downloads_count: 777, upvotes_count: 777 });
    assert(r.ok, r.err?.message);
    eq((await c.su(`SELECT downloads_count, upvotes_count FROM public.resources WHERE title='forged'`)).rows[0], { downloads_count: 0, upvotes_count: 0 }, 'resource insert');
    await c.t(`UPDATE public.resources SET downloads_count=888, upvotes_count=888 WHERE id='${S.resU}'`);
    eq((await c.su(`SELECT downloads_count, upvotes_count FROM public.resources WHERE id='${S.resU}'`)).rows[0], { downloads_count: 0, upvotes_count: 0 }, 'resource update');
  });
  await as(U.alumU, async (c) => {
    await c.t(`UPDATE public.jobs SET applications_count=500, title='t2' WHERE id='${S.jobU}'`);
    eq((await c.su(`SELECT applications_count FROM public.jobs WHERE id='${S.jobU}'`)).rows[0].applications_count, 0, 'jobs.applications_count');
  });
  await as(ROOT, async (c) => {
    await c.t(`UPDATE public.posts SET likes_count=5 WHERE id='${S.postI}'`);
    eq((await c.q(`SELECT likes_count FROM public.posts WHERE id='${S.postI}'`)).rows[0].likes_count, 5, 'super admin may set counters');
  });
});
await check('6. the real counter paths still work: likes, comments, downloads, upvotes, job applications', async () => {
  await as(U.verU2, async (c) => {
    const l = await c.t(`INSERT INTO public.post_likes (post_id, user_id) VALUES ('${S.postU}','${U.verU2}')`);
    assert(l.ok, l.err?.message);
    eq((await c.su(`SELECT likes_count FROM public.posts WHERE id='${S.postU}'`)).rows[0].likes_count, 1, 'likes_count did not increment');
    const cm = await insAs(c, 'post_comments', { post_id: S.postU, author_id: U.verU2, content: 'hi' });
    assert(cm.ok, cm.err?.message);
    eq((await c.su(`SELECT comments_count FROM public.posts WHERE id='${S.postU}'`)).rows[0].comments_count, 1, 'comments_count did not increment');
    const dl = await c.t(`SELECT public.increment_resource_download('${S.resU}') AS n`);
    assert(dl.ok && dl.rows[0].n === 1, dl.err?.message || `download count ${JSON.stringify(dl.rows)}`);
    const up = await c.t(`SELECT * FROM public.toggle_resource_upvote('${S.resU}')`);
    assert(up.ok && up.rows[0].upvoted === true && up.rows[0].upvotes_count === 1, up.err?.message || JSON.stringify(up.rows));
    const ap = await insAs(c, 'job_applications', { job_id: S.jobU, applicant_id: U.verU2 });
    assert(ap.ok, ap.err?.message);
    eq((await c.su(`SELECT applications_count FROM public.jobs WHERE id='${S.jobU}'`)).rows[0].applications_count, 1, 'applications_count did not increment');
  });
});

// =========================================================================== item 7: notifications
const notif = (c, vals) => insAs(c, 'notifications', { type: 'system', title: 't', body: 'b', ...vals });
await check('7. sender_id is forced to the caller (students, staff and admins), NULL included', async () => {
  await as(U.verU, async (c) => {
    const r = await c.t(`INSERT INTO public.notifications (id, recipient_id, sender_id, title, body, type, action_url) VALUES ('${id(180)}', '${U.verU2}', '${U.root}', 'hi', 'b', 'message', '/messages/x')`);
    assert(r.ok, r.err?.message);
    eq((await c.su(`SELECT sender_id FROM public.notifications WHERE id='${id(180)}'`)).rows[0].sender_id, U.verU, 'spoofed sender survived');
  });
  await as(SU, async (c) => {
    let n = 181;
    for (const [rcp, snd, ty] of [[U.verU, `'${U.root}'`, 'moderation'], [U.verU2, 'NULL', 'announcement']]) {
      const nid = id(n++);
      const r = await c.t(`INSERT INTO public.notifications (id, recipient_id, sender_id, title, body, type, action_url) VALUES ('${nid}', '${rcp}', ${snd}, 'hi', 'b', '${ty}', '/dashboard')`);
      assert(r.ok, `staff ${ty}: ${r.err?.message}`);
      eq((await c.su(`SELECT sender_id FROM public.notifications WHERE id='${nid}'`)).rows[0].sender_id, U.staffU, 'staff sender');
    }
  });
});
await check('7. students: only message/system types, only to people on their campus or related to them, never across a block, URLs must be relative', async () => {
  await as(U.verU, async (c) => {
    assert((await notif(c, { recipient_id: U.verU2, type: 'message', action_url: '/messages/abc' })).ok, 'same-campus peer message');
    assert((await notif(c, { recipient_id: U.verU, type: 'system' })).ok, 'self notification');
    assert((await notif(c, { recipient_id: U.globStudent, type: 'system', action_url: '/(student)/post/1' })).ok, 'GLOBAL member');
    denied(await notif(c, { recipient_id: U.verU2, type: 'moderation' }), /row-level security/, 'moderation type');
    denied(await notif(c, { recipient_id: U.verU2, type: 'announcement' }), /row-level security/, 'announcement type');
    for (const url of ['https://evil.example/login', '//evil.example', 'javascript:alert(1)', 'http://x.y', '/a b']) {
      denied(await notif(c, { recipient_id: U.verU2, type: 'system', action_url: url }), /row-level security/, `action_url ${url}`);
    }
  });
  await as(U.unvU, async (c) => denied(await notif(c, { recipient_id: U.verI, type: 'system' }), /row-level security/, 'unrelated other-campus member'));
  // a shared chat opens the door across campuses; a connection too
  await as(U.verU, async (c) => assert((await notif(c, { recipient_id: U.verI, type: 'message' })).ok, 'cross-campus member who shares a DM'));
  // a block closes it
  await db.exec(`INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES ('${U.verU2}','${U.verU}')`);
  try {
    await as(U.verU, async (c) => denied(await notif(c, { recipient_id: U.verU2, type: 'message' }), /row-level security/, 'blocked peer'));
  } finally { await db.exec(`DELETE FROM public.user_blocks WHERE blocker_id='${U.verU2}' AND blocked_id='${U.verU}'`); }
});
await check('7. staff / campus admins reach their own campus (and GLOBAL members) only; Super Admin everyone', async () => {
  await as(SU, async (c) => {
    assert((await notif(c, { recipient_id: U.verU, type: 'moderation', action_url: '/settings' })).ok, 'own campus');
    assert((await notif(c, { recipient_id: U.globStudent, type: 'announcement', action_url: '/dashboard' })).ok, 'GLOBAL member (announcement fan-out includes them)');
    denied(await notif(c, { recipient_id: U.verI, type: 'moderation' }), /row-level security/, 'other campus');
    denied(await notif(c, { recipient_id: U.verU, type: 'moderation', action_url: 'https://evil.example' }), /row-level security/, 'external URL');
  });
  await as(CAU, async (c) => denied(await notif(c, { recipient_id: U.verI, type: 'moderation' }), /row-level security/, 'campus admin -> other campus'));
  await as(ROOT, async (c) => assert((await notif(c, { recipient_id: U.verI, type: 'announcement', action_url: '/dashboard' })).ok, 'super admin'));
});
await check('7. rate limit: 120 notifications per hour per sender (students); trigger-generated notifications are not counted', async () => {
  await as(U.verU2, async (c) => {
    const many = await c.t(`INSERT INTO public.notifications (recipient_id, title, body, type) SELECT '${U.verU}', 'n'||g, 'b', 'system' FROM generate_series(1,120) g`);
    assert(many.ok, many.err?.message || 'first 120 should pass');
    const over = await c.t(`INSERT INTO public.notifications (recipient_id, title, body, type) VALUES ('${U.verU}', 'n121', 'b', 'system')`);
    denied(over, /Rate limit/, 'the 121st');
    // a comment on somebody's post makes the (definer) trigger notify the author: unaffected by the limit
    const cm = await insAs(c, 'post_comments', { post_id: S.postU, author_id: U.verU2, content: 'x' });
    assert(cm.ok, cm.err?.message || 'trigger-driven flows must not be rate limited by the client limiter');
  });
});

// =========================================================================== item 8: forced chat membership
await check('8. nobody can add themselves or others to a conversation they do not own; the creator can start a DM', async () => {
  await as(U.unvU, async (c) => {
    denied(await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${S.chDM}','${U.unvU}')`), /row-level security/, 'self-join a DM by id');
    denied(await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${S.chGroupU}','${U.unvU}')`), /row-level security/, 'self-join a user-created group');
    denied(await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${S.chDM}','${U.unvU2}')`), /row-level security/, 'add another person to a stranger\'s DM');
  });
  await as(U.verU2, async (c) => {
    denied(await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${S.chDM}','${U.unvU}')`), /row-level security/, 'member adds a third person (not the creator)');
    const re = await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${S.chDM}','${U.verU2}') ON CONFLICT DO NOTHING`);
    assert(re.ok, re.err?.message || 'the send-message upsert of an existing member must keep working');
  });
  await as(U.unvU, async (c) => {
    const ch = await c.t(`INSERT INTO public.chat_channels (id, name, is_direct_message, created_by) VALUES ('${S.chDM2}','dm2', true, '${U.unvU}')`);
    assert(ch.ok, ch.err?.message);
    assert((await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${S.chDM2}','${U.unvU2}')`)).ok, 'creator adds the other DM participant');
    denied(await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${S.chDM2}','${U.verU}')`), /row-level security/, 'a third person in a DM');
  });
});
await check('8. blocked pairs cannot be put in a channel; group channels stay on the creator\'s campus; system channels are self-service on their campus', async () => {
  await db.exec(`INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES ('${U.unvU2}','${U.unvU}')`);
  try {
    await as(U.unvU, async (c) => {
      assert((await c.t(`INSERT INTO public.chat_channels (id, name, is_direct_message, created_by) VALUES ('${id(138)}','dm3', true, '${U.unvU}')`)).ok);
      denied(await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${id(138)}','${U.unvU2}')`), /row-level security/, 'blocked person');
    });
  } finally { await db.exec(`DELETE FROM public.user_blocks WHERE blocker_id='${U.unvU2}' AND blocked_id='${U.unvU}'`); }
  await as(U.verU, async (c) => {
    denied(await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${S.chGroupU}','${U.verI}')`), /row-level security/, 'cross-campus member into a campus group');
    assert((await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${S.chGroupU}','${U.unvU}')`)).ok, 'same-campus member');
    assert((await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${S.chGroupU}','${U.globStudent}')`)).ok, 'GLOBAL member');
  });
  await as(U.verU2, async (c) => assert((await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${S.chSys}','${U.verU2}')`)).ok, 'own-campus system channel'));
  await as(U.verI, async (c) => denied(await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${S.chSys}','${U.verI}')`), /row-level security/, 'other-campus system channel'));
  await as(CAU, async (c) => {
    denied(await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${S.chDM}','${U.campAdminU}')`), /row-level security/, 'Campus Admin joins a DM');
    denied(await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${S.chGroupU}','${U.campAdminU}')`), /row-level security/, 'Campus Admin joins a group');
  });
  await as(ROOT, async (c) => assert((await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${S.chDM}','${U.root}')`)).ok, 'super admin'));
});

// =========================================================================== item 9: avatars listing
await check('9. avatars: anonymous and cross-member LISTING is gone, the bucket stays public, own files stay visible', async () => {
  await as('anon', async (c) => eq((await c.q(`SELECT count(*)::int n FROM storage.objects WHERE bucket_id='avatars'`)).rows[0].n, 0, 'anon lists avatars'));
  await as(U.verU2, async (c) => eq((await c.q(`SELECT name FROM storage.objects WHERE bucket_id='avatars'`)).rows.map((x) => x.name), [], 'a member lists other members\' avatars'));
  await as(U.verU, async (c) => eq((await c.q(`SELECT name FROM storage.objects WHERE bucket_id='avatars'`)).rows.map((x) => x.name), [`${U.verU}/me.png`], 'own avatar'));
  eq((await db.query(`SELECT public FROM storage.buckets WHERE id='avatars'`)).rows[0].public, true, 'bucket must stay public');
  eq((await db.query(`SELECT count(*)::int n FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Avatars are publicly viewable'`)).rows[0].n, 0);
});

// =========================================================================== item 10: root bootstrap
await check('10. the root-e-mail bootstrap needs a CONFIRMED address (JWT e-mail claim alone no longer counts)', async () => {
  await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
  await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
  try {
    // 1) JWT claims the root address but the account is somebody else's: not a Super Admin
    await as({ sub: U.unvU, email: ROOT_EMAIL }, async (c) => eq((await c.q(`SELECT public.auth_is_super_admin() v`)).rows[0].v, false, 'forged JWT e-mail claim'));
    // 2) the real root account with an UNCONFIRMED e-mail and no super_admin profile row
    await as(ROOT, async (c) => {
      await c.su(`UPDATE public.profiles SET role='student', admin_role=NULL WHERE id='${U.root}'`);
      await c.su(`UPDATE auth.users SET email_confirmed_at = NULL WHERE id='${U.root}'`);
      eq((await c.q(`SELECT public.auth_is_super_admin() v`)).rows[0].v, false, 'unconfirmed root e-mail');
      await c.su(`UPDATE auth.users SET email_confirmed_at = now() WHERE id='${U.root}'`);
      eq((await c.q(`SELECT public.auth_is_super_admin() v`)).rows[0].v, true, 'confirmed root e-mail');
    });
    // 3) admin_role = 'super_admin' rows are unchanged
    await as({ sub: U.campAdminU, email: 'campadmin.u@school.test' }, async (c) => {
      await c.su(`UPDATE public.profiles SET admin_role='super_admin' WHERE id='${U.campAdminU}'`);
      eq((await c.q(`SELECT public.auth_is_super_admin() v`)).rows[0].v, true, 'super_admin row');
    });
  } finally {
    await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
    await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);
  }
});

// =========================================================================== item 11: takedown abuse
await check('11. takedown: needs a verified onboarded account; third-party claims stay pending; only the uploader\'s own removal is instant (with caps); only campus admins are alerted', async () => {
  const call = (c, rid, type) => c.t(`SELECT public.submit_takedown_request('${rid}', '${type}', 'Claimant Name', 'claim@example.com', 'owner', 'This is my work, please remove it.', true) AS r`);
  await as(U.unvU, async (c) => denied(await call(c, S.resU, 'owner_removal'), /Verify your account/, 'unverified filer'));
  await as(U.verU2, async (c) => {
    const r = await call(c, S.resU, 'owner_removal');
    assert(r.ok, r.err?.message);
    eq(r.rows[0].r.auto_hidden, false, 'a third party must not hide a resource instantly');
    eq((await c.su(`SELECT is_approved FROM public.resources WHERE id='${S.resU}'`)).rows[0].is_approved, true, 'resource was hidden by a third party');
    denied(await call(c, S.resU, 'owner_removal'), /already have a request open/, 'duplicate');
  });
  await as(U.verU, async (c) => {
    const r = await call(c, S.resU, 'owner_removal');
    assert(r.ok, r.err?.message);
    eq(r.rows[0].r.auto_hidden, true, 'the uploader\'s own removal should apply at once');
    eq((await c.su(`SELECT is_approved FROM public.resources WHERE id='${S.resU}'`)).rows[0].is_approved, false);
    const rec = (await c.su(`SELECT DISTINCT recipient_id FROM public.notifications WHERE title IN ('New resource report','Copyright takedown: resource hidden') AND body LIKE '%U res%'`)).rows.map((x) => x.recipient_id);
    assert(rec.includes(U.campAdminU) && rec.includes(U.root), `campus admin / super admin not alerted: ${rec}`);
    assert(!rec.includes(U.campAdminI) && !rec.includes(U.adminG), 'admins of other campuses were alerted');
  });
});
await check('11. takedown: at most one instant hide per resource per day (cap), further uploader claims are queued', async () => {
  await as(U.verI, async (c) => {
    const call = (rid, type) => c.t(`SELECT public.submit_takedown_request('${rid}', '${type}', 'Claimant Name', 'claim@example.com', 'owner', 'This is my work, please remove it.', true) AS r`);
    const a = await call(S.resUI, 'owner_removal'); assert(a.ok, a.err?.message); eq(a.rows[0].r.auto_hidden, true);
    await c.su(`UPDATE public.resource_takedown_requests SET status='rejected' WHERE resource_id='${S.resUI}' AND reporter_id='${U.verI}'`);
    const b = await call(S.resUI, 'owner_removal'); assert(b.ok, b.err?.message);
    eq(b.rows[0].r.auto_hidden, false, 'second instant hide on the same resource within a day');
  });
});

// =========================================================================== item 12: probe helpers
await check('12. users_have_block / dm_channel_has_block / campus_of / is_profile_verified cannot be used to probe other people', async () => {
  await db.exec(`INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES ('${U.verU2}','${U.alumU}')`);
  try {
    await as(U.verU, async (c) => {
      eq((await c.q(`SELECT public.users_have_block('${U.verU2}', '${U.alumU}') v`)).rows[0].v, false, 'third-party block probe');
      eq((await c.q(`SELECT public.dm_channel_has_block('${S.chCross}', '${U.verI}') v`)).rows[0].v, false, 'sender probe');
      eq((await c.q(`SELECT public.dm_channel_has_block('${id(999)}') v`)).rows[0].v, false, 'unknown channel');
      eq((await c.q(`SELECT public.campus_of('${U.verI}') v`)).rows[0].v, null, 'campus of an invisible user');
      eq((await c.q(`SELECT public.campus_of('${U.glob}') v`)).rows[0].v, 'GLOBAL', 'GLOBAL member');
      eq((await c.q(`SELECT public.campus_of('${U.verU2}') v`)).rows[0].v, 'UNILAG', 'same campus');
      eq((await c.q(`SELECT public.is_profile_verified('${U.verU2}') v`)).rows[0].v, false, 'other member verification');
      eq((await c.q(`SELECT public.is_profile_verified('${U.verU}') v`)).rows[0].v, true, 'own verification');
    });
    await as(U.verU2, async (c) => eq((await c.q(`SELECT public.users_have_block('${U.verU2}', '${U.alumU}') v`)).rows[0].v, true, 'own block still reported'));
    await as(U.unvU, async (c) => eq((await c.q(`SELECT public.dm_channel_has_block('${S.chDM}') v`)).rows[0].v, false, 'non-member channel probe'));
    await as(CAU, async (c) => eq((await c.q(`SELECT public.campus_of('${U.verI}') v`)).rows[0].v, null, 'admin: other campus resolves to "no authority"'));
    await as(ROOT, async (c) => eq((await c.q(`SELECT public.campus_of('${U.verI}') v`)).rows[0].v, 'UI', 'super admin'));
    await as('postgres', async (c) => {
      eq((await c.q(`SELECT public.is_profile_verified('${U.verI}') v`)).rows[0].v, true, 'internal / SQL-editor call');
      eq((await c.q(`SELECT public.campus_of('${U.verI}') v`)).rows[0].v, 'UI', 'internal campus_of');
    });
  } finally { await db.exec(`DELETE FROM public.user_blocks WHERE blocker_id='${U.verU2}' AND blocked_id='${U.alumU}'`); }
});
await check('12. mentor_directory is scoped to the caller\'s campus (+ GLOBAL); Super Admin sees all', async () => {
  for (const [uid, headline] of [[U.alumU, 'UNILAG mentor'], [U.alumI, 'UI mentor']]) {
    await ins('mentor_profiles', { user_id: uid, headline, is_accepting: true, max_mentees: 3, expertise: '{x}', industries: '{y}', linkedin_url: 'https://linkedin.com/in/' + uid.slice(-4) });
  }
  const seen = async (who) => as(who, async (c) => (await c.q(`SELECT campus_code FROM public.mentor_directory(NULL, NULL, NULL, false, 50)`)).rows.map((x) => x.campus_code).sort());
  eq(await seen(U.verU), ['UNILAG'], 'UNILAG student');
  eq(await seen(U.verI), ['UI'], 'UI student');
  assert((await seen(ROOT)).length === 2, 'super admin');
});

// =========================================================================== item 13: search_path
await check('13. every SECURITY DEFINER function in public has pg_temp in its search_path (when it sets one)', async () => {
  const r = await db.query(`
    SELECT p.oid::regprocedure::text AS sig, c AS cfg FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public', unnest(p.proconfig) c
    WHERE p.prosecdef AND c LIKE 'search_path=%' AND c !~* 'pg_temp' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') ORDER BY 1`);
  assert(r.rows.length === 0, r.rows.map((x) => `${x.sig} ${x.cfg}`).join(' | '));
  const named = await db.query(`SELECT count(*)::int n FROM pg_proc WHERE proname = ANY ($1::text[]) AND prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c ~* 'pg_temp')`,
    [['is_community_manager', 'users_have_block', 'dm_channel_has_block', 'assign_forum_community_moderator', 'unassign_forum_community_moderator', 'get_suggested_connections', 'resolve_takedown_request', 'submit_takedown_request', 'enforce_community_admin_authority']]);
  eq(named.rows[0].n, 0);
});

// =========================================================================== item 14 / 15
await check('14. role_permissions is not readable by anon; signed-in members still read it', async () => {
  await as('anon', async (c) => { const r = await c.t(`SELECT count(*)::int n FROM public.role_permissions`); assert(!r.ok || r.rows[0].n === 0, 'anon reads the permission matrix'); });
  await as(U.verU, async (c) => assert((await c.q(`SELECT count(*)::int n FROM public.role_permissions`)).rows[0].n > 0, 'members lost the matrix'));
  await as(ROOT, async (c) => assert((await c.t(`UPDATE public.role_permissions SET enabled = enabled`)).ok, 'super admin manages the matrix'));
});
await check('15. verification evidence: the owner cannot replace / delete it after the decision; pending or unreferenced files stay editable', async () => {
  await db.exec(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES
    ('verifications','${U.verU}/decided.jpg','${U.verU}'), ('verifications','${U.verU}/pending.jpg','${U.verU}'), ('verifications','${U.verU}/free.jpg','${U.verU}')`);
  await ins('verifications', { id: id(170), user_id: U.verU, campus_code: 'UNILAG', status: 'approved', id_card_front_url: `${U.verU}/decided.jpg` });
  await ins('verifications', { id: id(171), user_id: U.verU, campus_code: 'UNILAG', status: 'pending', id_card_front_url: `${U.verU}/pending.jpg` });
  await as(U.verU, async (c) => {
    const upd = (n) => c.t(`UPDATE storage.objects SET metadata='{"x":1}'::jsonb WHERE bucket_id='verifications' AND name='${U.verU}/${n}'`);
    const del = (n) => c.t(`DELETE FROM storage.objects WHERE bucket_id='verifications' AND name='${U.verU}/${n}'`);
    eq((await upd('decided.jpg')).n, 0, 'owner updated decided evidence');
    eq((await del('decided.jpg')).n, 0, 'owner deleted decided evidence');
    eq((await upd('pending.jpg')).n, 1, 'pending evidence must stay editable');
    eq((await upd('free.jpg')).n, 1, 'unreferenced file must stay editable');
    eq((await del('free.jpg')).n, 1, 'unreferenced file must stay deletable');
  });
  await as(ROOT, async (c) => eq((await c.t(`DELETE FROM storage.objects WHERE bucket_id='verifications' AND name='${U.verU}/decided.jpg'`)).n, 1, 'super admin'));
});

// =========================================================================== 16. positive flows
await check('16. positive flows: student posts to own campus, campus admin acts on own campus, Super Admin everywhere', async () => {
  await as(U.verU, async (c) => {
    assert((await insAs(c, 'posts', postRow('UNILAG'))).ok, 'student post');
    assert((await c.t(`UPDATE public.posts SET title='x' WHERE id='${S.postU}'`)).ok, 'student edit');
  });
  await as(CAU, async (c) => {
    assert((await c.t(`UPDATE public.posts SET title='mod' WHERE id='${S.postU}'`)).n === 1, 'campus admin edits own-campus post');
    eq((await c.t(`UPDATE public.posts SET title='mod' WHERE id='${S.postI}'`)).n, 0, 'campus admin edits other campus post');
    assert((await c.t(`SELECT public.event_can_manage('${S.evU}')`)).ok);
  });
  await as(ROOT, async (c) => {
    assert((await c.t(`UPDATE public.posts SET title='root' WHERE id='${S.postI}'`)).n === 1, 'super admin edits any post');
    assert((await c.t(`SELECT * FROM public.admin_get_profile_contacts(ARRAY['${U.verI}']::uuid[])`)).rows.length === 1);
  });
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${BEFORE ? ' (BEFORE: failures here are the holes being demonstrated)' : ''}`);
process.exit(BEFORE ? 0 : failed.length ? 1 : 0);
