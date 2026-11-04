import type { Page, Route } from '@playwright/test';
import { seedAuthenticatedSession, stubAdultMemberStatus, waitForApp, type TestUserRole } from './fixtures';

// Minimal, realistic sample rows for the stubbed Supabase REST API, so list / detail / action UI actually renders
// items to click in the interaction tests. Everything is served from memory; nothing leaves the browser.
//
//   const backend = await installSampleBackend(page, { role: 'student' });
//   ... drive the UI ...
//   expect(backend.calls.some((c) => c.table === 'post_likes' && c.method === 'POST')).toBe(true);
//
// Register it AFTER seedAuthenticatedSession (Playwright tries the most recently registered route first).

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

export interface BackendCall {
  method: string;
  /** REST table, or `rpc/<name>`, or `fn/<name>` for edge functions, or `auth/<path>`. */
  table: string;
  url: string;
  body: any;
}

export interface SampleBackend {
  calls: BackendCall[];
  /** Mutable tables (name -> rows). Tests may replace a table before navigating. */
  rows: Record<string, any[]>;
  /** RPC / edge-function overrides: name -> value or (args) => value | { status, body }. */
  rpc: Record<string, any>;
  /** Make every call to this table / rpc / fn name fail with the given HTTP status (or clear it with 0). */
  failWith(name: string, status: number, message?: string): void;
  /** Delay (ms) for a table / rpc name, to exercise loading states and double-click guards. */
  delay(name: string, ms: number): void;
  count(method: string, name: string): number;
}

export interface SampleOptions {
  role: 'student' | 'alumni' | 'staff' | 'admin';
  /** Inject very long / unicode / emoji strings into every name and title. */
  long?: boolean;
}

export const LONG_UNBROKEN = 'Supercalifragilisticexpialidocious'.repeat(5);
export const LONG_TEXT =
  `Ünïcödé 漢字 العربية 😀🎓🚀 ${'very long title words '.repeat(12)}${LONG_UNBROKEN}`;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const IDS = {
  post: uuid(101),
  post2: uuid(102),
  comment: uuid(201),
  event: uuid(301),
  event2: uuid(302),
  resource: uuid(401),
  job: uuid(501),
  listing: uuid(601),
  channel: uuid(701),
  notification: uuid(801),
  announcement: uuid(901),
  report: uuid(1001),
  verification: uuid(1101),
  community: uuid(1201),
  other: uuid(1301),
};

export function buildRows(role: string, long: boolean): Record<string, any[]> {
  const me = `e2e-${role}-user`;
  const nm = (s: string) => (long ? `${s} ${LONG_TEXT}` : s);
  const author = { full_name: nm('Ada Okafor'), role: 'student', avatar_url: null, campus_code: 'UI', verification_status: 'verified', department: 'Computer Science' };
  const other = { id: IDS.other, ...author, username: 'ada_okafor', is_suspended: false, email: 'ada@example.com' };
  return {
    profiles: [
      other,
      { id: uuid(1302), full_name: nm('Chidi Eze'), username: 'chidi', role: 'alumni', campus_code: 'UI', verification_status: 'verified', department: 'Law', is_suspended: false, avatar_url: null },
    ],
    posts: [
      {
        id: IDS.post, author_id: IDS.other, title: nm('Anyone studying for CSC 301?'), content: nm('Looking for a study partner for the algorithms exam. DM me or comment below.'),
        category: 'Academic', likes_count: 3, comments_count: 1, reposts_count: 0, created_at: iso(-2 * HOUR), status: 'published',
        campus_code: 'UI', visibility_scope: 'campus', audience_scope: 'global', profiles: author, post_likes: [], image_url: null, is_pinned: false,
      },
      {
        id: IDS.post2, author_id: me, title: nm('My own thread'), content: 'Written by the signed-in member.',
        category: 'General', likes_count: 0, comments_count: 0, reposts_count: 0, created_at: iso(-5 * HOUR), status: 'published',
        campus_code: 'UI', visibility_scope: 'campus', audience_scope: 'global', profiles: { ...author, full_name: 'Me Myself' }, post_likes: [], image_url: null,
        poll_data: { question: 'Best study spot?', options: [{ id: 'o1', label: 'Library', votes: 2 }, { id: 'o2', label: 'Hostel', votes: 1 }], totalVotes: 3 },
      },
    ],
    post_comments: [
      { id: IDS.comment, post_id: IDS.post, author_id: IDS.other, content: nm('I am in! Library at 4pm?'), created_at: iso(-HOUR), likes_count: 0, parent_comment_id: null, author },
    ],
    events: [
      {
        id: IDS.event, creator_id: IDS.other, campus_code: 'UI', title: nm('Career Fair 2026'), description: nm('Meet recruiters from 40 companies.'), category: 'Career',
        venue: nm('Main Auditorium'), start_time: iso(2 * DAY), end_time: iso(2 * DAY + 3 * HOUR), status: 'approved', registered_count: 12, capacity: 200,
        visibility_scope: 'global', venue_type: 'physical', ticket_type: 'free', ticket_price: 0, profiles: { full_name: nm('Ada Okafor') }, event_attendees: [],
      },
      {
        id: IDS.event2, creator_id: me, campus_code: 'UI', title: 'Hackathon', description: 'Build things.', category: 'Academic',
        venue: 'Lab 2', start_time: iso(5 * DAY), end_time: iso(5 * DAY + 5 * HOUR), status: 'approved', registered_count: 3, capacity: 50,
        visibility_scope: 'global', venue_type: 'physical', ticket_type: 'free', ticket_price: 0, profiles: { full_name: 'Me Myself' }, event_attendees: [],
      },
    ],
    resources: [
      {
        id: IDS.resource, uploader_id: IDS.other, title: nm('CSC 301 Past Questions 2024'), description: nm('Last three years of exam questions.'), resource_type: 'past_question',
        course_code: 'CSC 301', course_title: 'Algorithms', file_url: 'https://example.com/csc301.pdf', file_mime_type: 'application/pdf', file_size_bytes: 1048576,
        upvotes_count: 4, downloads_count: 9, is_approved: true, campus_code: 'UI', created_at: iso(-3 * DAY), profiles: { full_name: nm('Ada Okafor'), role: 'student', avatar_url: null, department: 'Computer Science' },
      },
    ],
    jobs: [
      {
        id: IDS.job, title: nm('Junior Software Engineer'), company: nm('Acme Labs'), location: 'Lagos', type: 'Full-time', is_remote: false, apply_url: 'https://example.com/apply',
        accepts_in_app_applications: true, applications_count: 2, is_approved: true, poster_id: IDS.other, created_at: iso(-DAY), description: nm('Build and ship features.'), campus_code: 'UI',
        poster: { full_name: nm('Ada Okafor') }, is_closed: false,
      },
    ],
    marketplace_listings: [
      {
        id: IDS.listing, seller_id: IDS.other, title: nm('Scientific calculator'), description: nm('Barely used, Casio fx-991.'), price_kobo: 500000, price_display: '₦5,000', condition: 'like_new', category: 'electronics',
        campus_code: 'UI', created_at: iso(-DAY), is_sold: false, is_removed: false, seller: { full_name: nm('Ada Okafor'), avatar_url: null, trust_score: 80, verification_status: 'verified', role: 'student' },
      },
    ],
    notifications: [
      { id: IDS.notification, recipient_id: me, type: 'system', title: nm('Welcome to Lioris'), body: nm('Your account is ready.'), action_url: null, is_read: false, read_at: null, created_at: iso(-HOUR) },
    ],
    announcements: [
      { id: IDS.announcement, author_id: IDS.other, campus_code: 'UI', title: nm('Exam timetable released'), content: nm('See the portal for details.'), audience_scope: 'all', priority: 'normal', published_at: iso(-DAY), expires_at: null, author: { full_name: 'Registry' } },
    ],
    moderation_queue: [
      { id: IDS.report, item_type: 'post', item_id: IDS.post, reporter_id: IDS.other, campus_code: 'UI', reason: nm('Spam'), status: 'pending', created_at: iso(-HOUR) },
    ],
    verifications: [
      { id: IDS.verification, user_id: IDS.other, campus_code: 'UI', requested_role: 'student', id_card_front_url: null, status: 'pending', review_notes: 'student_id: 12345', created_at: iso(-DAY), profiles: { full_name: nm('Ada Okafor'), role: 'student', campus_code: 'UI' } },
    ],
    forum_communities: [
      { id: IDS.community, label: nm('Algorithms Club'), slug: 'algorithms', category: 'Algorithms', description: nm('All about algorithms.'), campus_code: 'UI', created_at: iso(-10 * DAY), approval_status: 'approved', created_by: IDS.other },
    ],
    saved_items: [],
    connections: [],
    chat_channels: [
      {
        id: IDS.channel, name: null, is_direct_message: true, campus_code: 'UI', created_by: IDS.other, created_at: iso(-DAY), updated_at: iso(-HOUR),
        chat_channel_members: [
          { user_id: me, joined_at: iso(-DAY), profiles: { id: me, full_name: 'Me Myself', avatar_url: null, department: 'CS', role, campus_code: 'UI', last_active_at: iso(0) } },
          { user_id: IDS.other, joined_at: iso(-DAY), profiles: { id: IDS.other, full_name: nm('Ada Okafor'), avatar_url: null, department: 'CS', role: 'student', campus_code: 'UI', last_active_at: iso(0) } },
        ],
      },
    ],
    chat_messages: [
      { id: uuid(710), channel_id: IDS.channel, sender_id: IDS.other, content: nm('Hey, are you free to study tomorrow?'), is_read: false, created_at: iso(-HOUR), media_url: null },
    ],
  };
}

function tableOf(url: URL): string | null {
  const m = url.pathname.match(/\/rest\/v1\/([a-z_0-9]+)$/);
  return m ? m[1] : null;
}

export async function installSampleBackend(page: Page, opts: SampleOptions): Promise<SampleBackend> {
  const me = `e2e-${opts.role}-user`;
  const rows = buildRows(opts.role, !!opts.long);
  const fails = new Map<string, { status: number; message: string }>();
  const delays = new Map<string, number>();
  const backend: SampleBackend = {
    calls: [],
    rows,
    rpc: {
      get_my_conversation_summaries: () => [
        { id: IDS.channel, last_message_content: 'Hey, are you free to study tomorrow?', last_message_at: iso(-HOUR), unread_count: 1 },
      ],
      check_username_available: true,
      get_report_count_for_author: 0,
      get_forum_communities_stats: [],
      admin_search_profiles: () => rows.profiles,
      mentor_directory: [],
      is_community_manager: false,
    },
    failWith(name, status, message = 'e2e injected failure') {
      if (status) fails.set(name, { status, message });
      else fails.delete(name);
    },
    delay(name, ms) {
      delays.set(name, ms);
    },
    count(method, name) {
      return backend.calls.filter((c) => c.method === method && c.table === name).length;
    },
  };

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });

  // supabase.auth.getUser() asks the server; answer with the seeded member so "who am I" calls work.
  await page.route(/https:\/\/[a-z0-9]+\.supabase\.co\/auth\/v1\/user$/, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return json(route, 200, {
      id: me,
      aud: 'authenticated',
      role: 'authenticated',
      email: `${opts.role}.e2e@example.com`,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { full_name: `E2E ${opts.role}` },
      created_at: new Date().toISOString(),
    });
  });

  await page.route(/https:\/\/[a-z0-9]+\.supabase\.co\/(rest|functions)\/.*/, async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(request.url());
    const rpcMatch = url.pathname.match(/\/rest\/v1\/rpc\/([a-z_0-9]+)$/);
    const fnMatch = url.pathname.match(/\/functions\/v1\/([a-z0-9_-]+)$/);
    let body: any = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = request.postData();
    }

    if (url.pathname.includes('report-client-error')) return route.fallback();

    // --- RPC / edge functions -------------------------------------------------------------------------------
    if (rpcMatch || fnMatch) {
      const name = (rpcMatch ?? fnMatch)![1];
      const key = rpcMatch ? `rpc/${name}` : `fn/${name}`;
      if (name === 'latest_consent' || name === 'get_my_minor_status') return route.fallback();
      backend.calls.push({ method, table: key, url: request.url(), body });
      const d = delays.get(name) ?? delays.get(key);
      if (d) await new Promise((r) => setTimeout(r, d));
      const f = fails.get(name) ?? fails.get(key);
      if (f) return json(route, f.status, { message: f.message, error: f.message });
      if (!(name in backend.rpc)) return route.fallback();
      const v = typeof backend.rpc[name] === 'function' ? await backend.rpc[name](body) : backend.rpc[name];
      if (v && typeof v === 'object' && 'status' in v && 'body' in v) return json(route, v.status, v.body);
      return json(route, 200, v);
    }

    // --- tables ---------------------------------------------------------------------------------------------
    const table = tableOf(url);
    if (!table) return route.fallback();
    backend.calls.push({ method, table, url: request.url(), body });
    const d = delays.get(table);
    if (d) await new Promise((r) => setTimeout(r, d));
    const f = fails.get(table);
    if (f && method !== 'GET') return json(route, f.status, { message: f.message, code: 'E2E' });
    if (f) return json(route, f.status, { message: f.message, code: 'E2E' });

    // The member's own verified profile lookup is served by stubVerifiedProfile (registered earlier) when present.
    if (table === 'profiles' && url.searchParams.get('id') === `eq.${me}`) return route.fallback();
    if (!(table in rows)) return route.fallback();

    const wantsObject = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const idFilter = url.searchParams.get('id');
    let list = rows[table];
    if (idFilter?.startsWith('eq.')) list = list.filter((r) => r.id === idFilter.slice(3));

    if (method === 'GET' || method === 'HEAD') {
      if (wantsObject) return list.length ? json(route, 200, list[0]) : json(route, 406, { code: 'PGRST116', message: 'no rows' });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ...CORS, 'content-range': `0-${Math.max(0, list.length - 1)}/${list.length}` },
        body: JSON.stringify(list),
      });
    }
    if (method === 'POST') {
      const inserted = Array.isArray(body) ? body : [body];
      rows[table] = [...inserted.map((r: any) => ({ created_at: iso(0), ...r })), ...rows[table]];
      return json(route, 201, wantsObject ? inserted[0] : inserted);
    }
    if (method === 'PATCH') {
      list.forEach((r) => Object.assign(r, body));
      return json(route, 200, wantsObject ? list[0] ?? {} : list);
    }
    if (method === 'DELETE') {
      const ids = new Set(list.map((r) => r.id));
      rows[table] = rows[table].filter((r) => !ids.has(r.id));
      return json(route, 200, list);
    }
    return route.fallback();
  });

  return backend;
}

/**
 * Seeds a signed-in member of `role` (verified adult by default), installs the sample backend and opens `path`.
 * The returned backend records every request so a test can assert what a click actually sent.
 */
export async function openAs(
  page: Page,
  role: TestUserRole,
  path: string,
  options: { superAdmin?: boolean; verified?: boolean; long?: boolean; viewport?: { width: number; height: number }; setup?: (backend: SampleBackend) => void | Promise<void> } = {},
): Promise<SampleBackend> {
  if (options.viewport) await page.setViewportSize(options.viewport);
  await seedAuthenticatedSession(page, role, { superAdmin: options.superAdmin, verified: options.verified ?? true });
  await stubAdultMemberStatus(page);
  const backend = await installSampleBackend(page, { role, long: options.long });
  if (options.setup) await options.setup(backend);
  await page.goto(path);
  await waitForApp(page);
  return backend;
}
