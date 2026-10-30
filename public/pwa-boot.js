/* Lioris web boot helpers. Loaded before the app bundle (see public/index.html).
 * Plain ES5 on purpose: it must run on every phone browser and cannot depend on the bundle.
 *
 *  1. Captures the browser's install prompt as early as possible (it can fire before
 *     React mounts) and hands it to the app through window.__liorisInstallPrompt.
 *  2. Registers the service worker (see sw.js).
 *  3. Recovers from the blank white screen: a stale/missing script after a deploy,
 *     or an app tree that vanished while the app sat minimized, reloads the page.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  // ---- 0. Theme before first paint -------------------------------------------
  // The app stores its own light/dark choice. Without this, the page background (and the loading screen shown while
  // a screen's code downloads) follows the DEVICE setting, so someone who picked Light on a dark phone saw dark
  // flashes between screens. The app keeps the attribute current once it is running (src/theme/ThemeProvider.tsx).
  try {
    var storedTheme = window.localStorage.getItem('lioris.themeMode');
    if (storedTheme === 'light' || storedTheme === 'dark') {
      document.documentElement.setAttribute('data-lioris-theme', storedTheme);
      document.documentElement.style.colorScheme = storedTheme;
    }
  } catch (e) {
    /* storage blocked: the device setting applies */
  }

  // ---- 1. Install prompt -----------------------------------------------------
  window.__liorisInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    window.__liorisInstallPrompt = event;
    window.dispatchEvent(new Event('lioris:installable'));
  });
  window.addEventListener('appinstalled', function () {
    window.__liorisInstallPrompt = null;
    window.dispatchEvent(new Event('lioris:installed'));
  });

  // ---- 2. Service worker -----------------------------------------------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('/sw.js')
        .then(function (reg) {
          if (reg) {
            reg.update().catch(function () {});
          }
        })
        .catch(function () {
          /* Installability and offline shell are optional; the app works without them. */
        });
    });
  }

  // The app can call `window.dispatchEvent(new Event('lioris:sign-out'))` when a user signs out
  // to make the service worker drop its runtime caches (see CLEAR_RUNTIME_CACHES in sw.js).
  window.addEventListener('lioris:sign-out', function () {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_RUNTIME_CACHES' });
      }
    } catch (e) {
      /* best effort */
    }
  });

  // ---- 2b. Per-route metadata for the public legal pages ----------------------
  // The site is one HTML file, so title/description/canonical would otherwise be the
  // landing page's for every URL. This runs before the app boots. It lives here (not
  // inline in index.html) because the CSP is script-src 'self' and blocks inline scripts.
  (function setRouteMetadata() {
    var ORIGIN = 'https://lioris-campus.vercel.app';
    var PAGES = {
      '/terms': ['Terms of Service | Lioris', 'The terms that apply when you use Lioris: eligibility, accounts, acceptable use, content, the marketplace, moderation and disputes.'],
      '/privacy': ['Privacy Policy | Lioris', 'How Lioris collects, uses, shares and protects your personal data, and the choices and rights you have.'],
      '/copyright': ['Copyright and Takedown Policy | Lioris', 'What you may share on Lioris, how rights holders ask for removal, and how we handle copyright complaints.'],
      '/community-rules': ['Community Rules | Lioris', 'The standards of behaviour for everyone on Lioris, and what happens when they are broken.'],
    };
    try {
      var path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
      var page = Object.prototype.hasOwnProperty.call(PAGES, path) ? PAGES[path] : null;
      if (!page) return;
      var url = ORIGIN + path;
      var setMeta = function (selector, attr, value) {
        var el = document.head.querySelector(selector);
        if (el) el.setAttribute(attr, value);
      };
      document.title = page[0];
      setMeta('meta[name="description"]', 'content', page[1]);
      setMeta('link[rel="canonical"]', 'href', url);
      setMeta('meta[property="og:url"]', 'content', url);
      setMeta('meta[property="og:title"]', 'content', page[0]);
      setMeta('meta[property="og:description"]', 'content', page[1]);
      setMeta('meta[name="twitter:url"]', 'content', url);
      setMeta('meta[name="twitter:title"]', 'content', page[0]);
      setMeta('meta[name="twitter:description"]', 'content', page[1]);
    } catch (e) {
      /* metadata is cosmetic; never block boot */
    }
  })();

  // ---- 3. Blank-screen recovery ----------------------------------------------
  var RELOAD_KEY = 'lioris_recovery_reload_at';
  var RELOAD_GUARD_MS = 20000;

  function reloadOnce() {
    try {
      var last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last < RELOAD_GUARD_MS) return; // never loop
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch (e) {
      /* storage blocked: reload anyway, once per page life */
      if (window.__liorisReloaded) return;
      window.__liorisReloaded = true;
    }
    window.location.reload();
  }

  // A bundle file that failed to load (removed by a newer deploy, flaky network) or unhandled chunk syntax error.
  window.addEventListener(
    'error',
    function (event) {
      var el = event && event.target;
      if (el && el.tagName === 'SCRIPT' && el.src && el.src.indexOf('/_expo/') !== -1) {
        reloadOnce();
        return;
      }
      var msg = String((event && (event.message || (event.error && event.error.message))) || '');
      if (/SyntaxError: Unexpected token '<'|ChunkLoadError|Loading chunk|dynamically imported module/i.test(msg)) {
        reloadOnce();
      }
    },
    true,
  );

  // A lazily loaded chunk that came back as index.html or never arrived.
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    var message = String((reason && (reason.message || reason.name)) || reason || '');
    if (/ChunkLoadError|Loading chunk|dynamically imported module|Unexpected token '<'/i.test(message)) {
      reloadOnce();
    }
  });

  function appIsBlank() {
    var root = document.getElementById('root');
    if (!root || root.childElementCount === 0) return true;
    var inner = (root.innerText || root.textContent || '').trim();
    if (inner.length === 0 && !root.querySelector('img, svg, canvas, input, button, [role="button"]')) {
      return true;
    }
    var rect = root.getBoundingClientRect();
    if (rect.height === 0 && inner.length === 0) return true;
    return false;
  }

  // Coming back from minimized / a discarded tab / bfcache with nothing rendered.
  // A single check shortly after resume is not enough: a freeze that develops a
  // little later (e.g. a stale network request finally timing out and unmounting
  // something) lands right after the one check finds everything still fine, so it
  // is missed. Recheck a few times over the following seconds instead of once.
  var RESUME_CHECK_DELAYS_MS = [1500, 4000, 8000];
  function checkAfterResume() {
    RESUME_CHECK_DELAYS_MS.forEach(function (delay) {
      setTimeout(function () {
        if (document.visibilityState === 'visible' && appIsBlank()) reloadOnce();
      }, delay);
    });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkAfterResume();
  });
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) checkAfterResume();
  });
  // Some mobile browsers (and in-app/PWA shells) fire `focus` on resume more
  // reliably than `visibilitychange`; treat it as the same signal.
  window.addEventListener('focus', checkAfterResume);

  // The mounted React tree can also disappear WITHOUT throwing (so React's own
  // error boundary never sees it) and without being tied to a resume event at
  // all - e.g. something calls into a stale closure left over from before the
  // app was backgrounded. Watch #root directly so a vanished tree is caught the
  // instant it happens, whatever the cause or timing.
  (function watchRootForVanishing() {
    var root = document.getElementById('root');
    if (!root || typeof MutationObserver === 'undefined') return;
    var everMounted = false;
    var observer = new MutationObserver(function () {
      if (root.childElementCount > 0) {
        everMounted = true;
        return;
      }
      if (everMounted) reloadOnce();
    });
    observer.observe(root, { childList: true });
  })();

  // First-load safety net: the bundle never mounted at all.
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (appIsBlank()) reloadOnce();
    }, 12000);
  });
})();
