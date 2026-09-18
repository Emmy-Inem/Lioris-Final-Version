# Content-Security-Policy notes

The enforced policy lives in `vercel.json` (source `/(.*)`). Rationale per directive:

| Directive | Value | Why |
| --- | --- | --- |
| `script-src` | `'self'` | The Expo web export (`dist/index.html`) has no inline scripts and the bundle needs no `eval`/`wasm`, so no `unsafe-inline`/`unsafe-eval`. |
| `style-src` | `'self' 'unsafe-inline' https://fonts.googleapis.com` | react-native-web injects `<style>` tags at runtime and the Expo HTML shell has an inline reset style. |
| `font-src` | `'self' data: https://fonts.gstatic.com` | Fonts are bundled; Google Fonts allowed as fallback. |
| `img-src` | `'self' data: blob: https:` | User/campus images, GIFs and book covers come from many https hosts. |
| `media-src` | `'self' blob: https:` | Campus radio streams. `http://` streams are blocked (mixed content + `upgrade-insecure-requests`); only https streams play. Radio-browser results with http URLs will not play on the web build. |
| `connect-src` | Supabase (https+wss), api.lioris.app (https+wss), openlibrary.org, api.semanticscholar.org, api.openalex.org, api.open-meteo.com, open.er-api.com, `*.api.radio-browser.info`, plus `blob:` and `data:` | Origins the client calls (`src/api/*.ts`). `blob:`/`data:` are needed because picked images are read with `fetch(uri)` before upload. |
| `frame-src` | meet.jit.si, www.openstreetmap.org, maps.google.com, www.google.com, docs.google.com | Jitsi calls, OSM/Google map embeds, Google Docs viewer for resources. |
| `worker-src` | `'self' blob:` | Bundler/worker blob usage. |
| `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`, `upgrade-insecure-requests` | | Clickjacking, base-tag and plugin hardening. |

Adding a new third-party API or embed to the client requires adding its origin here, otherwise the browser blocks it. `X-Frame-Options: DENY` and `frame-ancestors 'none'` mean the app cannot itself be embedded.

To test a change: `npx expo export -p web --clear`, serve `dist/` with the headers from `vercel.json`, open the login page and check the browser console for "violates the following Content Security Policy directive".
