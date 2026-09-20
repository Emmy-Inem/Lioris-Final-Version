// send-push
//
// Delivers a mobile push notification through the Expo Push Service whenever a row
// is INSERTed into public.notifications. It is invoked by a Supabase Database
// Webhook (Dashboard > Database > Webhooks), NOT by users, so it is deployed WITHOUT
// JWT verification and instead requires a shared secret header compared in constant
// time:
//
//   x-webhook-secret: <PUSH_WEBHOOK_SECRET>
//
// Webhook payload (Supabase standard):
//   { type: 'INSERT', table: 'notifications', schema: 'public', record: {...}, old_record: null }
//
// The app writes one notifications row per recipient (broadcasts included, see
// src/api/notifications.ts createNotification), so there is no fan-out here beyond
// "all devices of this one recipient".
//
// Behaviour:
//   * fails closed when PUSH_WEBHOOK_SECRET is missing/too short (500) or wrong (401)
//   * skips (200, sent: 0) suspended recipients, recipients who blocked the sender,
//     and rows older than 10 minutes (webhook replays / retries never spam old pushes)
//   * sends to Expo in batches of <= 100 with data.deepLinkPath (the app reads
//     response.notification.request.content.data.deepLinkPath)
//   * Android channelId: 'critical' for system_announcement / emergency, else 'default'
//   * deletes a push_tokens row when Expo reports DeviceNotRegistered in the ticket
//   * never logs titles, bodies or tokens
//
// Deployment (verify_jwt OFF):
//   supabase functions deploy send-push --no-verify-jwt
//   supabase secrets set PUSH_WEBHOOK_SECRET=<long random string> SUPABASE_SERVICE_ROLE_KEY=<...>
//   optional: supabase secrets set EXPO_ACCESS_TOKEN=<Expo access token>
//
// Response: { success: true, sent, removed, skipped?: <reason> }

import { timingSafeEqual } from '../_shared/auth.ts';
import { readJsonBody } from '../_shared/body.ts';
import { createServiceClient } from '../_shared/ratelimit.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_BODY_BYTES = 64 * 1024;
const EXPO_BATCH_SIZE = 100;
const MAX_TOKENS_PER_USER = 10;
const MAX_RECORD_AGE_MS = 10 * 60 * 1000;
const MAX_TITLE_LENGTH = 100;
const MAX_BODY_LENGTH = 178;
const EXPO_TIMEOUT_MS = 10_000;
const CRITICAL_TYPES = new Set(['system_announcement', 'emergency']);
const EXPO_TOKEN_RE = /^(?:Expo|Exponent)PushToken\[[^\]\s]+\]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface NotificationRecord {
  id?: unknown;
  recipient_id?: unknown;
  sender_id?: unknown;
  title?: unknown;
  body?: unknown;
  type?: unknown;
  action_url?: unknown;
  created_at?: unknown;
}

interface WebhookPayload {
  type?: unknown;
  table?: unknown;
  schema?: unknown;
  record?: NotificationRecord | null;
}

interface ExpoTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

function json(body: unknown, status: number): Response {
  // Machine-to-machine endpoint: no CORS headers are emitted on purpose.
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function truncate(value: unknown, max: number): string {
  const s = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Only in-app absolute paths are allowed as a deep link (no schemes, no protocol-relative). */
function safeDeepLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (v.length === 0 || v.length > 512) return undefined;
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return undefined;
  return v;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function postToExpo(messages: Record<string, unknown>[]): Promise<ExpoTicket[] | null> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(EXPO_TIMEOUT_MS),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 750));
          continue;
        }
        console.error(`[send-push] Expo responded ${res.status}.`);
        return null;
      }
      if (!res.ok) {
        console.error(`[send-push] Expo rejected the request with ${res.status}.`);
        return null;
      }
      const payload = (await res.json()) as { data?: ExpoTicket[] };
      return Array.isArray(payload.data) ? payload.data : null;
    } catch (err) {
      if (attempt === 1) {
        console.error('[send-push] Expo request failed:', err instanceof Error ? err.name : 'unknown');
        return null;
      }
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret || secret.length < 16) {
    console.error('[send-push] PUSH_WEBHOOK_SECRET missing or too short.');
    return json({ error: 'Server misconfiguration.' }, 500);
  }
  const provided = req.headers.get('x-webhook-secret') ?? '';
  if (!timingSafeEqual(provided, secret)) return json({ error: 'Unauthorized.' }, 401);

  const admin = createServiceClient();
  if (!admin) {
    console.error('[send-push] Missing service role secret.');
    return json({ error: 'Server misconfiguration.' }, 500);
  }

  const parsed = await readJsonBody<WebhookPayload>(req, MAX_BODY_BYTES);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
  const payload = parsed.value;

  if (payload.type !== 'INSERT' || payload.table !== 'notifications' || !payload.record) {
    return json({ success: true, sent: 0, removed: 0, skipped: 'not_a_notification_insert' }, 200);
  }
  const record = payload.record;
  const recipientId = record.recipient_id;
  if (typeof recipientId !== 'string' || !UUID_RE.test(recipientId)) {
    return json({ error: 'Invalid record.' }, 400);
  }

  // Idempotent-ish: never push for stale rows (webhook replays, manual re-sends).
  const createdAt = typeof record.created_at === 'string' ? Date.parse(record.created_at) : Number.NaN;
  if (Number.isFinite(createdAt) && Date.now() - createdAt > MAX_RECORD_AGE_MS) {
    return json({ success: true, sent: 0, removed: 0, skipped: 'stale' }, 200);
  }

  const title = truncate(record.title, MAX_TITLE_LENGTH);
  const body = truncate(record.body, MAX_BODY_LENGTH);
  if (!title && !body) return json({ success: true, sent: 0, removed: 0, skipped: 'empty' }, 200);

  try {
    // Suspended recipients get no pushes. Missing profile => nothing to deliver to.
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('is_suspended')
      .eq('id', recipientId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return json({ success: true, sent: 0, removed: 0, skipped: 'no_recipient' }, 200);
    if (profile.is_suspended === true) {
      return json({ success: true, sent: 0, removed: 0, skipped: 'suspended' }, 200);
    }

    // Respect blocks: no pushes from someone the recipient has blocked.
    const senderId = typeof record.sender_id === 'string' && UUID_RE.test(record.sender_id) ? record.sender_id : null;
    if (senderId && senderId !== recipientId) {
      const { data: block, error: blockError } = await admin
        .from('user_blocks')
        .select('blocker_id')
        .eq('blocker_id', recipientId)
        .eq('blocked_id', senderId)
        .maybeSingle();
      if (blockError) throw blockError;
      if (block) return json({ success: true, sent: 0, removed: 0, skipped: 'blocked' }, 200);
    }

    const { data: tokenRows, error: tokenError } = await admin
      .from('push_tokens')
      .select('token')
      .eq('user_id', recipientId)
      .order('updated_at', { ascending: false })
      .limit(MAX_TOKENS_PER_USER);
    if (tokenError) throw tokenError;
    const tokens = (tokenRows ?? [])
      .map((r: { token: string }) => r.token)
      .filter((t: unknown): t is string => typeof t === 'string' && EXPO_TOKEN_RE.test(t));
    if (tokens.length === 0) return json({ success: true, sent: 0, removed: 0, skipped: 'no_tokens' }, 200);

    const type = typeof record.type === 'string' ? record.type : '';
    const critical = CRITICAL_TYPES.has(type);
    const deepLinkPath = safeDeepLink(record.action_url);
    const data: Record<string, string> = {};
    if (deepLinkPath) data.deepLinkPath = deepLinkPath;
    if (type) data.type = type;

    const messages = tokens.map((to: string) => ({
      to,
      title,
      body,
      data,
      sound: 'default',
      priority: 'high',
      channelId: critical ? 'critical' : 'default',
    }));

    let sent = 0;
    const deadTokens: string[] = [];
    for (const batch of chunk(messages, EXPO_BATCH_SIZE)) {
      const tickets = await postToExpo(batch);
      if (!tickets) continue;
      tickets.forEach((ticket, i) => {
        if (ticket?.status === 'ok') {
          sent++;
        } else if (ticket?.details?.error === 'DeviceNotRegistered') {
          deadTokens.push(String(batch[i]?.to));
        } else if (ticket?.status === 'error') {
          // Log the error class only - never the message body or token.
          console.warn('[send-push] Expo ticket error:', ticket.details?.error ?? 'unknown');
        }
      });
    }

    let removed = 0;
    if (deadTokens.length > 0) {
      const { error: deleteError, count } = await admin
        .from('push_tokens')
        .delete({ count: 'exact' })
        .in('token', deadTokens);
      if (deleteError) console.error('[send-push] Failed to remove dead tokens:', deleteError.message);
      else removed = count ?? deadTokens.length;
    }

    return json({ success: true, sent, removed }, 200);
  } catch (err) {
    console.error('[send-push] Unexpected error:', err instanceof Error ? err.message : 'unknown');
    return json({ success: false, error: 'internal_error' }, 500);
  }
});
