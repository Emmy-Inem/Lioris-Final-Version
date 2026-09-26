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
const VERSION = 'lioris-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const STATIC_CACHE = `${VERSION}-static`;
const MAX_STATIC_ENTRIES = 160;
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

async function trimStaticCache() {
  const cache = await caches.open(STATIC_CACHE);
  const keys = await cache.keys();
  if (keys.length <= MAX_STATIC_ENTRIES) return;
  await Promise.all(keys.slice(0, keys.length - MAX_STATIC_ENTRIES).map((key) => cache.delete(key)));
}

async function handleNavigation(request) {
  const shell = await caches.open(SHELL_CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAVIGATION_TIMEOUT_MS)),
    ]);
    const type = response.headers.get('content-type') || '';
    if (response.ok && type.includes('text/html')) {
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
  if (cached) return cached;
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

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(handleStatic(request));
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
