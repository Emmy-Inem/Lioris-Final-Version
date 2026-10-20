// Behaviour tests for supabase/migrations/20261107000000_data_lifecycle.sql, executed against an
// in-memory Postgres (PGlite). Nothing here touches a real database.
//
//   cd tools/sql-harness && npm install && node lifecycle.mjs
//
// Same load order as audit-remediation.mjs: legacy root files, the root extras production also ran,
// then every supabase/migrations/*.sql in order. The lifecycle migration itself is applied strictly
// (it must apply in one transaction without a single failing statement).
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { newDb, bootstrap, applyFile, MIGRATIONS, ROOT } from './lib.mjs';

const LIFECYCLE = 'supabase/migrations/20261107000000_data_lifecycle.sql';
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
let lifecycleResult = null;
for (const f of migrationFiles) {
  const path = `supabase/migrations/${f}`;
  if (path === LIFECYCLE) {
    try { lifecycleResult = await applyFile(db, path, true, () => {}); } catch (e) {
      console.log(`FATAL: lifecycle migration did not apply: ${e.message}${e.detail ? ' | ' + e.detail : ''}${e.where ? ' | ' + e.where : ''}`);
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
const U = { root: id(1), stu: id(2), stu2: id(3), ob: id(4), nob: id(5), victim: id(6), other: id(7), ui: id(8) };
const ROOT_EMAIL = 'inememmanuel@gmail.com';
async function mk(uid, email, campus, meta = {}) {
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ($1,$2,$3::jsonb, now())`,
    [uid, email, JSON.stringify({ campus_code: campus, full_name: email.split('@')[0], ...meta })]);
}
await mk(U.root, ROOT_EMAIL, 'GLOBAL');
await mk(U.stu, 'stu@school.test', 'UNILAG');
await mk(U.stu2, 'stu2@school.test', 'UNILAG');
await mk(U.ob, 'onboarded@school.test', 'UNILAG');
await mk(U.nob, 'notonboarded@school.test', 'UNILAG');
await mk(U.victim, 'victim@school.test', 'UNILAG', { terms_version: 'v1', age_eligibility_confirmed: 'true' });
await mk(U.other, 'other@school.test', 'UNILAG');
await mk(U.ui, 'ui@school.test', 'UI');
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
await db.exec(`UPDATE public.profiles SET role='admin', admin_role='super_admin', campus_code='GLOBAL', verification_status='verified', onboarding_complete=true WHERE id='${U.root}'`);
await db.exec(`UPDATE public.profiles SET onboarding_complete=true, verification_status='verified' WHERE id IN ('${U.stu}','${U.stu2}','${U.ob}','${U.victim}','${U.other}','${U.ui}')`);
await db.exec(`UPDATE public.profiles SET onboarding_complete=false WHERE id='${U.nob}'`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);
await db.exec(`ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT SELECT, INSERT ON storage.objects TO anon, authenticated;`);
await db.exec(`INSERT INTO storage.buckets (id, name, public) VALUES ('resources','resources',false), ('campus-media','campus-media',false), ('verifications','verifications',false) ON CONFLICT (id) DO NOTHING`);

console.log('\n== LIFECYCLE ==');

// --------------------------------------------------------------------------- 0. application
await check('lifecycle migration applies cleanly in a single transaction', async () => { assert(lifecycleResult && !lifecycleResult.failures?.length, 'did not apply'); });
await check('lifecycle migration is idempotent (second run)', async () => {
  await db.exec(readFileSync(resolve(ROOT, LIFECYCLE), 'utf8'));
});

// --------------------------------------------------------------------------- 1. compliance RPCs
const priv = async (fn, role) => (await db.query(`SELECT has_function_privilege($1, $2, 'EXECUTE') v`, [role, fn])).rows[0].v;
await check('compliance RPCs exist in migrations with the intended grants (record_consent: authenticated yes, anon no)', async () => {
  const want = [
    // fn, anon, authenticated, service_role
    ['public.export_my_data()', false, true, true],
    ['public.record_consent(text,boolean)', false, true, true],
    ['public.latest_consent(text)', false, true, true],
    ['public.purge_user_data(uuid)', false, false, true],
    ['public.list_expired_verification_documents(int,int)', false, false, true],
    ['public.clear_verification_document_paths(uuid[])', false, false, true],
    ['public.claim_push_token(text,text)', false, true, true],
    ['public.record_user_activity(text,text,text,jsonb)', false, true, true],
    ['public.purge_old_analytics(int)', false, false, true],
    ['public.purge_stale_push_tokens(int)', false, false, true],
    ['public.purge_old_click_logs(int)', false, false, true],
    ['public.purge_resolved_moderation_queue(int)', false, false, true],
    ['public.purge_old_unread_notifications(int)', false, false, true],
    ['public.schedule_verification_document_purge()', false, false, true],
  ];
  for (const [fn, a, au, s] of want) {
    eq([await priv(fn, 'anon'), await priv(fn, 'authenticated'), await priv(fn, 'service_role')], [a, au, s], fn);
  }
  eq((await db.query(`SELECT count(*)::int n FROM pg_proc WHERE proname='list_expired_verification_documents'`)).rows[0].n, 1, 'old 1-arg overload must be gone');
});
await check('record_consent works for authenticated, latest_consent reads it back, anon cannot call either', async () => {
  await as(U.stu, async (c) => {
    eq((await c.q(`SELECT public.latest_consent() v`)).rows[0].v, null, 'no consent yet');
    const r = await c.t(`SELECT public.record_consent('2026-11')`);
    assert(r.ok, r.err?.message);
    eq((await c.q(`SELECT public.latest_consent() v`)).rows[0].v, '2026-11', 'latest');
    denied(await c.t(`SELECT public.record_consent('bad version!')`), /Invalid consent version/, 'bad version');
    denied(await c.t(`UPDATE public.consent_records SET version='x'`), /permission denied/i, 'consent is append-only');
  });
  await as('anon', async (c) => {
    denied(await c.t(`SELECT public.record_consent('2026-11')`), /permission denied/i, 'anon record_consent');
    denied(await c.t(`SELECT public.latest_consent()`), /permission denied/i, 'anon latest_consent');
  });
});
await check('export_my_data returns only the caller\'s rows and refuses anon', async () => {
  await as(U.victim, async (c) => {
    const r = (await c.q(`SELECT public.export_my_data() d`)).rows[0].d;
    eq(r.user_id, U.victim, 'user id');
    assert(Array.isArray(r.data.consent_records) && r.data.consent_records.length === 1, 'victim consent record missing from export');
    assert(JSON.stringify(r).indexOf(U.stu) === -1, 'export leaks another user id');
  });
  await as('anon', async (c) => { denied(await c.t(`SELECT public.export_my_data()`), /permission denied/i, 'anon export'); });
});

// --------------------------------------------------------------------------- 2. erasure
const sha = (s) => createHash('sha256').update(s).digest('hex');
const FK_SQL = `
  SELECT cl.relname::text tbl, a.attname::text col, c.confdeltype::text del
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid=c.conrelid AND cl.relkind='r'
    JOIN pg_namespace n ON n.oid=cl.relnamespace AND n.nspname='public'
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
   WHERE c.contype='f' AND array_length(c.conkey,1)=1
     AND c.confrelid IN ('public.profiles'::regclass,'auth.users'::regclass)
     AND cl.relname NOT IN ('audit_logs','profiles')
   ORDER BY 1,2`;
await check('every table with a user FK to profiles/auth.users is cascaded or nulled by purge_user_data (no restrictive FK)', async () => {
  const fks = (await db.query(FK_SQL)).rows;
  const bad = fks.filter((f) => !['c', 'n'].includes(f.del));
  assert(bad.length === 0, `restrictive FKs purge_user_data would skip: ${bad.map((b) => b.tbl + '.' + b.col).join(', ')}`);
  const tables = new Set(fks.map((f) => f.tbl));
  for (const t of ['job_applications', 'saved_items', 'resource_downloads', 'event_payment_clicks', 'giving_campaign_clicks', 'analytics_events', 'push_tokens', 'consent_records', 'posts', 'notifications', 'support_tickets']) {
    assert(tables.has(t), `${t} is not covered by an FK to profiles/auth.users`);
  }
  console.log(`      (${fks.length} user FK columns across ${tables.size} tables are handled)`);
});

// Seed a user with data in the tables the erasure must reach; returns {} ids. Runs inside a sandbox.
async function seedVictim(c) {
  const V = U.victim;
  const ev = (await c.q(`INSERT INTO public.events (creator_id, campus_code, title, description, venue, start_time, end_time) VALUES ('${U.other}','UNILAG','E','d','v', now()+interval '1 day', now()+interval '2 day') RETURNING id`)).rows[0].id;
  const gc = (await c.q(`INSERT INTO public.giving_campaigns (creator_id, title, giving_url) VALUES ('${U.other}','Camp','https://example.com') RETURNING id`)).rows[0].id;
  const job = (await c.q(`INSERT INTO public.jobs (title, company, location, poster_id) VALUES ('J','C','L','${U.other}') RETURNING id`)).rows[0].id;
  const res = (await c.q(`INSERT INTO public.resources (uploader_id, campus_code, course_code, course_title, title, file_url) VALUES ('${U.other}','UNILAG','C1','T','R','${U.other}/r.pdf') RETURNING id`)).rows[0].id;
  const post = (await c.q(`INSERT INTO public.posts (author_id, campus_code, content) VALUES ('${V}','UNILAG','my post') RETURNING id`)).rows[0].id;
  await c.q(`INSERT INTO public.post_comments (post_id, author_id, content) VALUES ('${post}','${V}','my comment')`);
  await c.q(`INSERT INTO public.saved_items (user_id, kind, item_id) VALUES ('${V}','resource','x1')`);
  await c.q(`INSERT INTO public.push_tokens (user_id, token) VALUES ('${V}','ExponentPushToken[victim-token-1]')`);
  await c.q(`INSERT INTO public.analytics_events (user_id, event_type, name, campus_code) VALUES ('${V}','page_view','/feed','UNILAG')`);
  await c.q(`INSERT INTO public.event_payment_clicks (event_id, user_id) VALUES ('${ev}','${V}')`);
  await c.q(`INSERT INTO public.giving_campaign_clicks (campaign_id, user_id) VALUES ('${gc}','${V}')`);
  await c.q(`INSERT INTO public.job_applications (job_id, applicant_id, resume_url) VALUES ('${job}','${V}','${V}/cv.pdf')`);
  await c.q(`INSERT INTO public.resource_downloads (resource_id, user_id) VALUES ('${res}','${V}')`);
  await c.q(`INSERT INTO public.notifications (recipient_id, title, body, type) VALUES ('${V}','t','b','system')`);
  await c.q(`INSERT INTO public.client_errors (fingerprint, user_id, message) VALUES ('fp-1','${V}','boom')`);
  await c.q(`UPDATE public.profiles SET resume_url='${V}/cv.pdf', company='Acme', location='Lagos' WHERE id='${V}'`);
  // audit rows that name the victim in every way the trail can
  await c.q(`INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata) VALUES ('${V}','post_created','post','${post}','{"note":"x"}')`);
  await c.q(`INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata) VALUES ('${U.other}','warned','user','${V}','{"summary":"warned user ${V}"}')`);
  await c.q(`INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata) VALUES ('${U.root}','verification_approved','verification_request',NULL,'{"targetUserId":"${V}","nested":{"u":["${V.toUpperCase()}"]}}')`);
  return { post };
}
const auditMentions = async (c, uid) => Number((await c.su(`SELECT count(*)::int n FROM public.audit_logs WHERE entity_id='${uid}' OR actor_id='${uid}' OR metadata::text ILIKE '%${uid}%'`)).rows[0].n);

await check('purge_user_data: deletes/nulls every user-linked row (incl. job_applications, saved_items, downloads, clicks, analytics, push tokens)', async () => {
  await sandbox(async (c) => {
    await seedVictim(c);
    const before = {};
    const fks = (await c.q(FK_SQL)).rows;
    const count = async (f) => Number((await c.q(`SELECT count(*)::int n FROM public.${f.tbl} WHERE ${f.col}='${U.victim}'`)).rows[0].n);
    for (const f of fks) before[`${f.tbl}.${f.col}`] = await count(f);
    for (const k of ['posts.author_id', 'post_comments.author_id', 'saved_items.user_id', 'push_tokens.user_id', 'analytics_events.user_id', 'event_payment_clicks.user_id', 'giving_campaign_clicks.user_id', 'job_applications.applicant_id', 'resource_downloads.user_id', 'notifications.recipient_id', 'consent_records.user_id']) {
      assert(before[k] >= 1, `fixture did not create a ${k} row`);
    }
    await c.q(`SET LOCAL ROLE service_role`);
    const r = (await c.q(`SELECT public.purge_user_data('${U.victim}') r`)).rows[0].r;
    await c.q(`RESET ROLE`);
    eq(r.skipped_restrictive_fks, [], 'skipped fks');
    for (const f of fks) eq(await count(f), 0, `${f.tbl}.${f.col} still holds the user after purge`);
    eq(Number((await c.q(`SELECT count(*)::int n FROM public.client_errors WHERE user_id='${U.victim}'`)).rows[0].n), 0, 'client_errors');
    const p = (await c.q(`SELECT email, full_name, resume_url, company, location FROM public.profiles WHERE id='${U.victim}'`)).rows[0];
    eq([p.full_name, p.resume_url, p.company, p.location], ['Deleted user', null, null, null], 'profile anonymised');
    assert(/^deleted\+/.test(p.email), 'profile e-mail anonymised');
  });
});
await check('purge_user_data: audit trail is kept but holds only the SHA-256 hash, never the raw user id', async () => {
  await sandbox(async (c) => {
    await seedVictim(c);
    const total = Number((await c.q(`SELECT count(*)::int n FROM public.audit_logs`)).rows[0].n);
    assert((await auditMentions(c, U.victim)) >= 3, 'fixture audit rows missing');
    await c.q(`SET LOCAL ROLE service_role`);
    const r = (await c.q(`SELECT public.purge_user_data('${U.victim}') r`)).rows[0].r;
    await c.q(`RESET ROLE`);
    const h = sha(U.victim);
    eq(r.user_id_hash, h, 'returned hash');
    eq(await auditMentions(c, U.victim), 0, 'audit_logs still reference the raw user id');
    const after = Number((await c.q(`SELECT count(*)::int n FROM public.audit_logs`)).rows[0].n);
    assert(after > total, `audit trail shrank or the purge itself was not logged (${total} -> ${after})`);
    const rows = (await c.q(`SELECT action, entity_id, actor_id, metadata FROM public.audit_logs WHERE metadata::text LIKE '%${h}%' ORDER BY created_at, action`)).rows;
    const byAction = Object.fromEntries(rows.map((x) => [x.action, x]));
    assert(byAction.post_created && byAction.post_created.actor_id === null && byAction.post_created.metadata.actorIdHash === h, 'actor row not anonymised with a hash');
    assert(byAction.warned && byAction.warned.entity_id === null && byAction.warned.metadata.entityIdHash === h && byAction.warned.metadata.summary.includes(h), 'entity row not anonymised with a hash');
    assert(byAction.verification_approved && JSON.stringify(byAction.verification_approved.metadata).includes(h) && byAction.verification_approved.actor_id === U.root, 'metadata reference not replaced (actor of the other row must be untouched)');
    const purge = byAction.user_data_purged;
    assert(purge && purge.entity_id === null && purge.metadata.deletedUserIdHash === h, 'the purge audit row must store the hash and no entity id');
  });
});
await check('audit_logs stays append-only for everyone else (the anonymisation exception is not reachable from a client role)', async () => {
  await as('service_role', async (c) => {
    await c.q(`SELECT set_config('lioris.audit_anonymise','on',true)`);
    denied(await c.t(`UPDATE public.audit_logs SET metadata='{}'::jsonb`), /append-only|permission denied/i, 'service_role update');
    denied(await c.t(`DELETE FROM public.audit_logs`), /append-only|permission denied/i, 'service_role delete');
  });
  await sandbox(async (c) => {
    await c.q(`INSERT INTO public.audit_logs (actor_id, action, entity_type, metadata) VALUES (NULL,'x','user','{}')`);
    denied(await c.t(`UPDATE public.audit_logs SET action='y'`), /append-only/i, 'superuser update without the flag');
    await c.q(`SELECT set_config('lioris.audit_anonymise','on',true)`);
    denied(await c.t(`UPDATE public.audit_logs SET action='y'`), /append-only/i, 'flag allows metadata only, not action');
  });
});
await check('purge_user_data keeps a minimal anonymised consent proof {hash, type, version, accepted_at}', async () => {
  await sandbox(async (c) => {
    const rec = (await c.q(`SELECT consent_type, version, accepted_at FROM public.consent_records WHERE user_id='${U.victim}'`)).rows;
    eq(rec.length, 1, 'victim consent');
    await c.q(`SET LOCAL ROLE service_role`);
    await c.q(`SELECT public.purge_user_data('${U.victim}')`);
    await c.q(`SELECT public.purge_user_data('${U.victim}')`); // idempotent
    await c.q(`RESET ROLE`);
    eq(Number((await c.q(`SELECT count(*)::int n FROM public.consent_records WHERE user_id='${U.victim}'`)).rows[0].n), 0, 'consent_records');
    const p = (await c.q(`SELECT user_hash, consent_type, version, accepted_at FROM public.consent_proofs`)).rows;
    eq(p.length, 1, 'one proof row');
    eq([p[0].user_hash, p[0].consent_type, p[0].version], [sha(U.victim), rec[0].consent_type, rec[0].version], 'proof content');
    eq(new Date(p[0].accepted_at).getTime(), new Date(rec[0].accepted_at).getTime(), 'proof accepted_at');
    const cols = (await c.q(`SELECT column_name FROM information_schema.columns WHERE table_name='consent_proofs' AND table_schema='public' ORDER BY 1`)).rows.map((x) => x.column_name);
    assert(!cols.includes('user_id'), 'proof table must not hold the user id');
  });
  await sandbox(async (c) => {
    await c.q(`INSERT INTO public.consent_proofs (user_hash, consent_type, version, accepted_at) VALUES ('${sha('x')}','terms','v1',now())`);
    await c.q(`SET LOCAL ROLE authenticated`);
    eq((await c.q(`SELECT count(*)::int n FROM public.consent_proofs`)).rows[0].n, 0, 'clients must see no proof rows');
    denied(await c.t(`INSERT INTO public.consent_proofs (user_hash, consent_type, version, accepted_at) VALUES ('${sha('y')}','terms','v1',now())`), /permission denied/i, 'clients cannot write proofs');
  });
});
await check('purge_user_data is service_role only and refuses admin accounts', async () => {
  await as(U.stu, async (c) => { denied(await c.t(`SELECT public.purge_user_data('${U.victim}')`), /permission denied/i, 'authenticated purge'); });
  await as('anon', async (c) => { denied(await c.t(`SELECT public.purge_user_data('${U.victim}')`), /permission denied/i, 'anon purge'); });
  await as('service_role', async (c) => { denied(await c.t(`SELECT public.purge_user_data('${U.root}')`), /Admin accounts cannot be purged/i, 'admin purge'); });
});

// --------------------------------------------------------------------------- 3. verification document retention
const GHOST = id(99); // an owner whose account (and requests) no longer exist
async function seedVerifications(c) {
  const v = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const ver = async (vid, uid, status, daysAgo, front, back = null, selfie = null) => c.q(
    `INSERT INTO public.verifications (id, user_id, campus_code, requested_role, id_card_front_url, id_card_back_url, selfie_url, status, reviewed_at, created_at)
     VALUES ($1,$2,'UNILAG','student',$3,$4,$5,$6::public.moderation_status_type, ${status === 'pending' ? 'NULL' : `now() - interval '${daysAgo} days'`}, now() - interval '${daysAgo + 1} days')`,
    [vid, uid, front, back, selfie, status]);
  const obj = async (name, daysAgo) => c.q(`INSERT INTO storage.objects (bucket_id, name, owner, created_at) VALUES ('verifications',$1,$2,now() - interval '${daysAgo} days')`, [name, name.split('/')[0]]);
  // fresh random client-side uuids: NOT equal to verifications.id (the production bug)
  await ver(v(1), U.stu, 'approved', 40, `${U.stu}/c0ffee00-0000-4000-8000-000000000001.jpg`, null, `${U.stu}/c0ffee00-0000-4000-8000-000000000002.jpg`);
  await obj(`${U.stu}/c0ffee00-0000-4000-8000-000000000001.jpg`, 41);
  await obj(`${U.stu}/c0ffee00-0000-4000-8000-000000000002.jpg`, 41);
  await ver(v(2), U.stu2, 'rejected', 10, `${U.stu2}/c0ffee00-0000-4000-8000-000000000003.jpg`);
  await obj(`${U.stu2}/c0ffee00-0000-4000-8000-000000000003.jpg`, 11);
  await ver(v(3), U.other, 'pending', 50, `${U.other}/c0ffee00-0000-4000-8000-000000000004.pdf`);
  await obj(`${U.other}/c0ffee00-0000-4000-8000-000000000004.pdf`, 50);
  await obj(`${U.other}/c0ffee00-0000-4000-8000-000000000005.pdf`, 60); // unreferenced but owner has a pending request
  await obj(`${GHOST}/c0ffee00-0000-4000-8000-000000000006.jpg`, 40);   // orphan (owner gone)
  await obj(`${GHOST}/c0ffee00-0000-4000-8000-000000000007.jpg`, 5);    // orphan but recent
  await ver(v(4), U.ob, 'approved', 40, `${U.ob}/legacy-front.jpg`);    // legacy naming: file is <verification id>.<ext>
  await obj(`${U.ob}/${v(4)}.jpg`, 41);
  await ver(v(5), U.ui, 'approved', 40, `https://x.supabase.co/storage/v1/object/sign/verifications/${U.ui}/signed.jpg?token=abc`);
  await obj(`${U.ui}/signed.jpg`, 41);
  return v;
}
await check('list_expired_verification_documents matches the real evidence paths (front/back/selfie, URLs, legacy ids) and orphans', async () => {
  await sandbox(async (c) => {
    const v = await seedVerifications(c);
    await c.q(`SET LOCAL ROLE service_role`);
    const rows = (await c.q(`SELECT bucket, path, verification_id FROM public.list_expired_verification_documents(30)`)).rows;
    await c.q(`RESET ROLE`);
    const got = Object.fromEntries(rows.map((r) => [r.path, r.verification_id]));
    const want = {
      [`${U.stu}/c0ffee00-0000-4000-8000-000000000001.jpg`]: v(1),
      [`${U.stu}/c0ffee00-0000-4000-8000-000000000002.jpg`]: v(1),
      [`${GHOST}/c0ffee00-0000-4000-8000-000000000006.jpg`]: null,
      [`${U.ob}/${v(4)}.jpg`]: v(4),
      [`${U.ui}/signed.jpg`]: v(5),
    };
    const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
    eq(sorted(got), sorted(want), 'expired set');
    assert(rows.every((r) => r.bucket === 'verifications'), 'bucket column');
  });
});
await check('list_expired_verification_documents honours p_days and p_limit; pending and recent requests are never listed', async () => {
  await sandbox(async (c) => {
    await seedVerifications(c);
    await c.q(`SET LOCAL ROLE service_role`);
    eq((await c.q(`SELECT count(*)::int n FROM public.list_expired_verification_documents(30, 2)`)).rows[0].n, 2, 'p_limit');
    eq((await c.q(`SELECT count(*)::int n FROM public.list_expired_verification_documents(5)`)).rows[0].n >= 6, true, 'a shorter window lists more (the 10-day-old rejection is now expired)');
    eq((await c.q(`SELECT count(*)::int n FROM public.list_expired_verification_documents(365)`)).rows[0].n, 0, 'a one-year window lists nothing');
    const all = (await c.q(`SELECT path FROM public.list_expired_verification_documents(30)`)).rows.map((r) => r.path).join('|');
    assert(!['0004', '0005', '0003', '0007'].some((n) => all.includes(`c0ffee00-0000-4000-8000-00000000${n}`)), 'pending / recent objects listed');
  });
});
await check('clear_verification_document_paths nulls the path columns of decided requests only; the cycle empties the list', async () => {
  await sandbox(async (c) => {
    const v = await seedVerifications(c);
    await c.q(`SET LOCAL ROLE service_role`);
    const ids = (await c.q(`SELECT DISTINCT verification_id FROM public.list_expired_verification_documents(30) WHERE verification_id IS NOT NULL`)).rows.map((r) => r.verification_id);
    // pending request id sneaked into the call must be left alone
    const n = (await c.q(`SELECT public.clear_verification_document_paths($1::uuid[]) n`, [`{${[...ids, v(3)].join(',')}}`])).rows[0].n;
    eq(n, ids.length, 'cleared rows');
    await c.q(`RESET ROLE`);
    const r = (await c.q(`SELECT id, id_card_front_url f, id_card_back_url b, selfie_url s FROM public.verifications ORDER BY id`)).rows;
    for (const x of r) {
      if (x.id === v(3)) assert(x.f !== null, 'pending request lost its document path');
      else if (ids.includes(x.id)) eq([x.f, x.b, x.s], [null, null, null], `decided request ${x.id} paths`);
    }
    // edge function deleted the objects; nothing is left to list
    await c.q(`DELETE FROM storage.objects WHERE created_at < now() - interval '30 days'`);
    await c.q(`SET LOCAL ROLE service_role`);
    eq((await c.q(`SELECT count(*)::int n FROM public.list_expired_verification_documents(30)`)).rows[0].n, 0, 'list after cleanup');
    eq((await c.q(`SELECT public.clear_verification_document_paths(NULL) n`)).rows[0].n, 0, 'NULL input');
  });
  await as(U.stu, async (c) => {
    denied(await c.t(`SELECT * FROM public.list_expired_verification_documents(30)`), /permission denied/i, 'authenticated list');
    denied(await c.t(`SELECT public.clear_verification_document_paths('{}')`), /permission denied/i, 'authenticated clear');
  });
  await as('anon', async (c) => {
    denied(await c.t(`SELECT * FROM public.list_expired_verification_documents(30)`), /permission denied/i, 'anon list');
  });
});

// --------------------------------------------------------------------------- 4. retention jobs
await check('retention purge functions delete only what is past its window (downloads and fresh rows are kept)', async () => {
  await sandbox(async (c) => {
    const ev = (await c.q(`INSERT INTO public.events (creator_id, campus_code, title, description, venue, start_time, end_time) VALUES ('${U.other}','UNILAG','E','d','v', now()+interval '1 day', now()+interval '2 day') RETURNING id`)).rows[0].id;
    const gc = (await c.q(`INSERT INTO public.giving_campaigns (creator_id, title, giving_url) VALUES ('${U.other}','Camp','https://example.com') RETURNING id`)).rows[0].id;
    const res = (await c.q(`INSERT INTO public.resources (uploader_id, campus_code, course_code, course_title, title, file_url) VALUES ('${U.other}','UNILAG','C1','T','R','${U.other}/r.pdf') RETURNING id`)).rows[0].id;
    // analytics
    await c.q(`INSERT INTO public.analytics_events (user_id, event_type, name, campus_code, created_at) VALUES (NULL,'page_view','/old','UNILAG', now() - interval '100 days'), (NULL,'page_view','/old2','UNILAG', now() - interval '91 days'), (NULL,'page_view','/new','UNILAG', now() - interval '10 days')`);
    // push tokens
    await c.q(`INSERT INTO public.push_tokens (user_id, token, updated_at) VALUES ('${U.stu}','ExponentPushToken[stale-token-1]', now() - interval '121 days'), ('${U.stu2}','ExponentPushToken[fresh-token-1]', now() - interval '5 days')`);
    // click logs + downloads
    await c.q(`INSERT INTO public.event_payment_clicks (event_id, user_id, first_clicked_at, last_clicked_at) VALUES ('${ev}','${U.stu}', now() - interval '300 days', now() - interval '200 days'), ('${ev}','${U.stu2}', now(), now())`);
    await c.q(`INSERT INTO public.giving_campaign_clicks (campaign_id, user_id, created_at) VALUES ('${gc}','${U.stu}', now() - interval '181 days'), ('${gc}','${U.stu2}', now())`);
    await c.q(`INSERT INTO public.resource_downloads (resource_id, user_id, created_at) VALUES ('${res}','${U.stu}', now() - interval '400 days')`);
    // moderation queue
    await c.q(`INSERT INTO public.moderation_queue (item_type, item_id, campus_code, reason, status, resolved_at) VALUES ('post', gen_random_uuid(), 'UNILAG', 'old resolved', 'approved', now() - interval '13 months'), ('post', gen_random_uuid(), 'UNILAG', 'recent resolved', 'approved', now() - interval '2 months'), ('post', gen_random_uuid(), 'UNILAG', 'old but open', 'pending', NULL)`);
    // notifications
    await c.q(`INSERT INTO public.notifications (recipient_id, title, body, type, is_read, created_at) VALUES ('${U.stu}','old unread','b','system', false, now() - interval '181 days'), ('${U.stu}','recent unread','b','system', false, now() - interval '5 days'), ('${U.stu}','old read','b','system', true, now() - interval '400 days')`);

    await c.q(`SET LOCAL ROLE service_role`);
    const n = async (sql) => Number((await c.q(sql)).rows[0].n);
    eq(await n(`SELECT public.purge_old_analytics(90) n`), 2, 'analytics purged');
    eq(await n(`SELECT public.purge_stale_push_tokens(120) n`), 1, 'push tokens purged');
    eq(await n(`SELECT public.purge_old_click_logs(180) n`), 2, 'click logs purged');
    eq(await n(`SELECT public.purge_resolved_moderation_queue(12) n`), 1, 'moderation rows purged');
    eq(await n(`SELECT public.purge_old_unread_notifications(180) n`), 1, 'unread notifications purged');
    eq(await n(`SELECT public.purge_old_analytics(90) n`), 0, 'second run finds nothing');
    await c.q(`RESET ROLE`);
    eq(await n(`SELECT count(*)::int n FROM public.analytics_events`), 1, 'fresh analytics kept');
    eq(await n(`SELECT count(*)::int n FROM public.push_tokens`), 1, 'fresh token kept');
    eq(await n(`SELECT count(*)::int n FROM public.event_payment_clicks`) + await n(`SELECT count(*)::int n FROM public.giving_campaign_clicks`), 2, 'fresh clicks kept');
    eq(await n(`SELECT count(*)::int n FROM public.resource_downloads`), 1, 'downloads are never purged');
    eq(await n(`SELECT count(*)::int n FROM public.moderation_queue`), 2, 'open + recent reports kept');
    eq(await n(`SELECT count(*)::int n FROM public.notifications WHERE recipient_id='${U.stu}'`), 2, 'recent unread + read (other job) kept');
    assert(await n(`SELECT count(*)::int n FROM public.audit_logs WHERE action='retention_purge'`) >= 5, 'purges are audit logged');
  });
  await as(U.stu, async (c) => { denied(await c.t(`SELECT public.purge_old_analytics(1)`), /permission denied/i, 'authenticated purge'); });
});
await check('scheduling the verification purge without pg_cron/pg_net/vault is a no-op notice, not an error', async () => {
  await as('service_role', async (c) => {
    const r = (await c.q(`SELECT public.schedule_verification_document_purge() r`)).rows[0].r;
    assert(/^skipped/.test(r), `unexpected result ${r}`);
  });
});

// --------------------------------------------------------------------------- 5. analytics integrity
await check('analytics_events: authenticated may insert only their own, campus-consistent, bounded events', async () => {
  const ins = (uid, type, name, campus, meta = '{}') => `INSERT INTO public.analytics_events (user_id, event_type, name, campus_code, metadata) VALUES (${uid ? `'${uid}'` : 'NULL'}, '${type}', '${name}', ${campus ? `'${campus}'` : 'NULL'}, '${meta}'::jsonb)`;
  await as(U.stu, async (c) => {
    assert((await c.t(ins(U.stu, 'page_view', '/feed', 'UNILAG'))).ok, 'own event with own campus refused');
    assert((await c.t(ins(U.stu, 'feature_use', 'heartbeat', null))).ok, 'own event with no campus refused');
    assert((await c.t(ins(null, 'page_view', '/x', 'GLOBAL'))).ok, 'anonymous-attributed GLOBAL event refused');
    denied(await c.t(ins(U.stu2, 'page_view', '/feed', 'UNILAG')), /row-level security/i, 'event attributed to another user');
    denied(await c.t(ins(U.stu, 'page_view', '/feed', 'UI')), /row-level security/i, 'event on another campus');
    denied(await c.t(ins(U.stu, 'drop_table', '/feed', 'UNILAG')), /row-level security/i, 'unknown event type');
    denied(await c.t(ins(U.stu, 'page_view', 'x'.repeat(65), 'UNILAG')), /analytics_events_name_len/i, 'name > 64');
    denied(await c.t(ins(U.stu, 'page_view', '/big', 'UNILAG', JSON.stringify({ blob: 'z'.repeat(3000) }))), /analytics_events_metadata_size/i, 'metadata > 2 KB');
  });
  await as('anon', async (c) => {
    assert((await c.t(ins(null, 'page_view', '/landing', 'GLOBAL'))).ok, 'anonymous page view refused');
    denied(await c.t(ins(U.stu, 'page_view', '/landing', null)), /row-level security/i, 'anon attributing an event to a user');
    denied(await c.t(ins(null, 'feature_use', 'spam', null)), /row-level security/i, 'anon feature_use');
    denied(await c.t(ins(null, 'page_view', '/landing', 'UNILAG')), /row-level security/i, 'anon writing a campus');
    denied(await c.t(ins(null, 'page_view', '/big', null, JSON.stringify({ blob: 'z'.repeat(3000) }))), /analytics_events_metadata_size/i, 'anon big metadata');
  });
});
await check('record_user_activity: not callable by anon; campus comes from the caller profile; input is bounded; client event names still work', async () => {
  await as('anon', async (c) => { denied(await c.t(`SELECT public.record_user_activity('page_view','/x','UNILAG','{}')`), /permission denied/i, 'anon'); });
  await as(U.stu, async (c) => {
    // exactly what src/hooks/useActivityTracker.ts sends
    for (const [t, n] of [['session_start', 'app_launch'], ['page_view', '/feed'], ['feature_use', 'heartbeat']]) {
      assert((await c.t(`SELECT public.record_user_activity('${t}','${n}',NULL,'{"role":"student"}')`)).ok, `${t}/${n} refused`);
    }
    await c.q(`SELECT public.record_user_activity('page_view','/spoof','UI','{}')`);
    await c.q(`SELECT public.record_user_activity('evil_type','/ignored',NULL,'{}')`);
    await c.q(`SELECT public.record_user_activity('page_view', '${'n'.repeat(200)}', NULL, '${JSON.stringify({ blob: 'z'.repeat(5000) })}')`);
    const rows = (await c.su(`SELECT name, campus_code, metadata, user_id FROM public.analytics_events WHERE user_id='${U.stu}' ORDER BY created_at, name`)).rows;
    const spoof = rows.find((r) => r.name === '/spoof');
    eq(spoof.campus_code, 'UNILAG', 'caller-supplied campus must be ignored');
    assert(!rows.some((r) => r.name === '/ignored'), 'unknown event type stored');
    const long = rows.find((r) => r.name.startsWith('nnn'));
    eq([long.name.length, JSON.stringify(long.metadata)], [64, '{}'], 'name truncated, oversized metadata dropped');
    assert(rows.every((r) => r.user_id === U.stu), 'user attribution');
  });
});

// --------------------------------------------------------------------------- 6. push token takeover
await check('claim_push_token re-parents a token left behind by the previous account; the old plain upsert cannot', async () => {
  const T = 'ExponentPushToken[shared-device-1]';
  await sandbox(async (c) => {
    await c.q(`INSERT INTO public.push_tokens (user_id, token, platform) VALUES ('${U.stu}','${T}','ios')`); // A's row survived sign-out
    await db.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"${U.ob}","role":"authenticated"}',true); SELECT set_config('request.jwt.claim.sub','${U.ob}',true)`);
    denied(await c.t(`INSERT INTO public.push_tokens (user_id, token) VALUES ('${U.ob}','${T}')`), /duplicate key|row-level security|unique/i, 'plain insert by B');
    denied(await c.t(`INSERT INTO public.push_tokens (user_id, token) VALUES ('${U.stu}','ExponentPushToken[forged-owner-1]')`), /row-level security/i, 'B inserting a row for A');
    const r = await c.t(`SELECT public.claim_push_token('${T}', 'android')`);
    assert(r.ok, r.err?.message);
    await c.q(`RESET ROLE`);
    const row = (await c.q(`SELECT user_id, platform FROM public.push_tokens WHERE token='${T}'`)).rows;
    eq(row, [{ user_id: U.ob, platform: 'android' }], 'token must now belong to B only');
    eq(Number((await c.q(`SELECT count(*)::int n FROM public.push_tokens WHERE user_id='${U.stu}'`)).rows[0].n), 0, 'A must no longer have the token');
  });
  await as(U.ob, async (c) => {
    denied(await c.t(`SELECT public.claim_push_token('not-a-token')`), /Invalid push token/i, 'invalid token');
    assert((await c.t(`SELECT public.register_push_token('ExponentPushToken[legacy-call-1]','ios')`)).ok, 'legacy register_push_token');
  });
  await as('anon', async (c) => { denied(await c.t(`SELECT public.claim_push_token('${T}')`), /permission denied/i, 'anon claim'); });
});

// --------------------------------------------------------------------------- 7. indexes
await check('new query-path and FK indexes exist', async () => {
  const want = ['idx_post_comments_post', 'idx_post_comments_post_created', 'idx_marketplace_listings_campus', 'idx_verifications_campus_status',
    'idx_giving_campaigns_campus', 'idx_study_groups_campus', 'idx_chat_channels_campus', 'idx_job_alerts_campus',
    'idx_notifications_recipient_created', 'idx_notifications_recipient_unread', 'idx_resources_campus_created', 'idx_events_campus_start',
    'idx_post_likes_user', 'idx_post_comment_likes_user', 'idx_event_waitlist_user', 'idx_resource_downloads_user', 'idx_event_payment_clicks_user',
    'idx_giving_campaign_clicks_campaign_user', 'idx_study_group_posts_author', 'idx_giving_campaigns_creator'];
  const have = new Set((await db.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public'`)).rows.map((r) => r.indexname));
  const missing = want.filter((w) => !have.has(w));
  assert(missing.length === 0, `missing indexes: ${missing.join(', ')}`);
  const cm = (await db.query(`SELECT count(*)::int n FROM pg_indexes WHERE schemaname='public' AND tablename='chat_messages' AND indexdef LIKE '%(channel_id, created_at DESC)%'`)).rows[0].n;
  eq(cm, 1, 'chat_messages(channel_id, created_at DESC) must exist exactly once (no duplicate index)');
  const part = (await db.query(`SELECT indexdef FROM pg_indexes WHERE indexname='idx_notifications_recipient_unread'`)).rows[0].indexdef;
  assert(/WHERE \(?NOT is_read\)?/i.test(part), `partial predicate: ${part}`);
});
await check('no FK from a public table to profiles(id) is left without a covering index', async () => {
  const r = (await db.query(`
    SELECT cl.relname::text || '.' || a.attname AS fk
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid=c.conrelid AND cl.relkind='r'
      JOIN pg_namespace n ON n.oid=cl.relnamespace AND n.nspname='public'
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
     WHERE c.contype='f' AND array_length(c.conkey,1)=1 AND c.confrelid='public.profiles'::regclass
       AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid AND i.indisvalid AND i.indkey[0]=c.conkey[1])`)).rows.map((x) => x.fk);
  assert(r.length === 0, `unindexed FKs: ${r.join(', ')}`);
});

// --------------------------------------------------------------------------- 8. campus deletion safety
const migrationSql = readFileSync(resolve(ROOT, LIFECYCLE), 'utf8');
const section = (from, to) => { const a = migrationSql.indexOf(from); const b = migrationSql.indexOf(to, a); assert(a > 0 && b > a, `section ${from} not found`); return migrationSql.slice(a, b); };
async function seedCampus(c) {
  await c.q(`INSERT INTO public.campuses (code, name, short_name) VALUES ('ZTEST','Zeta Test University','Zeta')`);
  await c.q(`INSERT INTO public.posts (author_id, campus_code, content) VALUES ('${U.other}','ZTEST','doomed post'), ('${U.other}','ZTEST','doomed post 2')`);
  await c.q(`INSERT INTO public.events (creator_id, campus_code, title, description, venue, start_time, end_time) VALUES ('${U.other}','ZTEST','E','d','v', now()+interval '1 day', now()+interval '2 day')`);
}
await check('campuses: a direct DELETE is refused (even for the table owner); the campus and its content survive', async () => {
  await sandbox(async (c) => {
    await seedCampus(c);
    denied(await c.t(`DELETE FROM public.campuses WHERE code='ZTEST'`), /admin_delete_campus/i, 'superuser DELETE');
    denied(await c.t(`TRUNCATE public.campuses CASCADE`), /cannot be truncated/i, 'TRUNCATE');
    eq(Number((await c.q(`SELECT count(*)::int n FROM public.posts WHERE campus_code='ZTEST'`)).rows[0].n), 2, 'posts must survive');
  });
  await sandbox(async (c) => {
    await seedCampus(c);
    await c.q(`SET LOCAL ROLE service_role`);
    denied(await c.t(`DELETE FROM public.campuses WHERE code='ZTEST'`), /admin_delete_campus/i, 'service_role DELETE');
    await c.q(`RESET ROLE`);
    await c.q(`SET LOCAL ROLE authenticated`);
    await c.q(`SELECT set_config('request.jwt.claims','{"sub":"${U.root}","role":"authenticated","email":"${ROOT_EMAIL}"}',true)`);
    await c.q(`SELECT set_config('request.jwt.claim.sub','${U.root}',true)`);
    const r = await c.t(`DELETE FROM public.campuses WHERE code='ZTEST'`);
    if (r.ok) eq(r.n, 0, 'Super Admin REST delete must not delete a row');
    await c.q(`RESET ROLE`);
    eq(Number((await c.q(`SELECT count(*)::int n FROM public.campuses WHERE code='ZTEST'`)).rows[0].n), 1, 'campus must still exist');
  });
});
await check('admin_delete_campus still works (Super Admin and service role), audits BEFORE deleting with row counts, and re-arms the guard', async () => {
  for (const who of [{ sub: U.root, email: ROOT_EMAIL }, 'service_role']) {
    await as(who, async (c) => {
      await c.su(`INSERT INTO public.campuses (code, name, short_name) VALUES ('ZTEST','Zeta Test University','Zeta')`);
      await c.su(`INSERT INTO public.posts (author_id, campus_code, content) VALUES ('${U.other}','ZTEST','doomed post'), ('${U.other}','ZTEST','doomed post 2')`);
      await c.su(`INSERT INTO public.events (creator_id, campus_code, title, description, venue, start_time, end_time) VALUES ('${U.other}','ZTEST','E','d','v', now()+interval '1 day', now()+interval '2 day')`);
      await c.su(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
      await c.su(`UPDATE public.profiles SET campus_code='ZTEST' WHERE id='${U.ob}'`);
      await c.su(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
      const r = await c.t(`SELECT public.admin_delete_campus('ztest') r`);
      assert(r.ok, r.err?.message);
      eq(r.rows[0].r.members_reassigned, 1, 'members reassigned');
      eq(Number((await c.su(`SELECT count(*)::int n FROM public.campuses WHERE code='ZTEST'`)).rows[0].n), 0, 'campus removed');
      eq(Number((await c.su(`SELECT count(*)::int n FROM public.posts WHERE campus_code='ZTEST'`)).rows[0].n), 0, 'posts removed');
      eq((await c.su(`SELECT campus_code FROM public.profiles WHERE id='${U.ob}'`)).rows[0].campus_code, 'GLOBAL', 'member moved to GLOBAL');
      const a = (await c.su(`SELECT actor_id, metadata FROM public.audit_logs WHERE action='campus_deleted'`)).rows;
      eq(a.length, 1, 'one audit row');
      eq(a[0].metadata.campusCode, 'ZTEST', 'audit campus');
      eq([a[0].metadata.removedRows.posts, a[0].metadata.removedRows.events, a[0].metadata.membersReassigned], [2, 1, 1], 'audit counts are from BEFORE the delete');
      eq(a[0].actor_id, typeof who === 'object' ? U.root : null, 'audit actor');
      await c.su(`INSERT INTO public.campuses (code, name, short_name) VALUES ('ZTEST2','Zeta Two','Z2')`);
      denied(await c.t(`DELETE FROM public.campuses WHERE code='ZTEST2'`), /admin_delete_campus/i, 'guard re-armed after the function ran');
    });
  }
  await as(U.stu, async (c) => { denied(await c.t(`SELECT public.admin_delete_campus('UI')`), /super_admin_required/i, 'student'); });
  await as('service_role', async (c) => { denied(await c.t(`SELECT public.admin_delete_campus('GLOBAL')`), /protected_campus/i, 'GLOBAL'); });
});

// --------------------------------------------------------------------------- 9. realtime publication
await check('realtime: every subscribed table is published; one already-published table no longer hides the rest', async () => {
  const want = ['chat_messages', 'chat_channels', 'notifications', 'connections', 'events', 'event_attendees', 'posts', 'post_comments', 'verifications', 'moderation_queue', 'marketplace_listings', 'mentorships', 'mentorship_sessions', 'mentorship_updates', 'mentorship_goals', 'study_group_posts', 'study_group_sessions', 'study_group_members'];
  const published = async () => new Set((await db.query(`SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public'`)).rows.map((r) => r.tablename));
  const now = await published();
  const missing = want.filter((t) => !now.has(t));
  assert(missing.length === 0, `not published: ${missing.join(', ')}`);
  assert(!now.has('profiles'), 'profiles must not be published (column privileges are ignored by realtime)');
  await sandbox(async (c) => {
    await c.q(`ALTER PUBLICATION supabase_realtime SET TABLE public.chat_messages`); // exactly one table already there
    await db.exec(section('DO $do$\nDECLARE\n  t text;', '-- ============================================================================\n-- 10. Sign-up'));
    const after = await published();
    const miss2 = want.filter((t) => !after.has(t));
    assert(miss2.length === 0, `after partial publication, still missing: ${miss2.join(', ')}`);
    await db.exec(section('DO $do$\nDECLARE\n  t text;', '-- ============================================================================\n-- 10. Sign-up')); // duplicates are ignored
  });
});

// --------------------------------------------------------------------------- 10. sign-up trigger
await check('sign-up: a stale profile row owning the e-mail no longer aborts sign-up; normal sign-up is unchanged', async () => {
  await sandbox(async (c) => {
    await c.q(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
    await c.q(`UPDATE public.profiles SET email='dup@school.test' WHERE id='${U.other}'`);
    await c.q(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
    await c.q(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ('${id(50)}','dup@school.test','{"campus_code":"UNILAG","full_name":"New Person","username":"newperson","terms_version":"v7","age_eligibility_confirmed":"true"}'::jsonb, now())`);
    const p = (await c.q(`SELECT email, full_name, username, role::text role, campus_code, verification_status::text vs FROM public.profiles WHERE id='${id(50)}'`)).rows;
    eq(p.length, 1, 'profile created');
    eq([p[0].full_name, p[0].username, p[0].role, p[0].vs], ['New Person', 'newperson', 'student', 'unverified'], 'profile fields');
    assert(/@email-conflict\.invalid$/.test(p[0].email), 'placeholder e-mail');
    eq((await c.q(`SELECT version, age_confirmed_18 FROM public.consent_records WHERE user_id='${id(50)}'`)).rows, [{ version: 'v7', age_confirmed_18: true }], 'consent record');
    // regular sign-up, role escalation attempt, username collision loop
    await c.q(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ('${id(51)}','fresh@gmail.test','{"campus_code":"UNILAG","role":"admin","username":"newperson"}'::jsonb, now())`);
    const q = (await c.q(`SELECT email, role::text role, username FROM public.profiles WHERE id='${id(51)}'`)).rows[0];
    eq([q.email, q.role], ['fresh@gmail.test', 'student'], 'normal sign-up / role stays student');
    assert(q.username && q.username !== 'newperson', 'username collision resolved by suffix');
  });
});
await check('event cancellation: one failing notification no longer rolls back the cancellation', async () => {
  await sandbox(async (c) => {
    const ev = (await c.q(`INSERT INTO public.events (creator_id, campus_code, title, description, venue, start_time, end_time) VALUES ('${U.other}','UNILAG','Party','d','v', now()+interval '1 day', now()+interval '2 day') RETURNING id`)).rows[0].id;
    await c.q(`INSERT INTO public.event_attendees (event_id, user_id) VALUES ('${ev}','${U.stu}'), ('${ev}','${U.stu2}')`);
    await c.q(`CREATE FUNCTION public.zz_break_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.recipient_id='${U.stu}' THEN RAISE EXCEPTION 'boom'; END IF; RETURN NEW; END $$`);
    await c.q(`CREATE TRIGGER zz_break BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.zz_break_notification()`);
    const r = await c.t(`UPDATE public.events SET status='cancelled' WHERE id='${ev}'`);
    assert(r.ok, `cancellation failed: ${r.err?.message}`);
    eq((await c.q(`SELECT status::text s FROM public.events WHERE id='${ev}'`)).rows[0].s, 'cancelled', 'event cancelled');
    eq(Number((await c.q(`SELECT count(*)::int n FROM public.notifications WHERE title='Event cancelled' AND recipient_id='${U.stu2}'`)).rows[0].n), 1, 'healthy recipient still notified');
  });
});

// --------------------------------------------------------------------------- 11. connections
await check('connections: accepted A->B and B->A cannot coexist; duplicates are resolved (accepted, then oldest) before the index is built', async () => {
  await sandbox(async (c) => {
    await c.q(`INSERT INTO public.connections (requester_id, recipient_id, status) VALUES ('${U.stu}','${U.stu2}','accepted')`);
    denied(await c.t(`INSERT INTO public.connections (requester_id, recipient_id, status) VALUES ('${U.stu2}','${U.stu}','accepted')`), /uq_connections_live_pair|duplicate key/i, 'reverse accepted');
    denied(await c.t(`INSERT INTO public.connections (requester_id, recipient_id, status) VALUES ('${U.stu2}','${U.stu}','pending')`), /uq_connections_live_pair|duplicate key/i, 'reverse pending beside accepted');
    await c.q(`INSERT INTO public.connections (requester_id, recipient_id, status) VALUES ('${U.ob}','${U.other}','declined')`);
    assert((await c.t(`INSERT INTO public.connections (requester_id, recipient_id, status) VALUES ('${U.other}','${U.ob}','pending')`)).ok, 'a declined row must not block a new request');
  });
  await sandbox(async (c) => {
    await c.q(`DROP INDEX public.uq_connections_live_pair`);
    await c.q(`INSERT INTO public.connections (requester_id, recipient_id, status, created_at) VALUES ('${U.stu}','${U.stu2}','accepted', now() - interval '10 days'), ('${U.stu2}','${U.stu}','accepted', now() - interval '20 days'), ('${U.ob}','${U.other}','pending', now() - interval '5 days'), ('${U.other}','${U.ob}','accepted', now() - interval '1 days')`);
    await db.exec(section('DO $do$\nDECLARE\n  v_n bigint;', '-- ============================================================================\n-- 12. Storage'));
    const left = (await c.q(`SELECT requester_id, recipient_id, status FROM public.connections ORDER BY requester_id`)).rows;
    eq(left.length, 2, 'one row per pair');
    assert(left.some((r) => r.requester_id === U.stu2 && r.recipient_id === U.stu), 'the OLDEST accepted row is kept');
    assert(left.some((r) => r.requester_id === U.other && r.status === 'accepted'), 'accepted wins over pending');
    eq(Number((await c.q(`SELECT count(*)::int n FROM pg_indexes WHERE indexname='uq_connections_live_pair'`)).rows[0].n), 1, 'index rebuilt');
  });
});

// --------------------------------------------------------------------------- 12. storage uploads
await db.exec(`INSERT INTO storage.buckets (id, name, public) VALUES ('avatars','avatars',true) ON CONFLICT (id) DO NOTHING`);
await check('storage: only onboarded users upload to resources / campus-media (chat attachments keep working); avatars stay open for onboarding', async () => {
  const up = (uid, bucket, name) => `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('${bucket}','${uid}/${name}','${uid}')`;
  await as(U.ob, async (c) => {
    assert((await c.t(up(U.ob, 'resources', 'chat/attachment.pdf'))).ok, 'onboarded user refused in resources (chat attachment path)');
    assert((await c.t(up(U.ob, 'campus-media', 'pic.jpg'))).ok, 'onboarded user refused in campus-media');
    denied(await c.t(up(U.stu, 'resources', 'x.pdf')), /row-level security/i, 'upload into someone else\'s folder');
  });
  await as(U.nob, async (c) => {
    denied(await c.t(up(U.nob, 'resources', 'a.pdf')), /row-level security/i, 'not onboarded -> resources');
    denied(await c.t(up(U.nob, 'campus-media', 'a.jpg')), /row-level security/i, 'not onboarded -> campus-media');
    assert((await c.t(up(U.nob, 'avatars', 'me.jpg'))).ok, 'avatar upload during onboarding must still work');
  });
  await as({ sub: U.root, email: ROOT_EMAIL }, async (c) => {
    assert((await c.t(up(U.root, 'resources', 'admin.pdf'))).ok, 'super admin upload');
  });
  await sandbox(async (c) => {
    await c.q(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
    await c.q(`UPDATE public.profiles SET is_suspended=true WHERE id='${U.ob}'`);
    await c.q(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
    await db.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"${U.ob}","role":"authenticated"}',true); SELECT set_config('request.jwt.claim.sub','${U.ob}',true)`);
    denied(await c.t(up(U.ob, 'resources', 'sus.pdf')), /row-level security/i, 'suspended user');
  });
});

// @@CHECKS@@

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
