// Tiny static server for the exported web build (dist/) used by the Playwright e2e run.
//
// It mirrors what Vercel does in production so the tests exercise the real thing:
//   * every `headers` rule from vercel.json is read at runtime and applied (including the
//     Content-Security-Policy), so CSP violations show up in tests instead of in production
//   * `cleanUrls`: /privacy serves privacy.html when the export produced one
//   * the SPA `rewrites` rule: unknown paths fall back to index.html (except /.well-known/)
//
// Usage: node e2e/serve-dist.mjs   (PORT and DIST_DIR may be overridden via env)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.resolve(root, process.env.DIST_DIR || 'dist');
const port = Number(process.env.PORT || 4173);

const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const headerRules = (vercel.headers || []).map((rule) => ({
  // Vercel sources are path-to-regexp patterns; the ones used here ("/(.*)", "/",
  // "/assets/(.*)", ...) are valid regular expressions once anchored.
  re: new RegExp(`^${rule.source}$`),
  headers: rule.headers,
}));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Map a URL pathname to a file inside dist/, or null. Never escapes distDir. */
function resolveFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const rel = decoded.replace(/^\/+/, '');
  const candidate = path.resolve(distDir, rel);
  if (candidate !== distDir && !candidate.startsWith(distDir + path.sep)) return null;
  if (rel === '') return path.join(distDir, 'index.html');
  if (isFile(candidate)) return candidate;
  if (isFile(`${candidate}.html`)) return `${candidate}.html`; // cleanUrls
  if (isFile(path.join(candidate, 'index.html'))) return path.join(candidate, 'index.html');
  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  let file = resolveFile(pathname);
  let status = 200;
  if (!file) {
    if (pathname.startsWith('/.well-known/')) {
      status = 404;
    } else {
      file = path.join(distDir, 'index.html'); // SPA rewrite
    }
  }

  const headers = {};
  for (const rule of headerRules) {
    if (rule.re.test(pathname)) {
      for (const h of rule.headers) headers[h.key] = h.value;
    }
  }

  if (status === 404 || !file || !isFile(file)) {
    res.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  // A header rule may set its own Content-Type (security.txt); otherwise infer it.
  const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');
  if (!hasContentType) headers['Content-Type'] = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

  res.writeHead(status, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${distDir} on http://127.0.0.1:${port}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
