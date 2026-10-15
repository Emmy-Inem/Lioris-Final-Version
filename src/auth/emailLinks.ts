import { supabase } from '@/api/supabase';

export type EmailLinkResult =
  /** Not an auth link - leave it to the router. */
  | { kind: 'none' }
  /** A recovery link: a session now exists and the person must choose a new password. */
  | { kind: 'recovery' }
  /** A confirmation / magic link: a session now exists. */
  | { kind: 'signed_in' }
  /** The link was rejected (expired, already used). */
  | { kind: 'error'; message: string };

function paramsOf(url: string): URLSearchParams {
  const merged = new URLSearchParams();
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf('?');
  if (queryIndex !== -1) new URLSearchParams(beforeHash.slice(queryIndex + 1)).forEach((v, k) => merged.set(k, v));
  if (hashIndex !== -1) new URLSearchParams(url.slice(hashIndex + 1)).forEach((v, k) => merged.set(k, v));
  return merged;
}

/**
 * E-mail links (confirm sign-up, reset password) arrive on a phone as `lioris://...#access_token=...`.
 * On the web supabase-js reads that fragment itself; on iOS/Android nothing did, so the app opened on the
 * wrong screen with no session and the single-use link was already spent. This turns the fragment into a
 * session. Links that carry `token_hash` (handled by the verify screens) are left alone.
 */
export async function consumeAuthLink(url: string | null | undefined): Promise<EmailLinkResult> {
  if (!url || (!url.includes('access_token=') && !url.includes('error_description='))) return { kind: 'none' };
  const params = paramsOf(url);

  const errorDescription = params.get('error_description');
  if (errorDescription) {
    return { kind: 'error', message: errorDescription.replace(/\+/g, ' ') };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return { kind: 'none' };

  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) return { kind: 'error', message: 'This link has expired or was already used. Request a new one.' };
  return params.get('type') === 'recovery' ? { kind: 'recovery' } : { kind: 'signed_in' };
}
