/**
 * Signed URLs for the PRIVATE storage buckets (`resources`, `campus-media`).
 *
 * Why this module exists
 * ----------------------
 * Until 2026-09-20 `resources` and `campus-media` were PUBLIC buckets and the
 * storage SELECT policy was `USING (bucket_id IN (...))` with no role check.
 * Verified on production: with only the publishable anon key the `resources`
 * bucket could be LISTED (enumerating uid folders and exact filenames), and
 * with *no credentials at all* an object returned HTTP 206 with real bytes of
 * a 9.8 MB student `.pptx`. Both buckets are now private, so a stored object
 * is only readable through a short-lived signed URL minted for a caller that
 * the storage policy actually lets read it.
 *
 * `avatars` stays PUBLIC and must never be routed through here - a profile
 * picture is not campus-private, and signing one per row in every list is a
 * real performance cost for no security gain.
 *
 * Contract (see docs/internal/campus-access-contract.md):
 *   resolveMediaUrl(bucket, path) -> Promise<string | null>
 *   useSignedUrl(bucket, path)    -> { url, loading, error }
 *   isLegacyPublicUrl(value)      -> boolean
 */

import { useEffect, useRef, useState } from 'react';
import { supabase, SUPABASE_URL } from './supabase';
import { isSafeHttpUrl } from '../utils/safeUrl';

export type PrivateBucket = 'resources' | 'campus-media';

/**
 * TTL for a minted URL, in seconds.
 *
 * A signed URL is a bearer token: anyone holding the link can read the object
 * until it expires, so the number is a trade-off, not a free parameter.
 *
 * - The original plan said 300 s. That is too short for the real use case: a
 *   student opening a 9.8 MB PowerPoint in the in-app reader on Nigerian
 *   mobile data may still be downloading it after five minutes, and a 20-minute
 *   read would break in the middle with an opaque 400 from storage.
 * - An hour or more (the Supabase default in many examples) leaves a copyable,
 *   credential-free link to private coursework alive long after the reader has
 *   closed the app, which is the exact failure we are fixing.
 *
 * 30 minutes is the compromise: comfortably longer than one sitting with a
 * document, short enough that a link pasted into a group chat is dead by the
 * time most people click it.
 */
const TTL_SECONDS = 30 * 60;

/**
 * A cached URL is only handed out while it still has this much life left, so
 * we refresh BEFORE expiry rather than after a failed request. Anything served
 * from the cache is therefore good for at least 10 more minutes.
 */
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

/**
 * What the document reader asks for. With a 30-minute TTL this means a reader
 * that opens on a cached URL older than 10 minutes mints a fresh one, so a
 * long read never starts against a nearly-expired link.
 */
export const READER_MIN_FRESH_MS = 20 * 60 * 1000;

interface CacheEntry {
  url: string;
  /** Wall-clock ms when the signature stops being valid. */
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
/** One in-flight promise per key, so 30 cards asking at once cost one request. */
const inFlight = new Map<string, Promise<string | null>>();

function cacheKey(bucket: PrivateBucket, path: string): string {
  return `${bucket}:${path}`;
}

/** A different session must not reuse the previous session's signatures. */
let authListenerAttached = false;
function attachAuthListener() {
  if (authListenerAttached) return;
  authListenerAttached = true;
  try {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        cache.clear();
        inFlight.clear();
      }
    });
  } catch {
    // A runtime without the auth listener still works; entries just live out
    // their TTL instead of being dropped early.
  }
}
attachAuthListener();

/** Drops every cached signature. Exported for sign-out paths and tests. */
export function clearSignedUrlCache(): void {
  cache.clear();
  inFlight.clear();
}

const PUBLIC_PREFIX_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/(.+)$/;

/**
 * True for a stored absolute URL that predates privatisation, e.g.
 * `https://<project>.supabase.co/storage/v1/object/public/resources/<uid>/<file>`.
 * Rows still holding one of these keep working: `resolveMediaUrl` recovers the
 * object path from it and signs that instead.
 */
export function isLegacyPublicUrl(value: string): boolean {
  if (typeof value !== 'string' || !isSafeHttpUrl(value)) return false;
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return false;
  }
  if (!isProjectHost(parsed.hostname)) return false;
  return PUBLIC_PREFIX_RE.test(parsed.pathname);
}

function isProjectHost(hostname: string): boolean {
  let projectHost = '';
  try {
    projectHost = new URL(SUPABASE_URL).hostname;
  } catch {
    // fall through
  }
  if (projectHost && hostname.toLowerCase() === projectHost.toLowerCase()) return true;
  // Be generous about the project ref so a URL stored against an older
  // environment's host is still recognised as one of ours.
  return /\.supabase\.(co|in)$/i.test(hostname);
}

/**
 * Turns whatever is stored in a media column into the object path inside
 * `bucket`, or null when the value is not an object in that bucket.
 *
 * Accepts:
 *  - a bare path (`<uid>/file.pptx`) - what we store from now on;
 *  - a legacy absolute public/sign URL for the same bucket (pre-privatisation).
 *
 * Rejects (returns null, caller passes the value through untouched):
 *  - genuinely external links (a job's apply URL, an image someone pasted);
 *  - `asset:` bundle references and on-device URIs.
 */
export function storagePathFor(bucket: PrivateBucket, value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    if (!isSafeHttpUrl(trimmed)) return null;
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }
    if (!isProjectHost(parsed.hostname)) return null;
    const match = PUBLIC_PREFIX_RE.exec(parsed.pathname);
    if (!match) return null;
    if (decodeURIComponent(match[1]) !== bucket) return null;
    const path = decodeURIComponent(match[2]).replace(/^\/+/, '');
    return path || null;
  }

  // Anything with a scheme is not one of our object paths.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;

  return trimmed.replace(/^\/+/, '') || null;
}

function cachedFresh(bucket: PrivateBucket, path: string, minFreshMs: number): string | null {
  const entry = cache.get(cacheKey(bucket, path));
  if (!entry) return null;
  if (entry.expiresAt - Date.now() <= minFreshMs) return null;
  return entry.url;
}

/**
 * Synchronous cache peek - lets a component render an already-signed URL on
 * its very first frame instead of flashing a spinner for a list that the API
 * layer has already primed.
 */
export function peekSignedUrl(bucket: PrivateBucket, value: string | null | undefined): string | null {
  const path = storagePathFor(bucket, value);
  if (!path) return null;
  return cachedFresh(bucket, path, REFRESH_MARGIN_MS);
}

function storeSigned(bucket: PrivateBucket, path: string, url: string): string {
  cache.set(cacheKey(bucket, path), { url, expiresAt: Date.now() + TTL_SECONDS * 1000 });
  return url;
}

export interface ResolveOptions {
  /**
   * Require at least this much remaining life. A cached URL with less is
   * re-minted. Defaults to REFRESH_MARGIN_MS.
   */
  minFreshMs?: number;
}

/**
 * Resolves a stored media reference to a URL that will actually load.
 *
 * - a path (or a legacy public URL) in a private bucket -> a signed URL;
 * - an external http(s) link -> returned unchanged, never signed;
 * - anything unusable -> null (this function never throws into render).
 *
 * Results are cached per bucket+path until shortly before expiry, and
 * concurrent callers for the same key share one request.
 */
export async function resolveMediaUrl(
  bucket: PrivateBucket,
  path: string | null | undefined,
  options: ResolveOptions = {},
): Promise<string | null> {
  const objectPath = storagePathFor(bucket, path);
  if (!objectPath) {
    // Not ours to sign. External links are handed back as-is so callers can
    // apply this blanket over a mixed column; everything else is null.
    if (typeof path === 'string' && isSafeHttpUrl(path)) return path.trim();
    return null;
  }

  const minFreshMs = options.minFreshMs ?? REFRESH_MARGIN_MS;
  const fresh = cachedFresh(bucket, objectPath, minFreshMs);
  if (fresh) return fresh;

  const key = cacheKey(bucket, objectPath);
  // A stricter freshness request must not be answered by a laxer in-flight
  // one, so only share when the default margin is enough.
  if (minFreshMs <= REFRESH_MARGIN_MS) {
    const pending = inFlight.get(key);
    if (pending) return pending;
  }

  const request = (async (): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, TTL_SECONDS);
      if (error || !data?.signedUrl) return null;
      return storeSigned(bucket, objectPath, data.signedUrl);
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}

/**
 * Batched sibling of `resolveMediaUrl` for a whole list. Uses the plural
 * `createSignedUrls` so a page of 30 resources costs ONE request instead of
 * 30, and fills the same cache the hook reads from.
 *
 * Returns one entry per input, in order. Never throws.
 */
export async function resolveMediaUrls(
  bucket: PrivateBucket,
  values: (string | null | undefined)[],
): Promise<(string | null)[]> {
  const paths = values.map((v) => storagePathFor(bucket, v));
  const needed = new Set<string>();
  for (const p of paths) {
    if (p && !cachedFresh(bucket, p, REFRESH_MARGIN_MS)) needed.add(p);
  }

  if (needed.size > 0) {
    const list = Array.from(needed);
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(list, TTL_SECONDS);
      if (!error && Array.isArray(data)) {
        for (const item of data) {
          // `path` comes back as the path we asked for; `signedUrl` is null on
          // a per-object failure (missing file, or not readable by this user).
          const returnedPath = (item as { path?: string | null }).path;
          const signedUrl = (item as { signedUrl?: string | null }).signedUrl;
          if (returnedPath && signedUrl) {
            storeSigned(bucket, returnedPath.replace(/^\/+/, ''), signedUrl);
          }
        }
      }
    } catch {
      // Fall through - each value is resolved individually below.
    }
  }

  return Promise.all(
    values.map((value, i) => {
      const path = paths[i];
      if (!path) return resolveMediaUrl(bucket, value);
      const hit = cachedFresh(bucket, path, REFRESH_MARGIN_MS);
      return hit ? Promise.resolve(hit) : resolveMediaUrl(bucket, value);
    }),
  );
}

/**
 * Warms the cache for a list without changing the caller's data shape. Used by
 * the API layer right after a page of rows is mapped, so the components that
 * render them find every URL already signed.
 */
export async function primeSignedUrls(
  bucket: PrivateBucket,
  values: (string | null | undefined)[],
): Promise<void> {
  try {
    await resolveMediaUrls(bucket, values);
  } catch {
    // Priming is an optimisation; the hook still resolves on demand.
  }
}

export interface SignedUrlState {
  url: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * React binding. Renders the cached URL on the first frame when there is one,
 * otherwise reports `loading` and then either a URL or a human-readable error.
 * It never throws into render.
 *
 * Pass `minFreshMs` where a long-lived view must not start on an almost-dead
 * link - the document reader passes READER_MIN_FRESH_MS.
 */
export function useSignedUrl(
  bucket: PrivateBucket,
  path: string | null | undefined,
  options: ResolveOptions = {},
): SignedUrlState {
  const minFreshMs = options.minFreshMs;
  const initial = peekSignedUrl(bucket, path);
  const [state, setState] = useState<SignedUrlState>(() => ({
    url: initial,
    loading: !!path && !initial,
    error: null,
  }));
  const activeRef = useRef(0);

  useEffect(() => {
    const token = ++activeRef.current;
    let cancelled = false;

    if (!path) {
      setState({ url: null, loading: false, error: null });
      return;
    }

    const hit = minFreshMs === undefined ? peekSignedUrl(bucket, path) : null;
    if (hit) {
      setState({ url: hit, loading: false, error: null });
      return;
    }

    setState((prev) => ({ url: prev.url, loading: true, error: null }));

    resolveMediaUrl(bucket, path, minFreshMs === undefined ? {} : { minFreshMs })
      .then((url) => {
        if (cancelled || token !== activeRef.current) return;
        if (url) {
          setState({ url, loading: false, error: null });
        } else {
          setState({
            url: null,
            loading: false,
            error: 'This file could not be opened. You may not have access to it, or it may have been removed.',
          });
        }
      })
      .catch(() => {
        if (cancelled || token !== activeRef.current) return;
        setState({ url: null, loading: false, error: 'This file could not be opened. Please try again.' });
      });

    return () => {
      cancelled = true;
    };
  }, [bucket, path, minFreshMs]);

  return state;
}
