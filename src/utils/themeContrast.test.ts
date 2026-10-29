import test from 'node:test';
import assert from 'node:assert/strict';
// Node's type stripping needs the explicit .ts extension; tsc does not allow it without allowImportingTsExtensions.
// @ts-ignore TS5097
import { contrastRatio, onBrandColor, readableOn } from '../theme/contrast.ts';
// @ts-ignore TS5097
import { darkColors, institutionThemeOverrides, lightColors, roleBadgeColors } from '../theme/colors.ts';

/**
 * Guards the WCAG AA contrast of every foreground/background token pair the app draws text (4.5:1) or
 * UI components (3:1) with, in both themes and for every campus brand. A token change that breaks a
 * pair fails here instead of silently reaching users (the dark theme once shipped white text on the
 * light #6A89FF / #A78BFA brand fills at 3.16:1 and 2.72:1).
 *
 * ThemeProvider derives `onBrand` per campus with `onBrandColor`; the same function is used here, so
 * the resolved colours below are exactly what the app renders.
 */

const TEXT = 4.5;
const UI = 3;

type Rgb = [number, number, number];

function parse(color: string): { rgb: Rgb; a: number } {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    return { rgb: [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)], a: 1 };
  }
  const m = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  assert.ok(m, `unsupported colour ${color}`);
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] === undefined ? 1 : Number(m[4]) };
}

function toHex(rgb: Rgb): string {
  return '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Flattens a (possibly translucent) colour over an opaque hex base, as the browser does. */
function over(color: string, base: string): string {
  const { rgb, a } = parse(color);
  const b = parse(base).rgb;
  return toHex([0, 1, 2].map((i) => rgb[i] * a + b[i] * (1 - a)) as Rgb);
}

function ratio(fg: string, bg: string): number {
  return contrastRatio(over(fg, bg), bg);
}

type Scheme = 'light' | 'dark';
const BASE = { light: lightColors, dark: darkColors } as const;

interface Variant {
  name: string;
  scheme: Scheme;
  colors: typeof lightColors;
}

// Every theme the app can render: the two defaults plus every campus brand in both schemes.
const VARIANTS: Variant[] = [];
for (const scheme of ['light', 'dark'] as const) {
  VARIANTS.push({ name: `${scheme}/default`, scheme, colors: { ...BASE[scheme], onBrand: BASE[scheme].onBrand } });
  for (const [code, override] of Object.entries(institutionThemeOverrides)) {
    const merged = { ...BASE[scheme], ...override[scheme] };
    VARIANTS.push({ name: `${scheme}/${code}`, scheme, colors: { ...merged, onBrand: onBrandColor(merged.brandPrimary) } });
  }
}

function check(label: string, fg: string, bg: string, min: number, failures: string[]) {
  const r = ratio(fg, bg);
  if (r < min) failures.push(`${label}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
}

test('default onBrand tokens match what ThemeProvider derives for the default brand', () => {
  assert.equal(lightColors.onBrand, onBrandColor(lightColors.brandPrimary));
  assert.equal(darkColors.onBrand, onBrandColor(darkColors.brandPrimary));
  // The regression this guards: white text on the light dark-theme brand fills.
  assert.ok(contrastRatio('#FFFFFF', '#6A89FF') < TEXT, 'white on #6A89FF is the known-bad pair');
  assert.ok(contrastRatio('#FFFFFF', '#A78BFA') < TEXT, 'white on #A78BFA is the known-bad pair');
});

test('text on solid brand and critical fills reaches AA in every theme and campus brand', () => {
  const failures: string[] = [];
  for (const { name, colors } of VARIANTS) {
    check(`${name} onBrand/brandPrimary`, colors.onBrand, colors.brandPrimary, TEXT, failures);
    check(`${name} onCritical/critical`, colors.onCritical, colors.critical, TEXT, failures);
    check(`${name} readableOn(brandAccent)/brandAccent`, readableOn(colors.brandAccent), colors.brandAccent, TEXT, failures);
  }
  assert.deepEqual(failures, []);
});

test('body and secondary text read on the page and card surfaces', () => {
  const failures: string[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    const c = BASE[scheme];
    for (const bg of [c.background, c.surface]) {
      check(`${scheme} textPrimary`, c.textPrimary, bg, TEXT, failures);
      check(`${scheme} textSecondary`, c.textSecondary, bg, TEXT, failures);
      check(`${scheme} tabInactive`, c.tabInactive, bg, TEXT, failures);
      check(`${scheme} success`, c.success, bg, TEXT, failures);
      check(`${scheme} warning`, c.warning, bg, TEXT, failures);
      check(`${scheme} critical`, c.critical, bg, TEXT, failures);
      check(`${scheme} inputBorder (UI)`, c.inputBorder, bg, UI, failures);
    }
    // Secondary text also sits on the subtle fills (chip backgrounds, dividers).
    check(`${scheme} textSecondary/divider`, c.textSecondary, over(c.divider, c.surface), TEXT, failures);
    check(`${scheme} textSecondary/border`, c.textSecondary, over(c.border, c.surface), TEXT, failures);
  }
  assert.deepEqual(failures, []);
});

test('brand-coloured text and section labels read on the surfaces in every campus brand', () => {
  const failures: string[] = [];
  for (const { name, colors } of VARIANTS) {
    for (const bg of [colors.background, colors.surface]) {
      check(`${name} sectionLabel`, colors.sectionLabel, bg, TEXT, failures);
      check(`${name} tabActive`, colors.tabActive, bg, TEXT, failures);
    }
    check(`${name} sectionLabel/pastelPrimaryBg`, colors.sectionLabel, over(colors.pastelPrimaryBg, colors.surface), TEXT, failures);
  }
  assert.deepEqual(failures, []);
});

test('pastel status tiles and role badges keep readable text', () => {
  const failures: string[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    const c = BASE[scheme];
    const pairs: Array<[string, string, string]> = [
      ['sage', c.sageText, c.sageBg],
      ['rose', c.roseText, c.roseBg],
      ['mint', c.mintText, c.mintBg],
      ['lavender', c.lavenderText, c.lavenderBg],
    ];
    for (const [label, fg, bg] of pairs) {
      for (const base of [c.background, c.surface]) check(`${scheme} ${label}`, fg, over(bg, base), TEXT, failures);
    }
    for (const [role, tokens] of Object.entries(roleBadgeColors)) {
      const t = (tokens as Record<Scheme, { bg: string; text: string }>)[scheme];
      for (const base of [c.background, c.surface]) check(`${scheme} role badge ${role}`, t.text, over(t.bg, base), TEXT, failures);
    }
  }
  assert.deepEqual(failures, []);
});

test('hard-coded status fills and tinted notices that carry text stay AA', () => {
  const failures: string[] = [];
  // White text on solid status fills (approved / pending / revoked / call-accept chips and badges).
  for (const fill of ['#047857', '#B45309', '#DC2626', '#15803D']) check('white on status fill', '#FFFFFF', fill, TEXT, failures);
  // Tinted notices: [text, tint, scheme]. The tint is drawn over the card surface.
  const notices: Array<[string, string, string, Scheme]> = [
    ['admin posting banner', '#2563EB', '#EFF6FF', 'light'],
    ['admin posting banner', '#93C5FD', 'rgba(59, 130, 246, 0.15)', 'dark'],
    ['sync-ok notice', '#047857', '#ECFDF5', 'light'],
    ['sync-ok notice', '#6EE7B7', 'rgba(16, 185, 129, 0.1)', 'dark'],
    ['no-errors notice', '#047857', '#ECFDF5', 'light'],
    ['no-errors notice', '#6EE7B7', 'rgba(16, 185, 129, 0.1)', 'dark'],
  ];
  for (const [label, fg, tint, scheme] of notices) {
    for (const base of [BASE[scheme].background, BASE[scheme].surface]) check(`${scheme} ${label}`, fg, over(tint, base), TEXT, failures);
  }
  assert.deepEqual(failures, []);
});
