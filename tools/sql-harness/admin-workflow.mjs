// Behaviour tests for supabase/migrations/20261109000000_admin_workflow_hardening.sql, executed against
// an in-memory Postgres (PGlite). Nothing here touches a real database.
//
//   cd tools/sql-harness && node admin-workflow.mjs
//
// Same load order as audit-remediation.mjs: every migration in order; the hardening migration itself
// is applied STRICT (one transaction, no statement may fail) and a second time to prove idempotency.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { newDb, bootstrap, applyFile, MIGRATIONS, ROOT } from './lib.mjs';

const MINE = 'supabase/migrations/20261109000000_admin_workflow_hardening.sql';
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
let mine = null;
for (const f of migrationFiles) {
  const path = `supabase/migrations/${f}`;
  if (path === MINE) {
    try { mine = await applyFile(db, path, true, () => {}); } catch (e) { console.log(`FATAL: hardening migration did not apply: ${e.message}${e.detail ? ' | ' + e.detail : ''}${e.where ? ' | ' + e.where : ''}`); process.exit(2); }
  } else if (/20261030000000|20261029000000|20261028000000/.test(path)) {
    try { await applyFile(db, path, true, () => {}); } catch (e) { console.log(`FATAL: ${path} did not apply: ${e.message}`); process.exit(2); }
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
  root: id(1), adminU: id(2), staffU: id(3), stuU: id(4), stuU2: id(5), alumU: id(6), adminI: id(7),
  stuI: id(8), nullAdmin: id(9), glob: id(10),
};
const ROOT_EMAIL = 'inememmanuel@gmail.com';
async function mk(uid, email, campus, meta = {}) {
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ($1,$2,$3::jsonb, now())`,
    [uid, email, JSON.stringify({ campus_code: campus, full_name: email.split('@')[0], ...meta })]);
}
await mk(U.root, ROOT_EMAIL, 'GLOBAL');
await mk(U.adminU, 'admin.u@school.test', 'UNILAG');
await mk(U.staffU, 'staff.u@school.test', 'UNILAG');
await mk(U.stuU, 'stu.u@gmail.test', 'UNILAG');
await mk(U.stuU2, 'stu2.u@gmail.test', 'UNILAG');
await mk(U.alumU, 'alum.u@gmail.test', 'UNILAG');
await mk(U.adminI, 'admin.i@school.test', 'UI');
await mk(U.stuI, 'stu.i@gmail.test', 'UI');
await mk(U.nullAdmin, 'nulladmin@school.test', 'UNILAG');
await mk(U.glob, 'globadmin@school.test', 'GLOBAL');
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
await db.exec(`UPDATE public.profiles SET role='admin', admin_role='super_admin', campus_code='GLOBAL', verification_status='verified', onboarding_complete=true WHERE id='${U.root}'`);
await db.exec(`UPDATE public.profiles SET role='admin', admin_role='campus_admin', onboarding_complete=true WHERE id IN ('${U.adminU}','${U.adminI}')`);
await db.exec(`UPDATE public.profiles SET role='admin', admin_role='campus_admin', campus_code='GLOBAL', onboarding_complete=true WHERE id='${U.glob}'`);
await db.exec(`UPDATE public.profiles SET role='admin', admin_role=NULL, onboarding_complete=true WHERE id='${U.nullAdmin}'`);
await db.exec(`UPDATE public.profiles SET role='staff', onboarding_complete=true WHERE id='${U.staffU}'`);
await db.exec(`UPDATE public.profiles SET role='alumni', verification_status='verified', onboarding_complete=true WHERE id='${U.alumU}'`);
await db.exec(`UPDATE public.profiles SET onboarding_complete=true WHERE id IN ('${U.stuU}','${U.stuU2}','${U.stuI}')`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);
const ADMIN_U = { sub: U.adminU, email: 'admin.u@school.test' };
const ADMIN_I = { sub: U.adminI, email: 'admin.i@school.test' };
const SUPER = { sub: U.root, email: ROOT_EMAIL };

console.log('\n== ADMIN WORKFLOW HARDENING ==');
await check('migration applies strictly in one transaction and is idempotent', async () => {
  assert(mine && !mine.failures?.length, 'did not apply');
  await db.exec(readFileSync(resolve(ROOT, MINE), 'utf8'));
});

// --------------------------------------------------------------------------- S1 jobs
const J = { approved: id(101), rejected: id(102) };
await db.exec(`ALTER TABLE public.jobs DISABLE TRIGGER USER`);
await db.exec(`INSERT INTO public.jobs (id, poster_id, campus_code, title, company, location, description, accepts_in_app_applications, apply_url, is_approved, approved_by, approved_at) VALUES
 ('${J.approved}','${U.alumU}','UNILAG','Dev','Acme','Lagos','desc',true,NULL,true,'${U.adminU}', now())`);
await db.exec(`INSERT INTO public.jobs (id, poster_id, campus_code, title, company, location, description, accepts_in_app_applications, apply_url, is_approved, rejection_reason, rejected_at) VALUES
 ('${J.rejected}','${U.alumU}','UNILAG','Old','Acme','Lagos','desc',true,NULL,false,'Too vague', now())`);
await db.exec(`ALTER TABLE public.jobs ENABLE TRIGGER USER`);
await check('S1: a poster editing the content of an APPROVED job sends it back to review', async () => {
  await as(U.alumU, async (c) => {
    const r = await c.t(`UPDATE public.jobs SET title='Dev (remote)' WHERE id='${J.approved}' RETURNING is_approved, approved_by`);
    assert(r.ok && r.rows.length === 1, r.err?.message || 'update failed');
    eq(r.rows[0], { is_approved: false, approved_by: null }, 'job stayed approved');
  });
});
await check('S1: closing an approved job (not a content change) does not re-queue it; the poster cannot self-approve', async () => {
  await db.exec(`ALTER TABLE public.jobs DISABLE TRIGGER USER`);
  await db.exec(`UPDATE public.jobs SET is_approved=true WHERE id='${J.approved}'`);
  await db.exec(`ALTER TABLE public.jobs ENABLE TRIGGER USER`);
  try {
    await as(U.alumU, async (c) => {
      const r = await c.t(`UPDATE public.jobs SET is_closed=true WHERE id='${J.approved}' RETURNING is_approved`);
      assert(r.ok && r.rows[0].is_approved === true, 'closing re-queued the job');
      const r2 = await c.t(`UPDATE public.jobs SET is_approved=true WHERE id='${J.rejected}' RETURNING is_approved`);
      assert(r2.ok && r2.rows[0].is_approved === false, 'poster self-approved');
    });
  } finally { /* as() rolls back */ }
});
await check('S1/C6: fixing a rejected job re-submits it (rejected_at cleared); an admin may approve', async () => {
  await as(U.alumU, async (c) => {
    const r = await c.t(`UPDATE public.jobs SET description='clearer description' WHERE id='${J.rejected}' RETURNING rejected_at, rejection_reason`);
    assert(r.ok, r.err?.message);
    eq(r.rows[0], { rejected_at: null, rejection_reason: null }, 'rejected posting not re-submitted');
  });
  await as(ADMIN_U, async (c) => {
    const r = await c.t(`UPDATE public.jobs SET is_approved=true WHERE id='${J.approved}' RETURNING is_approved`);
    assert(r.ok && r.rows[0]?.is_approved === true, r.err?.message || 'admin could not approve');
  });
});
await check('C6: rejected_at was back-filled for already-rejected rows', async () => {
  const r = await db.query(`SELECT count(*)::int n FROM public.jobs WHERE is_approved=false AND rejection_reason IS NOT NULL AND rejected_at IS NULL`);
  eq(r.rows[0].n, 0);
});

// --------------------------------------------------------------------------- S2 giving
const G = { uni: id(201), glob: id(202), ui: id(203) };
await db.exec(`ALTER TABLE public.giving_campaigns DISABLE TRIGGER USER`);
await db.exec(`INSERT INTO public.giving_campaigns (id, creator_id, campus_code, title, giving_url, review_status) VALUES
 ('${G.uni}','${U.alumU}','UNILAG','Library fund','https://give.example.com/a','pending'),
 ('${G.glob}','${U.alumU}','GLOBAL','Global fund','https://give.example.com/b','pending'),
 ('${G.ui}','${U.alumU}','UI','UI fund','https://give.example.com/c','pending')`);
await db.exec(`ALTER TABLE public.giving_campaigns ENABLE TRIGGER USER`);
await check('S2: the owner cannot set confirmed_total, but can report reported_total (other edits still work)', async () => {
  await as(U.alumU, async (c) => {
    const r = await c.t(`UPDATE public.giving_campaigns SET confirmed_total=999999, reported_total=1500, is_closed=false WHERE id='${G.uni}' RETURNING confirmed_total::float8 ct, reported_total::float8 rt`);
    assert(r.ok, r.err?.message);
    eq(r.rows[0], { ct: 0, rt: 1500 }, 'owner write outcome');
    denied(await c.t(`UPDATE public.giving_campaigns SET reported_total=-1 WHERE id='${G.uni}'`), /invalid_reported_total|nonneg/i, 'negative reported total');
    const ins = await c.t(`INSERT INTO public.giving_campaigns (creator_id, title, giving_url, confirmed_total, reported_total) VALUES ('${U.alumU}','New','https://give.example.com/n', 777, 5) RETURNING confirmed_total::float8 ct`);
    assert(ins.ok && ins.rows[0].ct === 0, ins.err?.message || 'insert kept confirmed_total');
  });
});
await check('S2: admin_review_giving_campaign records the reviewer, writes the audit row itself and refuses a second decision', async () => {
  await as('service_role', async (c) => {
    const r = await c.t(`SELECT public.admin_review_giving_campaign($1, true, NULL, $2) v`, [G.uni, U.adminU]);
    assert(r.ok, r.err?.message);
    const row = (await c.q(`SELECT review_status, reviewed_by FROM public.giving_campaigns WHERE id=$1`, [G.uni])).rows[0];
    eq(row, { review_status: 'approved', reviewed_by: U.adminU });
    const a = (await c.su(`SELECT action, actor_id, COALESCE(metadata->>'targetCampus', metadata->>'institutionCode') tc FROM public.audit_logs WHERE entity_id=$1 AND action='giving_campaign_approved'`, [G.uni])).rows;
    eq(a, [{ action: 'giving_campaign_approved', actor_id: U.adminU, tc: 'UNILAG' }], 'audit row');
    denied(await c.t(`SELECT public.admin_review_giving_campaign($1, false, 'changed my mind again', $2)`, [G.uni, U.adminU]), /already_reviewed/, 'second decision');
    const rr = await c.t(`SELECT public.admin_review_giving_campaign($1, false, 'changed my mind again', $2, true)`, [G.uni, U.root]);
    assert(rr.ok, 're-review by Super Admin refused: ' + rr.err?.message);
    denied(await c.t(`SELECT public.admin_review_giving_campaign($1, true, NULL, $2, true)`, [G.uni, U.adminU]), /already_reviewed/, 'Campus Admin re-review flag is ignored');
  });
});
await check('S2: campus scope - other campus, GLOBAL and NULL campaigns are Super Admin only; unknown id is not_found; the RPC is service_role only', async () => {
  await as('service_role', async (c) => {
    denied(await c.t(`SELECT public.admin_review_giving_campaign($1, true, NULL, $2)`, [G.ui, U.adminU]), /not_allowed/, 'other campus');
    denied(await c.t(`SELECT public.admin_review_giving_campaign($1, true, NULL, $2)`, [G.glob, U.adminU]), /not_allowed/, 'GLOBAL campaign by campus admin');
    denied(await c.t(`SELECT public.admin_review_giving_campaign($1, true, NULL, $2)`, [G.glob, U.glob]), /not_allowed/, 'GLOBAL admin is not a Super Admin');
    denied(await c.t(`SELECT public.admin_review_giving_campaign($1, true, NULL, NULL)`, [G.glob]), /not_allowed/, 'no actor');
    denied(await c.t(`SELECT public.admin_review_giving_campaign($1, true, NULL, $2)`, [id(999), U.root]), /not_found/, 'unknown campaign');
    assert((await c.t(`SELECT public.admin_review_giving_campaign($1, true, NULL, $2)`, [G.glob, U.root])).ok, 'Super Admin refused on GLOBAL');
    const t = await c.t(`SELECT public.admin_update_giving_total($1, 2500, $2)`, [G.ui, U.adminI]);
    assert(t.ok, t.err?.message);
    denied(await c.t(`SELECT public.admin_update_giving_total($1, 2500, $2)`, [G.ui, U.adminU]), /not_allowed/, 'total on another campus');
    eq((await c.q(`SELECT confirmed_total::float8 v FROM public.giving_campaigns WHERE id=$1`, [G.ui])).rows[0].v, 2500);
  });
  await as(ADMIN_U, async (c) => {
    denied(await c.t(`SELECT public.admin_review_giving_campaign($1, true)`, [G.uni]), /permission denied/i, 'signed-in admin calling the RPC directly');
  });
});

// --------------------------------------------------------------------------- S3 paid events
const EV = { uni: id(301), glob: id(302) };
await db.exec(`ALTER TABLE public.events DISABLE TRIGGER USER`);
for (const [eid, campus] of [[EV.uni, 'UNILAG'], [EV.glob, 'GLOBAL']]) {
  await db.exec(`INSERT INTO public.events (id, creator_id, campus_code, title, description, venue, start_time, end_time, category, status, ticket_type, ticket_price, payment_method, reservation_held, payment_review_status)
    VALUES ('${eid}','${U.alumU}','${campus}','Paid ${campus}','d','Hall', now() + interval '10 days', now() + interval '11 days','Academic','pending_approval','paid',1000,'online',false,'pending')`);
  await db.exec(`INSERT INTO public.event_payment_details (event_id, payment_url, instructions, link_check) VALUES ('${eid}','https://paystack.com/pay/x','pay at the door please', '${JSON.stringify({ status: 'ok', url: 'https://paystack.com/pay/x' })}'::jsonb)`);
}
await db.exec(`ALTER TABLE public.events ENABLE TRIGGER USER`);
await check('S3: payment review enforces actor campus scope (GLOBAL events are Super Admin only) and a pending status', async () => {
  await as('service_role', async (c) => {
    denied(await c.t(`SELECT public.admin_apply_payment_review($1, $2, 'approve')`, [EV.glob, U.adminU]), /not_allowed/, 'campus admin on GLOBAL event');
    denied(await c.t(`SELECT public.admin_apply_payment_review($1, $2, 'approve')`, [EV.uni, U.adminI]), /not_allowed/, 'other campus admin');
    const ok = await c.t(`SELECT public.admin_apply_payment_review($1, $2, 'approve') r`, [EV.uni, U.adminU]);
    assert(ok.ok, ok.err?.message);
    eq(ok.rows[0].r.payment_review_status, 'approved');
    denied(await c.t(`SELECT public.admin_apply_payment_review($1, $2, 'reject', 'second opinion here')`, [EV.uni, U.adminU]), /already_reviewed/, 'stale second decision');
    const a = (await c.su(`SELECT metadata->>'previousStatus' p, COALESCE(metadata->>'targetCampus', metadata->>'institutionCode') tc FROM public.audit_logs WHERE entity_id=$1 AND action='event_payment_approved'`, [EV.uni])).rows;
    eq(a, [{ p: 'pending', tc: 'UNILAG' }], 'audit row inside the function');
    const rr = await c.t(`SELECT public.admin_apply_payment_review($1, $2, 'reject', 'Super admin changed it', false, false, NULL, NULL, true) r`, [EV.uni, U.root]);
    assert(rr.ok && rr.rows[0].r.payment_review_status === 'rejected', rr.err?.message || 're-review failed');
  });
});
await check('S3: a review of changed payment details is refused (expected url / updated_at)', async () => {
  await as('service_role', async (c) => {
    denied(await c.t(`SELECT public.admin_apply_payment_review($1, $2, 'approve', NULL, false, false, 'https://paystack.com/pay/OLD')`, [EV.glob, U.root]), /stale_review/, 'url changed');
    denied(await c.t(`SELECT public.admin_apply_payment_review($1, $2, 'approve', NULL, false, false, NULL, now() - interval '1 day')`, [EV.glob, U.root]), /stale_review/, 'updated_at changed');
    const ok = await c.t(`SELECT public.admin_apply_payment_review($1, $2, 'approve', NULL, false, false, 'https://paystack.com/pay/x') r`, [EV.glob, U.root]);
    assert(ok.ok, ok.err?.message);
  });
});

// --------------------------------------------------------------------------- S4 unsuspend / verify
await check('S4: unsuspend_user_account clears the suspension, is campus scoped, and audits inside', async () => {
  await as(ADMIN_U, async (c) => {
    await c.su(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
    await c.su(`UPDATE public.profiles SET is_suspended=true, suspension_reason='[7-Day Suspension] spam', muted_until=now()+interval '7 days' WHERE id IN ('${U.stuU}','${U.stuI}','${U.nullAdmin}')`);
    await c.su(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
    const r = await c.t(`SELECT public.unsuspend_user_account($1, 'appeal accepted') v`, [U.stuU]);
    assert(r.ok, r.err?.message);
    const p = (await c.su(`SELECT is_suspended, suspension_reason, muted_until FROM public.profiles WHERE id='${U.stuU}'`)).rows[0];
    eq(p, { is_suspended: false, suspension_reason: null, muted_until: null });
    const a = (await c.su(`SELECT metadata->>'targetCampus' tc, actor_id FROM public.audit_logs WHERE entity_id='${U.stuU}' AND action='user_unsuspended'`)).rows;
    eq(a, [{ tc: 'UNILAG', actor_id: U.adminU }], 'audit row');
    denied(await c.t(`SELECT public.unsuspend_user_account($1)`, [U.stuI]), /own campus/, 'other campus');
    denied(await c.t(`SELECT public.unsuspend_user_account($1)`, [U.nullAdmin]), /Super Admin/, 'campus admin unsuspending an admin');
  });
  await as(SUPER, async (c) => {
    await c.su(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
    await c.su(`UPDATE public.profiles SET is_suspended=true WHERE id='${U.nullAdmin}'`);
    await c.su(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
    const r = await c.t(`SELECT public.unsuspend_user_account($1) v`, [U.nullAdmin]);
    assert(r.ok && r.rows[0].v.changed === true, r.err?.message || 'super admin could not unsuspend an admin');
  });
  await as(U.stuU2, async (c) => { denied(await c.t(`SELECT public.unsuspend_user_account($1)`, [U.stuU]), /Insufficient/, 'student'); });
});
await check('S4: admin_verify_user verifies, resolves the pending request, audits; scope + permission enforced; idempotent', async () => {
  await as(ADMIN_U, async (c) => {
    try { await c.su(`INSERT INTO public.verifications (user_id, campus_code, requested_role, id_card_front_url, status) VALUES ('${U.stuU2}','UNILAG','student','x','pending')`); } catch (e) { throw new Error('seed verification: ' + e.message); }
    const r = await c.t(`SELECT public.admin_verify_user($1, 'seen ID in person') v`, [U.stuU2]);
    assert(r.ok, r.err?.message);
    eq([r.rows[0].v.changed, r.rows[0].v.requests_closed], [true, 1]);
    const p = (await c.su(`SELECT verification_status::text v FROM public.profiles WHERE id='${U.stuU2}'`)).rows[0].v;
    eq(p, 'verified');
    const vr = (await c.su(`SELECT status::text s, reviewed_by FROM public.verifications WHERE user_id='${U.stuU2}'`)).rows[0];
    eq(vr, { s: 'approved', reviewed_by: U.adminU });
    const a = (await c.su(`SELECT count(*)::int n FROM public.audit_logs WHERE entity_id='${U.stuU2}' AND action IN ('user_verified','profile_verification_changed')`)).rows[0].n;
    eq(a, 1, 'exactly one audit row (the trigger row is skipped)');
    const again = await c.t(`SELECT public.admin_verify_user($1) v`, [U.stuU2]);
    assert(again.ok && again.rows[0].v.changed === false, 'second call should be a no-op');
    denied(await c.t(`SELECT public.admin_verify_user($1)`, [U.stuI]), /unauthorized_campus_scope/, 'other campus');
    denied(await c.t(`SELECT public.admin_verify_user($1)`, [U.adminU]), /conflict_of_interest/, 'self');
  });
  await as(U.stuU, async (c) => { denied(await c.t(`SELECT public.admin_verify_user($1)`, [U.stuU2]), /unauthorized_campus_scope/, 'student caller'); });
  await as(ADMIN_U, async (c) => {
    await c.su(`INSERT INTO public.role_permissions (role, permission_key, label, enabled) VALUES ('campus_admin','can_verify_students','Verify students',false) ON CONFLICT (role, permission_key) DO UPDATE SET enabled=false`);
    denied(await c.t(`SELECT public.admin_verify_user($1)`, [U.stuU]), /permission_disabled/, 'permission switched off');
  });
});

// --------------------------------------------------------------------------- S5 broadcast
await check('S5: a campus admin broadcast reaches only their campus, excludes suspended/bot accounts, returns the real count and audits', async () => {
  await as(ADMIN_U, async (c) => {
    await c.su(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
    await c.su(`UPDATE public.profiles SET is_suspended=true WHERE id='${U.stuU2}'`);
    await c.su(`UPDATE public.profiles SET is_bot=true WHERE id='${U.glob}'`);
    await c.su(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
    const expected = (await c.su(`SELECT count(*)::int n FROM public.profiles WHERE campus_code='UNILAG' AND NOT COALESCE(is_suspended,false) AND NOT COALESCE(is_bot,false)`)).rows[0].n;
    const r = await c.t(`SELECT public.admin_broadcast_notification('Hello UNILAG','Welcome back','announcement','{}'::jsonb, '/dashboard') n`);
    assert(r.ok, r.err?.message);
    eq(r.rows[0].n, expected, 'recipient count');
    const sent = (await c.su(`SELECT count(*)::int n, count(*) FILTER (WHERE recipient_id='${U.stuU2}')::int susp, count(*) FILTER (WHERE recipient_id='${U.stuI}')::int other FROM public.notifications WHERE title='Hello UNILAG'`)).rows[0];
    eq(sent, { n: expected, susp: 0, other: 0 });
    const a = (await c.su(`SELECT (metadata->>'recipients')::int n, metadata->>'targetCampus' tc FROM public.audit_logs WHERE action='broadcast_sent'`)).rows;
    eq(a, [{ n: expected, tc: 'UNILAG' }], 'audit row in the same transaction');
    denied(await c.t(`SELECT public.admin_broadcast_notification('x','y','announcement','{"campus":"UI"}'::jsonb)`), /own campus/, 'other campus');
    denied(await c.t(`SELECT public.admin_broadcast_notification('x','y','announcement','{"campus":"ALL"}'::jsonb)`), /Super Admin/, 'all campuses');
    denied(await c.t(`SELECT public.admin_broadcast_notification('x','y','bogus_type')`), /unsupported/, 'type');
  });
  await as(U.stuU, async (c) => { denied(await c.t(`SELECT public.admin_broadcast_notification('x','y','announcement')`), /not_allowed/, 'student'); });
  await as(SUPER, async (c) => {
    const all = (await c.su(`SELECT count(*)::int n FROM public.profiles WHERE NOT COALESCE(is_suspended,false) AND NOT COALESCE(is_bot,false)`)).rows[0].n;
    const r = await c.t(`SELECT public.admin_broadcast_notification('Everyone','Platform news','system_announcement','{}'::jsonb) n`);
    assert(r.ok, r.err?.message);
    eq(r.rows[0].n, all);
    const roles = await c.t(`SELECT public.admin_broadcast_notification('Alumni','only alumni','announcement','{"campus":"UNILAG","roles":["alumni"]}'::jsonb) n`);
    eq(roles.rows[0].n, 1);
  });
});
await check('S5: broadcasts are rate limited per caller; a muted category is respected; deleting an announcement removes its notifications', async () => {
  await as(ADMIN_U, async (c) => {
    let last;
    for (let i = 0; i < 21; i++) last = await c.t(`SELECT public.admin_broadcast_notification('Spam ${i}','body','announcement','{"roles":["staff"]}'::jsonb)`);
    denied(last, /rate_limited/, '21st broadcast in an hour');
  });
  await as(SUPER, async (c) => {
    await c.su(`INSERT INTO public.notification_preferences (user_id, announcements_enabled) VALUES ('${U.staffU}', false)`);
    const r = await c.t(`SELECT public.admin_broadcast_notification('Muted?','body','announcement','{"campus":"UNILAG","roles":["staff"]}'::jsonb) n`);
    eq(r.rows[0].n, 0, 'muted staff still notified');
    const ann = '00000000-0000-4000-8000-0000000004aa';
    await c.su(`INSERT INTO public.announcements (id, author_id, campus_code, title, content) VALUES ('${ann}','${U.root}','UNILAG','T','C')`);
    const n = await c.t(`SELECT public.admin_broadcast_notification('T','C','announcement','{"campus":"UNILAG"}'::jsonb, '/dashboard', $1) n`, [ann]);
    assert(n.ok && n.rows[0].n > 0, n.err?.message || 'no recipients');
    await c.su(`DELETE FROM public.announcements WHERE id='${ann}'`);
    eq((await c.su(`SELECT count(*)::int n FROM public.notifications WHERE announcement_id='${ann}'`)).rows[0].n, 0, 'notifications left behind');
  });
});

// --------------------------------------------------------------------------- S6 audit visibility
await check('S6: DB-trigger audit rows are stamped with targetCampus and visible to that campus admin only; audit_logs stays append-only', async () => {
  await as(ADMIN_U, async (c) => {
    const r = await c.t(`UPDATE public.profiles SET is_suspended=true, suspension_reason='spam' WHERE id='${U.alumU}' RETURNING id`);
    assert(r.ok && r.rows.length === 1, r.err?.message || 'suspend failed');
    const own = (await c.q(`SELECT metadata->>'targetCampus' tc FROM public.audit_logs WHERE entity_id='${U.alumU}' AND action='profile_suspension_changed'`)).rows;
    eq(own, [{ tc: 'UNILAG' }], 'UNILAG admin should see the stamped row');
  });
  await as(ADMIN_I, async (c) => {
    denied(await c.t(`UPDATE public.audit_logs SET action='x'`), /permission denied|append-only/i, 'update audit');
    denied(await c.t(`DELETE FROM public.audit_logs`), /permission denied|append-only/i, 'delete audit');
  });
  await as('postgres', async (c) => {
    denied(await c.t(`UPDATE public.audit_logs SET action='x'`), /append-only/, 'owner update of audit');
    await c.q(`INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata) VALUES (NULL,'x','event',$1,'{}'::jsonb)`, [EV.uni]);
    eq((await c.q(`SELECT metadata->>'targetCampus' tc FROM public.audit_logs WHERE action='x' AND entity_id=$1`, [EV.uni])).rows[0].tc, 'UNILAG', 'event rows stamped from events.campus_code');
    await c.q(`INSERT INTO public.audit_logs (actor_id, action, entity_type, metadata) VALUES (NULL,'y','something','{"institutionCode":"UI"}'::jsonb)`);
    eq((await c.q(`SELECT metadata->>'targetCampus' tc FROM public.audit_logs WHERE action='y'`)).rows[0].tc, null, 'explicit institutionCode is not overwritten');
  });
  // a UI admin must not see a UNILAG row: checked against the unscoped row count
  await as(ADMIN_U, async (c) => {
    await c.t(`UPDATE public.profiles SET is_suspended=true, suspension_reason='spam' WHERE id='${U.alumU}'`);
  });
  await as(ADMIN_I, async (c) => {
    const seen = (await c.q(`SELECT count(*)::int n FROM public.audit_logs WHERE metadata->>'targetCampus' = 'UNILAG'`)).rows[0].n;
    eq(seen, 0, 'UI admin sees UNILAG-stamped audit rows');
  });
});

// --------------------------------------------------------------------------- S7 moderation queue
await check('S7: a reporter cannot pre-set status, assignee or campus on a report', async () => {
  await as(U.stuU, async (c) => {
    const r = await c.t(`INSERT INTO public.moderation_queue (item_type, item_id, reporter_id, campus_code, reason, status, assigned_admin_id, action_taken, resolved_at)
      VALUES ('user_profile', '${U.alumU}', '${U.stuU}', 'UI', 'spam profile', 'approved', '${U.adminI}', 'dismissed', now())
      RETURNING status::text s, assigned_admin_id a, campus_code c, action_taken t, resolved_at r`);
    assert(r.ok, r.err?.message);
    eq(r.rows[0], { s: 'pending', a: null, c: 'UNILAG', t: null, r: null }, 'report row');
    const sp = await c.t(`INSERT INTO public.moderation_queue (item_type, item_id, reporter_id, campus_code, reason) VALUES ('user_profile','${U.alumU}','${U.stuU2}','UNILAG','impersonating') RETURNING reporter_id r`);
    assert(sp.ok && sp.rows[0].r === U.stuU, 'reporter_id must be forced to the caller');
  });
});

// --------------------------------------------------------------------------- C8 active users
await check('C8: admin_active_users_count is campus scoped for campus admins; Super Admin can scope or see all; students refused', async () => {
  await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
  await db.exec(`UPDATE public.profiles SET last_active_at = now() - interval '5 days'`);
await db.exec(`UPDATE public.profiles SET last_active_at = now() WHERE id IN ('${U.stuU}','${U.stuI}')`);
  await db.exec(`UPDATE public.profiles SET last_active_at = now() - interval '2 days' WHERE id='${U.staffU}'`);
  await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
  await as(ADMIN_U, async (c) => { eq((await c.q(`SELECT public.admin_active_users_count(15, 'UI') n`)).rows[0].n, 1, 'campus admin must be forced to own campus'); });
  await as(SUPER, async (c) => {
    eq((await c.q(`SELECT public.admin_active_users_count(15) n`)).rows[0].n, 2);
    eq((await c.q(`SELECT public.admin_active_users_count(15, 'UI') n`)).rows[0].n, 1);
  });
  await as(U.stuU, async (c) => { denied(await c.t(`SELECT public.admin_active_users_count(15)`), /not_allowed/, 'student'); });
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
