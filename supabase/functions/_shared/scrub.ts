// Pure helper (no Deno / network imports, so node --test can import it).
//
// PII / credential scrubbing for report-client-error. It runs on attacker-controlled text BEFORE any rate
// limit is applied, so every pattern must be linear-time: the e-mail pattern used to start a new attempt at
// every character of a long run of e-mail-local-part characters ("aaaa...", "a.a.a."), which is quadratic
// (about 200 ms of CPU for one 15 KB message). The look-behind makes an attempt start only at the beginning
// of a run, which matches exactly the same strings.

export function scrub(input: string): string {
  return input
    .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[jwt]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [token]')
    .replace(/\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[key]')
    .replace(/(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, '[email]')
    .replace(/(https?:\/\/[^\s?#"'<>)]+)[?#][^\s"'<>)]*/g, '$1')
    .replace(/\b(access_token|refresh_token|token|apikey|api_key|password|code)=[^\s&"']+/gi, '$1=[redacted]');
}
