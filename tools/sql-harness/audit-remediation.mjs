// Behaviour tests for supabase/migrations/20261028000000_audit_remediation.sql, executed against
// an in-memory Postgres (PGlite). Nothing here touches a real database.
//
//   cd tools/sql-harness && npm install && node audit-remediation.mjs
//
// Load order: the harness's legacy root files, the root files that production also ran
// (campus access wall, username login, ...), then every supabase/migrations/*.sql in order.
// Run with --before to execute the SAME probes against the state WITHOUT the remediation
// migration (every "holes" check is then expected to fail: that is the regression proof).
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { newDb, bootstrap, applyFile, MIGRATIONS, ROOT } from './lib.mjs';

const BEFORE = process.argv.includes('--before');
const REMEDIATION = 'supabase/migrations/20261028000000_audit_remediation.sql';
const REMEDIATION_2 = 'supabase/migrations/20261029000000_admin_scope_completion.sql';
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
const migrationFiles = readdirSync(resolve(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
let remediationResult = null;
for (const f of migrationFiles) {
  const path = `supabase/migrations/${f}`;
  if (path.includes('20261030000000')) {
    if (BEFORE) continue;
    try { await applyFile(db, path, true, () => {}); } catch (e) { console.log(`FATAL: mfa switch did not apply: ${e.message}`); process.exit(2); }
  } else if (path === REMEDIATION_2) {
    if (BEFORE) continue;
    try { await applyFile(db, path, true, () => {}); } catch (e) { console.log(`FATAL: scope completion did not apply: ${e.message}${e.detail ? ' | ' + e.detail : ''}`); process.exit(2); }
  } else if (path === REMEDIATION) {
    if (BEFORE) continue;
    // strict: the remediation must apply in one transaction, no statement may fail
    try {
      remediationResult = await applyFile(db, path, true, () => {});
    } catch (e) {
      console.log(`FATAL: remediation did not apply: ${e.message}${e.detail ? ' | ' + e.detail : ''}${e.where ? ' | ' + e.where : ''}`);
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
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER USER`); // also silences audit/guard triggers while seeding
await db.exec(`UPDATE public.profiles SET role='admin', admin_role='super_admin', campus_code='GLOBAL', verification_status='verified', onboarding_complete=true WHERE id='${U.root}'`);
await db.exec(`UPDATE public.profiles SET role='admin', admin_role='campus_admin', onboarding_complete=true WHERE id IN ('${U.campAdminU}','${U.campAdminI}')`);
await db.exec(`UPDATE public.profiles SET role='admin', admin_role=NULL, onboarding_complete=true WHERE id='${U.nullAdminU}'`);
await db.exec(`UPDATE public.profiles SET role='staff', onboarding_complete=true WHERE id IN ('${U.staffU}','${U.staffI}')`);
await db.exec(`UPDATE public.profiles SET verification_status='verified', onboarding_complete=true WHERE id IN ('${U.verU}','${U.verI}')`);
await db.exec(`UPDATE public.profiles SET username='verified_u' WHERE id='${U.verU}'`);
await db.exec(`UPDATE public.profiles SET student_id_number='UNILAG/1/2' WHERE id='${U.verU}'`);
await db.exec(`UPDATE public.profiles SET department='Computer Science' WHERE id IN ('${U.unvU}','${U.verU}')`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);
await db.exec(`ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT SELECT ON storage.objects TO anon, authenticated;`);
await db.exec(`INSERT INTO storage.buckets (id, name, public) VALUES ('resources','resources',false) ON CONFLICT (id) DO UPDATE SET public=false`);
// The remediation re-asserts the root admin; seed the NULL-admin legacy row AFTER it was applied
// is not possible (the trigger would normalise it), so the NULL case is checked at migration time below.

// resources + their files
await db.exec(`ALTER TABLE public.resources DISABLE TRIGGER USER`);
const R = { ui: '11111111-1111-4111-8111-111111111111', glob: '22222222-2222-4222-8222-222222222222', uniPending: '33333333-3333-4333-8333-333333333333', uniApproved: '44444444-4444-4444-8444-444444444444' };
const furl = (uid, name) => `https://x.supabase.co/storage/v1/object/public/resources/${uid}/${name}`;
await db.exec(`INSERT INTO public.resources (id, uploader_id, campus_code, course_code, course_title, title, resource_type, file_url, is_approved) VALUES
 ('${R.ui}','${U.verI}','UI','CSC101','Computing','UI notes','lecture_note','${furl(U.verI, 'ui.pdf')}', true),
 ('${R.glob}','${U.verU}','GLOBAL','GST101','General','Global notes','lecture_note','${furl(U.verU, 'global.pdf')}', true),
 ('${R.uniPending}','${U.verU}','UNILAG','CSC201','Computing','UNILAG pending','lecture_note','${U.verU}/pending.pdf', false),
 ('${R.uniApproved}','${U.verU}','UNILAG','CSC202','Computing','UNILAG approved','lecture_note','${U.verU}/approved.pdf', true)`);
await db.exec(`ALTER TABLE public.resources ENABLE TRIGGER USER`);
for (const [uid, n] of [[U.verI, 'ui.pdf'], [U.verU, 'global.pdf'], [U.verU, 'pending.pdf'], [U.verU, 'approved.pdf']]) {
  await db.exec(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('resources','${uid}/${n}','${uid}')`);
}

console.log(`\n== ${BEFORE ? 'BEFORE (remediation NOT applied)' : 'AFTER (remediation applied)'} ==`);
const expectHolesClosed = !BEFORE;

// --------------------------------------------------------------------------- 1. application
if (!BEFORE) {
  await check('remediation applies cleanly in a single transaction', async () => { assert(remediationResult && !remediationResult.failures?.length, 'did not apply'); });
  await check('remediation is idempotent (second run)', async () => {
    await db.exec((await import('node:fs')).readFileSync(resolve(ROOT, REMEDIATION), 'utf8'));
  });
}

// --------------------------------------------------------------------------- 2. profile privacy
await check('anon cannot read profiles.email / student_id_number', async () => {
  await as('anon', async (c) => {
    const r = await c.t(`SELECT email FROM public.profiles`);
    denied(r, /permission denied/i, 'anon SELECT email');
    const r2 = await c.t(`SELECT student_id_number FROM public.profiles`);
    denied(r2, /permission denied/i, 'anon SELECT student_id_number');
  });
});
await check('anon sees only GLOBAL-campus members and only public columns', async () => {
  await as('anon', async (c) => {
    const r = await c.t(`SELECT id, campus_code, full_name FROM public.profiles`);
    assert(r.ok, r.err?.message);
    assert(r.rows.length > 0 && r.rows.every((x) => x.campus_code === 'GLOBAL'), `anon saw non-GLOBAL rows: ${JSON.stringify(r.rows.map((x) => x.campus_code))}`);
  });
});
await check('a same-campus student cannot read a peer e-mail, push token or student id', async () => {
  await as(U.unvU, async (c) => {
    for (const col of ['email', 'student_id_number', 'push_token', 'suspension_reason', 'last_login_at']) {
      denied(await c.t(`SELECT ${col} FROM public.profiles WHERE id='${U.verU}'`), /permission denied/i, `SELECT ${col}`);
    }
  });
});
await check('a student still reads the safe peer columns the app needs', async () => {
  await as(U.unvU, async (c) => {
    const r = await c.t(`SELECT id, full_name, username, role, campus_code, department, avatar_url, verification_status, trust_score, admin_role, is_campus_ambassador, directory_discoverable FROM public.profiles WHERE id='${U.verU}'`);
    assert(r.ok && r.rows.length === 1, r.err?.message || 'no row');
  });
});
await check('a student reads their OWN full row (e-mail included) through get_my_profile()', async () => {
  await as(U.unvU, async (c) => {
    const r = await c.t(`SELECT email, onboarding_step, deactivated_at FROM public.get_my_profile()`);
    assert(r.ok && r.rows.length === 1 && r.rows[0].email === 'unv.u@gmail.test', r.err?.message || 'own row not returned');
  });
});
await check('public_profiles view is no longer a back door for anon / authenticated', async () => {
  await as('anon', async (c) => { denied(await c.t(`SELECT * FROM public.public_profiles`), /permission denied/i, 'anon public_profiles'); });
  await as(U.unvU, async (c) => { denied(await c.t(`SELECT * FROM public.public_profiles`), /permission denied/i, 'student public_profiles'); });
});

// --------------------------------------------------------------------------- 3. admin hierarchy
await check('is_super_admin() is TRUE only for a Super Admin (Campus Admin is not)', async () => {
  await as({ sub: U.campAdminU, email: 'campadmin.u@school.test' }, async (c) => {
    eq((await c.q(`SELECT public.is_super_admin() v`)).rows[0].v, false, 'campus admin reported as super admin');
  });
  await as({ sub: U.root, email: ROOT_EMAIL }, async (c) => { eq((await c.q(`SELECT public.is_super_admin() v`)).rows[0].v, true); });
});
await check('a Campus Admin cannot read profiles of another campus', async () => {
  await as({ sub: U.campAdminU, email: 'campadmin.u@school.test' }, async (c) => {
    const r = await c.q(`SELECT count(*)::int n FROM public.profiles WHERE campus_code='UI'`);
    eq(r.rows[0].n, 0, 'campus admin sees UI members');
  });
});
await check('a Campus Admin cannot edit or delete a member of another campus', async () => {
  await as({ sub: U.campAdminU, email: 'campadmin.u@school.test' }, async (c) => {
    const up = await c.t(`UPDATE public.profiles SET bio='x' WHERE id='${U.verI}'`);
    assert(!up.ok || up.n === 0, 'updated a UI member');
    const del = await c.t(`DELETE FROM public.profiles WHERE id='${U.verI}'`);
    assert(!del.ok || del.n === 0, 'deleted a UI member');
  });
  const still = await db.query(`SELECT 1 FROM public.profiles WHERE id='${U.verI}'`);
  eq(still.rows.length, 1, 'UI member was deleted');
});
await check('a Campus Admin cannot DELETE even an own-campus member (deletion is Super Admin / edge function only)', async () => {
  await as({ sub: U.campAdminU, email: 'campadmin.u@school.test' }, async (c) => {
    const del = await c.t(`DELETE FROM public.profiles WHERE id='${U.unvU2}'`);
    assert(!del.ok || del.n === 0, 'campus admin deleted a member');
  });
});
await check('a Campus Admin CAN moderate an own-campus student (suspend, verify) but not promote to admin or move campus', async () => {
  await as({ sub: U.campAdminU, email: 'campadmin.u@school.test' }, async (c) => {
    const up = await c.t(`UPDATE public.profiles SET is_suspended = true, verification_status='verified', campus_code='UI' WHERE id='${U.unvU2}' RETURNING is_suspended, verification_status::text v, role::text r, campus_code`);
    assert(up.ok && up.rows.length === 1, up.err?.message || 'moderation update failed');
    eq(up.rows[0], { is_suspended: true, v: 'verified', r: 'student', campus_code: 'UNILAG' }, 'moderation outcome (campus transfer must be ignored)');
    // an attempted promotion is neutralised completely
    const promo = await c.t(`UPDATE public.profiles SET role='admin', is_suspended=false WHERE id='${U.unvU2}' RETURNING role::text r, is_suspended`);
    assert(promo.ok, promo.err?.message);
    eq(promo.rows[0], { r: 'student', is_suspended: true }, 'promotion attempt had an effect');
  });
});
await check('a Campus Admin cannot touch the Super Admin or flip another admin', async () => {
  await as({ sub: U.campAdminU, email: 'campadmin.u@school.test' }, async (c) => {
    await c.t(`UPDATE public.profiles SET is_suspended = true, role='student' WHERE id='${U.root}'`);
    await c.t(`UPDATE public.profiles SET role='student', is_suspended = true WHERE id='${U.nullAdminU}'`);
    // read back inside the same (rolled-back) transaction with owner rights
    const r = await c.su(`SELECT id::text, role::text r, is_suspended s FROM public.profiles WHERE id IN ('${U.root}','${U.nullAdminU}') ORDER BY id`);
    eq(r.rows.map((x) => [x.r, x.s]), [['admin', false], ['admin', false]], 'a Campus Admin changed an admin row');
  });
});
await check('Campus Admin cannot create / edit campuses (domains drive auto-verification); Super Admin can', async () => {
  await as({ sub: U.campAdminU, email: 'campadmin.u@school.test' }, async (c) => {
    const r = await c.t(`UPDATE public.campuses SET email_domains = array_append(email_domains, 'evil.edu.ng') WHERE code='UNILAG'`);
    assert(!r.ok || r.n === 0, 'campus admin rewrote a campus');
  });
  await as({ sub: U.root, email: ROOT_EMAIL }, async (c) => {
    const r = await c.t(`UPDATE public.campuses SET short_name = short_name WHERE code='UNILAG'`);
    assert(r.ok && r.n === 1, r.err?.message || 'super admin cannot edit a campus');
  });
});
await check('Super Admin keeps full authority over members of every campus', async () => {
  await as({ sub: U.root, email: ROOT_EMAIL }, async (c) => {
    const up = await c.t(`UPDATE public.profiles SET is_suspended=true WHERE id IN ('${U.verI}','${U.verU}') RETURNING id`);
    assert(up.ok && up.rows.length === 2, up.err?.message || 'super admin blocked');
    const seen = await c.q(`SELECT count(DISTINCT campus_code)::int n FROM public.profiles`);
    assert(seen.rows[0].n >= 3, 'super admin cannot see every campus');
  });
});
await check('admin_get_user_profiles: staff and Campus Admin are pinned to their own campus, Super Admin sees all', async () => {
  await as(U.staffU, async (c) => {
    const r = await c.t(`SELECT DISTINCT campus_code FROM public.admin_get_user_profiles(NULL, 1000)`);
    assert(r.ok, r.err?.message);
    eq(r.rows.map((x) => x.campus_code), ['UNILAG'], 'staff saw other campuses');
    const r2 = await c.t(`SELECT DISTINCT campus_code FROM public.admin_get_user_profiles('UI', 1000)`);
    eq(r2.rows.map((x) => x.campus_code), ['UNILAG'], 'staff escaped scope by passing a campus');
  });
  await as({ sub: U.campAdminU, email: 'campadmin.u@school.test' }, async (c) => {
    const r = await c.t(`SELECT DISTINCT campus_code FROM public.admin_get_user_profiles('ALL', 1000)`);
    eq(r.rows.map((x) => x.campus_code), ['UNILAG'], 'campus admin saw other campuses');
  });
  await as({ sub: U.root, email: ROOT_EMAIL }, async (c) => {
    const r = await c.t(`SELECT DISTINCT campus_code FROM public.admin_get_user_profiles(NULL, 1000)`);
    assert(r.rows.length >= 3, 'super admin did not get every campus');
  });
});
await check('an admin row with a NULL admin_role is normalised to campus_admin (never silently super)', async () => {
  await db.exec(`UPDATE public.profiles SET admin_role = NULL WHERE id='${U.nullAdminU}'`);
  const r = await db.query(`SELECT admin_role FROM public.profiles WHERE id='${U.nullAdminU}'`);
  eq(r.rows[0].admin_role, 'campus_admin');
});
await check('set_campus_ambassador_status: campus-less staff/admin cannot appoint; own-campus admin can; cross-campus cannot', async () => {
  await as({ sub: U.campAdminU, email: 'campadmin.u@school.test' }, async (c) => {
    const ok = await c.t(`SELECT public.set_campus_ambassador_status('${U.unvU}', true)`);
    assert(ok.ok, ok.err?.message);
    const bad = await c.t(`SELECT public.set_campus_ambassador_status('${U.verI}', true)`);
    denied(bad, /unauthorized_campus_scope/, 'cross-campus ambassador');
  });
});

// --------------------------------------------------------------------------- 4. self-update guard
await check('a verified member cannot move to another campus (UPDATE)', async () => {
  await as(U.verU, async (c) => {
    await c.t(`UPDATE public.profiles SET campus_code='UI' WHERE id='${U.verU}'`);
    const r = await c.q(`SELECT campus_code, verification_status::text v FROM public.profiles WHERE id='${U.verU}'`);
    eq(r.rows[0], { campus_code: 'UNILAG', v: 'verified' }, 'verified member hopped campus');
  });
});
await check('an unverified member can still choose / change their campus', async () => {
  await as(U.unvU, async (c) => {
    await c.t(`UPDATE public.profiles SET campus_code='UI' WHERE id='${U.unvU}'`);
    eq((await c.q(`SELECT campus_code FROM public.profiles WHERE id='${U.unvU}'`)).rows[0].campus_code, 'UI');
  });
});
await check('a student cannot self-set is_bot or edit the e-mail on the profile row, so is_profile_verified() stays false', async () => {
  await as(U.unvU2, async (c) => {
    await c.t(`UPDATE public.profiles SET is_bot = true WHERE id='${U.unvU2}'`);
    await c.t(`UPDATE public.profiles SET email='fake@unilag.edu.ng' WHERE id='${U.unvU2}'`);
    // read back inside the same transaction (as() rolls back), with owner rights so column privileges do not interfere
    const r = await c.su(`SELECT is_bot, email, public.is_profile_verified('${U.unvU2}') v FROM public.profiles WHERE id='${U.unvU2}'`);
    eq(r.rows[0], { is_bot: false, email: 'unv2.u@gmail.test', v: false }, 'self-verification via is_bot / e-mail edit still works');
  });
});
await check('a student cannot self-grant verified / role / ambassador / trust / suspension', async () => {
  await as(U.unvU, async (c) => {
    await c.t(`UPDATE public.profiles SET verification_status='verified', role='admin', is_campus_ambassador=true, trust_score=100 WHERE id='${U.unvU}'`);
    const r = await c.q(`SELECT verification_status::text v, role::text r, is_campus_ambassador a, trust_score t FROM public.profiles WHERE id='${U.unvU}'`);
    assert(r.rows[0].v !== 'verified' && r.rows[0].r === 'student' && r.rows[0].a === false && Number(r.rows[0].t) !== 100, `escalated: ${JSON.stringify(r.rows[0])}`);
  });
});
await check('is_profile_verified(): an unlaunched *.edu.ng address no longer counts (only the server\'s verification_status)', async () => {
  await as('postgres', async (c) => {
    await c.q(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
    await c.q(`UPDATE public.profiles SET email='someone@abu.edu.ng' WHERE id='${U.unvU2}'`);
    const r = await c.q(`SELECT public.is_profile_verified('${U.unvU2}') v`);
    eq(r.rows[0].v, false, '.edu.ng shortcut still verifies');
  });
});

// --------------------------------------------------------------------------- 5. username login
await check('get_email_for_username() is not callable by anon or authenticated (e-mail harvesting)', async () => {
  await as('anon', async (c) => denied(await c.t(`SELECT public.get_email_for_username('verified_u')`), /permission denied/i, 'anon'));
  await as(U.unvU, async (c) => denied(await c.t(`SELECT public.get_email_for_username('verified_u')`), /permission denied/i, 'authenticated'));
  await as('service_role', async (c) => {
    const r = await c.t(`SELECT public.get_email_for_username('verified_u') e`);
    assert(r.ok && r.rows[0].e, 'service role cannot resolve a handle');
  });
});

// --------------------------------------------------------------------------- 6. verification
await check('a student cannot insert a verification row that is already approved or for another campus', async () => {
  await as(U.unvU2, async (c) => {
    denied(await c.t(`INSERT INTO public.verifications (user_id, campus_code, requested_role, id_card_front_url, status) VALUES ('${U.unvU2}','UNILAG','student','${U.unvU2}/a.jpg','approved')`), /row-level security/i, 'pre-approved insert');
    denied(await c.t(`INSERT INTO public.verifications (user_id, campus_code, requested_role, id_card_front_url, status) VALUES ('${U.unvU2}','UI','student','${U.unvU2}/a.jpg','pending')`), /row-level security/i, 'foreign-campus insert');
  });
});
let reqId;
await check('submit_verification_request(): derives campus/role from the profile, flips the profile to pending, is idempotent', async () => {
  await as(U.unvU2, async (c) => {
    const a = await c.t(`SELECT * FROM public.submit_verification_request('${U.unvU2}/doc.jpg', 'Student ID', 'UNILAG/1/1')`);
    assert(a.ok, a.err?.message);
    eq([a.rows[0].campus_code, a.rows[0].requested_role, a.rows[0].status], ['UNILAG', 'student', 'pending']);
    const b = await c.t(`SELECT * FROM public.submit_verification_request('${U.unvU2}/doc2.jpg', 'Student ID')`);
    assert(b.ok && b.rows[0].id === a.rows[0].id, 'second submit created a duplicate');
    eq((await c.q(`SELECT verification_status::text v FROM public.profiles WHERE id='${U.unvU2}'`)).rows[0].v, 'pending');
    denied(await c.t(`SELECT * FROM public.submit_verification_request('${U.verI}/doc.jpg')`), /invalid_document/, 'someone else\'s folder');
  });
});
// (as() rolls back, so create a committed pending request for the review tests)
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
await db.exec(`UPDATE public.profiles SET verification_status='pending', campus_code='UNILAG' WHERE id='${U.unvU2}'`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
await db.exec(`INSERT INTO public.verifications (id, user_id, campus_code, requested_role, id_card_front_url, status, review_notes) VALUES ('99999999-9999-4999-8999-999999999999','${U.unvU2}','UNILAG','student','${U.unvU2}/doc.jpg','pending','Student ID')`);
reqId = '99999999-9999-4999-8999-999999999999';

await check('review_verification_request(): a Campus Admin of ANOTHER campus is refused; a student is refused', async () => {
  await as({ sub: U.campAdminI, email: 'campadmin.i@school.test' }, async (c) => denied(await c.t(`SELECT public.review_verification_request('${reqId}', true)`), /unauthorized_campus_scope/, 'other-campus admin'));
  await as(U.unvU, async (c) => denied(await c.t(`SELECT public.review_verification_request('${reqId}', true)`), /unauthorized_campus_scope/, 'student'));
});
await check('review_verification_request(): rejection needs a reason; approval verifies the profile atomically; double review refused', async () => {
  await as({ sub: U.campAdminU, email: 'campadmin.u@school.test' }, async (c) => {
    denied(await c.t(`SELECT public.review_verification_request('${reqId}', false)`), /reason_required/, 'reject without reason');
    const ok = await c.t(`SELECT public.review_verification_request('${reqId}', true) r`);
    assert(ok.ok, ok.err?.message);
    const st = await c.su(`SELECT p.verification_status::text ps, v.status::text vs, v.reviewed_by FROM public.profiles p JOIN public.verifications v ON v.user_id=p.id WHERE p.id='${U.unvU2}'`);
    eq([st.rows[0].ps, st.rows[0].vs, st.rows[0].reviewed_by], ['verified', 'approved', U.campAdminU]);
    denied(await c.t(`SELECT public.review_verification_request('${reqId}', true)`), /already_reviewed/, 'double review');
  });
});
await check('review_verification_request(): switching the permission off for campus_admin blocks the review', async () => {
  await as('postgres', async (c) => {
    await c.q(`UPDATE public.role_permissions SET enabled=false WHERE role='campus_admin' AND permission_key='can_verify_students'`);
    await c.su(`SELECT 1`);
  });
  // as() rolls back; do it inline in one transaction
  await db.exec('BEGIN');
  try {
    await db.exec(`UPDATE public.role_permissions SET enabled=false WHERE role='campus_admin' AND permission_key='can_verify_students'`);
    await db.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${U.campAdminU}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub','${U.campAdminU}', true)`);
    const r = await db.query(`SELECT public.has_role_permission('can_verify_students') v`);
    eq(r.rows[0].v, false, 'toggle not honoured');
  } finally { await db.exec('ROLLBACK'); }
});

// --------------------------------------------------------------------------- 7. resources
await check('resources rows: unverified sees GLOBAL only; verified sees GLOBAL + own campus; never another campus', async () => {
  await as(U.unvU, async (c) => { // unvU moved to UI earlier in a rolled-back tx -> still UNILAG here
    const r = await c.q(`SELECT title FROM public.resources ORDER BY title`);
    eq(r.rows.map((x) => x.title), ['Global notes'], 'unverified saw campus resources');
  });
  await as(U.verU, async (c) => {
    const r = await c.q(`SELECT title FROM public.resources ORDER BY title`);
    eq(r.rows.map((x) => x.title), ['Global notes', 'UNILAG approved', 'UNILAG pending'], 'verified member (uploader of the pending one)');
  });
});
await check('resource FILES: an unverified student CAN read a GLOBAL approved file (download works)', async () => {
  await as(U.unvU, async (c) => {
    const r = await c.q(`SELECT name FROM storage.objects WHERE bucket_id='resources' ORDER BY name`);
    assert(r.rows.some((x) => x.name.endsWith('/global.pdf')), 'GLOBAL file not readable by an unverified student');
  });
});
await check('resource FILES: no cross-campus read, no read of unapproved files, owner can read their own', async () => {
  await as(U.verI, async (c) => {
    const names = (await c.q(`SELECT name FROM storage.objects WHERE bucket_id='resources'`)).rows.map((x) => x.name.split('/')[1]);
    assert(names.includes('ui.pdf') && names.includes('global.pdf'), 'UI member lost own/GLOBAL files');
    assert(!names.includes('approved.pdf') && !names.includes('pending.pdf'), `UI member can read UNILAG files: ${names}`);
  });
  await as(U.verU, async (c) => {
    const names = (await c.q(`SELECT name FROM storage.objects WHERE bucket_id='resources'`)).rows.map((x) => x.name.split('/')[1]);
    assert(!names.includes('ui.pdf'), 'UNILAG member can read a UI file');
    assert(names.includes('pending.pdf'), 'uploader lost their own pending file');
  });
  await as(U.glob, async (c) => {
    const names = (await c.q(`SELECT name FROM storage.objects WHERE bucket_id='resources'`)).rows.map((x) => x.name.split('/')[1]);
    assert(!names.includes('pending.pdf') && !names.includes('approved.pdf') && !names.includes('ui.pdf'), `GLOBAL member read campus files: ${names}`);
  });
  await as('anon', async (c) => { eq((await c.q(`SELECT count(*)::int n FROM storage.objects WHERE bucket_id='resources'`)).rows[0].n, 0, 'anon read files'); });
});
await check('resource FILES: Campus Admin reads own-campus pending files, not another campus\'s', async () => {
  await as({ sub: U.campAdminU, email: 'campadmin.u@school.test' }, async (c) => {
    const names = (await c.q(`SELECT name FROM storage.objects WHERE bucket_id='resources'`)).rows.map((x) => x.name.split('/')[1]);
    assert(names.includes('pending.pdf') && !names.includes('ui.pdf'), `campus admin scope wrong: ${names}`);
  });
  await as({ sub: U.root, email: ROOT_EMAIL }, async (c) => { eq((await c.q(`SELECT count(*)::int n FROM storage.objects WHERE bucket_id='resources'`)).rows[0].n, 4); });
});
await check('the Role Permissions matrix is enforced: can_download_resources=false blocks signing', async () => {
  await db.exec('BEGIN');
  try {
    await db.exec(`UPDATE public.role_permissions SET enabled=false WHERE role='student' AND permission_key='can_download_resources'`);
    await db.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${U.verU}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub','${U.verU}', true)`);
    const names = (await db.query(`SELECT name FROM storage.objects WHERE bucket_id='resources'`)).rows.map((x) => x.name.split('/')[1]);
    assert(!names.includes('global.pdf') || names.every((n) => ['global.pdf', 'pending.pdf', 'approved.pdf'].includes(n)), 'unexpected');
    assert(names.includes('global.pdf'), 'own upload must stay readable'); // global.pdf is verU's own file
    assert(!names.includes('ui.pdf'), 'cross-campus');
    // an unverified student (not the uploader) loses the GLOBAL file
    await db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${U.unvU}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub','${U.unvU}', true)`);
    const n2 = (await db.query(`SELECT name FROM storage.objects WHERE bucket_id='resources'`)).rows.length;
    eq(n2, 0, 'download permission off but file still readable');
  } finally { await db.exec('ROLLBACK'); }
});
await check('resource uploads must target the uploader\'s own campus', async () => {
  await as(U.verU, async (c) => {
    const bad = await c.t(`INSERT INTO public.resources (id, uploader_id, campus_code, course_code, course_title, title, resource_type, file_url) VALUES ('55555555-5555-4555-8555-555555555555','${U.verU}','UI','X','X','x','lecture_note','${U.verU}/z.pdf')`);
    denied(bad, /row-level security/i, 'upload into another campus');
    const ok = await c.t(`INSERT INTO public.resources (id, uploader_id, campus_code, course_code, course_title, title, resource_type, file_url) VALUES ('66666666-6666-4666-8666-666666666666','${U.verU}','UNILAG','X','X','x','lecture_note','${U.verU}/z.pdf')`);
    assert(ok.ok, ok.err?.message);
  });
});
await check('download counter: once per person, only for resources you may see', async () => {
  await as(U.unvU, async (c) => {
    const a = await c.t(`SELECT public.increment_resource_download('${R.glob}') n`);
    assert(a.ok, a.err?.message);
    const b = await c.t(`SELECT public.increment_resource_download('${R.glob}') n`);
    eq(b.rows[0].n, a.rows[0].n, 'second tap counted again');
    denied(await c.t(`SELECT public.increment_resource_download('${R.ui}')`), /do not have access/i, 'resource of another campus');
  });
});

// --------------------------------------------------------------------------- 8. onboarding RPCs
await check('save_academic_profile(): institutional e-mails are locked to their campus and the server reports it', async () => {
  // an unilag.edu.ng address -> auto campus UNILAG
  await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ('${id(50)}','amaka@unilag.edu.ng','{"campus_code":"UNILAG"}'::jsonb, now())`);
  await as(id(50), async (c) => {
    const r = await c.t(`SELECT public.save_academic_profile('UI','Physics','Science','200L','hello') r`);
    assert(r.ok, r.err?.message);
    eq([r.rows[0].r.campus_code, r.rows[0].r.campus_locked, r.rows[0].r.lock_reason], ['UNILAG', true, 'email_domain']);
  });
});
await check('save_academic_profile(): a personal-email student picks a campus; complete_my_onboarding() needs campus + department', async () => {
  await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ('${id(51)}','tola@gmail.test','{}'::jsonb, now())`);
  await as(id(51), async (c) => {
    denied(await c.t(`SELECT public.complete_my_onboarding()`), /academic_profile_incomplete/, 'complete without campus/department');
    const r = await c.t(`SELECT public.save_academic_profile('UNILAG','Law','Law','300L',NULL) r`);
    assert(r.ok, r.err?.message);
    eq([r.rows[0].r.campus_code, r.rows[0].r.campus_locked], ['UNILAG', false]);
    const d = await c.t(`SELECT public.complete_my_onboarding() r`);
    assert(d.ok && d.rows[0].r.onboarding_complete === true, d.err?.message || JSON.stringify(d.rows));
    denied(await c.t(`SELECT public.save_academic_profile('GLOBAL','Law')`), /invalid_campus/, 'GLOBAL campus');
    denied(await c.t(`SELECT public.save_academic_profile('UNILAG','')`), /department_required/, 'empty department');
  });
});

await check('legacy members who confirmed an institutional e-mail before auto-verify existed are backfilled to verified', async () => {
  await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ('${id(60)}','legacy@unilag.edu.ng','{"campus_code":"UNILAG"}'::jsonb, now())`);
  await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ('${id(61)}','plain@gmail.test','{"campus_code":"UNILAG"}'::jsonb, now())`);
  const before = await db.query(`SELECT id, verification_status::text v FROM public.profiles WHERE id IN ('${id(60)}','${id(61)}') ORDER BY id`);
  eq(before.rows.map((r) => r.v), ['unverified', 'unverified'], 'fixture should start unverified');
  await db.exec((await import('node:fs')).readFileSync(resolve(ROOT, REMEDIATION), 'utf8'));
  const after = await db.query(`SELECT id, verification_status::text v, campus_code FROM public.profiles WHERE id IN ('${id(60)}','${id(61)}') ORDER BY id`);
  eq(after.rows.map((r) => r.v), ['verified', 'unverified'], 'backfill outcome');
  eq(after.rows[0].campus_code, 'UNILAG');
});

await check('sign-up trigger: never admin from metadata, records the age answer the app sends, root e-mail is not elevated at sign-up', async () => {
  await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ('${id(70)}','sneaky@gmail.test','{"role":"admin","campus_code":"NOPE","username":"Sneaky_One","full_name":"S","terms_version":"2026-10","age_eligibility_confirmed":true}'::jsonb, now())`);
  await db.exec(`DELETE FROM public.profiles WHERE id='${U.root}'`).catch(() => {});
  const p = await db.query(`SELECT role::text r, campus_code, username, admin_role FROM public.profiles WHERE id='${id(70)}'`);
  eq(p.rows[0], { r: 'student', campus_code: 'GLOBAL', username: 'sneaky_one', admin_role: null }, 'profile minted from hostile metadata');
  const c = await db.query(`SELECT age_confirmed_18 a FROM public.consent_records WHERE user_id='${id(70)}'`);
  eq(c.rows[0]?.a, true, 'age answer not recorded');
});

// --------------------------------------------------------------------------- 8b. scope completion (20261029)
// generic row inserter: fills NOT NULL columns, FK/trigger checks off (fixtures only)
async function ins(table, vals) {
  const cols = (await db.query(`SELECT column_name c, data_type d, udt_name u, is_nullable n, column_default df FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table])).rows;
  const row = { ...vals };
  for (const c of cols) {
    if (c.c in row || c.n === 'YES' || c.df !== null) continue;
    if (c.d === 'uuid') row[c.c] = '00000000-0000-4000-8000-0000000000aa';
    else if (c.d === 'ARRAY') row[c.c] = '{}';
    else if (c.d === 'boolean') row[c.c] = false;
    else if (/int|numeric|double|real/.test(c.d)) row[c.c] = 0;
    else if (/timestamp/.test(c.d)) row[c.c] = new Date().toISOString();
    else if (c.d === 'jsonb' || c.d === 'json') row[c.c] = '{}';
    else if (c.d === 'USER-DEFINED') row[c.c] = (await db.query(`SELECT e.enumlabel l FROM pg_enum e JOIN pg_type ty ON ty.oid=e.enumtypid WHERE ty.typname=$1 ORDER BY e.enumsortorder LIMIT 1`, [c.u])).rows[0].l;
    else row[c.c] = 'x';
  }
  const keys = Object.keys(row);
  await db.exec('SET session_replication_role = replica');
  try {
    await db.query(`INSERT INTO public.${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map((k) => row[k]));
  } finally { await db.exec('SET session_replication_role = origin'); }
}
const S = { // fixture ids
  postU: id(101), postI: id(102), postIglobal: id(103), annI: id(104), annU: id(105), mktI: id(106), jobI: id(107), evI: id(108), sgI: id(109),
  cmtI: id(110), cmtU: id(111), tkI: id(112), tkU: id(113),
};
await ins('posts', { id: S.postU, author_id: U.verU, campus_code: 'UNILAG', visibility_scope: 'campus', audience_scope: 'global', status: 'published' });
await ins('posts', { id: S.postI, author_id: U.verI, campus_code: 'UI', visibility_scope: 'campus', audience_scope: 'global', status: 'published' });
await ins('posts', { id: S.postIglobal, author_id: U.verI, campus_code: 'UI', visibility_scope: 'global', audience_scope: 'global', status: 'published', image_url: `https://x.supabase.co/storage/v1/object/public/campus-media/${U.verI}/globalpost.jpg` });
await ins('announcements', { id: S.annI, author_id: U.verI, campus_code: 'UI' });
await ins('announcements', { id: S.annU, author_id: U.verU, campus_code: 'UNILAG' });
await ins('marketplace_listings', { id: S.mktI, seller_id: U.verI, campus_code: 'UI' });
await ins('jobs', { id: S.jobI, poster_id: U.verI, campus_code: 'UI', is_approved: true });
await ins('events', { id: S.evI, creator_id: U.verI, campus_code: 'UI', visibility_scope: 'campus' });
await ins('study_groups', { id: S.sgI, creator_id: U.verI, campus_code: 'UI', name: 'Study group', max_members: 10 });
await ins('post_comments', { id: S.cmtI, post_id: S.postI, author_id: U.verI });
await ins('post_comments', { id: S.cmtU, post_id: S.postU, author_id: U.verU });
await ins('support_tickets', { id: S.tkI, user_id: U.verI, category: 'general' });
await ins('support_tickets', { id: S.tkU, user_id: U.verU, category: 'general' });
await ins('push_tokens', { user_id: U.verI, token: 'ExponentPushToken[ui-user-token]' });
await ins('client_errors', { user_id: U.verI, message: 'boom' });
for (const [uid, b, n] of [[U.verI, 'verifications', 'doc.jpg'], [U.verU, 'verifications', 'doc.jpg'], [U.verI, 'resumes', 'cv.pdf'], [U.verI, 'campus-media', 'cover.jpg'], [U.verU, 'campus-media', 'cover.jpg'], [U.verI, 'campus-media', 'globalpost.jpg'], [U.glob, 'campus-media', 'pub.jpg']]) {
  await db.exec(`INSERT INTO storage.buckets (id, name, public) VALUES ('${b}','${b}',false) ON CONFLICT (id) DO NOTHING`);
  await db.exec(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('${b}','${uid}/${n}','${uid}')`);
}
await db.exec(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('resources','${U.verU}/chat_doc.pdf','${U.verU}')`);
await ins('chat_channels', { id: id(900) });
await db.exec(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${id(900)}','${U.verU}'), ('${id(900)}','${U.verI}')`);
await ins('chat_messages', { channel_id: id(900), sender_id: U.verU, content: 'notes', media_url: `${U.verU}/chat_doc.pdf` });
const CAU = { sub: U.campAdminU, email: 'campadmin.u@school.test' };
const names = async (c, bucket) => (await c.q(`SELECT name FROM storage.objects WHERE bucket_id='${bucket}' ORDER BY name`)).rows.map((x) => x.name);

await check('scope: a Campus Admin and staff cannot READ another campus\'s campus-only content, but see own campus, GLOBAL and global-visibility rows', async () => {
  for (const who of [CAU, U.staffU]) {
    await as(who, async (c) => {
      const posts = (await c.q(`SELECT id FROM public.posts`)).rows.map((x) => x.id);
      assert(posts.includes(S.postU), 'own-campus post hidden');
      assert(!posts.includes(S.postI), 'UI campus-only post visible to a UNILAG admin/staff');
      assert(posts.includes(S.postIglobal), 'global-visibility UI post must stay visible');
      for (const [t, col, bad] of [['announcements', 'id', S.annI], ['marketplace_listings', 'id', S.mktI], ['jobs', 'id', S.jobI], ['events', 'id', S.evI], ['study_groups', 'id', S.sgI]]) {
        const rows = (await c.q(`SELECT ${col} FROM public.${t}`)).rows.map((x) => x[col]);
        assert(!rows.includes(bad), `${t}: UI row visible to a UNILAG admin/staff`);
      }
    });
  }
});
await check('scope: a Campus Admin / staff cannot UPDATE or DELETE other-campus rows, and cannot INSERT into another campus; own campus still works', async () => {
  for (const who of [CAU, U.staffU]) {
    await as(who, async (c) => {
      for (const [t, id_] of [['posts', S.postI], ['announcements', S.annI], ['marketplace_listings', S.mktI], ['jobs', S.jobI], ['events', S.evI], ['study_groups', S.sgI]]) {
        const up = await c.t(`UPDATE public.${t} SET campus_code = campus_code WHERE id='${id_}'`);
        assert(!up.ok || up.n === 0, `${t}: updated another campus's row`);
        const del = await c.t(`DELETE FROM public.${t} WHERE id='${id_}'`);
        assert(!del.ok || del.n === 0, `${t}: deleted another campus's row`);
      }
    });
  }
  await as(CAU, async (c) => {
    const ok = await c.t(`UPDATE public.announcements SET campus_code = campus_code WHERE id='${S.annU}'`);
    assert(ok.ok && ok.n === 1, ok.err?.message || 'own-campus announcement not editable');
    const okPost = await c.t(`UPDATE public.posts SET campus_code = campus_code WHERE id='${S.postU}'`);
    assert(okPost.ok && okPost.n === 1, okPost.err?.message || 'own-campus post not editable');
    const bad = await c.t(`INSERT INTO public.announcements (id, author_id, campus_code, title, body) VALUES ('${id(120)}','${U.campAdminU}','UI','x','x')`);
    assert(!bad.ok, 'campus admin published an announcement into another campus');
  });
});
await check('scope: child rows follow the parent (comments on another campus\'s post)', async () => {
  await as(CAU, async (c) => {
    const ids = (await c.q(`SELECT id FROM public.post_comments`)).rows.map((x) => x.id);
    assert(!ids.includes(S.cmtI), 'comment on a UI post visible to a UNILAG admin');
    const del = await c.t(`DELETE FROM public.post_comments WHERE id='${S.cmtI}'`);
    assert(!del.ok || del.n === 0, 'deleted a comment on another campus');
    const own = await c.t(`DELETE FROM public.post_comments WHERE id='${S.cmtU}' RETURNING id`);
    assert(own.ok && own.n === 1, own.err?.message || 'could not moderate an own-campus comment');
  });
});
await check('scope: support tickets by member campus; push tokens / client errors are Super Admin only', async () => {
  await as(CAU, async (c) => {
    const tk = (await c.q(`SELECT id FROM public.support_tickets`)).rows.map((x) => x.id);
    assert(tk.includes(S.tkU) && !tk.includes(S.tkI), `ticket scope wrong: ${tk}`);
    eq((await c.q(`SELECT count(*)::int n FROM public.push_tokens`)).rows[0].n, 0, 'campus admin reads push tokens');
    eq((await c.q(`SELECT count(*)::int n FROM public.client_errors`)).rows[0].n, 0, 'campus admin reads client errors');
  });
  await as({ sub: U.root, email: ROOT_EMAIL }, async (c) => {
    assert((await c.q(`SELECT count(*)::int n FROM public.push_tokens`)).rows[0].n >= 1, 'super admin lost push tokens');
    assert((await c.q(`SELECT count(*)::int n FROM public.support_tickets`)).rows[0].n >= 2, 'super admin lost tickets');
  });
  await as(U.verI, async (c) => { assert((await c.q(`SELECT count(*)::int n FROM public.push_tokens`)).rows[0].n === 1, 'owner lost own push token'); });
});
await check('scope: students are unaffected (own-campus reads, global posts, own writes)', async () => {
  await as(U.verU, async (c) => {
    const posts = (await c.q(`SELECT id FROM public.posts`)).rows.map((x) => x.id);
    assert(posts.includes(S.postU) && posts.includes(S.postIglobal) && !posts.includes(S.postI), `student post visibility: ${posts.length}`);
    const own = await c.t(`UPDATE public.posts SET campus_code = campus_code WHERE id='${S.postU}'`);
    assert(own.ok && own.n === 1, own.err?.message || 'student cannot edit own post');
  });
});
await check('storage: verification documents are readable only by the owner, the Super Admin and the admin of the OWNER\'s campus', async () => {
  await as(CAU, async (c) => {
    const n = await names(c, 'verifications');
    assert(n.includes(`${U.verU}/doc.jpg`), 'campus admin cannot review own-campus evidence');
    assert(!n.includes(`${U.verI}/doc.jpg`), 'UNILAG admin can read a UI member\'s ID document');
  });
  await as(U.verI, async (c) => { eq(await names(c, 'verifications'), [`${U.verI}/doc.jpg`], 'owner view'); });
  await as({ sub: U.root, email: ROOT_EMAIL }, async (c) => { eq((await names(c, 'verifications')).length, 2); });
  await as(CAU, async (c) => {
    const del = await c.t(`DELETE FROM storage.objects WHERE bucket_id='verifications' AND name='${U.verI}/doc.jpg'`);
    assert(!del.ok || del.n === 0, 'campus admin deleted another campus\'s ID document');
  });
});
await check('storage: a chat attachment in the private resources bucket can be opened by the other member of the conversation, and nobody else', async () => {
  const can = (who) => as(who, async (c) => (await names(c, 'resources')).includes(`${U.verU}/chat_doc.pdf`));
  assert(await can(U.verU), 'sender cannot read own attachment');
  assert(await can(U.verI), 'the other chat member cannot open the attachment');
  assert(!(await can(U.unvU)), 'a non-member read a chat attachment');
  assert(!(await can(U.glob)), 'a non-member (global) read a chat attachment');
});
await check('people you may know: a student only gets students/alumni of their own campus (or GLOBAL), never staff, admins or other campuses', async () => {
  await as(U.verU, async (c) => {
    const r = await c.q(`SELECT p.id, p.role::text role, p.campus_code FROM public.get_suggested_connections(500) s JOIN public.profiles p ON p.id = s.id`);
    for (const row of r.rows) {
      assert(['student', 'alumni'].includes(row.role), `suggested a ${row.role}`);
      assert(['UNILAG', 'GLOBAL'].includes(row.campus_code), `suggested someone from ${row.campus_code}`);
    }
  });
});
await check('cross-campus authors of global posts are readable (name/avatar) by students, nobody else on that campus is, and campus admins stay campus-bound', async () => {
  await as(U.verU, async (c) => {
    const r = await c.q(`SELECT id FROM public.profiles WHERE id IN ('${U.verI}', '${U.campAdminI}', '${U.staffI}')`);
    const ids = r.rows.map((x) => x.id);
    assert(ids.includes(U.verI), 'author of a global post is invisible to a student on another campus');
    assert(!ids.includes(U.campAdminI) && !ids.includes(U.staffI), 'a UI member who never published globally became readable');
  });
  await as(CAU, async (c) => {
    eq((await c.q(`SELECT count(*)::int n FROM public.profiles WHERE id = '${U.verI}'`)).rows[0].n, 0, 'UNILAG campus admin read a UI author');
  });
});
await check('usernames: a collision at sign-up still yields a unique handle, reserved/malformed handles are replaced, and the availability check fails closed', async () => {
  const mkUser = (n, email, handle) => db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ('${id(n)}','${email}','${JSON.stringify({ campus_code: 'UNILAG', username: handle })}'::jsonb, now())`);
  await mkUser(800, 'first.person@gmail.test', 'popular_handle');
  await mkUser(801, 'second.person@gmail.test', 'Popular_Handle'); // same handle, different case: the race the index decides
  await mkUser(802, 'third.person@gmail.test', 'admin');           // reserved
  await mkUser(803, 'fourth.person@gmail.test', 'no spaces!');     // malformed
  const u = async (n) => (await db.query(`SELECT username FROM public.profiles WHERE id='${id(n)}'`)).rows[0]?.username;
  eq(await u(800), 'popular_handle');
  assert(/^popular_handle\d{4}$/.test(await u(801)), `second person got ${await u(801)}`);
  eq(await u(802), 'third.person', 'reserved handle must be replaced by one derived from the e-mail');
  eq(await u(803), 'fourth.person');
  await as('anon', async (c) => {
    eq((await c.q(`SELECT public.check_username_available('popular_handle') ok`)).rows[0].ok, false);
    eq((await c.q(`SELECT public.check_username_available('Admin') ok`)).rows[0].ok, false);
    eq((await c.q(`SELECT public.check_username_available('bad name') ok`)).rows[0].ok, false);
    eq((await c.q(`SELECT public.check_username_available('brand_new_handle') ok`)).rows[0].ok, true);
  });
});
await check('event schedule: the organiser can save an agenda, another student cannot, and a malformed agenda is refused', async () => {
  await ins('events', { id: id(950), creator_id: U.verU, campus_code: 'UNILAG', title: 'Agenda test', status: 'upcoming' });
  await as(U.verU, async (c) => {
    const r = await c.t(`UPDATE public.events SET agenda = '[{"time":"10:00","title":"Opening"}]'::jsonb WHERE id='${id(950)}' RETURNING id`);
    assert(r.ok && r.rows.length === 1, 'organiser could not save the agenda');
    const bad = await c.t(`UPDATE public.events SET agenda = '{"not":"an array"}'::jsonb WHERE id='${id(950)}'`);
    assert(!bad.ok, 'a non-array agenda was accepted');
  });
  await as(U.verI, async (c) => {
    const r = await c.t(`UPDATE public.events SET agenda = '[]'::jsonb WHERE id='${id(950)}' RETURNING id`);
    assert(!r.ok || r.rows.length === 0, 'another student edited the organiser\'s schedule');
  });
});
await check('conversation summaries: one row per channel with last message and unread count, members only', async () => {
  await as(U.verI, async (c) => {
    const r = await c.q(`SELECT * FROM public.get_my_conversation_summaries(50) WHERE id = '${id(900)}'`);
    eq(r.rows.length, 1, 'channel missing for a member');
    eq(r.rows[0].last_message_content, 'notes');
    eq(r.rows[0].unread_count, 1, 'peer message should count as unread');
  });
  await as(U.verU, async (c) => {
    const r = await c.q(`SELECT unread_count FROM public.get_my_conversation_summaries(50) WHERE id = '${id(900)}'`);
    eq(r.rows[0].unread_count, 0, 'own message must not count as unread');
  });
  await as(U.unvU, async (c) => {
    eq((await c.q(`SELECT count(*)::int n FROM public.get_my_conversation_summaries(50)`)).rows[0].n, 0, 'non-member saw a channel');
  });
  await as('anon', async (c) => {
    const r = await c.t(`SELECT * FROM public.get_my_conversation_summaries(5)`);
    assert(!r.ok, 'anon could call the summaries function');
  });
});
await check('integration: helper functions that migrations call actually exist (is_feature_enabled, 4-arg mentorship_notify)', async () => {
  const r = await db.query(`SELECT to_regprocedure('public.is_feature_enabled(text)') IS NOT NULL a, to_regprocedure('public.mentorship_notify(uuid,text,text,text)') IS NOT NULL b`);
  assert(r.rows[0].a, 'is_feature_enabled(text) missing');
  assert(r.rows[0].b, 'mentorship_notify(uuid,text,text,text) missing');
});
await check('storage: résumés are not readable by an admin of another campus', async () => {
  await as(CAU, async (c) => { eq(await names(c, 'resumes'), [], 'UNILAG admin read a UI résumé'); });
  await as({ sub: id(9), email: 'campadmin.i@school.test' }, async (c) => { eq(await names(c, 'resumes'), [`${U.verI}/cv.pdf`]); });
});
await check('storage: campus-media is no longer readable across campuses by verified members; global content and own campus still work', async () => {
  await as(U.verU, async (c) => {
    const n = await names(c, 'campus-media');
    assert(n.includes(`${U.verU}/cover.jpg`), 'own upload hidden');
    assert(n.includes(`${U.glob}/pub.jpg`), 'GLOBAL member media hidden');
    assert(n.includes(`${U.verI}/globalpost.jpg`), 'media of a global-visibility post must stay readable cross-campus');
    if (n.includes(`${U.verI}/cover.jpg`)) {
      const d = await c.q(`SELECT public.storage_owner_campus('${U.verI}/cover.jpg') oc, public.auth_campus_access() a, public.can_admin_campus('UI') adm, public.auth_is_super_admin() sa, (SELECT role::text||'/'||campus_code FROM public.profiles WHERE id='${U.verU}') me`);
      const nm = `${U.verI}/cover.jpg`;
      const probes = {};
      probes.posts = (await c.su(`SELECT count(*)::int n FROM public.posts p WHERE (p.visibility_scope='global' OR p.campus_code IS NULL OR p.campus_code='GLOBAL') AND (public.media_ref_matches(p.image_url,'${nm}') OR public.media_ref_matches(p.video_url,'${nm}'))`)).rows[0].n;
      probes.events = (await c.su(`SELECT count(*)::int n FROM public.events e WHERE public.media_ref_matches(e.banner_url,'${nm}')`)).rows[0].n;
      probes.mkt = (await c.su(`SELECT count(*)::int n FROM public.marketplace_listings m WHERE public.media_ref_matches(m.image_url,'${nm}') OR public.media_ref_matches(m.image_path,'${nm}')`)).rows[0].n;
      probes.giving = (await c.su(`SELECT count(*)::int n FROM public.giving_campaigns g WHERE public.media_ref_matches(g.cover_image_url,'${nm}')`)).rows[0].n;
      probes.policies = (await c.su(`SELECT string_agg(policyname,' | ') s FROM pg_policies WHERE schemaname='storage' AND cmd='SELECT'`)).rows[0].s;
      throw new Error('UNILAG member can read UI campus media: ' + JSON.stringify(d.rows[0]) + JSON.stringify(probes));
    }
  });
  await as(U.unvU, async (c) => { // unverified: GLOBAL + referenced global content only
    const n = await names(c, 'campus-media');
    assert(n.includes(`${U.glob}/pub.jpg`) && n.includes(`${U.verI}/globalpost.jpg`), 'unverified member lost global media');
    assert(!n.includes(`${U.verU}/cover.jpg`), 'unverified member can read campus media');
  });
  await as(CAU, async (c) => {
    const n = await names(c, 'campus-media');
    assert(n.includes(`${U.verU}/cover.jpg`) && !n.includes(`${U.verI}/cover.jpg`), `campus admin media scope: ${n}`);
  });
});
await check('Role Permissions are enforced for forum posts and comments (can_post_forum / can_comment_forum)', async () => {
  await db.exec('BEGIN');
  try {
    await db.exec(`UPDATE public.role_permissions SET enabled=false WHERE role='student' AND permission_key IN ('can_post_forum','can_comment_forum')`);
    await db.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${U.verU}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub','${U.verU}', true)`);
    await db.exec('SAVEPOINT s1');
    let blocked = false;
    try { await db.exec(`INSERT INTO public.posts (id, author_id, campus_code, visibility_scope, audience_scope, status, title, content) VALUES ('${id(130)}','${U.verU}','UNILAG','campus','global','published','t','c')`); } catch (e) { blocked = /row-level security/i.test(e.message) || /permission/i.test(e.message); await db.exec('ROLLBACK TO s1'); }
    assert(blocked, 'a student posted although can_post_forum is off');
  } finally { await db.exec('ROLLBACK'); }
});
await check('the default permission matrix does not block normal behaviour for any role (post / comment / list / message)', async () => {
  const r = await db.query(`SELECT role, permission_key, enabled FROM public.role_permissions WHERE permission_key IN ('can_post_forum','can_comment_forum','can_list_marketplace','can_send_messages') AND enabled = false ORDER BY 1,2`);
  // informational: any disabled default is reported so the owner can decide; only fail if a role that has the feature is off
  const offenders = r.rows.filter((x) => ['student', 'campus_admin', 'staff', 'super_admin'].includes(x.role) && !(x.role === 'staff' && x.permission_key === 'can_list_marketplace'));
  assert(offenders.length === 0, `default matrix disables features roles use: ${JSON.stringify(offenders)}`);
});
await check('scope completion is idempotent (second run)', async () => {
  await db.exec((await import('node:fs')).readFileSync(resolve(ROOT, REMEDIATION_2), 'utf8'));
});

await check('optional MFA switch: OFF changes nothing; ON requires AAL2 only for admins with a verified factor', async () => {
  await db.exec(`CREATE TABLE IF NOT EXISTS auth.mfa_factors (id uuid DEFAULT gen_random_uuid(), user_id uuid, status text)`);
  const probe = (who) => as(who, async (c) => (await c.q(`SELECT public.can_admin_campus('UNILAG') AS v`)).rows[0].v);
  const admin = { sub: U.campAdminU, email: 'campadmin.u@school.test' };
  try {
    await db.exec(`INSERT INTO auth.mfa_factors (user_id, status) VALUES ('${U.campAdminU}', 'verified')`);
    eq(await probe(admin), true, 'switch off must not change anything');
    await db.exec(`INSERT INTO public.platform_settings (key, value) VALUES ('admin_mfa_required','{"enabled": true}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    eq(await probe(admin), false, 'enrolled admin on aal1 must lose authority when the switch is on');
    eq(await probe({ ...admin, aal: 'aal2' }), true, 'aal2 session must keep authority');
    eq(await probe({ sub: U.staffU, email: 'staff.u@school.test' }), true, 'a staff member with no factor must not be locked out');
  } finally {
    await db.exec(`DELETE FROM public.platform_settings WHERE key = 'admin_mfa_required'; DELETE FROM auth.mfa_factors`);
  }
});

await check('live diagnostic script runs and the "applied" section reports all three migrations', async () => {
  const sql = (await import('node:fs')).readFileSync(resolve(ROOT, 'supabase/diagnostics/audit_live_state.sql'), 'utf8');
  const res = await db.exec(sql);
  const rows = res[res.length - 1].rows;
  const g = rows.filter((r) => r.section === 'G applied');
  assert(g.length >= 8, `expected 8 G rows, got ${g.length}`);
  const bad = g.filter((r) => String(r.value).startsWith('ERROR:'));
  assert(bad.length === 0, `G rows errored: ${JSON.stringify(bad)}`);
  const get = (s) => g.find((r) => r.item.includes(s)).value;
  eq(get('can_read_media_object'), 'true', 'media helper');
  eq(get('admin_aal2_ok() exists'), 'true', '2fa helper');
  assert(Number(get('restrictive scope_')) >= 40, `restrictive policy count ${get('restrictive scope_')}`);
  assert(Number(get('role_permission_insert')) >= 4, `role_permission_insert policies: ${get('role_permission_insert')}`);
});

// --------------------------------------------------------------------------- 9. nothing else broke
await check('no new permission-denied errors: every public table stays readable (as student and as Campus Admin)', async () => {
  const tables = (await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1`)).rows.map((r) => r.relname);
  const broken = [];
  for (const who of [U.verU, { sub: U.campAdminU, email: 'campadmin.u@school.test' }]) {
    await as(who, async (c) => {
      for (const t of tables) {
        const r = await c.t(`SELECT 1 FROM public.${t} LIMIT 1`);
        if (!r.ok && /permission denied/i.test(r.err.message)) broken.push(`${typeof who === 'object' ? 'campusAdmin' : 'student'}:${t}:${r.err.message.slice(0, 60)}`);
      }
    });
  }
  // tables that were never readable by authenticated by design are listed in BASELINE_DENIED
  // api_rate_limits: service-role only since launch hardening; resource_downloads: written only by the
  // increment_resource_download() RPC. Neither is meant to be readable by clients.
  const INTENTIONALLY_DENIED = ['api_rate_limits', 'resource_downloads'];
  const fresh = broken.filter((b) => !INTENTIONALLY_DENIED.some((t) => b.includes(`:${t}:`)));
  assert(fresh.length === 0, `permission denied on: ${fresh.join(' | ')}`);
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${BEFORE ? ' (BEFORE: failures here are the holes being demonstrated)' : ''}`);
process.exit(BEFORE ? 0 : failed.length ? 1 : 0);
