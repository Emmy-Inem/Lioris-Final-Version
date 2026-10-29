// Behaviour tests for supabase/migrations/20261114000000_remove_seed_bot_content.sql, executed against an in-memory
// Postgres (PGlite). Nothing here touches a real database.
//
//   cd tools/sql-harness && npm install && node seed-cleanup.mjs
//
// Same load order as engagement.mjs, except that every migration BEFORE the one under test is applied first and
// the fixtures (real members who interacted with the seeded bots' content, plus look-alike rows the cleanup must
// not touch) are created next; the migration under test is then applied strictly (one transaction, no failing
// statement), again to prove idempotency, and once more after the original seed migration is replayed.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { newDb, bootstrap, applyFile, MIGRATIONS, ROOT } from './lib.mjs';

const CLEANUP = 'supabase/migrations/20261114000000_remove_seed_bot_content.sql';
const SEED = 'supabase/migrations/20260926150000_seed_campus_community_bots.sql';
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
for (const f of migrationFiles) {
  const path = `supabase/migrations/${f}`;
  if (path === CLEANUP) continue; // applied below, after the fixtures exist
  await applyFile(db, path, false, () => {});
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
const n = async (sql, p) => Number((await db.query(sql, p)).rows[0].n);

// --------------------------------------------------------------------------- fixtures
const BOT = (k) => `00000000-0000-4000-a000-${String(k).padStart(12, '0')}`; // 101 .. are seed bots
const SEED_POST = (k) => `00000000-0000-4000-b000-${String(k).padStart(12, '0')}`;
const U = { a: id(1), b: id(2), c: id(3), lookalike: BOT(9001), flaggedReal: id(4), seedIdAdmin: BOT(9002) };

async function mk(uid, email, campus) {
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ($1,$2,$3::jsonb, now())`,
    [uid, email, JSON.stringify({ campus_code: campus, full_name: email.split('@')[0] })]);
}
await mk(U.a, 'a@school.test', 'UI');
await mk(U.b, 'b@school.test', 'UI');
await mk(U.c, 'c@school.test', 'UNILAG');
await mk(U.lookalike, 'lookalike@school.test', 'UI'); // seed-shaped id, is_bot = false: a REAL account
await mk(U.flaggedReal, 'flagged@school.test', 'UI'); // is_bot = true but NOT a seed id
await mk(U.seedIdAdmin, 'adminlike@school.test', 'UI'); // seed-shaped id + is_bot but an admin: never treated as a seed bot
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER tr_prevent_profile_role_escalation`);
await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
await db.exec(`UPDATE public.profiles SET onboarding_complete=true, verification_status='verified' WHERE id IN ('${U.a}','${U.b}','${U.c}','${U.lookalike}','${U.flaggedReal}','${U.seedIdAdmin}')`);
await db.exec(`UPDATE public.profiles SET is_bot = true WHERE id IN ('${U.flaggedReal}','${U.seedIdAdmin}')`);
await db.exec(`UPDATE public.profiles SET role = 'admin', admin_role = 'campus_admin' WHERE id = '${U.seedIdAdmin}'`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER tr_prevent_profile_role_escalation`);

const S1 = SEED_POST(101);
const BOT1 = BOT(101);
async function post(authorId, title) {
  const r = await db.query(`INSERT INTO public.posts (author_id, campus_code, content, title, category, status) VALUES ($1,'UI',$2,$2,'General','published') RETURNING id`, [authorId, title]);
  return r.rows[0].id;
}
const real = {};
real.postA = await post(U.a, 'Real post by A');
real.postLook = await post(U.lookalike, 'Post by the seed-shaped real account');
real.postFlagged = await post(U.flaggedReal, 'Post by an is_bot account with a non-seed id');
real.postAdminLike = await post(U.seedIdAdmin, 'Post by the seed-shaped admin');

// Real members interacting with a seed thread, and with their own content.
await db.query(`INSERT INTO public.post_comments (post_id, author_id, content) VALUES ($1,$2,'A replies on the seed thread')`, [S1, U.a]);
await db.query(`INSERT INTO public.post_comments (post_id, author_id, content) VALUES ($1,$2,'B replies on A''s real post')`, [real.postA, U.b]);
await db.query(`INSERT INTO public.post_likes (post_id, user_id) VALUES ($1,$2)`, [S1, U.b]);
await db.query(`INSERT INTO public.post_likes (post_id, user_id) VALUES ($1,$2)`, [real.postA, U.b]);
await db.query(`INSERT INTO public.saved_items (user_id, kind, item_id, title) VALUES ($1,'post',$2,'seed')`, [U.b, S1]);
await db.query(`INSERT INTO public.saved_items (user_id, kind, item_id, title) VALUES ($1,'post',$2,'real')`, [U.b, real.postA]);
await db.query(`INSERT INTO public.notifications (recipient_id, sender_id, title, body, action_url) VALUES ($1,$2,'about seed','x',$3)`, [U.a, U.b, `/(student)/post/${S1}`]);
await db.query(`INSERT INTO public.notifications (recipient_id, sender_id, title, body, action_url) VALUES ($1,$2,'about real','x',$3)`, [U.a, U.b, `/(student)/post/${real.postA}`]);
await db.query(`INSERT INTO public.notifications (recipient_id, title, body) VALUES ($1,'to a bot','x')`, [BOT1]);
await db.query(`INSERT INTO public.connections (requester_id, recipient_id, status) VALUES ($1,$2,'pending')`, [U.a, BOT1]);
await db.query(`INSERT INTO public.connections (requester_id, recipient_id, status) VALUES ($1,$2,'pending')`, [U.a, U.b]);
const comm = (await db.query(`SELECT id FROM public.forum_communities ORDER BY created_at LIMIT 1`)).rows[0].id;
await db.query(`INSERT INTO public.forum_community_members (community_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [comm, BOT1]);
await db.query(`INSERT INTO public.forum_community_members (community_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [comm, U.a]);
const dm = (await db.query(`INSERT INTO public.chat_channels (is_direct_message, campus_code, created_by) VALUES (true,'UI',$1) RETURNING id`, [U.a])).rows[0].id;
await db.query(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [dm, U.a]);
await db.query(`INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [dm, BOT1]);

const SEED_BOTS = `id::text ~ '^00000000-0000-4000-a000-[0-9a-f]{12}$' AND is_bot AND role::text IN ('student','alumni')`;
async function snapshot() {
  return {
    posts: await n(`SELECT count(*) n FROM public.posts`),
    comments: await n(`SELECT count(*) n FROM public.post_comments`),
    likes: await n(`SELECT count(*) n FROM public.post_likes`),
    saved: await n(`SELECT count(*) n FROM public.saved_items`),
    notifs: await n(`SELECT count(*) n FROM public.notifications`),
    conns: await n(`SELECT count(*) n FROM public.connections`),
    members: await n(`SELECT count(*) n FROM public.forum_community_members`),
    profiles: await n(`SELECT count(*) n FROM public.profiles`),
    users: await n(`SELECT count(*) n FROM auth.users`),
    suspended: await n(`SELECT count(*) n FROM public.profiles WHERE is_suspended`),
    channels: await n(`SELECT count(*) n FROM public.chat_channels`),
  };
}

console.log('\n== SEED CLEANUP ==');

// Before: the fixture really contains the seed the migration has to remove.
const before = await snapshot();
await check('fixture: the seed (20 bots, 20 posts) and the real members\' interactions with it are present', async () => {
  eq(await n(`SELECT count(*) n FROM public.profiles WHERE ${SEED_BOTS}`), 20);
  eq(await n(`SELECT count(*) n FROM public.posts WHERE id::text LIKE '00000000-0000-4000-b000-%'`), 20);
  eq(await n(`SELECT count(*) n FROM public.post_comments WHERE post_id = $1`, [S1]), 1);
});
const realProfilesBefore = (await db.query(`SELECT id, is_suspended, directory_discoverable, role::text role FROM public.profiles WHERE id IN ('${U.a}','${U.b}','${U.c}','${U.lookalike}','${U.flaggedReal}','${U.seedIdAdmin}') ORDER BY id`)).rows;

let migrationResult = null;
try { migrationResult = await applyFile(db, CLEANUP, true, () => {}); } catch (e) {
  console.log(`FATAL: seed cleanup migration did not apply: ${e.message}${e.detail ? ' | ' + e.detail : ''}${e.where ? ' | ' + e.where : ''}`);
  process.exit(2);
}
const after = await snapshot();

await check('migration applies cleanly in a single transaction', async () => { assert(migrationResult && !migrationResult.failures?.length, 'did not apply'); });
await check('migration is idempotent: a second run changes nothing', async () => {
  await db.exec(readFileSync(resolve(ROOT, CLEANUP), 'utf8'));
  eq(await snapshot(), after);
});

await check('every seed post is gone, along with its comments, likes and bookmarks', async () => {
  eq(await n(`SELECT count(*) n FROM public.posts WHERE id::text LIKE '00000000-0000-4000-b000-%'`), 0);
  eq(await n(`SELECT count(*) n FROM public.posts WHERE author_id IN (SELECT id FROM public.profiles WHERE ${SEED_BOTS})`), 0, 'nothing a seed bot wrote is left');
  eq(await n(`SELECT count(*) n FROM public.post_comments WHERE post_id = $1`, [S1]), 0, 'replies on the seed thread');
  eq(await n(`SELECT count(*) n FROM public.post_likes WHERE post_id = $1`, [S1]), 0, 'likes on the seed thread');
  eq(await n(`SELECT count(*) n FROM public.saved_items WHERE item_id = $1`, [S1]), 0, 'bookmarks of the seed thread');
});
await check('notifications about seed content or addressed to a bot are gone; the real notification stays', async () => {
  eq(await n(`SELECT count(*) n FROM public.notifications WHERE title IN ('about seed','to a bot')`), 0);
  eq(await n(`SELECT count(*) n FROM public.notifications WHERE title = 'about real'`), 1);
});
await check('bot connections and space memberships are gone; real ones stay', async () => {
  eq(await n(`SELECT count(*) n FROM public.connections WHERE requester_id = $1 OR recipient_id = $1`, [BOT1]), 0);
  eq(await n(`SELECT count(*) n FROM public.connections WHERE requester_id = $1 AND recipient_id = $2`, [U.a, U.b]), 1);
  eq(await n(`SELECT count(*) n FROM public.forum_community_members WHERE user_id::text LIKE '00000000-0000-4000-a000-%'`), 0);
  eq(await n(`SELECT count(*) n FROM public.forum_community_members WHERE user_id = $1`, [U.a]), 1);
});

await check('real members\' own content is untouched', async () => {
  eq(await n(`SELECT count(*) n FROM public.posts WHERE id = $1`, [real.postA]), 1, 'A\'s post');
  eq(await n(`SELECT count(*) n FROM public.post_comments WHERE post_id = $1 AND author_id = $2`, [real.postA, U.b]), 1, 'B\'s comment on A\'s post');
  eq(await n(`SELECT count(*) n FROM public.post_likes WHERE post_id = $1 AND user_id = $2`, [real.postA, U.b]), 1, 'B\'s like on A\'s post');
  eq(await n(`SELECT count(*) n FROM public.saved_items WHERE item_id = $1`, [real.postA]), 1, 'B\'s bookmark of A\'s post');
  eq(await n(`SELECT comments_count n FROM public.posts WHERE id = $1`, [real.postA]), 1, 'the comment counter of a real post');
  eq(await n(`SELECT count(*) n FROM public.chat_channels WHERE id = $1`, [dm]), 1, 'a real member\'s DM channel is left alone');
});
await check('accounts that only LOOK like seed rows are never touched (seed-shaped id without is_bot, is_bot without a seed id, seed-shaped admin)', async () => {
  for (const p of [real.postLook, real.postFlagged, real.postAdminLike]) {
    eq(await n(`SELECT count(*) n FROM public.posts WHERE id = $1`, [p]), 1, `post ${p} must survive`);
  }
  const realProfilesAfter = (await db.query(`SELECT id, is_suspended, directory_discoverable, role::text role FROM public.profiles WHERE id IN ('${U.a}','${U.b}','${U.c}','${U.lookalike}','${U.flaggedReal}','${U.seedIdAdmin}') ORDER BY id`)).rows;
  eq(realProfilesAfter, realProfilesBefore, 'real and look-alike profiles are byte-for-byte what they were');
  eq(await n(`SELECT count(*) n FROM public.profiles WHERE id IN ('${U.a}','${U.b}','${U.c}','${U.lookalike}','${U.flaggedReal}','${U.seedIdAdmin}') AND is_suspended`), 0);
});

await check('the 20 bot accounts are retired, not deleted: still flagged is_bot, suspended and hidden from the directory', async () => {
  eq(await n(`SELECT count(*) n FROM public.profiles WHERE ${SEED_BOTS}`), 20, 'profiles kept');
  eq(await n(`SELECT count(*) n FROM auth.users WHERE id::text ~ '^00000000-0000-4000-a000-[0-9a-f]{12}$' AND email NOT LIKE '%school.test'`), 20, 'auth users kept');
  eq(await n(`SELECT count(*) n FROM public.profiles WHERE ${SEED_BOTS} AND is_suspended AND directory_discoverable = false`), 20, 'all retired');
  eq(after.profiles, before.profiles, 'no profile was deleted');
  eq(after.users, before.users, 'no auth user was deleted');
});
await check('a retired bot no longer counts as verified, nor appears in the message-search / directory queries', async () => {
  eq((await db.query(`SELECT public.is_profile_verified($1) v`, [BOT1])).rows[0].v, false);
  eq(await n(`SELECT count(*) n FROM public.profiles WHERE is_suspended = false AND id::text ~ '^00000000-0000-4000-a000-[0-9a-f]{12}$' AND is_bot AND role::text IN ('student','alumni')`), 0);
  eq(await n(`SELECT count(*) n FROM public.profiles WHERE directory_discoverable AND ${SEED_BOTS}`), 0);
});

await check('replaying the original seed migration and then this one ends clean again (a full replay of supabase/migrations is safe)', async () => {
  await applyFile(db, SEED, false, () => {});
  assert(await n(`SELECT count(*) n FROM public.posts WHERE id::text LIKE '00000000-0000-4000-b000-%'`) > 0, 'the replay re-created the seed posts');
  await applyFile(db, CLEANUP, true, () => {});
  eq(await n(`SELECT count(*) n FROM public.posts WHERE id::text LIKE '00000000-0000-4000-b000-%'`), 0, 'seed posts removed again');
  eq(await n(`SELECT count(*) n FROM public.profiles WHERE ${SEED_BOTS} AND is_suspended AND directory_discoverable = false`), 20, 'bots retired again');
  eq(await n(`SELECT count(*) n FROM public.posts WHERE id = $1`, [real.postA]), 1, 'real post still there');
});
await check('on a database that never had the seed the migration is a no-op', async () => {
  // No profile matches the seed predicate any more once is_bot is cleared, which is what a database without the seed looks like.
  await db.exec(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
  await db.exec(`UPDATE public.profiles SET is_bot = false WHERE id::text ~ '^00000000-0000-4000-a000-000000000[1-3][0-9]{2}$'`);
  await db.exec(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
  const snap = await snapshot();
  await applyFile(db, CLEANUP, true, () => {});
  eq(await snapshot(), snap);
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
