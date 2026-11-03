// On-device scrubbing of free text before it is sent to the client-error sink. Pure (no react-native) so node --test
// can run it; src/monitoring/errorReporter.ts re-exports scrubText.

/** Removes personal data / credentials from free text. */
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
      // JSON-style credentials ("password":"hunter2") that arrive inside a serialised response or request body
      .replace(
        /(["'](?:access_token|refresh_token|token|apikey|api_key|password|secret)["']\s*:\s*)(["'])(?:(?!\2).)*\2/gi,
        '$1$2[redacted]$2',
      )
  );
}

interface BreadcrumbLike {
  message: string;
  data?: Record<string, unknown>;
}

/** Applies scrubText to every breadcrumb message and string value (breadcrumbs ride along inside an error report). */
export function scrubBreadcrumbs<T extends BreadcrumbLike>(crumbs: T[]): T[] {
  return crumbs.map((c) => {
    const data = c.data
      ? Object.fromEntries(Object.entries(c.data).map(([k, v]) => [k, typeof v === 'string' ? scrubText(v) : v]))
      : c.data;
    return { ...c, message: scrubText(c.message), data };
  });
}
