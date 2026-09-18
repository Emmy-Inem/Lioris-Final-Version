// gemini-proxy
//
// Server-side bridge to Google Gemini for the AI Study Copilot.
//
// Why this exists: the client used to read EXPO_PUBLIC_GEMINI_API_KEY, and anything
// prefixed EXPO_PUBLIC_ is compiled into the public app bundle, so setting the key
// would have published it to every visitor. Here the key lives only in a Supabase
// secret and the client never sees it.
//
// Hardening: signed-in users only (verify_jwt + an explicit getUser check), the system
// prompt is owned by this function (callers cannot swap it), mode is an allow-list,
// prompt/image sizes are capped and each user is rate limited, so this cannot be used
// as a free general-purpose LLM endpoint.
//
// Behaviour without a key: responds 503 { error: "not_configured" } and the client
// falls back to its offline study templates and labels them honestly.
//
// Deployment:
//   supabase functions deploy gemini-proxy
//   supabase secrets set GEMINI_API_KEY=<key from Google AI Studio>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODES = ['explain', 'past_question', 'quiz', 'schedule', 'math_solve', 'flashcards'];
const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash'];
const MAX_PROMPT_CHARS = 8000;
const MAX_IMAGE_BASE64_CHARS = 5_000_000;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const RATE_LIMIT = 30; // requests per user per hour (best effort: per warm isolate)
const RATE_WINDOW_MS = 60 * 60 * 1000;

const SYSTEM_PROMPT = `You are Lioris Academic Study Copilot, an elite university tutor and researcher.
Your job is to provide clear, high-yield academic explanations, step-by-step past question breakdowns, handwritten chalkboard and equation solutions in standard LaTeX notation, and active-recall study aids.
Only help with academic and study topics; politely decline anything else.
Structure your answers with clean markdown headings, numbered steps, bold key terms, and practical exam tips.
When mathematical equations or formulas are present, render them clearly with LaTeX formatting (\\[ ... \\] for display math, \\( ... \\) for inline math).
Keep explanations rigorous, pedagogical, encouraging, and free of fluff.`;

const usage = new Map<string, { count: number; resetAt: number }>();

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'Server misconfiguration.' }, 500);
  }

  // --- 1. Caller must be a signed-in user ---------------------------------
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header.' }, 401);
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await callerClient.auth.getUser();
  if (authError || !user) return json({ error: 'Invalid or expired session.' }, 401);

  // --- 2. Validate input ----------------------------------------------------
  let body: { prompt?: unknown; mode?: unknown; image?: { base64?: unknown; mimeType?: unknown } };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON request body.' }, 400);
  }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    return json({ error: `prompt is required and must be at most ${MAX_PROMPT_CHARS} characters.` }, 400);
  }
  const mode = typeof body.mode === 'string' && MODES.includes(body.mode) ? body.mode : 'explain';

  let imagePart: Record<string, unknown> | null = null;
  if (body.image?.base64) {
    const base64 = String(body.image.base64).replace(/^data:image\/[a-z]+;base64,/, '');
    const mimeType = String(body.image.mimeType || 'image/jpeg');
    if (base64.length > MAX_IMAGE_BASE64_CHARS || !ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      return json({ error: 'Image must be a JPEG, PNG or WebP under ~3.5MB.' }, 400);
    }
    imagePart = { inlineData: { mimeType, data: base64 } };
  }

  // --- 3. Not configured: tell the client to use its offline fallback ------
  if (!GEMINI_API_KEY) return json({ error: 'not_configured' }, 503);

  // --- 4. Per-user rate limit ----------------------------------------------
  const now = Date.now();
  const entry = usage.get(user.id);
  if (!entry || now > entry.resetAt) {
    usage.set(user.id, { count: 1, resetAt: now + RATE_WINDOW_MS });
  } else if (entry.count >= RATE_LIMIT) {
    return json({ error: 'Rate limit reached. Please try again later.' }, 429);
  } else {
    entry.count += 1;
  }
  if (usage.size > 5000) usage.clear();

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
        return json({ content, model }, 200);
      }
    } catch (err) {
      console.error(`[gemini-proxy] ${model} call failed:`, err instanceof Error ? err.message : err);
    }
  }

  return json({ error: 'AI service unavailable.' }, 502);
});
