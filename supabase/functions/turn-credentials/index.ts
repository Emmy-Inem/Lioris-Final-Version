// turn-credentials
//
// Issues short-lived Cloudflare Realtime TURN credentials so voice/video calls can
// relay media when a direct peer-to-peer path is impossible (symmetric NAT, mobile
// carrier CGNAT). Without a TURN relay those calls silently fail.
//
// Request:  POST {}   (body ignored)
// Response: { iceServers: [ { urls: [...], username?, credential? }, ... ] }
//           503 { error: 'not_configured' } when TURN_KEY_ID / TURN_KEY_API_TOKEN are
//           not set - the client then falls back to public STUN only.
//
// Requirements / guard rails:
//   * a valid, signed-in, NON-anonymous user (verify_jwt ON + requireUser)
//   * 30 requests per hour per user (durable rate limit, fails closed)
//   * the Cloudflare API token never leaves the server; only the generated,
//     1-hour credentials are returned
//
// Deployment (verify_jwt ON):
//   supabase functions deploy turn-credentials
//   supabase secrets set TURN_KEY_ID=<Cloudflare TURN key id> TURN_KEY_API_TOKEN=<Cloudflare TURN API token>

import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { requireUser } from '../_shared/auth.ts';
import { consumeRateLimit, createServiceClient } from '../_shared/ratelimit.ts';

const CREDENTIAL_TTL_SECONDS = 3600;
const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60 * 60;
const UPSTREAM_TIMEOUT_MS = 8000;

interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

function normaliseIceServers(payload: unknown): IceServer[] {
  const raw = (payload as { iceServers?: unknown } | null)?.iceServers;
  // Current API returns an array; the older API returned a single object.
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  const out: IceServer[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { urls?: unknown; username?: unknown; credential?: unknown };
    const urls = (Array.isArray(e.urls) ? e.urls : typeof e.urls === 'string' ? [e.urls] : []).filter(
      (u): u is string => typeof u === 'string' && /^(stun|stuns|turn|turns):/i.test(u),
    );
    if (urls.length === 0) continue;
    const server: IceServer = { urls };
    if (typeof e.username === 'string') server.username = e.username;
    if (typeof e.credential === 'string') server.credential = e.credential;
    out.push(server);
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405);

  const keyId = Deno.env.get('TURN_KEY_ID');
  const apiToken = Deno.env.get('TURN_KEY_API_TOKEN');
  if (!keyId || !apiToken) {
    return jsonResponse(req, { error: 'not_configured' }, 503);
  }

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const uid = auth.caller.user.id;

  const admin = createServiceClient();
  if (!admin) {
    console.error('[turn-credentials] Missing required environment secrets.');
    return jsonResponse(req, { error: 'Server misconfiguration.' }, 500);
  }

  const verdict = await consumeRateLimit(admin, `turn-credentials:${uid}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
  if (verdict === 'error') return jsonResponse(req, { error: 'Service temporarily unavailable.' }, 503);
  if (verdict === 'limited') {
    return jsonResponse(req, { error: 'Too many requests. Please try again later.' }, 429, {
      'Retry-After': '3600',
    });
  }

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      console.error(`[turn-credentials] Cloudflare responded ${res.status}.`);
      return jsonResponse(req, { error: 'TURN provider unavailable.' }, 502);
    }
    const iceServers = normaliseIceServers(await res.json());
    if (iceServers.length === 0) {
      console.error('[turn-credentials] Cloudflare returned no usable ICE servers.');
      return jsonResponse(req, { error: 'TURN provider unavailable.' }, 502);
    }
    return jsonResponse(req, { iceServers, ttl: CREDENTIAL_TTL_SECONDS }, 200);
  } catch (err) {
    console.error('[turn-credentials] Upstream error:', err instanceof Error ? err.name : 'unknown');
    return jsonResponse(req, { error: 'TURN provider unavailable.' }, 502);
  }
});
