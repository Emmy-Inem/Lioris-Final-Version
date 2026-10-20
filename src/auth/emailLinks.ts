import { supabase } from '@/api/supabase';
import {
  findMarkerForLinkType,
  hasAnyLiveMarker,
  mayReplaceCurrentSession,
  parseAuthLink,
} from '../utils/authLinkValidation';
import { clearAuthLinkMarker, readAuthLinkMarkers } from './authLinkMarker';

export type EmailLinkResult =
  /** Not an auth link - leave it to the router. */
  | { kind: 'none' }
  /** A recovery link: a session now exists and the person must choose a new password. */
  | { kind: 'recovery' }
  /** A confirmation / magic link: a session now exists. */
  | { kind: 'signed_in' }
  /** The link was rejected (expired, already used, or not one this device asked for). */
  | { kind: 'error'; message: string };

const NOT_EXPECTED_MESSAGE =
  'We ignored this link because this device did not request it. Request a new e-mail from Lioris, or use the 6-digit code instead.';
const OTHER_ACCOUNT_MESSAGE =
  'We ignored this link because a different account is signed in on this device. Sign out first, then open the link again.';

/**
 * E-mail links (confirm sign-up, reset password) arrive on a phone as `lioris://...#access_token=...`.
 * On the web supabase-js reads that fragment itself; on iOS/Android nothing did, so the app opened on the
 * wrong screen with no session and the single-use link was already spent. This turns the fragment into a
 * session. Links that carry `token_hash` (handled by the verify screens) are left alone.
 *
 * A link is only honoured when ALL of these hold (otherwise anyone could sign the person into an
 * account of their choosing): our own scheme or the configured https site host; tokens in the
 * fragment; a known `type`; a recent request recorded on this device (markAuthLinkExpected); and no
 * different account currently signed in.
 */
export async function consumeAuthLink(url: string | null | undefined): Promise<EmailLinkResult> {
  const parsed = parseAuthLink(url, process.env.EXPO_PUBLIC_SITE_URL);
  if (parsed.kind === 'none') return { kind: 'none' };
  if (parsed.kind === 'rejected') {
    return parsed.reason === 'untrusted_origin' ? { kind: 'none' } : { kind: 'error', message: NOT_EXPECTED_MESSAGE };
  }

  const markers = await readAuthLinkMarkers();

  if (parsed.kind === 'error') {
    // Only explain a failed link the person actually asked for.
    return hasAnyLiveMarker(markers) ? { kind: 'error', message: parsed.message } : { kind: 'none' };
  }

  const match = findMarkerForLinkType(markers, parsed.type);
  if (!match) return { kind: 'error', message: NOT_EXPECTED_MESSAGE };

  let currentUserId: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    currentUserId = data.session?.user?.id ?? null;
  } catch {
    currentUserId = null;
  }
  if (!mayReplaceCurrentSession(currentUserId, parsed.accessToken, match.record)) {
    return { kind: 'error', message: OTHER_ACCOUNT_MESSAGE };
  }

  const { error } = await supabase.auth.setSession({
    access_token: parsed.accessToken,
    refresh_token: parsed.refreshToken,
  });
  if (error) return { kind: 'error', message: 'This link has expired or was already used. Request a new one.' };

  await clearAuthLinkMarker(match.kind);
  return parsed.type === 'recovery' ? { kind: 'recovery' } : { kind: 'signed_in' };
}
