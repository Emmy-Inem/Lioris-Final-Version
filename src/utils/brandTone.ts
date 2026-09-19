/**
 * Chooses which brand colour the Lioris wordmark should use for the active theme.
 *
 * The wordmark may only ever use colours that occur in the emblem (see BRAND_PALETTE), so it always
 * looks like part of the same logo. Within that palette we take the colour that is closest to the
 * theme's primary colour in hue, and in lightness so that light and dark themes get the matching
 * shade, and we only accept colours that stay readable on the theme's background and surface.
 *
 * Pure and dependency-free so it can be unit-tested with `node --test`.
 */

export interface PaletteEntry {
  readonly id: string;
  readonly hex: string;
}

type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two hex colours (1..21), or null when either is not a plain hex colour. */
export function contrastRatio(a: string, b: string): number | null {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return null;
  const la = relativeLuminance(ra);
  const lb = relativeLuminance(rb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function toHsl([r, g, b]: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export interface PickBrandToneOptions {
  /** The active theme's primary colour (hex), e.g. colors.brandPrimary. */
  primary: string;
  /** Colours the logo can sit on (hex), e.g. [colors.background, colors.surface]. */
  backgrounds: readonly string[];
  /** Minimum WCAG contrast against every background. Default 3 (large graphics / logos). */
  minContrast?: number;
}

/**
 * Returns the id of the palette entry to use. Never throws and always returns an id from `palette`
 * (which must not be empty).
 */
export function pickBrandTone<T extends PaletteEntry>(palette: readonly T[], opts: PickBrandToneOptions): T['id'] {
  const minContrast = opts.minContrast ?? 3;
  const primary = hexToRgb(opts.primary);
  const target = primary ? toHsl(primary) : null;

  let bestId: T['id'] = palette[0].id;
  let bestScore = Infinity;
  let readableFallbackId: T['id'] = palette[0].id;
  let readableFallbackContrast = -1;

  for (const entry of palette) {
    const rgb = hexToRgb(entry.hex);
    if (!rgb) continue;
    let worst = Infinity;
    for (const bg of opts.backgrounds) {
      const c = contrastRatio(entry.hex, bg);
      if (c !== null && c < worst) worst = c;
    }
    if (worst === Infinity) worst = minContrast; // no usable background info: do not exclude anything
    if (worst > readableFallbackContrast) {
      readableFallbackContrast = worst;
      readableFallbackId = entry.id;
    }
    if (worst < minContrast) continue;

    const hsl = toHsl(rgb);
    let score: number;
    if (!target) score = 0;
    else {
      // A near-grey theme colour has no meaningful hue, so only lightness decides.
      const hueTerm = target.s < 0.12 ? 0 : hueDistance(hsl.h, target.h) / 180;
      score = hueTerm + 0.6 * Math.abs(hsl.l - target.l);
    }
    if (score < bestScore) {
      bestScore = score;
      bestId = entry.id;
    }
  }
  // If nothing met the contrast target, use the most readable colour rather than an unreadable one.
  return bestScore === Infinity ? readableFallbackId : bestId;
}
