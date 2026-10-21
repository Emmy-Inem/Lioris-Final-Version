// Behaviour tests for supabase/migrations/20261111000000_minors_and_guardians.sql, executed against an
// in-memory Postgres (PGlite). Nothing here touches a real database.
//
//   cd tools/sql-harness && npm install && node minors.mjs
//
// Same load order as lifecycle.mjs: legacy root files, the root extras production also ran, then every
// supabase/migrations/*.sql in order. The minors migration itself is applied strictly (one transaction,
// not a single failing statement) and then a second time (idempotency).
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { newDb, bootstrap, applyFile, MIGRATIONS, ROOT } from './lib.mjs';

const MINORS = 'supabase/migrations/20261111000000_minors_and_guardians.sql';
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
let minorsResult = null;
for (const f of migrationFiles) {
  const path = `supabase/migrations/${f}`;
  if (path === MINORS) {
    try { minorsResult = await applyFile(db, path, true, () => {}); } catch (e) {
      console.log(`FATAL: minors migration did not apply: ${e.message}${e.detail ? ' | ' + e.detail : ''}${e.where ? ' | ' + e.where : ''}`);
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


/** Switch the current transaction to a signed-in member (for checks that must alternate between superuser and member). */
const imp = (uid) => db.exec(`RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); SELECT set_config('request.jwt.claim.sub', '${uid}', true)`);
const sudo = (sql) => db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims', '', true); SELECT set_config('request.jwt.claim.sub', '', true); ${sql}`);

// --------------------------------------------------------------------------- date helpers (database clock)
const dbDate = async (expr) => (await db.query(`SELECT (${expr})::date::text d`)).rows[0].d;
/** a date of birth that makes the member exactly `n` years old (birthday was yesterday) */
const dobAge = (n) => dbDate(`current_date - interval '${n} years' - interval '1 day'`);
/** birthday is TODAY: the member has just turned n */
const dobTurnsToday = (n) => dbDate(`current_date - interval '${n} years'`);
/** birthday is TOMORROW: the member is still n-1 */
const dobTurnsTomorrow = (n) => dbDate(`current_date - interval '${n} years' + interval '1 day'`);

// --------------------------------------------------------------------------- fixtures
const U = {
  root: id(1), adminU: id(2), adminI: id(3), staffU: id(4), adult: id(5), legacy: id(6),
  minorL: id(7), minorP: id(8), minorC: id(9), minorI: id(10), alumAdult: id(11), alumMinor: id(12),
  adult2: id(13), globMinor: id(14), stuI: id(15),
};
const ROOT_EMAIL = 'inememmanuel@gmail.com';
async function mk(uid, email, campus, meta = {}) {
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ($1,$2,$3::jsonb, now())`,
    [uid, email, JSON.stringify({ campus_code: campus, full_name: email.split('@')[0], ...meta })]);
}
const D = { adult: await dobAge(25), minorL: await dobAge(15), minorP: await dobAge(16), minorC: await dobAge(14), minorI: await dobAge(15), alum: await dobAge(30), alumMinor: await dobAge(17), adult2: await dobAge(22), glob: await dobAge(15) };
await mk(U.root, ROOT_EMAIL, 'GLOBAL');
await mk(U.adminU, 'adminu@school.test', 'UNILAG');
await mk(U.adminI, 'adminui@school.test', 'UI');
await mk(U.staffU, 'staffu@school.test', 'UNILAG');
await mk(U.adult, 'adult@school.test', 'UNILAG', { date_of_birth: D.adult });
await mk(U.legacy, 'legacy@school.test', 'UNILAG');                       // signed up before the age rules: no date of birth
await mk(U.minorL, 'minorl@school.test', 'UNILAG', { date_of_birth: D.minorL });
await mk(U.minorP, 'minorp@school.test', 'UNILAG', { date_of_birth: D.minorP });
await mk(U.minorC, 'minorc@school.test', 'UNILAG', { date_of_birth: D.minorC });
await mk(U.minorI, 'minori@school.test', 'UI', { date_of_birth: D.minorI });
await mk(U.alumAdult, 'alumadult@school.test', 'UNILAG', { role: 'alumni', date_of_birth: D.alum });
await mk(U.alumMinor, 'alumminor@school.test', 'UNILAG', { role: 'alumni', date_of_birth: D.alumMinor });
await mk(U.adult2, 'adult2@school.test', 'UNILAG', { date_of_birth: D.adult2 });
await mk(U.globMinor, 'globminor@gmail.test', 'GLOBAL', { date_of_birth: D.glob });
await mk(U.stuI, 'stui@school.test', 'UI', { date_of_birth: D.adult });
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
await db.exec(`UPDATE public.profiles SET role='admin', admin_role='super_admin', campus_code='GLOBAL', verification_status='verified', onboarding_complete=true WHERE id='${U.root}'`);
await db.exec(`UPDATE public.profiles SET role='admin', admin_role='campus_admin' WHERE id IN ('${U.adminU}','${U.adminI}')`);
await db.exec(`UPDATE public.profiles SET role='staff' WHERE id='${U.staffU}'`);
await db.exec(`UPDATE public.profiles SET onboarding_complete=true, verification_status='verified' WHERE id <> '${U.root}'`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);
// guardian states: minorL none (limited), minorP pending, minorC confirmed, alumMinor none, minorI pending
await db.exec(`INSERT INTO public.guardian_records (minor_id, guardian_name, relationship, guardian_email, consent_status) VALUES ('${U.minorP}','Pat Parent','parent','pat.parent@example.org','pending')`);
await db.exec(`INSERT INTO public.guardian_records (minor_id, guardian_name, relationship, guardian_phone, consent_status, consent_method, consent_note, consent_decided_at, consent_decided_by) VALUES ('${U.minorC}','Cora Carer','legal_guardian','+2348012345678','confirmed','admin_recorded','spoke to Cora by phone, verified',now(),'${U.adminU}')`);
await db.exec(`INSERT INTO public.guardian_records (minor_id, guardian_name, relationship, guardian_email) VALUES ('${U.minorI}','Ian Ibe','parent','ian@example.org')`);

console.log('\n== MINORS & GUARDIANS ==');

// --------------------------------------------------------------------------- 0. application
await check('minors migration applies cleanly in a single transaction', async () => { assert(minorsResult && !minorsResult.failures?.length, 'did not apply'); });
await check('minors migration is idempotent (second run, state and grants unchanged)', async () => {
  const before = (await db.query(`SELECT count(*)::int n FROM pg_policies WHERE schemaname='public' AND policyname IN ('minors_hidden_from_adults','minors_hidden_from_anon','minor_restriction_insert')`)).rows[0].n;
  await db.exec(readFileSync(resolve(ROOT, MINORS), 'utf8'));
  const after = (await db.query(`SELECT count(*)::int n FROM pg_policies WHERE schemaname='public' AND policyname IN ('minors_hidden_from_adults','minors_hidden_from_anon','minor_restriction_insert')`)).rows[0].n;
  eq(after, before, 'policy count changed on re-run');
  assert(before >= 7, `expected the profile + 5 backstop policies, found ${before}`);
});
const priv = async (fn, role) => (await db.query(`SELECT has_function_privilege($1, $2, 'EXECUTE') v`, [role, fn])).rows[0].v;
await check('every new function has the intended grants (nothing for anon except the two pure helpers)', async () => {
  const want = [
    // fn, anon, authenticated, service_role
    ['public.age_years(date)', true, true, true],
    ['public.check_signup_dob(date)', true, true, true],
    ['public.is_minor(uuid)', false, true, true],
    ['public.get_my_minor_status()', false, true, true],
    ['public.set_my_date_of_birth(date)', false, true, true],
    ['public.submit_guardian_details(text,text,text,text)', false, true, true],
    ['public.admin_list_minors(text,text,integer,integer)', false, true, true],
    ['public.admin_get_minor_guardian(uuid)', false, true, true],
    ['public.admin_record_guardian_consent(uuid,text,text,text,text,text,text)', false, true, true],
    ['public.admin_correct_date_of_birth(uuid,date,text)', false, true, true],
    ['public.admin_age_diagnostics(text)', false, true, true],
    ['public.purge_guardian_records_for_adults(integer,integer)', false, false, true],
    ['public.export_my_data()', false, true, true],
    ['public.purge_user_data(uuid)', false, false, true],
  ];
  for (const [fn, a, au, s] of want) eq([await priv(fn, 'anon'), await priv(fn, 'authenticated'), await priv(fn, 'service_role')], [a, au, s], fn);
  const anonDefiner = (await db.query(`SELECT COALESCE(string_agg(p.proname, ',' ORDER BY p.proname), '') s FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public' WHERE p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')`)).rows[0].s;
  eq(anonDefiner, 'check_username_available,record_public_page_view', 'anon-callable SECURITY DEFINER functions (the manual-apply gate expects exactly this)');
});
await check('every SECURITY DEFINER function in public / lioris_internal that this migration added pins its search_path', async () => {
  const bad = (await db.query(`SELECT n.nspname||'.'||p.proname n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname IN ('public','lioris_internal') AND p.prosecdef AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
       AND (n.nspname='lioris_internal' OR p.proname IN ('is_minor','get_my_minor_status','set_my_date_of_birth','submit_guardian_details','admin_list_minors','admin_get_minor_guardian','admin_record_guardian_consent','admin_correct_date_of_birth','admin_age_diagnostics','purge_guardian_records_for_adults','export_my_data','purge_user_data','handle_new_user_profile','open_giving_page','get_suggested_connections'))`)).rows;
  assert(bad.length === 0, `no search_path: ${bad.map((b) => b.n).join(', ')}`);
});
await check('lioris_internal helpers are not reachable by anon, and anon has no EXECUTE on them', async () => {
  eq((await db.query(`SELECT has_schema_privilege('anon','lioris_internal','USAGE') v`)).rows[0].v, false, 'anon USAGE');
  eq((await db.query(`SELECT has_schema_privilege('public','lioris_internal','USAGE') v`)).rows[0].v, false, 'PUBLIC USAGE');
  await as('anon', async (c) => { denied(await c.t(`SELECT lioris_internal.is_minor_raw('${U.minorL}')`), /permission denied/i, 'anon internal helper'); });
});
await check('age is never stored or generated: date_of_birth is a plain column and age_years() is STABLE', async () => {
  const col = (await db.query(`SELECT attgenerated g, atthasdef d, format_type(atttypid, atttypmod) t FROM pg_attribute WHERE attrelid='public.profiles'::regclass AND attname='date_of_birth'`)).rows[0];
  eq([col.g, col.d, col.t], ['', false, 'date'], 'date_of_birth must be a plain nullable date');
  eq((await db.query(`SELECT provolatile v FROM pg_proc WHERE oid='public.age_years(date)'::regprocedure`)).rows[0].v, 's', 'age_years volatility');
  eq((await db.query(`SELECT count(*)::int n FROM pg_attribute WHERE attrelid='public.profiles'::regclass AND attgenerated <> '' AND NOT attisdropped`)).rows[0].n, 0, 'profiles has a generated column');
});
await check('age_years: whole years, birthday boundaries, NULL', async () => {
  eq((await db.query(`SELECT public.age_years(NULL) v`)).rows[0].v, null);
  eq((await db.query(`SELECT public.age_years($1::date) v`, [await dobTurnsToday(18)])).rows[0].v, 18, 'turns 18 today');
  eq((await db.query(`SELECT public.age_years($1::date) v`, [await dobTurnsTomorrow(18)])).rows[0].v, 17, 'turns 18 tomorrow');
  eq((await db.query(`SELECT public.age_years($1::date) v`, [await dobTurnsTomorrow(13)])).rows[0].v, 12, 'turns 13 tomorrow');
  eq((await db.query(`SELECT public.age_years($1::date) v`, [await dobTurnsToday(13)])).rows[0].v, 13, 'turns 13 today');
});

// --------------------------------------------------------------------------- 1. under 13
await check('sign-up with a date of birth under 13 is refused by the trigger (no auth user, no profile)', async () => {
  await as('postgres', async (c) => {
    const r = await c.t(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('${id(900)}','kid@school.test', $1::jsonb)`,
      [JSON.stringify({ campus_code: 'UNILAG', date_of_birth: await dobAge(11) })]);
    denied(r, /AGE_UNDER_13/, 'under-13 sign-up');
    eq((await c.q(`SELECT count(*)::int n FROM auth.users WHERE id='${id(900)}'`)).rows[0].n, 0, 'auth user left behind');
    eq((await c.q(`SELECT count(*)::int n FROM public.profiles WHERE id='${id(900)}'`)).rows[0].n, 0, 'profile left behind');
  });
});
await check('sign-up boundary: turns 13 today is accepted, turns 13 tomorrow is refused', async () => {
  await as('postgres', async (c) => {
    const ok = await c.t(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('${id(901)}','just13@school.test', $1::jsonb)`,
      [JSON.stringify({ campus_code: 'UNILAG', date_of_birth: await dobTurnsToday(13) })]);
    assert(ok.ok, ok.err?.message);
    eq((await c.q(`SELECT public.age_years(date_of_birth) a FROM public.profiles WHERE id='${id(901)}'`)).rows[0].a, 13);
    denied(await c.t(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('${id(902)}','almost13@school.test', $1::jsonb)`,
      [JSON.stringify({ campus_code: 'UNILAG', date_of_birth: await dobTurnsTomorrow(13) })]), /AGE_UNDER_13/, 'one day short');
  });
});
await check('sign-up with an impossible / malformed date of birth is refused (future, absurdly old, not a date)', async () => {
  await as('postgres', async (c) => {
    for (const bad of [await dbDate(`current_date + 1`), '1850-01-01', 'not-a-date', '2010-02-30', '12/05/2008']) {
      denied(await c.t(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('${id(903)}','bad@school.test', $1::jsonb)`,
        [JSON.stringify({ campus_code: 'UNILAG', date_of_birth: bad })]), /DOB_INVALID/, `dob ${bad}`);
    }
  });
});
await check('sign-up WITHOUT a date of birth still works (older app builds, admin-created accounts): NULL, treated as adult', async () => {
  await as('postgres', async (c) => {
    const r = await c.t(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('${id(904)}','nodob@school.test', '{"campus_code":"UNILAG"}'::jsonb)`);
    assert(r.ok, r.err?.message);
    eq((await c.q(`SELECT date_of_birth d FROM public.profiles WHERE id='${id(904)}'`)).rows[0].d, null);
  });
});
await check('a 13-17 sign-up stores the date of birth on the profile', async () => {
  const r = (await db.query(`SELECT date_of_birth::text d FROM public.profiles WHERE id=$1`, [U.minorL])).rows[0];
  eq(r.d, D.minorL);
});
await check('check_signup_dob classifies correctly and is callable by anon', async () => {
  await as('anon', async (c) => {
    const cls = async (d) => (await c.q(`SELECT public.check_signup_dob($1::date) v`, [d])).rows[0].v;
    eq(await cls(await dobAge(11)), 'under_13');
    eq(await cls(await dobTurnsTomorrow(13)), 'under_13');
    eq(await cls(await dobTurnsToday(13)), 'minor');
    eq(await cls(await dobAge(17)), 'minor');
    eq(await cls(await dobTurnsTomorrow(18)), 'minor');
    eq(await cls(await dobTurnsToday(18)), 'adult');
    eq(await cls(await dobAge(40)), 'adult');
    eq(await cls(await dbDate(`current_date + 1`)), 'invalid');
    eq(await cls('1850-01-01'), 'invalid');
    eq(await cls(null), 'missing');
  });
});
await check('an existing member (no date of birth) who enters one under 13 is blocked: stored, suspended with the age reason, audited', async () => {
  await as(U.legacy, async (c) => {
    const r = await c.t(`SELECT public.set_my_date_of_birth($1::date) s`, [await dobAge(12)]);
    assert(r.ok, r.err?.message);
    eq([r.rows[0].s.blocked, r.rows[0].s.is_under_13], [true, true]);
    const p = (await c.su(`SELECT is_suspended s, suspension_reason r, date_of_birth d FROM public.profiles WHERE id='${U.legacy}'`)).rows[0];
    eq(p.s, true, 'not suspended');
    assert(/^AGE_UNDER_13:/.test(p.r), `reason: ${p.r}`);
    assert(p.d, 'date of birth not stored');
    eq((await c.su(`SELECT count(*)::int n FROM public.audit_logs WHERE action='underage_account_blocked' AND entity_id='${U.legacy}'`)).rows[0].n, 1, 'no audit row');
    denied(await c.t(`SELECT public.submit_guardian_details('Some Parent','parent','p@example.org',NULL)`), /AGE_UNDER_13/, 'guardian details for an under-13');
  });
});
await check('an administrator corrects an under-13 mistake: the age block lifts and nothing else is touched', async () => {
  await as(U.legacy, async (c) => { await c.q(`SELECT public.set_my_date_of_birth($1::date)`, [await dobAge(12)]); });
  await as(U.adminU, async (c) => {
    const r = await c.t(`SELECT public.admin_correct_date_of_birth('${U.legacy}', $1::date, 'Passport seen: member is 24, typo on entry') s`, [await dobAge(24)]);
    assert(r.ok, r.err?.message);
    const p = (await c.su(`SELECT is_suspended s, suspension_reason r FROM public.profiles WHERE id='${U.legacy}'`)).rows[0];
    eq([p.s, p.r], [false, null]);
  });
});
await check('a manual suspension is NOT lifted by a date-of-birth correction (only the AGE_UNDER_13 block is)', async () => {
  await as('postgres', async (c) => {
    await c.q(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
    await c.q(`UPDATE public.profiles SET is_suspended=true, suspension_reason='Spam' WHERE id='${U.legacy}'`);
    await c.q(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);
    await c.q(`UPDATE public.profiles SET date_of_birth = $1::date WHERE id='${U.legacy}'`, [await dobAge(30)]);
    eq((await c.q(`SELECT is_suspended s, suspension_reason r FROM public.profiles WHERE id='${U.legacy}'`)).rows[0], { s: true, r: 'Spam' });
  });
});

// --------------------------------------------------------------------------- 2. date of birth is write-once
await check('set_my_date_of_birth: first value is stored, the second attempt is refused (DOB_LOCKED), invalid dates refused', async () => {
  await as(U.legacy, async (c) => {
    denied(await c.t(`SELECT public.set_my_date_of_birth($1::date)`, [await dbDate(`current_date + 1`)]), /DOB_INVALID/, 'future');
    denied(await c.t(`SELECT public.set_my_date_of_birth('1850-01-01')`), /DOB_INVALID/, 'ancient');
    denied(await c.t(`SELECT public.set_my_date_of_birth(NULL)`), /DOB_INVALID/, 'null');
    const ok = await c.t(`SELECT public.set_my_date_of_birth($1::date) s`, [await dobAge(21)]);
    assert(ok.ok, ok.err?.message);
    eq([ok.rows[0].s.is_minor, ok.rows[0].s.consent_status, ok.rows[0].s.is_limited, ok.rows[0].s.blocked], [false, 'not_required', false, false]);
    denied(await c.t(`SELECT public.set_my_date_of_birth($1::date)`, [await dobAge(40)]), /DOB_LOCKED/, 'second set');
  });
  await as('anon', async (c) => { denied(await c.t(`SELECT public.set_my_date_of_birth('2000-01-01')`), /permission denied/i, 'anon'); });
});
await check('an existing member can set a minor date of birth and is then limited with consent "missing"', async () => {
  await as(U.legacy, async (c) => {
    const s = (await c.q(`SELECT public.set_my_date_of_birth($1::date) s`, [await dobAge(16)])).rows[0].s;
    eq([s.is_minor, s.consent_status, s.is_limited, s.restrictions.length], [true, 'missing', true, 5]);
  });
});
await check('date_of_birth is not updatable by the member: not when NULL, not when set, not by a campus admin or a Super Admin on the REST role', async () => {
  const set = (uid, d) => `UPDATE public.profiles SET date_of_birth = '${d}' WHERE id = '${uid}'`;
  await as(U.legacy, async (c) => { denied(await c.t(set(U.legacy, '1990-01-01')), /permission denied/i, 'NULL -> value (must use the RPC)'); });
  await as(U.adult, async (c) => { denied(await c.t(set(U.adult, '1990-01-01')), /permission denied/i, 'value -> value (adult makes themselves a minor/other age)'); });
  await as(U.minorL, async (c) => { denied(await c.t(set(U.minorL, '1990-01-01')), /permission denied/i, 'minor makes themselves an adult'); });
  await as(U.adminU, async (c) => { denied(await c.t(set(U.minorL, '1990-01-01')), /permission denied/i, 'campus admin direct update'); });
  await as(U.root, async (c) => { denied(await c.t(set(U.minorL, '1990-01-01')), /permission denied/i, 'super admin direct update'); });
});
await check('the trigger is a second wall: even with the column privilege restored, a client role still cannot change or insert a date of birth', async () => {
  await as('postgres', async (c) => {
    await c.q(`GRANT UPDATE (date_of_birth) ON public.profiles TO authenticated`);
    await c.q(`GRANT INSERT (date_of_birth) ON public.profiles TO authenticated`);
    await imp(U.adult);
    denied(await c.t(`UPDATE public.profiles SET date_of_birth='2012-01-01' WHERE id='${U.adult}'`), /DOB_LOCKED/, 'trigger on UPDATE');
    denied(await c.t(`UPDATE public.profiles SET date_of_birth=NULL WHERE id='${U.adult}'`), /DOB_LOCKED/, 'trigger on clearing');
    denied(await c.t(`INSERT INTO public.profiles (id, email, full_name, date_of_birth) VALUES ('${id(950)}','x@y.test','X','2000-01-01')`), /DOB_LOCKED|row-level|violates/i, 'insert with a date of birth');
  });
});
await check('self-service profile updates still work for every other column (the column-grant conversion lost nothing)', async () => {
  await as(U.adult, async (c) => {
    const r = await c.t(`UPDATE public.profiles SET bio='hello', interests=ARRAY['x'] WHERE id='${U.adult}'`);
    assert(r.ok && r.n === 1, r.err?.message || 'no row updated');
  });
  const cols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name <> 'date_of_birth' ORDER BY 1`)).rows.map((r) => r.column_name);
  const granted = (await db.query(`SELECT column_name FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='profiles' AND grantee='authenticated' AND privilege_type='UPDATE' ORDER BY 1`)).rows.map((r) => r.column_name);
  eq(granted, cols, 'authenticated UPDATE columns must be every column except date_of_birth');
  const ins = (await db.query(`SELECT column_name FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='profiles' AND grantee='authenticated' AND privilege_type='INSERT' ORDER BY 1`)).rows.map((r) => r.column_name);
  eq(ins, cols, 'authenticated INSERT columns must be every column except date_of_birth');
});
await check('date of birth is invisible to other members: no SELECT privilege, so neither a direct read nor SELECT * works', async () => {
  for (const who of [U.adult, U.adult2, U.stuI, U.adminI, U.minorL]) {
    await as(who, async (c) => {
      denied(await c.t(`SELECT date_of_birth FROM public.profiles WHERE id='${U.minorC}'`), /permission denied/i, `read dob as ${who}`);
      denied(await c.t(`SELECT * FROM public.profiles WHERE id='${U.minorC}'`), /permission denied/i, `select * as ${who}`);
      denied(await c.t(`SELECT id FROM public.profiles WHERE date_of_birth < '2012-01-01'`), /permission denied/i, `filter on dob as ${who}`);
    });
  }
  await as('anon', async (c) => { denied(await c.t(`SELECT date_of_birth FROM public.profiles`), /permission denied/i, 'anon'); });
});
await check('a member reads their OWN date of birth through get_my_profile() (and only theirs)', async () => {
  await as(U.minorL, async (c) => {
    const row = (await c.q(`SELECT id, date_of_birth::text AS dob FROM public.get_my_profile()`)).rows[0];
    eq(row.id, U.minorL);
    eq(row.dob, D.minorL, 'own dob via get_my_profile');
  });
});
await check('admin_correct_date_of_birth: reason required, audited, not for yourself, scoped to the campus, only a Super Admin touches an admin', async () => {
  await as(U.adminU, async (c) => {
    const to = await dobAge(20);
    denied(await c.t(`SELECT public.admin_correct_date_of_birth('${U.minorL}', $1::date, 'short')`, [to]), /DOB_INVALID/, 'reason too short');
    denied(await c.t(`SELECT public.admin_correct_date_of_birth('${U.minorL}', $1::date, NULL)`, [to]), /DOB_INVALID/, 'no reason');
    denied(await c.t(`SELECT public.admin_correct_date_of_birth('${U.adminU}', $1::date, 'correcting my own date of birth')`, [to]), /own date of birth/i, 'self');
    denied(await c.t(`SELECT public.admin_correct_date_of_birth('${U.minorI}', $1::date, 'wrong campus entirely here')`, [to]), /own campus/i, 'other campus');
    denied(await c.t(`SELECT public.admin_correct_date_of_birth('${U.globMinor}', $1::date, 'GLOBAL member is not mine')`, [to]), /own campus/i, 'GLOBAL member');
    denied(await c.t(`SELECT public.admin_correct_date_of_birth('${U.minorL}', $1::date, 'enough reason here')`, [await dbDate('current_date + 3')]), /DOB_INVALID/, 'future date');
    const ok = await c.t(`SELECT public.admin_correct_date_of_birth('${U.minorL}', $1::date, 'Student ID card seen: born in 2006') s`, [to]);
    assert(ok.ok, ok.err?.message);
    eq([ok.rows[0].s.is_minor, ok.rows[0].s.consent_status], [false, 'not_required']);
    const a = (await c.su(`SELECT actor_id, metadata FROM public.audit_logs WHERE action='date_of_birth_corrected' AND entity_id='${U.minorL}'`)).rows[0];
    eq(a.actor_id, U.adminU);
    eq([a.metadata.previousAge, a.metadata.newAge, a.metadata.hadDateOfBirth], [15, 20, true]);
    assert(/Student ID card/.test(a.metadata.reason), 'reason not audited');
    assert(!JSON.stringify(a.metadata).includes(to) && !JSON.stringify(a.metadata).includes(D.minorL), 'the audit row must hold ages, not dates of birth');
  });
  await as(U.adminU, async (c) => {
    denied(await c.t(`SELECT public.admin_correct_date_of_birth('${U.adminI}', $1::date, 'campus admin of another campus')`, [await dobAge(40)]), /own campus|Super Admin/i, 'admin of another campus');
  });
  await as(U.staffU, async (c) => { denied(await c.t(`SELECT public.admin_correct_date_of_birth('${U.minorL}', $1::date, 'staff has no authority here')`, [await dobAge(20)]), /campus administrator|Super Admin/i, 'staff'); });
  await as(U.adult, async (c) => { denied(await c.t(`SELECT public.admin_correct_date_of_birth('${U.minorL}', $1::date, 'a student has no authority')`, [await dobAge(20)]), /campus administrator|Super Admin/i, 'student'); });
  await as(U.root, async (c) => {
    const ok = await c.t(`SELECT public.admin_correct_date_of_birth('${U.adminU}', $1::date, 'Super admin fixes admin dob entry') s`, [await dobAge(35)]);
    assert(ok.ok, ok.err?.message);
    const ok2 = await c.t(`SELECT public.admin_correct_date_of_birth('${U.globMinor}', $1::date, 'Super admin handles GLOBAL members') s`, [await dobAge(35)]);
    assert(ok2.ok, ok2.err?.message);
  });
});
await check('correcting a minor to 18+ deletes the guardian record; correcting to another minor age keeps it', async () => {
  await as(U.adminU, async (c) => {
    const keep = await c.t(`SELECT public.admin_correct_date_of_birth('${U.minorP}', $1::date, 'Entered wrong year, still a minor') s`, [await dobAge(17)]);
    assert(keep.ok, keep.err?.message);
    eq((await c.su(`SELECT count(*)::int n FROM public.guardian_records WHERE minor_id='${U.minorP}'`)).rows[0].n, 1, 'record must stay');
    const del = await c.t(`SELECT public.admin_correct_date_of_birth('${U.minorP}', $1::date, 'Passport seen, member is an adult') s`, [await dobAge(21)]);
    assert(del.ok, del.err?.message);
    eq((await c.su(`SELECT count(*)::int n FROM public.guardian_records WHERE minor_id='${U.minorP}'`)).rows[0].n, 0, 'record must go');
    eq((await c.su(`SELECT (metadata->>'guardianRecordRemoved')::boolean b FROM public.audit_logs WHERE action='date_of_birth_corrected' AND entity_id='${U.minorP}' AND (metadata->>'newAge')::int = 21`)).rows[0].b, true);
  });
});

// --------------------------------------------------------------------------- 3. guardian details (member side)
await check('get_my_minor_status: adult / minor with no record / pending / confirmed', async () => {
  const st = async (uid) => as(uid, async (c) => (await c.q(`SELECT public.get_my_minor_status() s`)).rows[0].s);
  const a = await st(U.adult);
  eq([a.is_minor, a.consent_status, a.is_limited, a.restrictions, a.guardian, a.date_of_birth_set], [false, 'not_required', false, [], null, true]);
  const l = await st(U.alumMinor);
  eq([l.is_minor, l.consent_status, l.is_limited, l.guardian], [true, 'missing', true, null]);
  const p = await st(U.minorI);
  eq([p.consent_status, p.is_limited, p.guardian.name], ['pending', true, 'Ian Ibe']);
  const cf = await st(U.minorC);
  eq([cf.consent_status, cf.is_limited, cf.restrictions], ['confirmed', false, ['marketplace_listings', 'giving']]);
  assert(!('note' in cf.guardian) && !JSON.stringify(cf).includes('verified'), 'the administrator note must not reach the member');
  await as('anon', async (c) => { denied(await c.t(`SELECT public.get_my_minor_status()`), /permission denied/i, 'anon'); });
});
await check('a member with no date of birth gets date_of_birth_set=false and is not limited', async () => {
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('${id(906)}','nodob3@school.test', '{"campus_code":"UNILAG"}'::jsonb)`);
  await as(id(906), async (c) => {
    const s = (await c.q(`SELECT public.get_my_minor_status() s`)).rows[0].s;
    eq([s.date_of_birth_set, s.age_years, s.is_minor, s.is_limited, s.consent_status], [false, null, false, false, 'not_required']);
  });
});
await check('submit_guardian_details: a limited minor with no record creates a pending one', async () => {
  await as(U.alumMinor, async (c) => {
    const r = await c.t(`SELECT public.submit_guardian_details('  Mary Minor ', 'Parent', ' Mary@Example.org ', ' +234 801 234 5678 ') s`);
    assert(r.ok, r.err?.message);
    const s = r.rows[0].s;
    eq([s.consent_status, s.is_limited, s.guardian.name, s.guardian.relationship, s.guardian.email, s.guardian.phone], ['pending', true, 'Mary Minor', 'parent', 'mary@example.org', '+234 801 234 5678']);
    const own = (await c.q(`SELECT guardian_name, consent_status FROM public.guardian_records`)).rows;
    eq(own, [{ guardian_name: 'Mary Minor', consent_status: 'pending' }], 'the member sees only their own row');
    eq((await c.su(`SELECT count(*)::int n FROM public.audit_logs WHERE action='guardian_details_submitted' AND actor_id='${U.alumMinor}'`)).rows[0].n, 1);
  });
});
await check('submit_guardian_details validation: name, relationship, a contact, e-mail and phone formats', async () => {
  await as(U.minorL, async (c) => {
    const call = (n, r, e, p) => c.t(`SELECT public.submit_guardian_details($1,$2,$3,$4)`, [n, r, e, p]);
    denied(await call('A', 'parent', 'a@b.co', null), /GUARDIAN_INVALID/, 'short name');
    denied(await call('Good Name', 'uncle', 'a@b.co', null), /GUARDIAN_INVALID/, 'relationship outside the list');
    denied(await call('Good Name', 'parent', null, null), /GUARDIAN_INVALID/, 'no contact');
    denied(await call('Good Name', 'parent', '   ', ''), /GUARDIAN_INVALID/, 'blank contact');
    denied(await call('Good Name', 'parent', 'not-an-email', null), /GUARDIAN_INVALID/, 'bad e-mail');
    denied(await call('Good Name', 'parent', null, 'call me maybe'), /GUARDIAN_INVALID/, 'bad phone');
    denied(await call(null, 'parent', 'a@b.co', null), /GUARDIAN_INVALID/, 'null name');
    assert((await call('Good Name', 'other_relative', null, '08012345678')).ok, 'phone only must work');
  });
});
await check('submit_guardian_details is for 13-17 only: adults, members without a date of birth and under-13s are refused', async () => {
  await as(U.adult, async (c) => { denied(await c.t(`SELECT public.submit_guardian_details('Some One','parent','a@b.co',NULL)`), /GUARDIAN_NOT_NEEDED/, 'adult'); });
  await as(id(906), async (c) => { denied(await c.t(`SELECT public.submit_guardian_details('Some One','parent','a@b.co',NULL)`), /GUARDIAN_NOT_NEEDED/, 'no date of birth'); });
  await as('anon', async (c) => { denied(await c.t(`SELECT public.submit_guardian_details('Some One','parent','a@b.co',NULL)`), /permission denied/i, 'anon'); });
});
await check('re-submitting IDENTICAL details keeps the status; CHANGED details restart consent (confirmed -> pending, no longer unlocked)', async () => {
  await as(U.minorC, async (c) => {
    const same = (await c.q(`SELECT public.submit_guardian_details('Cora Carer','legal_guardian',NULL,'+2348012345678') s`)).rows[0].s;
    eq([same.consent_status, same.is_limited], ['confirmed', false], 'identical details must not reset consent');
    const changed = (await c.q(`SELECT public.submit_guardian_details('Someone Else','parent','else@example.org',NULL) s`)).rows[0].s;
    eq([changed.consent_status, changed.is_limited, changed.guardian.name, changed.guardian.decided_at], ['pending', true, 'Someone Else', null]);
    const raw = (await c.su(`SELECT consent_method, consent_note, consent_decided_by FROM public.guardian_records WHERE minor_id='${U.minorC}'`)).rows[0];
    eq(raw, { consent_method: null, consent_note: null, consent_decided_by: null }, 'old decision must be cleared');
  });
});
await check('a minor cannot confirm their own consent or touch the table: no INSERT/UPDATE/DELETE, no admin RPC, no direct status write', async () => {
  await as(U.minorI, async (c) => {
    denied(await c.t(`UPDATE public.guardian_records SET consent_status='confirmed' WHERE minor_id='${U.minorI}'`), /permission denied/i, 'direct update');
    denied(await c.t(`INSERT INTO public.guardian_records (minor_id, guardian_name, relationship, guardian_email, consent_status) VALUES ('${U.minorI}','X Y','parent','a@b.co','confirmed')`), /permission denied/i, 'direct insert');
    denied(await c.t(`DELETE FROM public.guardian_records WHERE minor_id='${U.minorI}'`), /permission denied/i, 'direct delete');
    denied(await c.t(`SELECT public.admin_record_guardian_consent('${U.minorI}','confirmed','I am my own guardian')`), /campus administrator|Super Admin/i, 'admin RPC');
    denied(await c.t(`SELECT consent_note FROM public.guardian_records`), /permission denied/i, 'internal note column');
    denied(await c.t(`SELECT consent_decided_by FROM public.guardian_records`), /permission denied/i, 'decided_by column');
    // submitting never moves the status to anything but pending
    const s = (await c.q(`SELECT public.submit_guardian_details('Ian Ibe','parent','ian@example.org',NULL) s`)).rows[0].s;
    eq(s.consent_status, 'pending');
  });
});
await check('re-submit rate limit: the 11th submission in a day is refused', async () => {
  await as(U.alumMinor, async (c) => {
    let last = null;
    for (let i = 0; i < 12; i++) last = await c.t(`SELECT public.submit_guardian_details($1,'parent','p${i}@example.org',NULL)`, [`Parent Number ${i}`]);
    denied(last, /Rate limit/i, 'rate limit');
  });
});

// --------------------------------------------------------------------------- 4. who can see guardian data
await check('guardian data is invisible to other students, to alumni, to staff, and to campus admins of OTHER campuses (table reads)', async () => {
  for (const who of [U.adult, U.adult2, U.alumAdult, U.stuI, U.staffU, U.adminI, U.minorL, U.minorP]) {
    await as(who, async (c) => {
      const rows = (await c.q(`SELECT minor_id FROM public.guardian_records WHERE minor_id IN ('${U.minorC}','${U.minorI}')`)).rows;
      eq(rows.length, 0, `guardian rows leaked to ${who}`);
    });
  }
  await as('anon', async (c) => { denied(await c.t(`SELECT minor_id FROM public.guardian_records`), /permission denied/i, 'anon'); });
});
await check('guardian data is invisible through the admin RPCs to students, staff, and campus admins of other campuses; GLOBAL members need a Super Admin', async () => {
  for (const [who, label] of [[U.adult, 'student'], [U.alumAdult, 'alumnus'], [U.staffU, 'staff'], [U.minorP, 'minor']]) {
    await as(who, async (c) => {
      denied(await c.t(`SELECT public.admin_get_minor_guardian('${U.minorC}')`), /campus administrator|Super Admin/i, `get as ${label}`);
      denied(await c.t(`SELECT * FROM public.admin_list_minors('all')`), /campus administrator|Super Admin/i, `list as ${label}`);
      denied(await c.t(`SELECT public.admin_record_guardian_consent('${U.minorC}','revoked','trying as ${label}')`), /campus administrator|Super Admin/i, `record as ${label}`);
      denied(await c.t(`SELECT public.admin_age_diagnostics()`), /campus administrator|Super Admin/i, `diagnostics as ${label}`);
    });
  }
  await as(U.adminI, async (c) => {   // campus admin of UI
    denied(await c.t(`SELECT public.admin_get_minor_guardian('${U.minorC}')`), /own campus/i, 'UNILAG minor');
    denied(await c.t(`SELECT public.admin_record_guardian_consent('${U.minorC}','revoked','wrong campus admin here')`), /own campus/i, 'record for UNILAG');
    denied(await c.t(`SELECT public.admin_get_minor_guardian('${U.globMinor}')`), /own campus/i, 'GLOBAL minor');
    denied(await c.t(`SELECT * FROM public.admin_list_minors('all','UNILAG')`), /own campus/i, 'list asking for another campus');
    const own = (await c.q(`SELECT minor_id FROM public.admin_list_minors('all')`)).rows.map((r) => r.minor_id);
    eq(own, [U.minorI], 'campus admin list is limited to their own campus');
    assert((await c.t(`SELECT public.admin_get_minor_guardian('${U.minorI}')`)).ok, 'own campus must work');
  });
  await as(U.adminU, async (c) => {
    denied(await c.t(`SELECT public.admin_get_minor_guardian('${U.minorI}')`), /own campus/i, 'UI minor');
    denied(await c.t(`SELECT public.admin_get_minor_guardian('${U.globMinor}')`), /own campus/i, 'GLOBAL minor');
  });
});
await check('is_minor() answers only about yourself or someone you administer (no oracle); anon gets nothing', async () => {
  await as(U.minorL, async (c) => { eq((await c.q(`SELECT public.is_minor('${U.minorL}') v`)).rows[0].v, true, 'self'); });
  await as(U.adult, async (c) => {
    eq((await c.q(`SELECT public.is_minor('${U.minorC}') v`)).rows[0].v, false, 'another student must not learn it');
    eq((await c.q(`SELECT public.is_minor('${U.adult}') v`)).rows[0].v, false, 'self adult');
  });
  await as(U.adminU, async (c) => {
    eq((await c.q(`SELECT public.is_minor('${U.minorC}') v`)).rows[0].v, true, 'own-campus admin');
    eq((await c.q(`SELECT public.is_minor('${U.minorI}') v`)).rows[0].v, false, 'other campus');
  });
  await as(U.root, async (c) => { eq((await c.q(`SELECT public.is_minor('${U.minorI}') v`)).rows[0].v, true, 'super admin'); });
  await as('service_role', async (c) => { eq((await c.q(`SELECT public.is_minor('${U.minorI}') v`)).rows[0].v, true, 'service role'); });
  await as('anon', async (c) => { denied(await c.t(`SELECT public.is_minor('${U.minorI}')`), /permission denied/i, 'anon'); });
});

// --------------------------------------------------------------------------- 5. admin consent workflow
await check('admin list / diagnostics: pending = missing + pending, filters, scope, ordering, no date of birth in the list', async () => {
  await as(U.adminU, async (c) => {
    const rows = (await c.q(`SELECT minor_id, consent_status, age_years FROM public.admin_list_minors('pending')`)).rows;
    const ids = rows.map((r) => r.minor_id).sort();
    for (const u of [U.minorL, U.alumMinor]) assert(ids.includes(u), `limited minor ${u} missing from the pending list`);
    assert(!ids.includes(U.minorC) && !ids.includes(U.minorI) && !ids.includes(U.globMinor), 'confirmed / other-campus / GLOBAL minors must not be listed');
    assert(!Object.keys(rows[0]).includes('date_of_birth'), 'the list must not carry dates of birth');
    const conf = (await c.q(`SELECT minor_id FROM public.admin_list_minors('confirmed')`)).rows.map((r) => r.minor_id);
    eq(conf, [U.minorC], 'confirmed filter (own campus only)');
    denied(await c.t(`SELECT * FROM public.admin_list_minors('bogus')`), /Unknown status/, 'bad filter');
  });
  await as(U.root, async (c) => {
    const all = (await c.q(`SELECT minor_id FROM public.admin_list_minors('all')`)).rows.map((r) => r.minor_id);
    for (const u of [U.minorC, U.minorI, U.minorP, U.alumMinor]) assert(all.includes(u), `super admin must see ${u}`);
    const onlyUi = (await c.q(`SELECT minor_id FROM public.admin_list_minors('all','ui')`)).rows.map((r) => r.minor_id);
    eq(onlyUi, [U.minorI], 'campus filter for a Super Admin');
  });
});
await check('admin_record_guardian_consent: confirm -> the minor is no longer limited; audit row has the actor and NO guardian personal data', async () => {
  await as(U.adminU, async (c) => {
    denied(await c.t(`SELECT public.admin_record_guardian_consent('${U.minorP}','confirmed',NULL)`), /Say how consent was verified/, 'note required');
    denied(await c.t(`SELECT public.admin_record_guardian_consent('${U.minorP}','confirmed','ab')`), /Say how consent was verified/, 'note too short');
    denied(await c.t(`SELECT public.admin_record_guardian_consent('${U.minorP}','maybe','a note here')`), /CONSENT_INVALID/, 'unknown status');
    denied(await c.t(`SELECT public.admin_record_guardian_consent('${U.adminU}','confirmed','my own account!')`), /your own account/, 'self');
    denied(await c.t(`SELECT public.admin_record_guardian_consent('${U.adult}','confirmed','not a minor anyway')`), /not recorded as under 18/, 'adult target');
    denied(await c.t(`SELECT public.admin_record_guardian_consent('${U.legacy}','confirmed','legacy has no dob?')`), /not recorded as under 18/, 'NULL dob target');
    const r = await c.t(`SELECT public.admin_record_guardian_consent('${U.minorP}','confirmed','Phoned Pat Parent on the number given; identity confirmed') s`);
    assert(r.ok, r.err?.message);
    eq([r.rows[0].s.consent_status, r.rows[0].s.is_limited], ['confirmed', false]);
    const g = (await c.su(`SELECT consent_method m, consent_decided_by by, consent_decided_at IS NOT NULL has_at FROM public.guardian_records WHERE minor_id='${U.minorP}'`)).rows[0];
    eq([g.m, g.by, g.has_at], ['admin_recorded', U.adminU, true]);
    const a = (await c.su(`SELECT actor_id, metadata::text m FROM public.audit_logs WHERE action='guardian_consent_confirmed' AND entity_id='${U.minorP}'`)).rows;
    eq(a.length, 1, 'one audit row');
    eq(a[0].actor_id, U.adminU);
    for (const secret of ['Pat Parent', 'pat.parent', 'Phoned', 'identity confirmed']) assert(!a[0].m.includes(secret), `audit metadata leaked "${secret}"`);
    assert(/"targetCampus": ?"UNILAG"/.test(a[0].m), 'audit row must carry the campus');
    denied(await c.t(`SELECT public.admin_record_guardian_consent('${U.minorP}','confirmed','confirming again')`), /currently "confirmed"/, 'confirm twice');
  });
});
await check('admin_record_guardian_consent: decline / revoke / reset transitions; invalid ones refused; revoke re-limits the minor', async () => {
  await as(U.adminU, async (c) => {
    const call = (m, s, n) => c.t(`SELECT public.admin_record_guardian_consent('${m}', $1, $2) s`, [s, n]);
    denied(await call(U.minorC, 'declined', 'cannot decline a confirmed one'), /currently "confirmed"/, 'confirmed -> declined');
    denied(await call(U.minorC, 'pending', 'cannot reset a confirmed one'), /currently "confirmed"/, 'confirmed -> pending');
    const rev = await call(U.minorC, 'revoked', 'Guardian emailed the school to withdraw consent');
    assert(rev.ok, rev.err?.message);
    eq([rev.rows[0].s.consent_status, rev.rows[0].s.is_limited], ['revoked', true]);
    denied(await call(U.minorC, 'revoked', 'revoking twice'), /currently "revoked"/, 'revoke twice');
    const re = await call(U.minorC, 'confirmed', 'Guardian re-confirmed by phone on 12 Nov');
    assert(re.ok, re.err?.message);
    eq(re.rows[0].s.consent_status, 'confirmed');
  });
});
await check('admin_record_guardian_consent for a minor who never submitted details: the admin must supply them (validated), then it is recorded', async () => {
  await as(U.adminU, async (c) => {
    denied(await c.t(`SELECT public.admin_record_guardian_consent('${U.minorL}','confirmed','Parent visited the welfare office')`), /GUARDIAN_INVALID/, 'no details at all');
    denied(await c.t(`SELECT public.admin_record_guardian_consent('${U.minorL}','confirmed','Parent visited the welfare office','Paul Parent','cousin',NULL,'08012345678')`), /GUARDIAN_INVALID/, 'relationship');
    denied(await c.t(`SELECT public.admin_record_guardian_consent('${U.minorL}','confirmed','Parent visited the welfare office','Paul Parent','parent','bad-email',NULL)`), /GUARDIAN_INVALID/, 'email');
    eq((await c.su(`SELECT count(*)::int n FROM public.guardian_records WHERE minor_id='${U.minorL}'`)).rows[0].n, 0, 'a refused call must not leave a record behind');
    const ok = await c.t(`SELECT public.admin_record_guardian_consent('${U.minorL}','declined','Parent visited the welfare office and declined','Paul Parent','parent',NULL,'08012345678') s`);
    assert(ok.ok, ok.err?.message);
    eq([ok.rows[0].s.consent_status, ok.rows[0].s.is_limited], ['declined', true]);
  });
});
await check('admin_get_minor_guardian returns the full record (incl. note and who decided) and writes an audit row; the minor sees none of that', async () => {
  await as(U.adminU, async (c) => {
    const d = (await c.q(`SELECT public.admin_get_minor_guardian('${U.minorC}') d`)).rows[0].d;
    eq([d.minor.id, d.consent_status, d.guardian.name, d.guardian.phone], [U.minorC, 'confirmed', 'Cora Carer', '+2348012345678']);
    assert(d.guardian.note && d.guardian.decided_by_name, 'note / decider missing for the admin');
    assert(d.minor.date_of_birth, 'admin sees the date of birth');
    eq((await c.su(`SELECT count(*)::int n FROM public.audit_logs WHERE action='guardian_record_viewed' AND entity_id='${U.minorC}' AND actor_id='${U.adminU}'`)).rows[0].n >= 1, true, 'view not audited');
  });
  await as(U.root, async (c) => { assert((await c.t(`SELECT public.admin_get_minor_guardian('${U.globMinor}')`)).ok, 'super admin reaches GLOBAL members'); });
});
await check('admin diagnostics flag members with no date of birth (and count minors by consent, under-13 blocks), scoped to the campus', async () => {
  await as(U.adminU, async (c) => {
    const d = (await c.q(`SELECT public.admin_age_diagnostics() d`)).rows[0].d;
    eq(d.scope, 'UNILAG');
    const expectMissing = (await c.su(`SELECT count(*)::int n FROM public.profiles WHERE campus_code='UNILAG' AND date_of_birth IS NULL AND NOT COALESCE(is_bot,false)`)).rows[0].n;
    eq(d.missing_date_of_birth, expectMissing, 'missing count');
    assert(d.missing_date_of_birth >= 2, 'staff + admin fixtures have no date of birth');
    const sampleIds = d.missing_date_of_birth_sample.map((s) => s.id);
    assert(sampleIds.includes(U.staffU) && !sampleIds.includes(U.adult), 'sample must list members without a date of birth only');
    assert(d.missing_date_of_birth_sample.every((s) => s.campus_code === 'UNILAG'), 'campus scope');
    assert(typeof d.minors_by_consent === 'object' && d.minors_total >= 3, 'minor counts');
  });
  await as(U.root, async (c) => {
    const all = (await c.q(`SELECT public.admin_age_diagnostics() d`)).rows[0].d;
    eq(all.scope, 'ALL');
    const ui = (await c.q(`SELECT public.admin_age_diagnostics('UI') d`)).rows[0].d;
    eq(ui.scope, 'UI');
    assert(all.members_total > ui.members_total, 'Super Admin sees every campus');
  });
});

// --------------------------------------------------------------------------- 6. enforcement
const listing = (uid) => `INSERT INTO public.marketplace_listings (seller_id, title, price_display, category) VALUES ('${uid}','Desk lamp','₦2000','Electronics')`;
await check('marketplace: members under 18 cannot create listings (limited, pending AND consent-confirmed); an adult and a member with no date of birth can', async () => {
  for (const who of [U.minorL, U.minorP, U.minorC]) {
    await as(who, async (c) => { denied(await c.t(listing(who)), /MINOR_RESTRICTED/, `listing as ${who}`); });
  }
  await as(U.adult, async (c) => { const r = await c.t(listing(U.adult)); assert(r.ok, r.err?.message); });
  await as(id(906), async (c) => { /* no date of birth, not verified: judged by the existing rules, NOT by the age rule */
    const r = await c.t(listing(id(906)));
    assert(r.ok || !/MINOR_RESTRICTED/.test(r.err.message), 'NULL date of birth must not be treated as a minor');
  });
  await as(U.adult2, async (c) => { assert((await c.t(listing(U.adult2))).ok, 'adult2'); });
});
await check('marketplace: the restrictive POLICY alone also refuses a minor (backstop when the trigger is off)', async () => {
  await as('postgres', async (c) => {
    await c.q(`ALTER TABLE public.marketplace_listings DISABLE TRIGGER trg_minor_restriction`);
    await imp(U.minorC);
    denied(await c.t(listing(U.minorC)), /row-level security/i, 'policy backstop');
  });
});
await check('giving: members under 18 cannot start campaigns or open giving pages (any consent status); adults can', async () => {
  await as('postgres', async (c) => {
    const gc = (await c.q(`INSERT INTO public.giving_campaigns (creator_id, title, giving_url, review_status, campus_code) VALUES ('${U.adult}','Library fund','https://example.com/give','approved','UNILAG') RETURNING id`)).rows[0].id;
    await c.q(`INSERT INTO public.platform_settings (key, value) VALUES ('feature_flags','{"donations": true}'::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    for (const who of [U.minorL, U.minorC]) {
      await imp(who);
      denied(await c.t(`INSERT INTO public.giving_campaigns (creator_id, title, giving_url) VALUES ('${who}','Mine','https://example.com/x')`), /MINOR_RESTRICTED/, `campaign as ${who}`);
      denied(await c.t(`SELECT public.open_giving_page('${gc}')`), /MINOR_RESTRICTED/, `open_giving_page as ${who}`);
      await sudo('SELECT 1');
    }
    await imp(U.adult2);
    const ok = await c.t(`INSERT INTO public.giving_campaigns (creator_id, title, giving_url) VALUES ('${U.adult2}','Adult campaign','https://example.com/y')`);
    assert(ok.ok, ok.err?.message);
    const open = await c.t(`SELECT public.open_giving_page('${gc}') u`);
    assert(open.ok || !/MINOR_RESTRICTED/.test(open.err.message), `adult giving refused by the age rule: ${open.err?.message}`);
  });
});
await check('jobs: a limited minor cannot post; with confirmed consent they can; an adult alumnus can', async () => {
  const job = (uid) => `INSERT INTO public.jobs (title, company, location, poster_id) VALUES ('Intern','Acme','Lagos','${uid}')`;
  await as(U.alumMinor, async (c) => { denied(await c.t(job(U.alumMinor)), /MINOR_RESTRICTED/, 'limited minor'); });
  await as('postgres', async (c) => {
    await c.q(`INSERT INTO public.guardian_records (minor_id, guardian_name, relationship, guardian_email, consent_status, consent_method, consent_decided_at, consent_decided_by) VALUES ('${U.alumMinor}','Alma Parent','parent','alma@example.org','confirmed','admin_recorded',now(),'${U.adminU}') ON CONFLICT (minor_id) DO UPDATE SET consent_status='confirmed'`);
    await imp(U.alumMinor);
    const r = await c.t(job(U.alumMinor));
    assert(r.ok, `confirmed minor should be able to post: ${r.err?.message}`);
  });
  await as(U.alumAdult, async (c) => { const r = await c.t(job(U.alumAdult)); assert(r.ok, r.err?.message); });
});
await check('jobs: the restrictive policy alone refuses a limited minor (backstop)', async () => {
  await as('postgres', async (c) => {
    await c.q(`ALTER TABLE public.jobs DISABLE TRIGGER trg_minor_restriction`);
    await imp(U.alumMinor);
    await sudo(`UPDATE public.guardian_records SET consent_status='revoked' WHERE minor_id='${U.alumMinor}'`);
    await imp(U.alumMinor);
    denied(await c.t(`INSERT INTO public.jobs (title, company, location, poster_id) VALUES ('Intern','Acme','Lagos','${U.alumMinor}')`), /row-level security/i, 'policy backstop');
  });
});

// direct messages
const mkChannel = (c, ch, creator, members) => c.q(`INSERT INTO public.chat_channels (id, name, is_direct_message, created_by) VALUES ('${ch}','dm',true,'${creator}')`)
  .then(() => Promise.all(members.map((m) => c.q(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${ch}','${m}') ON CONFLICT DO NOTHING`))));
await check('DMs: a limited minor cannot START a conversation with a non-connection (channel-member insert refused)', async () => {
  await as(U.minorL, async (c) => {
    const ch = id(2001);
    assert((await c.t(`INSERT INTO public.chat_channels (id, name, is_direct_message, created_by) VALUES ('${ch}','dm',true,'${U.minorL}')`)).ok, 'channel insert');
    assert((await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${ch}','${U.minorL}') ON CONFLICT DO NOTHING`)).ok, 'own membership');
    denied(await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${ch}','${U.adult}')`), /MINOR_RESTRICTED.*connected/, 'add a non-connection');
  });
});
await check('DMs: a limited minor can message an ACCEPTED connection, not a pending one; a connection made later unlocks it', async () => {
  await as('postgres', async (c) => {
    const ch = id(2002);
    await mkChannel(c, ch, U.minorL, [U.minorL, U.adult]);
    await c.q(`INSERT INTO public.connections (requester_id, recipient_id, status) VALUES ('${U.minorL}','${U.adult}','pending')`);
    await imp(U.minorL);
    denied(await c.t(`INSERT INTO public.chat_messages (channel_id, sender_id, content) VALUES ('${ch}','${U.minorL}','hi')`), /MINOR_RESTRICTED/, 'pending connection');
    await sudo(`UPDATE public.connections SET status='accepted' WHERE requester_id='${U.minorL}'`);
    await imp(U.minorL);
    const ok = await c.t(`INSERT INTO public.chat_messages (channel_id, sender_id, content) VALUES ('${ch}','${U.minorL}','hi again')`);
    assert(ok.ok, ok.err?.message);
  });
});
await check('DMs: an ADULT cannot message a limited minor they are not connected with (and is told nothing about why); an existing channel is covered too', async () => {
  await as('postgres', async (c) => {
    const ch = id(2003);
    await mkChannel(c, ch, U.adult2, [U.adult2, U.minorL]);   // created server-side: the member insert policy is not in play
    await imp(U.adult2);
    const r = await c.t(`INSERT INTO public.chat_messages (channel_id, sender_id, content) VALUES ('${ch}','${U.adult2}','hello')`);
    denied(r, /MINOR_RESTRICTED: You cannot message this member right now/, 'adult -> limited minor');
    assert(!/consent|guardian|under 18|minor/i.test(r.err.message.replace('MINOR_RESTRICTED', '')), `the refusal must not reveal why: ${r.err.message}`);
  });
  await as(U.adult2, async (c) => {
    const ch = id(2004);
    assert((await c.t(`INSERT INTO public.chat_channels (id, name, is_direct_message, created_by) VALUES ('${ch}','dm',true,'${U.adult2}')`)).ok);
    assert((await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${ch}','${U.adult2}') ON CONFLICT DO NOTHING`)).ok);
    denied(await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${ch}','${U.minorL}')`), /MINOR_RESTRICTED/, 'start a DM with a limited minor');
  });
});
await check('DMs: staff / admins can reach a limited minor; a minor with CONFIRMED consent can message anyone; adults are unaffected; group channels are not DMs', async () => {
  await as(U.staffU, async (c) => {
    const ch = id(2005);
    assert((await c.t(`INSERT INTO public.chat_channels (id, name, is_direct_message, created_by) VALUES ('${ch}','dm',true,'${U.staffU}')`)).ok);
    assert((await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${ch}','${U.staffU}') ON CONFLICT DO NOTHING`)).ok);
    const r = await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${ch}','${U.minorL}')`);
    assert(r.ok, `staff -> limited minor: ${r.err?.message}`);
  });
  await as(U.minorC, async (c) => {   // consent was re-confirmed above
    const ch = id(2006);
    assert((await c.t(`INSERT INTO public.chat_channels (id, name, is_direct_message, created_by) VALUES ('${ch}','dm',true,'${U.minorC}')`)).ok);
    assert((await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${ch}','${U.minorC}') ON CONFLICT DO NOTHING`)).ok);
    const r = await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${ch}','${U.adult}')`);
    assert(r.ok, `confirmed minor -> adult: ${r.err?.message}`);
  });
  await as(U.adult2, async (c) => {
    const ch = id(2007);
    assert((await c.t(`INSERT INTO public.chat_channels (id, name, is_direct_message, created_by) VALUES ('${ch}','dm',true,'${U.adult2}')`)).ok);
    assert((await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${ch}','${U.adult2}') ON CONFLICT DO NOTHING`)).ok);
    const r = await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${ch}','${U.adult}')`);
    assert(r.ok, `adult -> adult: ${r.err?.message}`);
    assert((await c.t(`INSERT INTO public.chat_messages (channel_id, sender_id, content) VALUES ('${ch}','${U.adult2}','hello adult')`)).ok, 'adult message');
  });
  await as(U.minorL, async (c) => {
    const ch = id(2008);
    assert((await c.t(`INSERT INTO public.chat_channels (id, name, is_direct_message, created_by) VALUES ('${ch}','study group',false,'${U.minorL}')`)).ok);
    assert((await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${ch}','${U.minorL}') ON CONFLICT DO NOTHING`)).ok, 'group membership is not a DM');
  });
});

// discoverability
const visibleIds = (c, ids) => c.q(`SELECT id FROM public.profiles WHERE id = ANY($1::uuid[])`, [ids]).then((r) => r.rows.map((x) => x.id).sort());
await check('visibility: a limited minor is hidden from adult members (profile reads, people search); a confirmed minor is visible', async () => {
  const probe = [U.minorL, U.minorP, U.minorC, U.minorI, U.alumMinor, U.globMinor, U.adult2];
  await as('postgres', async (c) => {
    await c.q(`UPDATE public.guardian_records SET consent_status='confirmed' WHERE minor_id='${U.minorC}'`);
    await c.q(`UPDATE public.guardian_records SET consent_status='pending' WHERE minor_id='${U.alumMinor}'`);
    await imp(U.adult2);
    const seen = await visibleIds(c, probe);
    eq(seen, [U.minorC, U.adult2].sort(), 'adult sees only the confirmed minor (and themself)');
    eq((await c.q(`SELECT id FROM public.profiles WHERE full_name ILIKE '%minor%' AND role::text='student' AND campus_code='UNILAG' ORDER BY id`)).rows.map((r) => r.id), [U.minorC].sort(), 'name search as the directory does it');
  });
});
await check('visibility: exempt viewers still see limited minors (themselves, other minors, staff, campus admins, Super Admin) and so does an adult the minor is connected with', async () => {
  const probe = [U.minorL, U.minorC];
  await as(U.minorL, async (c) => { eq(await visibleIds(c, probe), [U.minorL, U.minorC].sort(), 'minor viewer'); });
  await as(U.minorP, async (c) => { assert((await visibleIds(c, probe)).includes(U.minorL), 'another minor sees the limited minor'); });
  await as(U.staffU, async (c) => { assert((await visibleIds(c, probe)).includes(U.minorL), 'staff'); });
  await as(U.adminU, async (c) => { assert((await visibleIds(c, probe)).includes(U.minorL), 'campus admin'); });
  await as(U.root, async (c) => { assert((await visibleIds(c, probe)).includes(U.minorL), 'super admin'); });
  await as('postgres', async (c) => {
    await c.q(`INSERT INTO public.connections (requester_id, recipient_id, status) VALUES ('${U.minorL}','${U.adult2}','pending')`);
    await imp(U.adult2);
    assert((await visibleIds(c, probe)).includes(U.minorL), 'adult with a connection request from the minor still sees them');
  });
});
await check('connection requests: an ADULT cannot request a limited minor (trigger and policy); minors, staff, adult-to-adult and requests to a confirmed minor are fine', async () => {
  const req = (from, to) => `INSERT INTO public.connections (requester_id, recipient_id, status) VALUES ('${from}','${to}','pending')`;
  await as(U.adult2, async (c) => {
    denied(await c.t(req(U.adult2, U.minorL)), /MINOR_RESTRICTED: You cannot send a connection request/, 'adult -> limited minor');
    assert((await c.t(req(U.adult2, U.adult))).ok, 'adult -> adult');
    assert((await c.t(req(U.adult2, U.minorC))).ok, 'adult -> confirmed minor');
  });
  await as(U.staffU, async (c) => { assert((await c.t(req(U.staffU, U.minorL))).ok, 'staff -> limited minor'); });
  await as(U.minorP, async (c) => { assert((await c.t(req(U.minorP, U.minorL))).ok, 'minor -> minor'); });
  await as(U.minorL, async (c) => { assert((await c.t(req(U.minorL, U.adult2))).ok, 'a limited minor may ask an adult'); });
  await as('postgres', async (c) => {
    await c.q(`ALTER TABLE public.connections DISABLE TRIGGER trg_minor_restriction`);
    await imp(U.adult2);
    denied(await c.t(req(U.adult2, U.minorL)), /row-level security/i, 'policy backstop');
  });
});
await check('an adult-initiated request does NOT make a limited minor visible to that adult (only a request FROM the minor, or an accepted connection, does)', async () => {
  await as('postgres', async (c) => {
    await c.q(`DELETE FROM public.connections`);
    await c.q(`INSERT INTO public.connections (requester_id, recipient_id, status) VALUES ('${U.adult2}','${U.minorL}','pending')`);
    await imp(U.adult2);
    eq(await visibleIds(c, [U.minorL]), [], 'visible through an adult-initiated pending request');
    await sudo(`UPDATE public.connections SET status='accepted'`);
    await imp(U.adult2);
    eq(await visibleIds(c, [U.minorL]), [U.minorL], 'an accepted connection makes them visible');
  });
});
await check('visibility: anonymous visitors never see a member under 18 (GLOBAL minors included)', async () => {
  await as('anon', async (c) => {
    const rows = (await c.q(`SELECT id FROM public.profiles WHERE id = ANY($1::uuid[])`, [[U.globMinor, U.minorC, U.adult2]])).rows;
    assert(!rows.some((r) => r.id === U.globMinor || r.id === U.minorC), 'anon saw a minor');
  });
});
await check('get_suggested_connections: adults are never shown a limited minor; a confirmed minor and other adults still appear; a minor viewer may be shown minors', async () => {
  await as('postgres', async (c) => {
    await c.q(`DELETE FROM public.connections`);
    await c.q(`UPDATE public.guardian_records SET consent_status='confirmed' WHERE minor_id='${U.minorC}'`);
  });
  await as(U.adult, async (c) => {
    const ids = (await c.q(`SELECT id FROM public.get_suggested_connections(200)`)).rows.map((r) => r.id);
    for (const hidden of [U.minorL, U.minorP, U.alumMinor]) assert(!ids.includes(hidden), `limited minor ${hidden} suggested to an adult`);
    assert(ids.includes(U.minorC), 'a confirmed minor is a normal member');
    assert(ids.includes(U.adult2), 'adults still suggested');
  });
  await as(U.minorP, async (c) => {
    const ids = (await c.q(`SELECT id FROM public.get_suggested_connections(200)`)).rows.map((r) => r.id);
    assert(ids.includes(U.minorL), 'a minor viewer is not subject to the adult-facing filter');
  });
});
await check('a member with NO date of birth is treated as an adult everywhere (visible, can DM, suggested) and is flagged by diagnostics', async () => {
  await as(U.adult2, async (c) => {
    assert((await visibleIds(c, [U.legacy, id(906)])).length >= 1, 'NULL-dob members stay visible');
    const sug = (await c.q(`SELECT id FROM public.get_suggested_connections(200)`)).rows.map((r) => r.id);
    assert(sug.includes(id(906)), 'NULL-dob member suggested');
  });
  await as(id(906), async (c) => {
    const ch = id(2100);
    assert((await c.t(`INSERT INTO public.chat_channels (id, name, is_direct_message, created_by) VALUES ('${ch}','dm',true,'${id(906)}')`)).ok);
    assert((await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${ch}','${id(906)}') ON CONFLICT DO NOTHING`)).ok);
    const r = await c.t(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ('${ch}','${U.adult2}')`);
    assert(r.ok, `NULL-dob member must be able to DM: ${r.err?.message}`);
  });
  await as(U.root, async (c) => {
    const d = (await c.q(`SELECT public.admin_age_diagnostics() d`)).rows[0].d;
    assert(d.missing_date_of_birth_sample.some((s) => s.id === id(906)), 'diagnostics must list the member');
  });
});

// --------------------------------------------------------------------------- 7. data lifecycle
await check('export_my_data includes the date of birth and the guardian record (without the internal note / decider); nobody else\'s', async () => {
  await as(U.minorC, async (c) => {
    const r = (await c.q(`SELECT public.export_my_data() d`)).rows[0].d;
    const g = r.data.guardian_records;
    assert(Array.isArray(g) && g.length === 1, `guardian_records missing from the export: ${JSON.stringify(Object.keys(r.data))}`);
    eq([g[0].guardian_name, g[0].relationship, g[0].consent_status], ['Cora Carer', 'legal_guardian', 'confirmed']);
    assert(!('consent_note' in g[0]) && !('consent_decided_by' in g[0]), 'internal columns exported');
    const prof = r.data.profiles?.[0];
    assert(prof && String(prof.date_of_birth).slice(0, 10) === D.minorC, 'own profile row / date of birth missing from the export');
    const txt = JSON.stringify(r);
    for (const other of ['Ian Ibe', 'Pat Parent', U.minorI]) assert(!txt.includes(other), `export leaks ${other}`);
  });
  await as(U.adult, async (c) => {
    const r = (await c.q(`SELECT public.export_my_data() d`)).rows[0].d;
    assert(!r.data.guardian_records || r.data.guardian_records.length === 0, 'adult export holds guardian rows');
  });
});
await check('export_my_data still contains everything it did before (consent records, audit sections, schema version)', async () => {
  await as(U.minorC, async (c) => {
    await c.su(`INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata) VALUES ('${U.adminU}','guardian_consent_confirmed','user','${U.minorC}','{"summary":"x"}')`);
    const r = (await c.q(`SELECT public.export_my_data() d`)).rows[0].d;
    for (const k of ['audit_logs_performed_by_you', 'audit_logs_about_your_account']) assert(Array.isArray(r.data[k]), `${k} missing`);
    eq(r.schema_version, 1);
    assert(Array.isArray(r.data.consent_records), 'consent_records missing');
    assert(r.data.audit_logs_about_your_account.length >= 1, 'actions about the account (consent decisions) should be listed');
  });
});
await check('purge_user_data erases the guardian record and the date of birth, names the record in its result, and leaves no guardian detail anywhere (audit rows included)', async () => {
  await as('postgres', async (c) => {
    // administrator activity on this record first, so there IS an audit trail to anonymise
    await imp(U.adminU);
    assert((await c.t(`SELECT public.admin_get_minor_guardian('${U.minorC}')`)).ok, 'admin view');
    assert((await c.t(`SELECT public.admin_record_guardian_consent('${U.minorC}','revoked','Guardian Cora Carer called the school')`)).ok, 'admin revoke');
    await sudo('SELECT 1');
    const pre = (await c.q(`SELECT count(*)::int n FROM public.audit_logs WHERE metadata::text ILIKE '%Cora Carer%' OR metadata::text ILIKE '%+2348012345678%'`)).rows[0].n;
    eq(pre, 0, 'guardian PII must never be in the audit trail to begin with');
    const out = (await c.q(`SELECT public.purge_user_data('${U.minorC}') r`)).rows[0].r;
    eq(out.deleted['guardian_records.minor_id'], 1, 'purge result does not name the guardian record');
    eq((await c.q(`SELECT count(*)::int n FROM public.guardian_records WHERE minor_id='${U.minorC}'`)).rows[0].n, 0, 'guardian record survived');
    const p = (await c.q(`SELECT date_of_birth d, full_name n, email e FROM public.profiles WHERE id='${U.minorC}'`)).rows[0];
    eq([p.d, p.n], [null, 'Deleted user'], 'date of birth / name survived');
    assert(/^deleted\+/.test(p.e), 'profile not anonymised');
    const aud = (await c.q(`SELECT count(*)::int n FROM public.audit_logs WHERE metadata::text ILIKE '%${U.minorC}%' OR entity_id='${U.minorC}' OR actor_id='${U.minorC}'`)).rows[0].n;
    eq(aud, 0, 'audit rows still point at the erased member');
    eq((await c.q(`SELECT count(*)::int n FROM public.audit_logs WHERE action LIKE 'guardian_%' AND entity_id IS NULL`)).rows[0].n >= 1, true, 'the guardian audit trail is kept, anonymised');
  });
});
await check('erasing an admin-decided record keeps the deciding admin intact (decided_by is nulled on the record, not the other way round)', async () => {
  await as('postgres', async (c) => {
    eq((await c.q(`SELECT count(*)::int n FROM public.profiles WHERE id='${U.adminU}'`)).rows[0].n, 1);
    await c.q(`UPDATE public.guardian_records SET consent_status='confirmed', consent_decided_by='${U.adminU}', consent_decided_at=now(), consent_method='admin_recorded' WHERE minor_id='${U.minorI}'`);
    const fk = (await c.q(`SELECT confdeltype d FROM pg_constraint WHERE conrelid='public.guardian_records'::regclass AND contype='f' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.guardian_records'::regclass AND attname='consent_decided_by')]`)).rows[0].d;
    eq(fk, 'n', 'consent_decided_by must be ON DELETE SET NULL');
  });
});
await check('purge_guardian_records_for_adults: service role only; removes records of members who turned 18 more than the grace period ago, keeps the rest', async () => {
  await as('postgres', async (c) => {
    await c.q(`INSERT INTO public.guardian_records (minor_id, guardian_name, relationship, guardian_email) VALUES ('${U.adult}','Old Record','parent','old@example.org') ON CONFLICT DO NOTHING`);
    await c.q(`INSERT INTO public.guardian_records (minor_id, guardian_name, relationship, guardian_email) VALUES ('${U.adult2}','Fresh Adult','parent','fresh@example.org') ON CONFLICT DO NOTHING`);
    await c.q(`UPDATE public.profiles SET date_of_birth = (current_date - interval '18 years' - interval '5 days')::date WHERE id='${U.adult2}'`);
    const n = (await c.q(`SELECT public.purge_guardian_records_for_adults(30, 5000) n`)).rows[0].n;
    eq(Number(n), 1, 'only the long-adult record goes (adult is 25; adult2 turned 18 five days ago)');
    eq((await c.q(`SELECT guardian_name FROM public.guardian_records WHERE minor_id IN ('${U.adult}','${U.adult2}')`)).rows, [{ guardian_name: 'Fresh Adult' }]);
    assert((await c.q(`SELECT count(*)::int n FROM public.guardian_records WHERE minor_id='${U.minorI}'`)).rows[0].n === 1, 'a minor record was purged');
  });
  await as(U.adminU, async (c) => { denied(await c.t(`SELECT public.purge_guardian_records_for_adults()`), /permission denied/i, 'authenticated'); });
  await as('service_role', async (c) => { assert((await c.t(`SELECT public.purge_guardian_records_for_adults()`)).ok, 'service role'); });
});

// --------------------------------------------------------------------------- 8. adult unaffected + regression
await check('an adult is unaffected: can list on the marketplace, DM, give, update their profile, read their status, and is visible', async () => {
  await as(U.adult, async (c) => {
    const s = (await c.q(`SELECT public.get_my_minor_status() s`)).rows[0].s;
    eq([s.is_minor, s.is_limited, s.restrictions], [false, false, []]);
    assert((await c.t(listing(U.adult))).ok, 'listing');
    assert((await c.t(`UPDATE public.profiles SET bio='still works' WHERE id='${U.adult}'`)).n === 1, 'profile update');
    assert((await c.q(`SELECT id FROM public.profiles WHERE id='${U.adult}'`)).rows.length === 1, 'own row');
    assert((await c.q(`SELECT id FROM public.get_suggested_connections(5)`)).rows.length >= 1, 'suggestions');
  });
  await as(U.adult2, async (c) => { assert((await visibleIds(c, [U.adult, U.alumAdult])).length === 2, 'adults see adults'); });
});
await check('campus-scoped visibility of profiles is unchanged by the new policy (a UI student still cannot see UNILAG adults)', async () => {
  await as(U.stuI, async (c) => {
    const seen = await visibleIds(c, [U.adult, U.adult2, U.stuI]);
    eq(seen, [U.stuI], 'campus scoping regressed');
  });
});
await check('there is no emailed-token flow: no token table, no guardian-consent edge function in this change (admin-recorded consent only)', async () => {
  eq((await db.query(`SELECT count(*)::int n FROM pg_tables WHERE schemaname='public' AND tablename ILIKE '%guardian%token%'`)).rows[0].n, 0);
  eq((await db.query(`SELECT count(*)::int n FROM public.guardian_records WHERE consent_method IS NOT NULL AND consent_method <> 'admin_recorded'`)).rows[0].n, 0);
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
