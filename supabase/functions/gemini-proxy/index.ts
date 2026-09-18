// gemini-proxy
//
// Server-side bridge to Google Gemini for the AI Study Copilot.
//
// Why this exists: the client used to read EXPO_PUBLIC_GEMINI_API_KEY, and anything
// prefixed EXPO_PUBLIC_ is compiled into the public app bundle, so setting the key
// would have published it to every visitor. Here the key lives only in a Supabase
// secret and the client never sees it.
//
// Hardening (all enforced here, not just at the gateway):
//   * A real, signed-in, NON-anonymous user is REQUIRED. There is no shared/anonymous
//     fallback: the anon key alone is rejected with 401, and suspended users get 403.
//   * Rate limits are durable (public.consume_rate_limit via the service-role client):
//     30 requests/hour and 5 requests/60s per user. If the limiter is unavailable the
//     request FAILS CLOSED (503) rather than allowing unmetered use.
//   * The system prompt is owned by this function (callers cannot swap it), `mode` is an
//     allow-list, and the total request body, prompt and image sizes are capped before
//     anything is parsed or forwarded. Image base64 charset and mime type are validated.
//   * Prompts are never logged.
//
// Behaviour without a key: responds 503 { error: "not_configured" } and the client
// falls back to its offline study templates and labels them honestly.
//
// Deployment (verify_jwt stays ON; this function also verifies the user itself):
//   supabase functions deploy gemini-proxy
//   supabase secrets set GEMINI_API_KEY=<key from Google AI Studio>
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service role key>   # rate limiting
//   supabase secrets set ALLOWED_ORIGINS=https://lioris.app,https://www.lioris.app,...

import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { requireUser } from '../_shared/auth.ts';
import { readJsonBody } from '../_shared/body.ts';
import { consumeRateLimit, createServiceClient } from '../_shared/ratelimit.ts';

const MODES = ['explain', 'past_question', 'quiz', 'schedule', 'math_solve', 'flashcards'];
const MODELS = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
const MAX_PROMPT_CHARS = 8000;
const MAX_IMAGE_BASE64_CHARS = 5_000_000;
// Whole-body cap: image base64 + prompt (up to 4 bytes/char in UTF-8) + JSON overhead.
const MAX_BODY_BYTES = MAX_IMAGE_BASE64_CHARS + MAX_PROMPT_CHARS * 4 + 4096;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

const HOURLY_LIMIT = 30;
const HOURLY_WINDOW_SECONDS = 60 * 60;
const BURST_LIMIT = 5;
const BURST_WINDOW_SECONDS = 60;

const SYSTEM_PROMPT = `You are Lioris Academic AI, an elite university tutor and researcher powered by Google Gemini.
Your job is to provide clear, high-yield academic explanations, step-by-step past question breakdowns, handwritten chalkboard and equation solutions in standard LaTeX notation, and active-recall study aids.
Only help with academic and study topics; politely decline anything else.
Structure your answers with clean markdown headings, numbered steps, bold key terms, and practical exam tips.
When mathematical equations or formulas are present, render them clearly with LaTeX formatting (\\[ ... \\] for display math, \\( ... \\) for inline math).
Keep explanations rigorous, pedagogical, encouraging, and free of fluff.`;

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405);

  // --- 1. Authenticate: a real, non-anonymous, non-suspended user ------------
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const { user, callerClient } = auth.caller;

  const { data: profile, error: profileError } = await callerClient
    .from('profiles')
    .select('is_suspended')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile) {
    return jsonResponse(req, { error: 'Account unavailable.' }, 403);
  }
  if (profile.is_suspended === true) {
    return jsonResponse(req, { error: 'Account suspended.' }, 403);
  }

  // --- 2. Validate input (body size is capped BEFORE parsing) ---------------
  const parsed = await readJsonBody<{
    prompt?: unknown;
    mode?: unknown;
    image?: { base64?: unknown; mimeType?: unknown };
  }>(req, MAX_BODY_BYTES);
  if (!parsed.ok) return jsonResponse(req, { error: parsed.error }, parsed.status);
  const body = parsed.value;

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    return jsonResponse(req, { error: `prompt is required and must be at most ${MAX_PROMPT_CHARS} characters.` }, 400);
  }
  const mode = typeof body.mode === 'string' && MODES.includes(body.mode) ? body.mode : 'explain';

  let imagePart: Record<string, unknown> | null = null;
  if (body.image && body.image.base64) {
    if (typeof body.image.base64 !== 'string') {
      return jsonResponse(req, { error: 'Invalid image.' }, 400);
    }
    const base64 = body.image.base64.replace(/^data:image\/[a-z]+;base64,/, '');
    const mimeType = typeof body.image.mimeType === 'string' ? body.image.mimeType : 'image/jpeg';
    if (
      base64.length === 0 ||
      base64.length > MAX_IMAGE_BASE64_CHARS ||
      !ALLOWED_IMAGE_TYPES.includes(mimeType) ||
      !BASE64_RE.test(base64)
    ) {
      return jsonResponse(req, { error: 'Image must be a valid JPEG, PNG or WebP under ~3.5MB.' }, 400);
    }
    imagePart = { inlineData: { mimeType, data: base64 } };
  }

  // --- 3. Not configured: tell the client to use its offline fallback ------
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) return jsonResponse(req, { error: 'not_configured' }, 503);

  // --- 4. Durable per-user rate limits (FAIL CLOSED) ------------------------
  const admin = createServiceClient();
  if (!admin) {
    console.error('[gemini-proxy] SUPABASE_SERVICE_ROLE_KEY missing; refusing to run unmetered.');
    return jsonResponse(req, { error: 'Service temporarily unavailable.' }, 503);
  }
  const burst = await consumeRateLimit(admin, `gemini-burst:${user.id}`, BURST_LIMIT, BURST_WINDOW_SECONDS);
  if (burst === 'error') return jsonResponse(req, { error: 'Service temporarily unavailable.' }, 503);
  if (burst === 'limited') {
    return jsonResponse(req, { error: 'Too many requests. Please slow down.' }, 429, { 'Retry-After': '60' });
  }
  const hourly = await consumeRateLimit(admin, `gemini:${user.id}`, HOURLY_LIMIT, HOURLY_WINDOW_SECONDS);
  if (hourly === 'error') return jsonResponse(req, { error: 'Service temporarily unavailable.' }, 503);
  if (hourly === 'limited') {
    return jsonResponse(req, { error: 'Rate limit reached. Please try again later.' }, 429, {
      'Retry-After': '3600',
    });
  }

  // --- 5. Call Gemini -------------------------------------------------------
  const parts: Record<string, unknown>[] = [];
  if (imagePart) parts.push(imagePart);
  parts.push({ text: `${SYSTEM_PROMPT}\n\nTask Mode: ${mode}\n\nStudent Prompt:\n${prompt}` });

  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
          }),
          signal: AbortSignal.timeout(45000),
        },
      );
      if (!res.ok) {
        console.error(`[gemini-proxy] ${model} returned HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof content === 'string' && content.length > 0) {
        return jsonResponse(req, { content, model }, 200);
      }
    } catch (err) {
      console.error(`[gemini-proxy] ${model} call failed:`, err instanceof Error ? err.name : 'error');
    }
  }

  return jsonResponse(req, { error: 'AI service unavailable.' }, 502);
});
