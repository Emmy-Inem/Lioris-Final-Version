// login-with-username
//
// Signs a user in with their @handle + password WITHOUT ever sending their e-mail address to
// the browser. The old flow called the public RPC get_email_for_username(), which returned the
// e-mail address of any handle to anyone holding the publishable key (e-mail harvesting).
//
// Request:  POST { username, password, captchaToken? }
// Success:  200 { session: { access_token, refresh_token, expires_in, expires_at, token_type } }
// Failures: { error: '<code>', message: '<sentence for people>' }
//   invalid_credentials (401)   unknown handle and wrong password are deliberately identical
//   email_not_confirmed (403)   carries `email` - only revealed once the PASSWORD was correct
//   captcha_failed      (400)
//   rate_limited        (429)   too many FAILED attempts: 30 per IP / 5 min, and 10 per handle+IP / 15 min.
//                               Successful sign-ins are not counted, and the per-handle bucket includes the
//                               caller's IP so a stranger cannot lock a victim's handle out.
//   unavailable         (503)   limiter / configuration failure (fails closed)
//
// Note: the caller's real IP is NOT forwarded to GoTrue (supabase-js can not set it per request and
// the gateway overwrites forwarded headers), so Auth's own per-IP limits see this function's address;
// the limits above are what protect an individual account and caller here.
//
// Deployment:
//   supabase functions deploy login-with-username --no-verify-jwt
//   (needs SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY - all provided by default.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { readJsonBody } from '../_shared/body.ts';
import { clientIp, consumeRateLimit, createServiceClient, peekRateLimit } from '../_shared/ratelimit.ts';

const MAX_BODY_BYTES = 4096;
const IP_LIMIT = 30;
const IP_WINDOW_SECONDS = 5 * 60;
const HANDLE_LIMIT = 10;
const HANDLE_WINDOW_SECONDS = 15 * 60;

const INVALID = {
  error: 'invalid_credentials',
  message: 'Incorrect username or password. Check them and try again, or reset your password.',
};

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed', message: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const admin = createServiceClient();
  if (!url || !anonKey || !admin) {
    console.error('[login-with-username] Missing required environment secrets.');
    return jsonResponse(req, { error: 'unavailable', message: 'Sign-in is temporarily unavailable. Please use your e-mail address.' }, 503);
  }

  const parsed = await readJsonBody<{ username?: unknown; password?: unknown; captchaToken?: unknown }>(req, MAX_BODY_BYTES);
  if (!parsed.ok) return jsonResponse(req, { error: 'bad_request', message: parsed.error }, parsed.status);

  const rawHandle = typeof parsed.value.username === 'string' ? parsed.value.username : '';
  const handle = rawHandle.trim().replace(/^@/, '').toLowerCase();
  const password = typeof parsed.value.password === 'string' ? parsed.value.password : '';
  const captchaToken = typeof parsed.value.captchaToken === 'string' && parsed.value.captchaToken ? parsed.value.captchaToken : undefined;

  if (!/^[a-z0-9._]{3,24}$/.test(handle) || password.length < 1 || password.length > 256) {
    return jsonResponse(req, INVALID, 401);
  }

  // Only FAILED attempts count. The per-handle bucket is keyed by handle + IP, so a stranger who
  // hammers a victim's handle only locks out their OWN address, never the victim's. The buckets are
  // read here (peek) and spent by failLogin() below.
  const ip = clientIp(req);
  const ipKey = `login-ip:${ip}`;
  const handleKey = `login-handle:${handle}:${ip}`;
  const [ipFails, handleFails] = await Promise.all([
    peekRateLimit(admin, ipKey, IP_WINDOW_SECONDS),
    peekRateLimit(admin, handleKey, HANDLE_WINDOW_SECONDS),
  ]);
  if (ipFails === null || handleFails === null) {
    return jsonResponse(req, { error: 'unavailable', message: 'Sign-in is temporarily unavailable. Please use your e-mail address.' }, 503);
  }
  if (ipFails >= IP_LIMIT || handleFails >= HANDLE_LIMIT) {
    return jsonResponse(
      req,
      { error: 'rate_limited', message: 'Too many failed sign-in attempts. Please wait a few minutes and try again.' },
      429,
      { 'Retry-After': '300' },
    );
  }
  /** Count one failed attempt against both buckets (unknown handle and wrong password look identical). */
  const failLogin = async (countHandle = true): Promise<Response> => {
    await consumeRateLimit(admin, ipKey, IP_LIMIT, IP_WINDOW_SECONDS);
    if (countHandle) await consumeRateLimit(admin, handleKey, HANDLE_LIMIT, HANDLE_WINDOW_SECONDS);
    return jsonResponse(req, INVALID, 401);
  };

  let email: string | null = null;
  try {
    const { data, error } = await admin.rpc('get_email_for_username', { p_username: handle });
    if (!error && typeof data === 'string' && data.length > 0) email = data;
  } catch (err) {
    console.error('[login-with-username] handle lookup failed:', err instanceof Error ? err.message : 'unknown');
  }
  // Unknown handle: answer exactly like a wrong password.
  if (!email) return await failLogin();

  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  });

  if (error || !data?.session) {
    const code = (error as { code?: string } | null)?.code ?? '';
    const msg = (error?.message ?? '').toLowerCase();
    if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
      return jsonResponse(req, { error: 'email_not_confirmed', message: 'Please confirm your e-mail address first.', email }, 403);
    }
    if (code === 'captcha_failed' || msg.includes('captcha')) {
      await consumeRateLimit(admin, ipKey, IP_LIMIT, IP_WINDOW_SECONDS); // per-IP only: no password was tested
      return jsonResponse(req, { error: 'captcha_failed', message: 'Security verification failed or expired. Please complete the security check again.' }, 400);
    }
    if (code === 'over_request_rate_limit' || msg.includes('rate limit')) {
      return jsonResponse(req, { error: 'rate_limited', message: 'Too many sign-in attempts. Please wait a few minutes and try again.' }, 429, { 'Retry-After': '300' });
    }
    return await failLogin();
  }

  const s = data.session;
  return jsonResponse(
    req,
    {
      session: {
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_in: s.expires_in,
        expires_at: s.expires_at,
        token_type: s.token_type,
      },
    },
    200,
  );
});
