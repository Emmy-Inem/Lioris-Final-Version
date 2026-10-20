import { supabase } from './supabase';

/**
 * The signed-in user's id from the locally stored session (no network round trip).
 * `supabase.auth.getUser()` is a request to the auth server on every call; the list/read APIs only need the id (RLS
 * does the real authorization), and getSession() refreshes an expired token by itself when it has to.
 * Works for impersonation sessions too: the active supabase session IS the impersonated user.
 */
export async function getSessionUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}
