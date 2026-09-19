// Self-hosted client error reporting.
//
// Errors are POSTed to the `report-client-error` Supabase edge function, which stores
// them (deduplicated by fingerprint) in `public.client_errors`. Admins read them under
// Admin > System Health. See docs/operations/monitoring.md.
//
// Design rules:
//   * fire-and-forget: reportError() never throws, never awaits on the render path
//   * privacy: emails, tokens, JWTs and URL query strings are scrubbed on the device
//     before anything leaves it; the server scrubs again as defence in depth
//   * bounded: identical errors are sent at most once per minute and a session sends
//     at most MAX_REPORTS_PER_SESSION reports, so an error loop cannot flood the sink
//   * no-op in __DEV__ (console.warn only)
//
// To replace this sink with Sentry later, keep the exported function names and swap
// the body of `send()`; nothing else in the app needs to change.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/api/supabase';

export type ErrorLevel = 'error' | 'warning' | 'info';
export type ErrorContext = Record<string, unknown>;

const ENDPOINT = `${SUPABASE_URL}/functions/v1/report-client-error`;

const MAX_MESSAGE_CHARS = 1000;
const MAX_STACK_CHARS = 6000;
const MAX_CONTEXT_CHARS = 2000;
const MAX_URL_CHARS = 300;
const MAX_REPORTS_PER_SESSION = 20;
const DEDUPE_WINDOW_MS = 60_000;
const SESSION_LOOKUP_TIMEOUT_MS = 1500;
const SEND_TIMEOUT_MS = 8000;

const sessionId = randomId();
const lastSentAt = new Map<string, number>();
let sentThisSession = 0;
let installed = false;

function randomId(): string {
  try {
    const c = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

// ---------------------------------------------------------------------------
// Scrubbing
// ---------------------------------------------------------------------------

/** Removes personal data / credentials from free text. Exported for unit tests. */
export function scrubText(input: string): string {
  return (
    input
      // JWT-looking strings (three base64url segments, header starts with eyJ)
      .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[jwt]')
      // Authorization bearer tokens
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [token]')
      // Supabase publishable / secret keys
      .replace(/\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[key]')
      // Emails
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, '[email]')
      // Query strings / fragments on absolute URLs (they can carry tokens and PII)
      .replace(/(https?:\/\/[^\s?#"'<>)]+)[?#][^\s"'<>)]*/g, '$1')
      // key=value credentials that survive outside URLs
      .replace(/\b(access_token|refresh_token|token|apikey|api_key|password|code)=[^\s&"']+/gi, '$1=[redacted]')
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...[truncated]` : value;
}

/** Path only: no origin, no query string, no hash. */
function safePath(rawUrl: string | undefined): string {
  if (!rawUrl) return '';
  let path = rawUrl;
  try {
    path = new URL(rawUrl, 'http://localhost').pathname;
  } catch {
    path = rawUrl.split(/[?#]/)[0];
  }
  return truncate(scrubText(path), MAX_URL_CHARS);
}

function currentRoute(): string {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return safePath(window.location.pathname);
    }
  } catch {
    // ignore
  }
  return '';
}

function scrubContext(context: ErrorContext | undefined): ErrorContext {
  if (!context) return {};
  try {
    const json = JSON.stringify(context, (_k, v) => {
      if (typeof v === 'string') return scrubText(v);
      if (typeof v === 'function' || typeof v === 'symbol') return undefined;
      if (v instanceof Error) return scrubText(`${v.name}: ${v.message}`);
      return v;
    });
    if (!json) return {};
    if (json.length > MAX_CONTEXT_CHARS) {
      return { truncated: true, preview: json.slice(0, MAX_CONTEXT_CHARS) };
    }
    return JSON.parse(json);
  } catch {
    return { unserializable: true };
  }
}

// ---------------------------------------------------------------------------
// Fingerprinting
// ---------------------------------------------------------------------------

function fnv1a(str: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function firstStackFrame(stack: string): string {
  const lines = stack.split('\n').map((l) => l.trim());
  const frame = lines.find((l) => /^at\s|@/.test(l)) ?? '';
  // Bundle hashes and line/column numbers change between releases; drop them so the
  // same bug keeps one fingerprint.
  return frame.replace(/:\d+:\d+\)?$/, '').replace(/[?#].*$/, '');
}

/** Stable hash of the message (ids/numbers normalised) and the first stack frame. */
export function computeFingerprint(message: string, stack: string): string {
  const normalised = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\d+/g, '<n>');
  const basis = `${normalised}|${firstStackFrame(stack)}`;
  return fnv1a(basis, 2166136261) + fnv1a(basis, 84696351);
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string | null> {
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SESSION_LOOKUP_TIMEOUT_MS)),
    ]);
    return result?.data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

function normaliseError(error: unknown): { message: string; stack: string; name: string } {
  if (error instanceof Error) {
    return { message: error.message || error.name || 'Error', stack: error.stack ?? '', name: error.name };
  }
  if (typeof error === 'string') return { message: error, stack: '', name: 'Error' };
  try {
    const anyErr = error as any;
    if (anyErr && typeof anyErr.message === 'string') {
      return { message: anyErr.message, stack: typeof anyErr.stack === 'string' ? anyErr.stack : '', name: 'Error' };
    }
    return { message: `Non-error thrown: ${JSON.stringify(error)}`, stack: '', name: 'Error' };
  } catch {
    return { message: 'Unknown error', stack: '', name: 'Error' };
  }
}

const IGNORED_MESSAGES = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Non-Error promise rejection captured/i,
];

function shouldIgnore(message: string, stack: string): boolean {
  if (IGNORED_MESSAGES.some((re) => re.test(message))) return true;
  // Browser-extension noise
  return /(?:chrome|moz|safari)-extension:\/\//.test(stack);
}

async function send(payload: Record<string, unknown>): Promise<void> {
  const token = await getAccessToken();
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), SEND_TIMEOUT_MS) : null;
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
      keepalive: true,
      signal: controller?.signal,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function report(level: ErrorLevel, error: unknown, context?: ErrorContext): void {
  try {
    const { message: rawMessage, stack: rawStack, name } = normaliseError(error);
    const message = truncate(scrubText(rawMessage), MAX_MESSAGE_CHARS);
    const stack = truncate(scrubText(rawStack), MAX_STACK_CHARS);

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[errorReporter] (dev: not sent)', level, message);
      return;
    }
    if (shouldIgnore(message, rawStack)) return;
    if (sentThisSession >= MAX_REPORTS_PER_SESSION) return;

    const fingerprint = computeFingerprint(message, rawStack);
    const now = Date.now();
    const last = lastSentAt.get(fingerprint);
    if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return;
    lastSentAt.set(fingerprint, now);
    sentThisSession += 1;

    const payload = {
      message,
      stack,
      fingerprint,
      level,
      url: currentRoute(),
      release: `lioris@${Constants.expoConfig?.version ?? 'unknown'}`,
      session_id: sessionId,
      context: { ...scrubContext(context), platform: Platform.OS, errorName: name },
    };

    send(payload).catch(() => {
      // The sink being unreachable must never surface to the user.
    });
  } catch {
    // reporting must never throw
  }
}

export function reportError(error: unknown, context?: ErrorContext): void {
  report('error', error, context);
}

export function reportMessage(message: string, context?: ErrorContext, level: ErrorLevel = 'info'): void {
  report(level, new Error(message), context);
}

// ---------------------------------------------------------------------------
// Global handlers
// ---------------------------------------------------------------------------

export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('error', (event: ErrorEvent) => {
        // Resource load failures have no `error`/`message`; extension scripts are noise.
        if (!event.error && !event.message) return;
        reportError(event.error ?? event.message, { source: 'window.onerror' });
      });
      window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        reportError(event.reason, { source: 'unhandledrejection' });
      });
      return;
    }

    const errorUtils = (globalThis as any).ErrorUtils;
    if (errorUtils?.setGlobalHandler) {
      const previous = errorUtils.getGlobalHandler?.();
      errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
        reportError(error, { source: 'ErrorUtils', isFatal: !!isFatal });
        try {
          previous?.(error, isFatal);
        } catch {
          // never let the chained handler break us
        }
      });
    }
  } catch {
    // Installing handlers must never break app start-up.
  }
}

// Auto-install as soon as this module is imported (ErrorBoundary imports it).
installGlobalErrorHandlers();
