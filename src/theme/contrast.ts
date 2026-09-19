/**
 * WCAG 2.1 contrast helpers. Used where a token (e.g. the per-campus accent
 * colour) is chosen for fills but is also rendered as small text, so the text
 * variant must be nudged darker/lighter until it reaches AA (4.5:1).
 */

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}

export function contrastRatio(fg: string, bg: string): number {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!a || !b) return 21; // non-hex (rgba etc.): cannot compute, assume OK
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function toHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

/**
 * Returns `fg` unchanged if it already reaches `min` contrast on `bg`; otherwise
 * mixes it towards black (on light backgrounds) or white (on dark backgrounds)
 * in small steps until it does. Hue is preserved as far as possible.
 */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  const rgb = hexToRgb(fg);
  const bgRgb = hexToRgb(bg);
  if (!rgb || !bgRgb) return fg;
  if (contrastRatio(fg, bg) >= min) return fg;
  const target: [number, number, number] = luminance(bgRgb) > 0.4 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const mixed = toHex([
      rgb[0] + (target[0] - rgb[0]) * t,
      rgb[1] + (target[1] - rgb[1]) * t,
      rgb[2] + (target[2] - rgb[2]) * t,
    ]);
    if (contrastRatio(mixed, bg) >= min) return mixed;
  }
  return toHex(target);
}

/** Picks near-black or white text, whichever reads better on `bg`. */
export function readableOn(bg: string, dark = '#0A1326', light = '#FFFFFF'): string {
  return contrastRatio(dark, bg) >= contrastRatio(light, bg) ? dark : light;
}
