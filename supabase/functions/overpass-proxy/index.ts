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
const IP_RATE_LIMIT = 30; // requests per IP per 10 minutes
const IP_RATE_WINDOW_SECONDS = 600;
// When the durable limiter is unavailable (no service key, RPC error) a small per-isolate cap applies
// instead of unmetered access: 10 uncached lookups per IP per 10 minutes.
const FALLBACK_LIMIT = 10;
const FALLBACK_WINDOW_MS = IP_RATE_WINDOW_SECONDS * 1000;

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
const fallbackHits = new Map<string, { count: number; resetAt: number }>();

/** In-memory per-IP cap used only while the durable limiter is down. true = allowed. */
function fallbackAllowed(ip: string): boolean {
  const now = Date.now();
  if (fallbackHits.size > 1000) {
    for (const [k, v] of fallbackHits) if (v.resetAt <= now) fallbackHits.delete(k);
    if (fallbackHits.size > 1000) fallbackHits.clear();
  }
  const entry = fallbackHits.get(ip);
  if (!entry || entry.resetAt <= now) {
    fallbackHits.set(ip, { count: 1, resetAt: now + FALLBACK_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= FALLBACK_LIMIT;
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
    jsonResponse(req, body, status, extra);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const parsed = await readJsonBody<{ lat?: unknown; lon?: unknown }>(req, MAX_BODY_BYTES);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
  const body = parsed.value;

  const rawLat = Number(body?.lat);
  const rawLon = Number(body?.lon);
  if (!Number.isFinite(rawLat) || !Number.isFinite(rawLon) || Math.abs(rawLat) > 90 || Math.abs(rawLon) > 180) {
    return json({ error: 'lat and lon must be valid coordinates.' }, 400);
  }
  // Snap to a ~1km grid BEFORE the query is built, so the cache key and the data cached under it
  // always describe the same point (a neighbour's request can never be served another point's data).
  const lat = Math.round(rawLat * 100) / 100;
  const lon = Math.round(rawLon * 100) / 100;

  // Per-IP rate limit. The endpoint serves public map data, so a limiter outage does not turn it
  // off, but it is not left unmetered either: a small in-memory per-IP cap applies instead.
  const ip = clientIp(req);
  const admin = createServiceClient();
  const verdict = admin
    ? await consumeRateLimit(admin, `overpass:${ip}`, IP_RATE_LIMIT, IP_RATE_WINDOW_SECONDS)
    : 'error';
  if (verdict === 'limited' || (verdict === 'error' && !fallbackAllowed(ip))) {
    return json({ error: 'Too many requests.' }, 429, { 'Retry-After': '600' });
  }

  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return json(hit.body, 200);

  const query = `[out:json][timeout:15];(
    node["amenity"~"atm|bank|clinic|pharmacy|hospital|cafe|restaurant|fast_food|library"](around:${RADIUS_METERS},${lat},${lon});
    node["building"~"university|college"](around:${RADIUS_METERS},${lat},${lon});
  );out center 25;`;

  // Race every mirror; the first valid JSON answer wins. Mirrors are individually flaky
  // (and some drop connections from cloud IP ranges), so serial retries were too slow.
  // Every request shares one AbortController: as soon as a mirror wins (or all fail) the others are
  // aborted instead of running on for up to 20 s against public servers.
  const attempts: string[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const tryEndpoint = async (endpoint: string): Promise<string> => {
    const host = new URL(endpoint).host;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
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
    controller.abort(); // cancel the losing mirrors
    if (cache.size > 200) cache.clear();
    cache.set(key, { at: Date.now(), body: text });
    return json(text, 200);
  } catch {
    console.error('[overpass-proxy] all mirrors failed:', attempts.join(' | '));
    return json({ error: 'Overpass upstream unavailable.' }, 502);
  } finally {
    clearTimeout(timer);
  }
});
