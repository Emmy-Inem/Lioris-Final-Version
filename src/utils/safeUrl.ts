/**
 * URL safety helpers.
 *
 * User-supplied URLs (job apply links, resource files, chat media, event
 * links...) must never reach `window.open` / `Linking.openURL` / `<a href>`
 * unless they are plain http(s) URLs: `javascript:`, `data:`, `vbscript:`,
 * `file:` etc. are XSS / local-file vectors.
 *
 * This module is deliberately free of react-native imports so it can be unit
 * tested with plain Node. The RN-dependent opener lives in ./openExternalUrl.
 */

const MAX_URL_LENGTH = 2048;

/** True only for well-formed http(s) URLs without embedded credentials. */
export function isSafeHttpUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return false;
  // Control characters / whitespace inside the URL are used to smuggle schemes.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(trimmed)) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (!parsed.hostname) return false;
  return true;
}

/** Throws a user-friendly Error unless `url` is a safe http(s) URL. Returns the trimmed URL. */
export function assertSafeHttpUrl(url: unknown, label = 'Link'): string {
  if (!isSafeHttpUrl(url)) {
    throw new Error(`${label} must be a valid http:// or https:// URL.`);
  }
  return url.trim();
}

/** Returns the trimmed URL when safe, otherwise undefined (for sanitising stored rows). */
export function sanitizeHttpUrl(url: unknown): string | undefined {
  return isSafeHttpUrl(url) ? url.trim() : undefined;
}

/** True for `tel:` / `mailto:` links with a plain, non-empty target. */
export function isSafeContactLink(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  // eslint-disable-next-line no-control-regex
  if (!trimmed || trimmed.length > 512 || /[\u0000-\u001f\u007f\s]/.test(trimmed)) return false;
  return /^(mailto:[^?#]+|tel:\+?[0-9()\-.]{3,32})(\?[^#]*)?$/i.test(trimmed);
}

/** True for on-device media references produced by pickers/cameras (never remote, never script). */
export function isLocalMediaUri(uri: unknown): uri is string {
  if (typeof uri !== 'string') return false;
  const trimmed = uri.trim();
  return /^(file:\/\/|content:\/\/|ph:\/\/|assets-library:\/\/|blob:|data:image\/(jpeg|jpg|png|webp|gif);base64,|data:video\/(mp4|quicktime);base64,)/i.test(trimmed);
}
