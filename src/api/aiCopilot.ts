/**
 * AI Academic Study Copilot API
 *
 * Calls Google Gemini through the `gemini-proxy` Supabase edge function. The API key lives
 * only in a server-side secret; there is deliberately NO direct-to-Google fallback here
 * (an `EXPO_PUBLIC_` key would be compiled into the public bundle).
 *
 * Honesty rules this module enforces:
 *   * A canned study template is NEVER returned as if it were a Gemini answer. When the proxy
 *     cannot answer we throw a `CopilotError` that carries (a) a friendly, accurate reason and
 *     (b) an optional offline template the caller may show ONLY when it labels it as a template.
 *   * `CopilotResponse.source` distinguishes 'gemini' from 'offline_template' so the UI can badge it.
 *
 * Request limits below mirror `supabase/functions/gemini-proxy/index.ts` exactly so the user is
 * told which limit they hit before a doomed round-trip.
 */

import { supabase } from './supabase';

export type CopilotMode =
  | 'explain'
  | 'past_question'
  | 'quiz'
  | 'schedule'
  | 'math_solve'
  | 'flashcards';

/** Must stay in sync with MODES in supabase/functions/gemini-proxy/index.ts. */
export const COPILOT_MODES: CopilotMode[] = [
  'explain',
  'past_question',
  'quiz',
  'schedule',
  'math_solve',
  'flashcards',
];

/** Mirrors MAX_PROMPT_CHARS in the proxy. */
export const MAX_PROMPT_CHARS = 8000;
/** Mirrors MAX_IMAGE_BASE64_CHARS in the proxy (~3.5MB of binary image data). */
export const MAX_IMAGE_BASE64_CHARS = 5_000_000;
/** Mirrors ALLOWED_IMAGE_TYPES in the proxy. */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface MultimodalAttachment {
  base64: string;
  mimeType: string;
}

export type CopilotSource = 'gemini' | 'offline_template';

export interface CopilotResponse {
  content: string;
  mode: CopilotMode;
  source: CopilotSource;
  /** Gemini model that actually answered, as reported by the proxy. Only set when source === 'gemini'. */
  model?: string;
  timestamp: string;
}

export type CopilotFailureReason =
  | 'not_signed_in'
  | 'account_blocked'
  | 'invalid_input'
  | 'rate_limited'
  | 'not_configured'
  | 'network'
  | 'service_error';

/**
 * Thrown for every failure. `message` is already user-facing and honest.
 * `offlineTemplate` is present only when a generic study template exists for the mode; the UI must
 * label it as an offline template and must never present it as a Gemini answer.
 */
export class CopilotError extends Error {
  readonly reason: CopilotFailureReason;
  readonly retryAfterSeconds?: number;
  readonly offlineTemplate?: CopilotResponse;

  constructor(
    reason: CopilotFailureReason,
    message: string,
    options?: { retryAfterSeconds?: number; offlineTemplate?: CopilotResponse },
  ) {
    super(message);
    this.name = 'CopilotError';
    this.reason = reason;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.offlineTemplate = options?.offlineTemplate;
  }
}

/** Strips a `data:image/png;base64,` prefix and returns the raw base64 payload. */
export function stripDataUrlPrefix(value: string): string {
  const match = /^data:([a-zA-Z0-9.+/-]+);base64,/.exec(value);
  return match ? value.slice(match[0].length) : value;
}

/** Reads the mime type out of a data URL, when the value is one. */
export function mimeTypeFromDataUrl(value: string): string | null {
  const match = /^data:([a-zA-Z0-9.+/-]+);base64,/.exec(value);
  return match ? match[1].toLowerCase() : null;
}

function offlineTemplateFor(
  prompt: string,
  mode: CopilotMode,
  courseContext?: string,
  imageAttachment?: MultimodalAttachment,
): CopilotResponse {
  return {
    content: generateOfflineStudyTemplate(prompt, mode, courseContext, imageAttachment),
    mode,
    source: 'offline_template',
    timestamp: new Date().toISOString(),
  };
}

function buildPrompt(userPrompt: string, mode: CopilotMode, courseContext?: string): string {
  let formattedPrompt = userPrompt;
  if (courseContext) {
    formattedPrompt = `[Course: ${courseContext}]\n${userPrompt}`;
  }

  if (mode === 'math_solve') {
    formattedPrompt +=
      '\nPlease inspect the provided image and problem statement carefully. Provide: 1) The extracted equation in standard LaTeX notation, 2) Complete step-by-step mathematical working with intermediate derivations, 3) Final simplified answer highlighted, and 4) Common exam pitfalls.';
  } else if (mode === 'flashcards') {
    formattedPrompt +=
      '\nPlease analyze the provided lecture notes, slide, or topic and generate 4 interactive study flashcards formatted as:\n\n**Flashcard [N]:**\n**Q:** [Question]\n**A:** [Answer]\n**Core Concept:** [Key Takeaway]';
  } else if (mode === 'quiz') {
    formattedPrompt +=
      '\nPlease generate 3 high-yield revision quiz questions with multiple-choice options, detailed explanations, and correct answers at the end.';
  } else if (mode === 'past_question') {
    formattedPrompt +=
      '\nPlease break down this past question step-by-step, explaining the underlying formula/principle, the complete working, and common pitfalls.';
  } else if (mode === 'schedule') {
    formattedPrompt +=
      '\nPlease generate a structured 3-day exam revision timetable with specific focus blocks and rest intervals.';
  }

  return formattedPrompt;
}

/** Pulls status + parsed body out of whatever `supabase.functions.invoke` handed back as `error`. */
async function describeInvokeError(error: any): Promise<{ status: number | null; body: any }> {
  const response: Response | undefined = error?.context instanceof Response ? error.context : undefined;
  if (!response) {
    const status = typeof error?.status === 'number' ? error.status : null;
    return { status, body: null };
  }
  let body: any = null;
  try {
    const text = await response.clone().text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: text };
      }
    }
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

function retryAfterFromError(error: any): number | undefined {
  const response: Response | undefined = error?.context instanceof Response ? error.context : undefined;
  const header = response?.headers?.get?.('Retry-After');
  const parsed = header ? Number(header) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function friendlyRetryWindow(seconds?: number): string {
  if (!seconds) return 'in a little while';
  if (seconds <= 90) return `in about ${Math.max(10, Math.round(seconds))} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `in about ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return `in about ${hours} hour${hours === 1 ? '' : 's'}`;
}

/**
 * Asks Gemini (via the proxy). Resolves ONLY with a genuine model answer.
 * Every other outcome throws a `CopilotError` describing what actually went wrong.
 */
export async function askAiStudyCopilot(
  userPrompt: string,
  mode: CopilotMode = 'explain',
  courseContext?: string,
  imageAttachment?: MultimodalAttachment,
): Promise<CopilotResponse> {
  const safeMode: CopilotMode = COPILOT_MODES.includes(mode) ? mode : 'explain';
  const formattedPrompt = buildPrompt(userPrompt, safeMode, courseContext);
  const template = () => offlineTemplateFor(userPrompt, safeMode, courseContext, imageAttachment);

  // --- 1. Validate locally so the user hears about a limit before a doomed round-trip ---
  const trimmedPrompt = formattedPrompt.trim();
  if (!trimmedPrompt) {
    throw new CopilotError('invalid_input', 'Type a question first, then tap send.');
  }
  if (trimmedPrompt.length > MAX_PROMPT_CHARS) {
    throw new CopilotError(
      'invalid_input',
      `That question is ${trimmedPrompt.length.toLocaleString()} characters long. The study copilot accepts up to ${MAX_PROMPT_CHARS.toLocaleString()} - please shorten it and try again.`,
    );
  }

  let imagePayload: MultimodalAttachment | undefined;
  if (imageAttachment && imageAttachment.base64) {
    const base64 = stripDataUrlPrefix(imageAttachment.base64).replace(/\s/g, '');
    const mimeType = (mimeTypeFromDataUrl(imageAttachment.base64) || imageAttachment.mimeType || 'image/jpeg')
      .toLowerCase()
      .trim();

    if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      const label = mimeType.replace('image/', '').toUpperCase();
      throw new CopilotError(
        'invalid_input',
        `That image is ${label ? `a ${label} file` : 'an unsupported file type'}. Please attach a JPEG, PNG or WebP photo instead.`,
      );
    }
    if (!base64) {
      throw new CopilotError('invalid_input', 'That photo could not be read. Please attach it again.');
    }
    if (base64.length > MAX_IMAGE_BASE64_CHARS) {
      throw new CopilotError(
        'invalid_input',
        'That photo is too large (the limit is about 3.5MB). Please retake it at a lower resolution or crop it to just the question.',
      );
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      throw new CopilotError(
        'invalid_input',
        'That photo could not be encoded for analysis. Please try a different image.',
      );
    }
    imagePayload = { base64, mimeType };
  }

  // --- 2. The proxy requires a real, signed-in, non-anonymous user -----------
  let sessionUser: { id: string; is_anonymous?: boolean } | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    sessionUser = (data?.session?.user as any) ?? null;
  } catch {
    sessionUser = null;
  }
  if (!sessionUser || (sessionUser as any).is_anonymous === true) {
    throw new CopilotError(
      'not_signed_in',
      'Sign in to your Lioris account to use the AI study copilot. It is not available to guests.',
      { offlineTemplate: template() },
    );
  }

  // --- 3. Call the proxy ----------------------------------------------------
  let data: any;
  let error: any;
  try {
    const result = await supabase.functions.invoke('gemini-proxy', {
      body: {
        prompt: trimmedPrompt,
        mode: safeMode,
        image: imagePayload ? { base64: imagePayload.base64, mimeType: imagePayload.mimeType } : undefined,
      },
    });
    data = result.data;
    error = result.error;
  } catch (err: any) {
    console.warn('[LiorisAI] gemini-proxy request threw:', err?.message ?? err);
    throw new CopilotError(
      'network',
      'We could not reach the AI service. Check your internet connection and try again.',
      { offlineTemplate: template() },
    );
  }

  if (!error) {
    if (data && typeof data.content === 'string' && data.content.trim().length > 0) {
      return {
        content: data.content,
        mode: safeMode,
        source: 'gemini',
        model: typeof data.model === 'string' ? data.model : undefined,
        timestamp: new Date().toISOString(),
      };
    }
    throw new CopilotError(
      'service_error',
      'The AI service replied without an answer. Please try rephrasing your question.',
      { offlineTemplate: template() },
    );
  }

  const { status, body } = await describeInvokeError(error);
  const serverMessage = typeof body?.error === 'string' ? body.error : undefined;
  const retryAfterSeconds = retryAfterFromError(error);
  console.warn('[LiorisAI] gemini-proxy failed', { status, serverMessage });

  if (status === 401) {
    throw new CopilotError(
      'not_signed_in',
      'Your session has expired. Please sign in again to use the AI study copilot.',
      { offlineTemplate: template() },
    );
  }
  if (status === 403) {
    throw new CopilotError(
      'account_blocked',
      serverMessage === 'Account suspended.'
        ? 'Your account is suspended, so the AI study copilot is unavailable. Contact support if you think this is a mistake.'
        : 'Your account cannot use the AI study copilot right now. Contact support if you think this is a mistake.',
    );
  }
  if (status === 400 || status === 413) {
    throw new CopilotError(
      'invalid_input',
      serverMessage || 'The AI service rejected that request. Try a shorter question or a smaller photo.',
    );
  }
  if (status === 429) {
    throw new CopilotError(
      'rate_limited',
      `You have hit the AI usage limit (30 questions an hour, 5 a minute). Please try again ${friendlyRetryWindow(retryAfterSeconds)}.`,
      { retryAfterSeconds, offlineTemplate: template() },
    );
  }
  if (status === 503 && serverMessage === 'not_configured') {
    throw new CopilotError(
      'not_configured',
      'The AI study copilot is not switched on for this app yet. An offline study template is available in the meantime.',
      { offlineTemplate: template() },
    );
  }
  if (status === 503 || status === 502 || status === 500) {
    throw new CopilotError(
      'service_error',
      'The AI service is temporarily unavailable. Please try again in a few minutes.',
      { offlineTemplate: template() },
    );
  }

  throw new CopilotError(
    status === null ? 'network' : 'service_error',
    status === null
      ? 'We could not reach the AI service. Check your internet connection and try again.'
      : 'Something went wrong while contacting the AI service. Please try again.',
    { offlineTemplate: template() },
  );
}

const OFFLINE_BANNER =
  '> This is a generic offline study template, not an AI answer. It was written in advance and does not read your question.';

/**
 * Generic, pre-written study scaffolds. These are NEVER returned as a Gemini answer - they only
 * ever travel inside `CopilotError.offlineTemplate`, tagged `source: 'offline_template'`.
 */
function generateOfflineStudyTemplate(
  prompt: string,
  mode: CopilotMode,
  context?: string,
  imageAttachment?: MultimodalAttachment,
): string {
  if (mode === 'math_solve') {
    return `### Worked-example template: ${context || 'chalkboard / diagram problem'}

${OFFLINE_BANNER}
${imageAttachment ? '\nYour attached photo has not been analysed - that needs the AI service.\n' : ''}
**A reliable method for any derivation question**

1. **Write down what you are given.** List every symbol, its value and its unit before you start.
2. **Name the governing relationship.** Most exam questions collapse to one equation from your notes.
3. **Rearrange symbolically first.** Substitute numbers only at the very last step.
4. **Carry units through every line.** If the units of your answer are wrong, the algebra is wrong.
5. **Sanity-check the magnitude.** Ask whether the size of the answer is physically plausible.

**Common mark-losers**
* Dropping the constant of integration before applying the initial conditions.
* Rounding intermediate values - keep 3 extra decimal places until the final line.
* Losing a negative sign when moving a term across the equals sign.
* Omitting the unit on the final answer.`;
  }

  if (mode === 'flashcards') {
    return `### Flashcard template: ${context || 'lecture revision'}

${OFFLINE_BANNER}

Write your own cards in this shape - the act of writing them is most of the revision:

**Card [N]**
* **Q:** one question, one idea. If you need "and" in the question, split it into two cards.
* **A:** the shortest complete answer you could defend out loud.
* **Core concept:** the chapter or lecture this belongs to, so you can group cards later.

**How to drill them**
* Say the answer out loud before turning the card over - recognising is not recalling.
* Sort into "knew it" and "did not". Re-run only the second pile.
* Space the piles: same day, next day, three days, one week.`;
  }

  if (mode === 'quiz') {
    return `### Self-quiz template: ${context || 'core topic'}

${OFFLINE_BANNER}

Build three questions of your own from your lecture notes:

1. **A definition question.** "State and explain ..." - checks that you can reproduce the formal wording.
2. **An application question.** "Given X, calculate Y" - checks that you can use the idea under time pressure.
3. **A comparison question.** "Contrast A with B, and say when each is preferred" - this is where most marks sit.

Write the answers on a separate sheet, leave them for an hour, then mark yourself strictly.`;
  }

  if (mode === 'past_question') {
    return `### Past-question method

${OFFLINE_BANNER}

**Your question**
> ${prompt || '(no question text)'}

**Step 1 - classify it.** Which topic and which sub-skill is being examined? Past papers repeat shapes.
**Step 2 - list the givens.** Underline every number and constraint in the question stem.
**Step 3 - state the principle.** Write the governing law or definition before touching the algebra.
**Step 4 - work it symbolically.** Substitute numbers last.
**Step 5 - check against the mark scheme.** Where did the marks come from? Method or answer?

Then redo the same question from a blank page two days later.`;
  }

  if (mode === 'schedule') {
    return `### 3-day revision plan template
**Target module:** ${context || 'your next exam'}

${OFFLINE_BANNER}

**Day 1 - foundations**
* 2 x 90-minute blocks on the highest-weight topics, with a 20-minute break between them.
* Close the notes and write a summary from memory after each block.

**Day 2 - timed practice**
* One full past paper under exam conditions, no notes, strict timing.
* Afternoon: mark it yourself and write down every topic you lost marks on.

**Day 3 - consolidation**
* Rebuild the whole syllabus onto one A4 sheet.
* Re-attempt only the questions you got wrong yesterday.
* Stop early. Sleep does more for recall than a fourth hour of revision.`;
  }

  return `### Study template: ${prompt || 'your topic'}

${OFFLINE_BANNER}

**1. Define it.** Write the formal definition from your notes, word for word, then again in your own words.
**2. Explain the mechanism.** What problem does it solve, and how? Draw it if you can.
**3. Find two examples.** One from the lectures, one you found yourself.
**4. Name the limits.** Every technique has a case where it is the wrong choice - know that case.
**5. Predict the exam question.** Write the question you would set, then answer it.`;
}
