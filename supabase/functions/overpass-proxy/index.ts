// overpass-proxy
//
// overpass-api.de answers any browser-style User-Agent with a 406 that carries no
// CORS headers, so the campus map's "OpenStreetMap Live" lookup can never succeed
// from the web app. This function makes the request server-side with an identifying
// User-Agent (which Overpass accepts) and returns the JSON with CORS enabled.
//
// It is deliberately NOT a generic Overpass relay: the client sends only a
// coordinate, and the query is built here, so it cannot be used to run arbitrary
// Overpass QL. Public data only, hence deployed with --no-verify-jwt.
//
// Deployment:
//   supabase functions deploy overpass-proxy --no-verify-jwt

import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { readJsonBody } from '../_shared/body.ts';
import { clientIp, consumeRateLimit, createServiceClient } from '../_shared/ratelimit.ts';

const MAX_BODY_BYTES = 1024; // the client only ever sends { lat, lon }
const IP_RATE_LIMIT = 30; // requests per IP per 10 minutes (fails OPEN: public data)
const IP_RATE_WINDOW_SECONDS = 600;

// Overpass requires a non-browser, identifying User-Agent with contact details.
const USER_AGENT = 'Lioris/1.0 (contact: https://lioris-final-version.vercel.app)';
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const CACHE_TTL_MS = 10 * 60 * 1000;
const RADIUS_METERS = 2500;

const cache = new Map<string, { at: number; body: string }>();

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
    jsonResponse(req, body, status, extra);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const parsed = await readJsonBody<{ lat?: unknown; lon?: unknown }>(req, MAX_BODY_BYTES);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
  const body = parsed.value;

  const lat = Number(body?.lat);
  const lon = Number(body?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return json({ error: 'lat and lon must be valid coordinates.' }, 400);
  }

  // Per-IP rate limit. Best effort: if the limiter is unavailable (no service key or
  // RPC error) we fail OPEN because this endpoint only serves public map data.
  const admin = createServiceClient();
  if (admin) {
    const verdict = await consumeRateLimit(admin, `overpass:${clientIp(req)}`, IP_RATE_LIMIT, IP_RATE_WINDOW_SECONDS);
    if (verdict === 'limited') return json({ error: 'Too many requests.' }, 429, { 'Retry-After': '600' });
  }

  // ~1km grid so nearby requests share a cache entry.
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return json(hit.body, 200);

  const query = `[out:json][timeout:15];(
    node["amenity"~"atm|bank|clinic|pharmacy|hospital|cafe|restaurant|fast_food|library"](around:${RADIUS_METERS},${lat},${lon});
    node["building"~"university|college"](around:${RADIUS_METERS},${lat},${lon});
  );out center 25;`;

  // Race every mirror; the first valid JSON answer wins. Mirrors are individually flaky
  // (and some drop connections from cloud IP ranges), so serial retries were too slow.
  const attempts: string[] = [];
  const tryEndpoint = async (endpoint: string): Promise<string> => {
    const host = new URL(endpoint).host;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      JSON.parse(text); // reject non-JSON (e.g. an HTML error page served with 200)
      return text;
    } catch (err) {
      attempts.push(`${host}: ${err instanceof Error ? `${err.name} ${err.message}` : String(err)}`);
      throw err;
    }
  };

  try {
    const text = await Promise.any(ENDPOINTS.map(tryEndpoint));
    if (cache.size > 200) cache.clear();
    cache.set(key, { at: Date.now(), body: text });
    return json(text, 200);
  } catch {
    console.error('[overpass-proxy] all mirrors failed:', attempts.join(' | '));
    return json({ error: 'Overpass upstream unavailable.' }, 502);
  }
});
