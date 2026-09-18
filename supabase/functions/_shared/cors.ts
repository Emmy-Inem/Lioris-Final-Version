// Shared CORS helpers for all Lioris edge functions.
//
// The allow-list comes from the ALLOWED_ORIGINS secret (comma separated). The
// request Origin is echoed back ONLY when it is on that list; every response
// carries `Vary: Origin` so caches never serve one origin's headers to another.
// Requests without an Origin header (native apps, curl, server-to-server) are
// not subject to CORS and simply receive no Access-Control-Allow-Origin header.

export const DEFAULT_ALLOWED_ORIGINS = [
  'https://lioris-final-version.vercel.app',
  'https://lioris.app',
  'https://www.lioris.app',
  'http://localhost:8081',
  'http://localhost:19006',
];

export function allowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  if (!raw || !raw.trim()) return DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => o.length > 0);
}

export function corsHeaders(req: Request, methods = 'POST, OPTIONS'): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Max-Age': '600',
  };
  const origin = req.headers.get('Origin');
  if (origin && allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

/** Handle the CORS preflight. Returns a Response for OPTIONS, otherwise null. */
export function handlePreflight(req: Request, methods = 'POST, OPTIONS'): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(req, methods) });
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}
