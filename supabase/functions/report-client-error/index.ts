// report-client-error
//
// Self-hosted sink for client-side (browser / React Native) errors, so production
// crashes are visible without a third-party monitoring vendor. The app posts here from
// src/monitoring/errorReporter.ts; admins read the rows in `public.client_errors`
// (Admin > System Health > Client errors).
//
// Request:  POST { message, stack?, fingerprint?, url?, release?, session_id?, level?, context? }
// Response: 204 stored | 202 dropped (limiter/storage unavailable) | 4xx invalid request
//
// Design notes:
//   * Errors happen before login too, so this is deployed with --no-verify-jwt (the
//     anon/publishable key alone is accepted). When a real user JWT is present it is
//     validated here and the verified user id is stored; a client-supplied user id is
//     never trusted.
//   * Monitoring must never break the app: infrastructure failures (no service key, the
//     rate-limit RPC failing, a database error) FAIL OPEN, meaning the request still gets
//     a success-class status, and the report is simply dropped.
//   * Abuse controls: 16 KB body cap, every field validated and truncated, per-IP
//     30 reports / 10 minutes, per-user 60 reports / hour, and repeats of one fingerprint
//     within an hour bump `occurrences` on a single row instead of inserting more rows.
//   * PII: emails, bearer tokens, JWTs and URL query strings are scrubbed again here
//     (the client already scrubs; this is defence in depth against modified clients).
//   * Internals are never echoed back.
//
// Deployment:
//   supabase functions deploy report-client-error --no-verify-jwt
//   (needs the standard SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY secrets; ALLOWED_ORIGINS
//   is optional.)

import { corsHeaders, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { readJsonBody } from '../_shared/body.ts';
import { clientIp, consumeRateLimit, createServiceClient } from '../_shared/ratelimit.ts';
import { isUuid } from '../_shared/auth.ts';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_MESSAGE = 1000;
const MAX_STACK = 6000;
const MAX_URL = 300;
const MAX_CONTEXT = 2000;
const MAX_USER_AGENT = 300;

const IP_LIMIT = 30;
const IP_WINDOW_SECONDS = 10 * 60;
const USER_LIMIT = 60;
const USER_WINDOW_SECONDS = 60 * 60;
const DEDUPE_WINDOW_MS = 60 * 60 * 1000;

const LEVELS = new Set(['error', 'warning', 'info']);

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...[truncated]` : value;
}

function scrub(input: string): string {
  return input
    .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[jwt]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [token]')
    .replace(/\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[key]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, '[email]')
    .replace(/(https?:\/\/[^\s?#"'<>)]+)[?#][^\s"'<>)]*/g, '$1')
    .replace(/\b(access_token|refresh_token|token|apikey|api_key|password|code)=[^\s&"']+/gi, '$1=[redacted]');
}

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return truncate(scrub(trimmed), max);
}

/** Path only: no origin, query string or hash. */
function cleanPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  let path = value;
  try {
    path = new URL(value, 'http://localhost').pathname;
  } catch {
    path = value.split(/[?#]/)[0];
  }
  return truncate(scrub(path), MAX_URL);
}

function cleanContext(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    const json = JSON.stringify(value, (_k, v) => (typeof v === 'string' ? scrub(v) : v));
    if (!json) return {};
    if (json.length > MAX_CONTEXT) return { truncated: true, preview: json.slice(0, MAX_CONTEXT) };
    return JSON.parse(json);
  } catch {
    return {};
  }
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function resolveFingerprint(raw: unknown, message: string, stack: string | null): Promise<string> {
  // Clients send a short hex hash; anything else is replaced by a server-side hash so a
  // caller cannot smuggle arbitrary text into the grouping column.
  if (typeof raw === 'string' && /^[a-f0-9]{8,64}$/.test(raw)) return raw;
  const firstFrame = (stack ?? '').split('\n').find((l) => /^\s*(at\s|.*@)/.test(l)) ?? '';
  return (await sha256Hex(`${message}|${firstFrame.trim()}`)).slice(0, 16);
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? req.headers.get('authorization');
  const m = header ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null;
  return m ? m[1].trim() : null;
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405);

  const parsed = await readJsonBody<Record<string, unknown>>(req, MAX_BODY_BYTES);
  if (!parsed.ok) return jsonResponse(req, { error: parsed.error }, parsed.status);
  const body = parsed.value;

  const message = cleanString(body.message, MAX_MESSAGE);
  if (!message) return jsonResponse(req, { error: 'message is required.' }, 400);

  // From here on, infrastructure problems drop the report but never surface as errors.
  const dropped = () => new Response(null, { status: 202, headers: corsHeaders(req) });

  try {
    const admin = createServiceClient();
    if (!admin) {
      console.error('[report-client-error] Missing service credentials; dropping report.');
      return dropped();
    }

    const ipVerdict = await consumeRateLimit(admin, `client-error-ip:${clientIp(req)}`, IP_LIMIT, IP_WINDOW_SECONDS);
    if (ipVerdict === 'limited') {
      return jsonResponse(req, { error: 'Too many reports.' }, 429, { 'Retry-After': String(IP_WINDOW_SECONDS) });
    }
    if (ipVerdict === 'error') return dropped(); // fail open, drop the report

    // Optional user attribution: only a JWT that Auth validates counts. The anon /
    // publishable key is not a user and simply yields an anonymous report.
    let userId: string | null = null;
    const token = bearerToken(req);
    if (token && token.split('.').length === 3) {
      try {
        const { data, error } = await admin.auth.getUser(token);
        if (!error && data?.user && isUuid(data.user.id) && data.user.is_anonymous !== true) {
          userId = data.user.id;
        }
      } catch {
        userId = null;
      }
    }
    if (userId) {
      const userVerdict = await consumeRateLimit(admin, `client-error-user:${userId}`, USER_LIMIT, USER_WINDOW_SECONDS);
      if (userVerdict === 'limited') {
        return jsonResponse(req, { error: 'Too many reports.' }, 429, { 'Retry-After': String(USER_WINDOW_SECONDS) });
      }
      if (userVerdict === 'error') return dropped();
    }

    const stack = cleanString(body.stack, MAX_STACK);
    const fingerprint = await resolveFingerprint(body.fingerprint, message, stack);
    const level = typeof body.level === 'string' && LEVELS.has(body.level) ? body.level : 'error';
    const release =
      typeof body.release === 'string' && /^[\w.@+-]{1,64}$/.test(body.release) ? body.release : null;
    const sessionId =
      typeof body.session_id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(body.session_id) ? body.session_id : null;
    const userAgent = truncate((req.headers.get('user-agent') ?? '').trim(), MAX_USER_AGENT) || null;
    const now = new Date();

    // Repeat of a recent fingerprint: bump the counter on the existing row.
    const since = new Date(now.getTime() - DEDUPE_WINDOW_MS).toISOString();
    const { data: existing, error: lookupError } = await admin
      .from('client_errors')
      .select('id, occurrences')
      .eq('fingerprint', fingerprint)
      .gte('last_seen_at', since)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lookupError) {
      console.error('[report-client-error] lookup failed:', lookupError.message);
      return dropped();
    }

    if (existing) {
      const { error: updateError } = await admin
        .from('client_errors')
        .update({ occurrences: (existing.occurrences ?? 1) + 1, last_seen_at: now.toISOString() })
        .eq('id', existing.id);
      if (updateError) {
        console.error('[report-client-error] update failed:', updateError.message);
        return dropped();
      }
    } else {
      const { error: insertError } = await admin.from('client_errors').insert({
        user_id: userId,
        session_id: sessionId,
        fingerprint,
        message,
        stack,
        url: cleanPath(body.url),
        user_agent: userAgent,
        release,
        level,
        context: cleanContext(body.context),
        occurrences: 1,
        last_seen_at: now.toISOString(),
      });
      if (insertError) {
        console.error('[report-client-error] insert failed:', insertError.message);
        return dropped();
      }
    }

    return new Response(null, { status: 204, headers: corsHeaders(req) });
  } catch (err) {
    console.error('[report-client-error] unexpected failure:', err instanceof Error ? err.message : 'unknown');
    return dropped();
  }
});
