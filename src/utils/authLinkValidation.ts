/**
 * Pure validation for e-mail auth links (confirm sign-up, reset password...). No react-native or
 * supabase imports so it can be unit tested with node --test.
 *
 * Threat: a link such as `lioris://x#access_token=<attacker's token>&refresh_token=...` can be opened
 * by any web page or app. Blindly turning it into a session signs the victim into the ATTACKER's account
 * (login CSRF / account swap), after which everything they type or upload belongs to the attacker.
 */

export type AuthLinkType = 'signup' | 'recovery' | 'magiclink' | 'invite' | 'email_change';
/** What the person asked for on this device, recorded when the e-mail was requested. */
export type PendingLinkKind = 'signup' | 'recovery' | 'email_change';

export const AUTH_LINK_TYPES: readonly AuthLinkType[] = ['signup', 'recovery', 'magiclink', 'invite', 'email_change'];
export const APP_LINK_SCHEME = 'lioris:';
export const DEFAULT_SITE_URL = 'https://lioris-campus.vercel.app';
/** How long after requesting an e-mail its link is still accepted on this device. */
export const AUTH_LINK_MARKER_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_LINK_ERROR_LENGTH = 200;

export type ParsedAuthLink =
  /** Not an auth link - leave it to the router. */
  | { kind: 'none' }
  /** Looks like an auth link but the scheme/host is not ours, or the type is unknown. */
  | { kind: 'rejected'; reason: 'untrusted_origin' | 'unsupported_type' }
  /** The provider reported a problem with the link (already sanitised for display). */
  | { kind: 'error'; message: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string; type: AuthLinkType };

/** Host (lower-case, no port) of a site URL, or null. */
export function hostOfSiteUrl(siteUrl: string | undefined | null): string | null {
  const base = (siteUrl && siteUrl.trim()) || DEFAULT_SITE_URL;
  const match = /^https:\/\/([^/?#]+)/i.exec(base.trim());
  if (!match) return null;
  return stripPort(match[1]);
}

function stripPort(authority: string): string | null {
  if (authority.includes('@')) return null; // user:pass@host tricks
  return authority.replace(/:\d*$/, '').toLowerCase() || null;
}

/** Only our own scheme, or https on exactly the configured site host, is trusted. */
export function isTrustedAuthLinkOrigin(url: string, siteUrl?: string | null): boolean {
  const match = /^([a-z][a-z0-9+.-]*):(?:\/\/([^/?#]*))?/i.exec(url.trim());
  if (!match) return false;
  const scheme = `${match[1].toLowerCase()}:`;
  if (scheme === APP_LINK_SCHEME) return true;
  if (scheme !== 'https:') return false;
  const host = match[2] ? stripPort(match[2]) : null;
  const expected = hostOfSiteUrl(siteUrl);
  return Boolean(host && expected && host === expected);
}

/** Plain text, no markup/control characters, at most MAX_LINK_ERROR_LENGTH characters. */
export function sanitizeLinkErrorDescription(raw: string | null | undefined): string {
  const cleaned = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'This link is not valid. Request a new one.';
  return cleaned.length > MAX_LINK_ERROR_LENGTH ? `${cleaned.slice(0, MAX_LINK_ERROR_LENGTH - 3)}...` : cleaned;
}

function fragmentParams(url: string): URLSearchParams {
  const hashIndex = url.indexOf('#');
  return new URLSearchParams(hashIndex === -1 ? '' : url.slice(hashIndex + 1));
}

/**
 * Parses a deep link. Tokens and errors are read from the URL FRAGMENT only: a query string is
 * attacker-controllable by anything that can craft a link and is never where Supabase puts them.
 */
export function parseAuthLink(url: string | null | undefined, siteUrl?: string | null): ParsedAuthLink {
  if (!url) return { kind: 'none' };
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return { kind: 'none' };
  const fragment = url.slice(hashIndex + 1);
  if (!fragment.includes('access_token=') && !fragment.includes('error_description=') && !/(^|&)error=/.test(fragment)) {
    return { kind: 'none' };
  }
  if (!isTrustedAuthLinkOrigin(url, siteUrl)) return { kind: 'rejected', reason: 'untrusted_origin' };

  const params = fragmentParams(url);
  const errorDescription = params.get('error_description');
  const errorCode = params.get('error_code');
  if (errorDescription || params.get('error')) {
    if (errorCode === 'otp_expired') {
      return { kind: 'error', message: 'This link has expired or was already used. Request a new one.' };
    }
    return { kind: 'error', message: sanitizeLinkErrorDescription(errorDescription) };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return { kind: 'none' };

  const type = params.get('type');
  if (!type || !(AUTH_LINK_TYPES as readonly string[]).includes(type)) {
    return { kind: 'rejected', reason: 'unsupported_type' };
  }
  return { kind: 'tokens', accessToken, refreshToken, type: type as AuthLinkType };
}

/** Which locally recorded request can justify a link of this type. invite has none: nothing in the app sends one. */
export function pendingKindsForLinkType(type: AuthLinkType): PendingLinkKind[] {
  switch (type) {
    case 'signup':
    case 'magiclink':
      return ['signup'];
    case 'recovery':
      return ['recovery'];
    case 'email_change':
      return ['email_change'];
    default:
      return [];
  }
}

export interface PendingLinkRecord {
  /** epoch ms */
  expiresAt: number;
  /** Only ever true if a flow deliberately asks for it; nothing does today. */
  allowAccountSwitch?: boolean;
}
export type PendingLinkMarkers = Partial<Record<PendingLinkKind, PendingLinkRecord>>;

export function parsePendingMarkers(raw: string | null | undefined, now: number = Date.now()): PendingLinkMarkers {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    const out: PendingLinkMarkers = {};
    for (const kind of ['signup', 'recovery', 'email_change'] as const) {
      const rec = parsed?.[kind];
      if (rec && typeof rec.expiresAt === 'number' && rec.expiresAt > now) {
        out[kind] = { expiresAt: rec.expiresAt, allowAccountSwitch: rec.allowAccountSwitch === true };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function withPendingMarker(
  markers: PendingLinkMarkers,
  kind: PendingLinkKind,
  now: number = Date.now(),
  opts?: { allowAccountSwitch?: boolean },
): PendingLinkMarkers {
  return {
    ...markers,
    [kind]: { expiresAt: now + AUTH_LINK_MARKER_TTL_MS, allowAccountSwitch: opts?.allowAccountSwitch === true },
  };
}

/** The marker that justifies this link type, if one is recorded and unexpired. */
export function findMarkerForLinkType(
  markers: PendingLinkMarkers,
  type: AuthLinkType,
  now: number = Date.now(),
): { kind: PendingLinkKind; record: PendingLinkRecord } | null {
  for (const kind of pendingKindsForLinkType(type)) {
    const record = markers[kind];
    if (record && record.expiresAt > now) return { kind, record };
  }
  return null;
}

/** Any live marker at all (used to decide whether to show a provider error). */
export function hasAnyLiveMarker(markers: PendingLinkMarkers, now: number = Date.now()): boolean {
  return Object.values(markers).some((rec) => rec && rec.expiresAt > now);
}

/** `sub` claim of a JWT without verifying it (the server verifies on setSession); null if unreadable. */
export function jwtSubject(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let bits = 0;
    let acc = 0;
    let out = '';
    for (const ch of padded) {
      if (ch === '=') break;
      const idx = alphabet.indexOf(ch);
      if (idx === -1) return null;
      acc = (acc << 6) | idx;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out += String.fromCharCode((acc >> bits) & 0xff);
        acc &= (1 << bits) - 1;
      }
    }
    const sub = JSON.parse(out)?.sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}

/**
 * Whether a link may replace the session that is currently signed in.
 * No current session: yes. Same account: yes. Different (or unreadable) account: only if the marker allows.
 */
export function mayReplaceCurrentSession(
  currentUserId: string | null | undefined,
  linkAccessToken: string,
  record: PendingLinkRecord,
): boolean {
  if (!currentUserId) return true;
  if (jwtSubject(linkAccessToken) === currentUserId) return true;
  return record.allowAccountSwitch === true;
}
