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
//   rate_limited        (429)   per IP and per handle
//   unavailable         (503)   limiter / configuration failure (fails closed)
//
// Deployment:
//   supabase functions deploy login-with-username --no-verify-jwt
//   (needs SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY - all provided by default.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { readJsonBody } from '../_shared/body.ts';
import { clientIp, consumeRateLimit, createServiceClient } from '../_shared/ratelimit.ts';

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

  const ip = clientIp(req);
  const byIp = await consumeRateLimit(admin, `login-ip:${ip}`, IP_LIMIT, IP_WINDOW_SECONDS);
  const byHandle = await consumeRateLimit(admin, `login-handle:${handle}`, HANDLE_LIMIT, HANDLE_WINDOW_SECONDS);
  if (byIp === 'error' || byHandle === 'error') {
    return jsonResponse(req, { error: 'unavailable', message: 'Sign-in is temporarily unavailable. Please use your e-mail address.' }, 503);
  }
  if (byIp === 'limited' || byHandle === 'limited') {
    return jsonResponse(
      req,
      { error: 'rate_limited', message: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
      429,
      { 'Retry-After': '300' },
    );
  }

  let email: string | null = null;
  try {
    const { data, error } = await admin.rpc('get_email_for_username', { p_username: handle });
    if (!error && typeof data === 'string' && data.length > 0) email = data;
  } catch (err) {
    console.error('[login-with-username] handle lookup failed:', err instanceof Error ? err.message : 'unknown');
  }
  // Unknown handle: answer exactly like a wrong password.
  if (!email) return jsonResponse(req, INVALID, 401);

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
      return jsonResponse(req, { error: 'captcha_failed', message: 'Security verification failed or expired. Please complete the security check again.' }, 400);
    }
    if (code === 'over_request_rate_limit' || msg.includes('rate limit')) {
      return jsonResponse(req, { error: 'rate_limited', message: 'Too many sign-in attempts. Please wait a few minutes and try again.' }, 429, { 'Retry-After': '300' });
    }
    return jsonResponse(req, INVALID, 401);
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
