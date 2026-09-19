#!/usr/bin/env node
/**
 * Rebuilds every Lioris brand asset from the four ORIGINAL logo files in assets/brand/source/.
 *
 *   node tools/brand/build-brand-assets.cjs            # write all assets
 *   PREVIEW_OUT=<dir> node tools/brand/build-brand-assets.cjs --preview   # also write QA contact sheets
 *
 * Order of operations (deliberate): the background is REMOVED FIRST, producing a clean transparent
 * cut-out of each logo. Every icon, splash, favicon and social image is then composed from those
 * cut-outs, never from the flat originals, so no light halo or grey box can leak into any of them.
 *
 * Background removal (per logo):
 *   1. Model the background locally (normalised convolution over pixels that look like background),
 *      so a noisy or vignetted grey backdrop is handled as well as a pure white one.
 *   2. Pixels far from the background are solid foreground (alpha 1).
 *   3. Edge pixels get their alpha by projecting onto the line between the local background and the
 *      nearest solid foreground colour (true matting), and are re-coloured with that foreground colour
 *      so no white/grey fringe survives. Negative space (arcs, stem, letter counters) becomes
 *      transparent because it is background-coloured too.
 *   4. Transparent pixels keep a neighbouring foreground RGB so resizing does not bleed dark/light edges.
 *
 * Only depends on `jimp-compact`, which ships with Expo's image tooling (no new dependency).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Jimp = require('jimp-compact');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'assets', 'brand', 'source');
const OUT = path.join(ROOT, 'assets', 'images');
const PUB = path.join(ROOT, 'public');
const PREVIEW = process.argv.includes('--preview') ? process.env.PREVIEW_OUT : null;

const NAVY = 0x0b1220ff;
const WHITE = 0xffffffff;
const OG_NAVY = 0x080e1aff; // matches theme-color / manifest background

// ---------------------------------------------------------------------------------------------
// Background removal
// ---------------------------------------------------------------------------------------------
function median(values) {
  const s = Float64Array.from(values).sort();
  return s[s.length >> 1];
}

function cutout(im) {
  const { width: w, height: h, data } = im.bitmap;
  const N = w * h;

  // Global background estimate = per-channel median of the border ring.
  const ring = [[], [], []];
  const take = (x, y) => {
    const i = (y * w + x) * 4;
    ring[0].push(data[i]);
    ring[1].push(data[i + 1]);
    ring[2].push(data[i + 2]);
  };
  for (let x = 0; x < w; x += 2) { take(x, 0); take(x, h - 1); }
  for (let y = 0; y < h; y += 2) { take(0, y); take(w - 1, y); }
  const gbg = [median(ring[0]), median(ring[1]), median(ring[2])];

  // Pixels that "look like background" (near the global estimate AND neutral in colour).
  const isBg = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const dr = r - gbg[0], dg = g - gbg[1], db = b - gbg[2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    isBg[i] = Math.sqrt(dr * dr + dg * dg + db * db) < 45 && chroma < 16 ? 1 : 0;
  }

  // Local background field: normalised convolution (box blur of bg-only pixels) via integral images.
  const W1 = w + 1;
  const integ = [0, 1, 2, 3].map(() => new Float64Array(W1 * (h + 1)));
  for (let y = 0; y < h; y++) {
    let rowR = 0, rowG = 0, rowB = 0, rowW = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (isBg[i]) {
        rowR += data[i * 4]; rowG += data[i * 4 + 1]; rowB += data[i * 4 + 2]; rowW += 1;
      }
      const k = (y + 1) * W1 + (x + 1), up = y * W1 + (x + 1);
      integ[0][k] = integ[0][up] + rowR;
      integ[1][k] = integ[1][up] + rowG;
      integ[2][k] = integ[2][up] + rowB;
      integ[3][k] = integ[3][up] + rowW;
    }
  }
  const R = Math.max(24, Math.round(Math.min(w, h) * 0.04));
  const bg = new Float32Array(N * 3);
  const dist = new Float32Array(N);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - R), y1 = Math.min(h, y + R + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 1);
      const box = (t) => integ[t][y1 * W1 + x1] - integ[t][y0 * W1 + x1] - integ[t][y1 * W1 + x0] + integ[t][y0 * W1 + x0];
      const cnt = box(3);
      const i = y * w + x;
      const br = cnt > 40 ? box(0) / cnt : gbg[0];
      const bgc = cnt > 40 ? box(1) / cnt : gbg[1];
      const bb = cnt > 40 ? box(2) / cnt : gbg[2];
      bg[i * 3] = br; bg[i * 3 + 1] = bgc; bg[i * 3 + 2] = bb;
      const dr = data[i * 4] - br, dg = data[i * 4 + 1] - bgc, db = data[i * 4 + 2] - bb;
      dist[i] = Math.sqrt(dr * dr + dg * dg + db * db);
    }
  }

  // Solid foreground.
  const STRONG = 75;
  const nearest = new Int32Array(N).fill(-1);
  const steps = new Uint8Array(N);
  const queue = new Int32Array(N);
  let qh = 0, qt = 0;
  for (let i = 0; i < N; i++) {
    if (dist[i] > STRONG) { nearest[i] = i; queue[qt++] = i; }
  }
  // Multi-source BFS: every pixel learns its nearest solid-foreground pixel (up to FILL px away).
  const FILL = 14;
  while (qh < qt) {
    const i = queue[qh++];
    if (steps[i] >= FILL) continue;
    const x = i % w, y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (nearest[j] !== -1) continue;
        nearest[j] = nearest[i];
        steps[j] = steps[i] + 1;
        queue[qt++] = j;
      }
    }
  }

  // Alpha by projection onto (background -> nearest solid foreground); re-colour edges.
  const out = Buffer.alloc(N * 4);
  const EDGE = 4;
  for (let i = 0; i < N; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    let a = 0, cr = r, cg = g, cb = b;
    if (dist[i] > STRONG) {
      a = 1;
    } else if (nearest[i] !== -1) {
      const f = nearest[i] * 4;
      const fr = data[f], fg = data[f + 1], fb = data[f + 2];
      cr = fr; cg = fg; cb = fb; // decontaminated colour
      if (steps[i] <= EDGE && dist[i] > 7) {
        const ur = fr - bg[i * 3], ug = fg - bg[i * 3 + 1], ub = fb - bg[i * 3 + 2];
        const vr = r - bg[i * 3], vg = g - bg[i * 3 + 1], vb = b - bg[i * 3 + 2];
        const uu = ur * ur + ug * ug + ub * ub;
        a = uu > 1 ? Math.min(1, Math.max(0, (vr * ur + vg * ug + vb * ub) / uu)) : 0;
        if (a < 0.03) a = 0;
      }
    } else {
      cr = cg = cb = 0;
    }
    out[i * 4] = cr; out[i * 4 + 1] = cg; out[i * 4 + 2] = cb;
    out[i * 4 + 3] = Math.round(a * 255);
  }

  const res = new Jimp({ data: out, width: w, height: h });
  return trim(res);
}

/** Crop to the visible pixels (alpha > 10). */
function trim(im, pad = 0) {
  const { width: w, height: h, data } = im.bitmap;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('cut-out is empty: background removal failed');
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  return im.clone().crop(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

// ---------------------------------------------------------------------------------------------
// Composition helpers
// ---------------------------------------------------------------------------------------------
const fit = (im, maxW, maxH) => im.clone().scaleToFit(maxW, maxH, Jimp.RESIZE_BICUBIC);

function silhouette(im, rgb = [255, 255, 255]) {
  const c = im.clone();
  const d = c.bitmap.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; }
  return c;
}

function centered(canvasW, canvasH, bgColor, logo, boxW, boxH, offsetY = 0) {
  const canvas = new Jimp(canvasW, canvasH, bgColor);
  const l = fit(logo, boxW, boxH);
  canvas.composite(l, Math.round((canvasW - l.bitmap.width) / 2), Math.round((canvasH - l.bitmap.height) / 2 + offsetY));
  return canvas;
}

async function save(im, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  im.deflateLevel(9);
  await im.writeAsync(file);
  const kb = (fs.statSync(file).size / 1024).toFixed(1);
  console.log('  wrote', path.relative(ROOT, file).replace(/\\/g, '/'), `${im.bitmap.width}x${im.bitmap.height}`, `${kb}KB`);
}

async function contactSheet(items, file) {
  // Each cut-out on navy, white and a checkerboard: halos and holes show immediately.
  const cell = 340, pad = 12, cols = 3;
  const rows = items.length;
  const sheet = new Jimp(cols * cell + (cols + 1) * pad, rows * cell + (rows + 1) * pad, 0x777777ff);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellIm = new Jimp(cell, cell, c === 0 ? NAVY : c === 1 ? WHITE : 0xffffffff);
      if (c === 2) {
        for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
          if (((x >> 4) + (y >> 4)) & 1) cellIm.setPixelColor(0xc8c8c8ff, x, y);
        }
      }
      const l = fit(items[r].im, cell - 40, cell - 40);
      cellIm.composite(l, Math.round((cell - l.bitmap.width) / 2), Math.round((cell - l.bitmap.height) / 2));
      sheet.composite(cellIm, pad + c * (cell + pad), pad + r * (cell + pad));
    }
  }
  await sheet.writeAsync(file);
  console.log('  preview', file);
}

// ---------------------------------------------------------------------------------------------
async function main() {
  console.log('1) Removing backgrounds from the original logos...');
  const emblem = cutout(await Jimp.read(path.join(SRC, 'emblem-color.jpg')));
  const emblemBlue = cutout(await Jimp.read(path.join(SRC, 'emblem-blue.jpg')));
  const wordBlue = cutout(await Jimp.read(path.join(SRC, 'wordmark-blue.jpg')));
  const wordOrange = cutout(await Jimp.read(path.join(SRC, 'wordmark-orange.jpg')));
  const wordWhite = silhouette(wordBlue);
  console.log(`  emblem ${emblem.bitmap.width}x${emblem.bitmap.height}, blue emblem ${emblemBlue.bitmap.width}x${emblemBlue.bitmap.height}, wordmark ${wordBlue.bitmap.width}x${wordBlue.bitmap.height}`);
  console.log(`  wordmark aspect ratio (w/h) = ${(wordBlue.bitmap.width / wordBlue.bitmap.height).toFixed(4)}`);
  // Sanity: the two wordmark sources must give (nearly) the same shape.
  {
    const a = wordBlue.bitmap, b = fit(wordOrange, a.width, a.height).bitmap;
    if (Math.abs(a.width - b.width) <= 2 && Math.abs(a.height - b.height) <= 2) {
      let inter = 0, uni = 0;
      const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const pa = a.data[(y * a.width + x) * 4 + 3] > 127, pb = b.data[(y * b.width + x) * 4 + 3] > 127;
        if (pa && pb) inter++; if (pa || pb) uni++;
      }
      console.log(`  wordmark orange/blue mask overlap (IoU) = ${(inter / uni).toFixed(3)}`);
    }
  }

  if (PREVIEW) {
    fs.mkdirSync(PREVIEW, { recursive: true });
    await contactSheet([
      { im: emblem }, { im: emblemBlue }, { im: wordBlue }, { im: wordOrange },
    ], path.join(PREVIEW, 'cutouts.png'));
  }

  console.log('2) In-app logos (assets/images)...');
  await save(fit(emblem, 768, 768), path.join(OUT, 'lioris_emblem.png'));
  await save(fit(emblemBlue, 768, 768), path.join(OUT, 'lioris_emblem_blue.png'));
  await save(wordBlue, path.join(OUT, 'lioris_wordmark_blue.png'));
  await save(wordOrange, path.join(OUT, 'lioris_wordmark_orange.png'));
  await save(wordWhite, path.join(OUT, 'lioris_wordmark_white.png'));

  console.log('3) Native app icon, adaptive icon, notification icon, splash...');
  // iOS / store icon: 1024, fully opaque (the App Store rejects transparency), master art on white.
  await save(centered(1024, 1024, WHITE, emblem, 740, 740), path.join(OUT, 'icon.png'));
  // Android adaptive icon: transparent foreground inside the 66% safe zone (+ themed monochrome layer).
  await save(centered(1024, 1024, 0x00000000, emblem, 640, 640), path.join(OUT, 'android-icon-foreground.png'));
  await save(centered(1024, 1024, 0x00000000, silhouette(emblem), 640, 640), path.join(OUT, 'android-icon-monochrome.png'));
  // Android status-bar notification icon: white silhouette on transparent.
  await save(centered(96, 96, 0x00000000, silhouette(emblem), 84, 84), path.join(OUT, 'notification-icon.png'));
  // Splash: transparent emblem (the background colour comes from app.config.ts, light + dark).
  await save(centered(1024, 1024, 0x00000000, emblem, 900, 900), path.join(OUT, 'splash.png'));
  await save(centered(256, 256, 0x00000000, emblem, 240, 240), path.join(OUT, 'favicon.png'));

  console.log('4) Web icons, PWA icons, social card (public)...');
  await save(centered(256, 256, 0x00000000, emblem, 240, 240), path.join(PUB, 'favicon.png'));
  await save(centered(32, 32, 0x00000000, emblem, 30, 30), path.join(PUB, 'favicon-32x32.png'));
  await save(centered(16, 16, 0x00000000, emblem, 15, 15), path.join(PUB, 'favicon-16x16.png'));
  // iOS home-screen icon must be opaque (transparent renders black).
  await save(centered(180, 180, WHITE, emblem, 138, 138), path.join(PUB, 'apple-touch-icon.png'));
  // PWA "any" icons: opaque, generous padding. "maskable": artwork inside the centre 60% safe zone.
  await save(centered(192, 192, WHITE, emblem, 150, 150), path.join(PUB, 'icon-192.png'));
  await save(centered(512, 512, WHITE, emblem, 400, 400), path.join(PUB, 'icon-512.png'));
  await save(centered(192, 192, WHITE, emblem, 112, 112), path.join(PUB, 'icon-maskable-192.png'));
  await save(centered(512, 512, WHITE, emblem, 300, 300), path.join(PUB, 'icon-maskable-512.png'));

  // Vector-style favicon: a small embedded PNG (~10KB) instead of the previous 450KB.
  {
    const small = fit(emblem, 128, 128);
    const b64 = (await small.getBufferAsync(Jimp.MIME_PNG)).toString('base64');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${small.bitmap.width} ${small.bitmap.height}">` +
      `<image width="${small.bitmap.width}" height="${small.bitmap.height}" href="data:image/png;base64,${b64}"/></svg>\n`;
    fs.writeFileSync(path.join(PUB, 'favicon.svg'), svg);
    console.log('  wrote public/favicon.svg', `${(svg.length / 1024).toFixed(1)}KB`);
  }

  // Social card 1200x630 (Open Graph / Twitter): emblem over wordmark on the brand navy. No text so
  // nothing is ever cropped or mis-rendered by WhatsApp / Twitter / iMessage.
  {
    const card = new Jimp(1200, 630, OG_NAVY);
    const e = fit(emblem, 330, 330);
    const wm = fit(wordBlue, 420, 100);
    const total = e.bitmap.height + 36 + wm.bitmap.height;
    const top = Math.round((630 - total) / 2);
    card.composite(e, Math.round((1200 - e.bitmap.width) / 2), top);
    card.composite(wm, Math.round((1200 - wm.bitmap.width) / 2), top + e.bitmap.height + 36);
    card.quality(84);
    fs.writeFileSync(path.join(PUB, 'og-image.jpg'), await card.getBufferAsync(Jimp.MIME_JPEG));
    console.log('  wrote public/og-image.jpg 1200x630', `${(fs.statSync(path.join(PUB, 'og-image.jpg')).size / 1024).toFixed(1)}KB`);
  }

  if (PREVIEW) {
    console.log('5) QA sheets...');
    const icons = [
      { im: await Jimp.read(path.join(OUT, 'icon.png')) },
      { im: await Jimp.read(path.join(OUT, 'android-icon-foreground.png')) },
      { im: await Jimp.read(path.join(OUT, 'notification-icon.png')).then((i) => i.resize(96, 96)) },
      { im: await Jimp.read(path.join(OUT, 'splash.png')) },
      { im: await Jimp.read(path.join(PUB, 'apple-touch-icon.png')) },
      { im: wordWhite },
    ];
    await contactSheet(icons, path.join(PREVIEW, 'icons.png'));
  }
  console.log('done.');
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
