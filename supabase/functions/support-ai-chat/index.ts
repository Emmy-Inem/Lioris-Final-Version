// support-ai-chat
//
// Server-side bridge to Google Gemini for the customer-care AI assistant
// (Settings > Help & Support). Separate from gemini-proxy (the academic study
// copilot): different system prompt, different job - answer "how do I..."
// questions about using Lioris, and say plainly when it cannot help so the
// client can offer to open a support ticket instead.
//
// This function is intentionally STATELESS: it never writes to the database.
// A conversation lives only in the client's memory. If the assistant cannot
// help, the client embeds the transcript verbatim into a new support ticket
// (public.support_tickets, origin='ai_escalation') via the existing ticket
// API - nothing here needs its own table, so nothing is retained about a
// question the assistant successfully answered.
//
// Contract: the model is instructed to end its raw reply with a machine-
// readable marker line, `[[NEEDS_HUMAN:true]]` or `[[NEEDS_HUMAN:false]]`,
// which this function parses and strips before returning `content` - the
// client never sees the marker. A missing or malformed marker defaults to
// true (escalate): failing toward "let a human look at it" is the safe
// default, never the other way round.
//
// Hardening (mirrors gemini-proxy):
//   * A real, signed-in, non-suspended, non-anonymous user is required.
//   * Rate limits are durable (public.consume_rate_limit): 30 requests/hour
//     and 6 requests/60s per user. Fails CLOSED (503) if the limiter itself
//     is unavailable.
//   * The system prompt is owned by this function; only `message` and a
//     short, size-capped `history` are accepted from the client.
//   * Conversation content is never logged.
//
// Behaviour without a key: responds 503 { error: "not_configured" } and the
// client falls back straight to the "create a support ticket" path.
//
// Deployment (verify_jwt stays ON; this function also verifies the user itself):
//   supabase functions deploy support-ai-chat
//   (reuses the GEMINI_API_KEY / SUPABASE_SERVICE_ROLE_KEY / ALLOWED_ORIGINS secrets already set for gemini-proxy)

import { handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { requireUser } from '../_shared/auth.ts';
import { readJsonBody } from '../_shared/body.ts';
import { consumeRateLimit, createServiceClient } from '../_shared/ratelimit.ts';

const MODELS = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_TURNS = 12;
const MAX_BODY_BYTES = (MAX_MESSAGE_CHARS * (MAX_HISTORY_TURNS + 1) * 4) + 4096;

const HOURLY_LIMIT = 30;
const HOURLY_WINDOW_SECONDS = 60 * 60;
const BURST_LIMIT = 6;
const BURST_WINDOW_SECONDS = 60;

const NEEDS_HUMAN_RE = /\[\[NEEDS_HUMAN:\s*(true|false)\s*\]\]\s*$/i;

const SYSTEM_PROMPT = `You are the Lioris Help & Support assistant - a friendly, concise first line of customer care for the Lioris campus platform (a mobile/web app for university students, alumni, staff and admins in Nigeria).

WHAT LIORIS DOES (answer "how do I..." questions about these using this knowledge):
- Accounts & verification: sign up with a university or personal email; an official .edu-style institutional email auto-verifies the account, a personal email needs a manually reviewed document upload (Settings > Account) or is auto-verified for admins. Two-factor authentication (TOTP) and a biometric/password app lock are optional, turned on under Settings > Security.
- Campus scope: every account belongs to one home campus; only admins can browse other campuses ("Explore Other Campus Workspaces").
- Forum: campus and global discussion communities, posts with text/image/video/polls, comments, likes and reposts. Liking or commenting on someone's post notifies them.
- Academic Resources: a shared library of past questions, notes and projects, organised by course code and department; uploads are held for review before appearing.
- Events: RSVP to campus events; if an event is at capacity, join its waitlist and you are automatically registered if a spot opens up. Some events are "paid" - Lioris never processes payment itself, it only refers you to the organiser's own payment page or venue and lets the organiser confirm your entry at the door.
- Jobs & careers: students and alumni post job/internship opportunities; postings from non-staff/admin accounts are held for a quick review before going live. Applicants can apply in-app with a CV upload, saved for reuse, plus any screening questions the poster added; ranking is automatic based on profile relevance, not a parsed resume.
- Alumni directory & giving: alumni can be found by graduation year, industry and company; alumni can also start a "Give Back" giving/fundraising campaign pointing at their own external giving page (again, Lioris never processes the gift itself, and every campaign is reviewed before going live).
- Marketplace: buy/sell textbooks, electronics and dorm items between students.
- Mentorship & study pods: alumni-led mentorship requests, and student-run study groups.
- Messaging & notifications: direct messages and an in-app notification feed; push notification, alert and privacy preferences are all in Settings.
- Data & privacy: a user can export their own data or permanently delete their account from Settings > Privacy & Data at any time.
- Admins have a separate moderation/approval console for jobs, events, resources, forum threads, donation campaigns and reported content; only admins can suspend accounts, grant verification, or take actions on someone else's account.

WHAT YOU CANNOT DO - escalate to a human (see rules below) for any of these, because you have no access to any user's account, database records, or admin tools:
- Anything specific to the asker's own account: "why was I suspended", "my student ID is wrong", "I didn't get verified", "my campus is wrong", "I can't log in", billing/payment/donation disputes, harassment/safety reports, or anything you would need to look something up to answer correctly.
- Anything you are not sure about, or that depends on information you were not given.
- Bug reports (the user experienced an error or something did not work) - acknowledge it, but always hand these to a human with the details they gave you, since a human needs to reproduce and fix it.

STYLE: Be warm, brief, and specific. Use short paragraphs or a short numbered/bulleted list for steps. Never invent a feature, policy, price, or timeline that was not described above. Never ask for or repeat back a password, verification code, or payment/card details.

OUTPUT FORMAT (required, every reply): write your normal reply to the student first, then on its own final line write exactly one of:
[[NEEDS_HUMAN:false]]  - you fully answered a general "how do I / what is" question using only the knowledge above
[[NEEDS_HUMAN:true]]   - the question needs a human (anything in the "cannot do" list above, or you are unsure)
Do not explain the marker or mention it to the student - it is read by the app, not shown to them.`;

interface HistoryTurn {
  role?: unknown;
  content?: unknown;
}

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405);

  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const { user, callerClient } = auth.caller;

  const { data: profile, error: profileError } = await callerClient
    .from('profiles')
    .select('is_suspended')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile) return jsonResponse(req, { error: 'Account unavailable.' }, 403);
  if (profile.is_suspended === true) return jsonResponse(req, { error: 'Account suspended.' }, 403);

  const parsed = await readJsonBody<{ message?: unknown; history?: unknown }>(req, MAX_BODY_BYTES);
  if (!parsed.ok) return jsonResponse(req, { error: parsed.error }, parsed.status);
  const body = parsed.value;

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > MAX_MESSAGE_CHARS) {
    return jsonResponse(req, { error: `message is required and must be at most ${MAX_MESSAGE_CHARS} characters.` }, 400);
  }

  const rawHistory = Array.isArray(body.history) ? (body.history as HistoryTurn[]) : [];
  const history = rawHistory
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => {
      const role = turn.role === 'assistant' ? 'model' : 'user';
      const content = typeof turn.content === 'string' ? turn.content.trim().slice(0, MAX_MESSAGE_CHARS) : '';
      return content ? { role, content } : null;
    })
    .filter((turn): turn is { role: string; content: string } => turn !== null);

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) return jsonResponse(req, { error: 'not_configured' }, 503);

  const admin = createServiceClient();
  if (!admin) {
    console.error('[support-ai-chat] SUPABASE_SERVICE_ROLE_KEY missing; refusing to run unmetered.');
    return jsonResponse(req, { error: 'Service temporarily unavailable.' }, 503);
  }
  const burst = await consumeRateLimit(admin, `support-chat-burst:${user.id}`, BURST_LIMIT, BURST_WINDOW_SECONDS);
  if (burst === 'error') return jsonResponse(req, { error: 'Service temporarily unavailable.' }, 503);
  if (burst === 'limited') {
    return jsonResponse(req, { error: 'Too many requests. Please slow down.' }, 429, { 'Retry-After': '60' });
  }
  const hourly = await consumeRateLimit(admin, `support-chat:${user.id}`, HOURLY_LIMIT, HOURLY_WINDOW_SECONDS);
  if (hourly === 'error') return jsonResponse(req, { error: 'Service temporarily unavailable.' }, 503);
  if (hourly === 'limited') {
    return jsonResponse(req, { error: 'Rate limit reached. Please try again later, or open a support ticket instead.' }, 429, {
      'Retry-After': '3600',
    });
  }

  const contents = [
    ...history.map((turn) => ({ role: turn.role, parts: [{ text: turn.content }] })),
    { role: 'user', parts: [{ text: message }] },
  ];

  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            generationConfig: { temperature: 0.3, maxOutputTokens: 700 },
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!res.ok) {
        console.error(`[support-ai-chat] ${model} returned HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof raw !== 'string' || raw.length === 0) continue;

      const marker = NEEDS_HUMAN_RE.exec(raw);
      const needsHuman = marker ? marker[1].toLowerCase() === 'true' : true;
      const content = (marker ? raw.slice(0, marker.index) : raw).trim();
      if (!content) continue;

      return jsonResponse(req, { content, needsHuman, model }, 200);
    } catch (err) {
      console.error(`[support-ai-chat] ${model} call failed:`, err instanceof Error ? err.name : 'error');
    }
  }

  return jsonResponse(req, { error: 'AI service unavailable.' }, 502);
});
