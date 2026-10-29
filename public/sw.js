/* Lioris service worker.
 *
 * Purpose: make the installed web app open instantly and survive being minimized.
 *  - Navigations are network-first (users always get the newest build), falling
 *    back to the cached app shell when the network is slow or offline, so the
 *    app never comes back as a blank white page.
 *  - Hashed build files (/_expo/, /assets/) are cache-first. A tab that stayed
 *    open across a deploy can still load the chunks it needs after the new
 *    deploy has removed them from the server.
 *  - Everything else (Supabase, storage, APIs, other origins) is never touched.
 */
const VERSION = 'lioris-v3';
const SHELL_CACHE = `${VERSION}-shell`;
const STATIC_CACHE = `${VERSION}-static`;
const MAX_STATIC_ENTRIES = 400; // one entry per route chunk (~125) plus fonts and images
const NAVIGATION_TIMEOUT_MS = 4000;

const SHELL_URLS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL_URLS.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((res) => (res.ok ? shell.put(url, res) : undefined))
            .catch(() => undefined),
        ),
      );
      // Pre-cache the bundle the shell points at so the cached shell is bootable offline.
      try {
        const cachedShell = await shell.match('/');
        if (cachedShell) {
          const html = await cachedShell.clone().text();
          const assets = Array.from(html.matchAll(/(?:src|href)="(\/_expo\/[^"]+)"/g)).map((m) => m[1]);
          const statics = await caches.open(STATIC_CACHE);
          await Promise.all(
            assets.map((url) =>
              fetch(url)
                .then((res) => (res.ok ? statics.put(url, res) : undefined))
                .catch(() => undefined),
            ),
          );
        }
      } catch (e) {
        // Pre-caching is best effort.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

// URLs of the hashed build files the cached app shell points at. These make up the
// current bundle, so they are never evicted by the size cap or by a runtime-cache clear.
async function currentBuildAssets() {
  const protectedUrls = new Set();
  try {
    const shell = await caches.open(SHELL_CACHE);
    const cachedShell = await shell.match('/');
    if (cachedShell) {
      const html = await cachedShell.clone().text();
      for (const m of html.matchAll(/(?:src|href)="(\/(?:_expo|assets)\/[^"]+)"/g)) protectedUrls.add(m[1]);
    }
  } catch (e) {
    // Best effort: with no shell to read, the cap below still keeps the newest entries.
  }
  return protectedUrls;
}

function pathOf(request) {
  return new URL(request.url).pathname;
}

// Cache.keys() is in insertion order, and handleStatic re-inserts an entry when it is
// used (see touchEntry), so the front of the list is the least recently used entry.
// Evict from the front, skipping anything that belongs to the current build.
async function trimStaticCache() {
  const cache = await caches.open(STATIC_CACHE);
  const keys = await cache.keys();
  if (keys.length <= MAX_STATIC_ENTRIES) return;
  const protectedUrls = await currentBuildAssets();
  let excess = keys.length - MAX_STATIC_ENTRIES;
  for (const key of keys) {
    if (excess <= 0) break;
    if (protectedUrls.has(pathOf(key))) continue;
    await cache.delete(key);
    excess -= 1;
  }
}

const lastTouched = new Map();
const TOUCH_INTERVAL_MS = 60 * 1000;

// Mark an entry as recently used by moving it to the end of the cache's key order.
async function touchEntry(cache, request, cached) {
  const now = Date.now();
  if (now - (lastTouched.get(request.url) || 0) < TOUCH_INTERVAL_MS) return;
  lastTouched.set(request.url, now);
  if (lastTouched.size > MAX_STATIC_ENTRIES * 4) lastTouched.clear();
  try {
    await cache.put(request, cached.clone());
  } catch (e) {
    // Ignore: the entry just keeps its old position.
  }
}

// Sign-out hook: drop everything cached at runtime. The shell and the files of the
// current build stay so the installed app still boots offline. Nothing in these caches
// is per-user today (API and Supabase traffic never passes through this worker), so this
// is defence in depth in case that ever changes.
async function clearRuntimeCaches() {
  const protectedUrls = await currentBuildAssets();
  const cache = await caches.open(STATIC_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.filter((key) => !protectedUrls.has(pathOf(key))).map((key) => cache.delete(key)));
  lastTouched.clear();
  const names = await caches.keys();
  await Promise.all(
    names.filter((n) => n !== SHELL_CACHE && n !== STATIC_CACHE && n.startsWith(VERSION)).map((n) => caches.delete(n)),
  );
}

// Paths that serve per-user or credentialed responses. The worker never answers or stores
// these; the fetch listener below also lets them go straight to the network.
const NEVER_CACHE_PREFIXES = ['/api/', '/auth/', '/rest/', '/functions/', '/storage/'];

function isNeverCached(request) {
  const path = pathOf(request);
  return request.headers.has('authorization') || NEVER_CACHE_PREFIXES.some((p) => path.startsWith(p));
}

function isCacheableShell(request, response, type) {
  return (
    response.ok &&
    response.status === 200 &&
    response.type === 'basic' &&
    !response.redirected &&
    type.includes('text/html') &&
    !isNeverCached(request) &&
    !/\bprivate\b/i.test(response.headers.get('cache-control') || '')
  );
}

async function handleNavigation(request) {
  const shell = await caches.open(SHELL_CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAVIGATION_TIMEOUT_MS)),
    ]);
    const type = response.headers.get('content-type') || '';
    // Only keep a clean, same-origin 200 page as the offline shell. Never store a redirect
    // (e.g. to a sign-in or provider page), an error page, or a page that varies per user.
    if (isCacheableShell(request, response, type)) {
      shell.put('/', response.clone()).catch(() => undefined);
    }
    return response;
  } catch (e) {
    const cached = await shell.match('/');
    if (cached) return cached;
    return new Response('Lioris is offline. Check your connection and try again.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function handleStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    touchEntry(cache, request, cached).catch(() => undefined);
    return cached;
  }
  const response = await fetch(request);
  const type = response.headers.get('content-type') || '';
  // A deploy that removed the file answers with the SPA index.html; never serve or cache that as JS/CSS.
  if (response.ok && type.includes('text/html')) {
    const reqUrl = new URL(request.url);
    if (reqUrl.pathname.endsWith('.js') || reqUrl.pathname.endsWith('.css') || reqUrl.pathname.startsWith('/_expo/')) {
      return new Response('Stale asset', { status: 404, statusText: 'Not Found' });
    }
  }
  if (response.ok && !type.includes('text/html')) {
    cache.put(request, response.clone()).then(trimStaticCache).catch(() => undefined);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isNeverCached(request)) return;
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(handleStatic(request));
  }
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data === 'SKIP_WAITING') self.skipWaiting();
  if (data && data.type === 'CLEAR_RUNTIME_CACHES') event.waitUntil(clearRuntimeCaches());
});
