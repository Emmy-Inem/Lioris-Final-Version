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
      navigator.serviceWorker.register('/sw.js').catch(function () {
        /* Installability and offline shell are optional; the app works without them. */
      });
    });
  }

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
    return false;
  }

  // Coming back from minimized / a discarded tab / bfcache with nothing rendered.
  function checkAfterResume() {
    if (document.visibilityState !== 'visible') return;
    setTimeout(function () {
      if (document.visibilityState === 'visible' && appIsBlank()) reloadOnce();
    }, 1500);
  }
  document.addEventListener('visibilitychange', checkAfterResume);
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) checkAfterResume();
  });

  // First-load safety net: the bundle never mounted at all.
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (appIsBlank()) reloadOnce();
    }, 12000);
  });
})();
