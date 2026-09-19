import test from 'node:test';
import assert from 'node:assert/strict';
// Node's type stripping needs the explicit .ts extension; tsc does not allow it without allowImportingTsExtensions.
// @ts-ignore TS5097
import { contrastRatio, hexToRgb, pickBrandTone } from './brandTone.ts';
// @ts-ignore TS5097
import { BRAND_PALETTE } from '../constants/brandPalette.ts';
// @ts-ignore TS5097
import { ACCENT_PRESETS, darkColors, institutionThemeOverrides, lightColors } from '../theme/colors.ts';

const BLUES = ['sky', 'azure', 'cobalt'];
const ORANGES = ['orange', 'tangerine', 'salmon'];
const BERRIES = ['crimson', 'magenta', 'plum'];

type Mode = 'light' | 'dark';
const base = { light: lightColors, dark: darkColors } as const;

function pick(primary: string, mode: Mode, overrideBg?: { background?: string; surface?: string }) {
  const bg = overrideBg?.background ?? base[mode].background;
  const surface = overrideBg?.surface ?? base[mode].surface;
  return pickBrandTone(BRAND_PALETTE, { primary, backgrounds: [bg, surface] });
}

test('the generated palette is well formed and covers the emblem colour families', () => {
  assert.ok(BRAND_PALETTE.length >= 8);
  const ids = BRAND_PALETTE.map((p: { id: string }) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'palette ids must be unique');
  for (const p of BRAND_PALETTE as readonly { id: string; hex: string }[]) {
    assert.ok(hexToRgb(p.hex), `${p.id} has an invalid hex ${p.hex}`);
  }
  for (const id of [...BLUES, ...ORANGES, ...BERRIES]) assert.ok(ids.includes(id), `missing palette colour ${id}`);
});

test('every accent preset, in light and dark, gets a palette colour that is readable on its background', () => {
  for (const preset of ACCENT_PRESETS as readonly { id: string; primaryLight: string; primaryDark: string }[]) {
    for (const mode of ['light', 'dark'] as const) {
      const primary = mode === 'light' ? preset.primaryLight : preset.primaryDark;
      const id = pick(primary, mode);
      const entry = (BRAND_PALETTE as readonly { id: string; hex: string }[]).find((p) => p.id === id);
      assert.ok(entry, `${preset.id}/${mode}: "${id}" is not in the palette`);
      for (const bg of [base[mode].background, base[mode].surface]) {
        const c = contrastRatio(entry!.hex, bg);
        assert.ok(c !== null && c >= 3, `${preset.id}/${mode}: ${id} has contrast ${c?.toFixed(2)} on ${bg}`);
      }
    }
  }
});

test('every campus theme override is readable in both modes', () => {
  for (const [campus, o] of Object.entries(institutionThemeOverrides) as [string, { light: any; dark: any }][]) {
    for (const mode of ['light', 'dark'] as const) {
      const merged = { ...base[mode], ...o[mode] };
      const id = pickBrandTone(BRAND_PALETTE, { primary: merged.brandPrimary, backgrounds: [merged.background, merged.surface] });
      const entry = (BRAND_PALETTE as readonly { id: string; hex: string }[]).find((p) => p.id === id)!;
      for (const bg of [merged.background, merged.surface]) {
        const c = contrastRatio(entry.hex, bg);
        assert.ok(c !== null && c >= 3, `${campus}/${mode}: ${id} has contrast ${c?.toFixed(2)} on ${bg}`);
      }
    }
  }
});

test('the wordmark colour follows the theme hue: blue themes get blues, amber themes get oranges', () => {
  for (const mode of ['light', 'dark'] as const) {
    const globalPrimary = mode === 'light' ? '#1A3DFF' : '#6A89FF';
    assert.ok(BLUES.includes(pick(globalPrimary, mode)), `default blue theme (${mode})`);
  }
  // Ife amber theme (light): primary is a burnt orange, so the orange family must win.
  assert.ok(ORANGES.includes(pick('#B45309', 'light')), 'amber light theme should use an orange');
  assert.ok(ORANGES.includes(pick('#FBBF24', 'dark')), 'amber dark theme should use an orange');
  // A red primary maps into the berry family.
  assert.ok(BERRIES.includes(pick('#DC2626', 'light')), 'red theme should use a crimson/magenta/plum');
});

test('light themes get deeper shades than dark themes for the same hue family', () => {
  const deep = { sky: 0, azure: 1, cobalt: 2 } as Record<string, number>;
  const light = pick('#1A3DFF', 'light');
  const dark = pick('#6A89FF', 'dark');
  assert.ok(deep[light] >= deep[dark], `light=${light} should be at least as deep as dark=${dark}`);
});

test('unusable input never throws and always returns a palette colour', () => {
  const ids = (BRAND_PALETTE as readonly { id: string }[]).map((p) => p.id);
  for (const primary of ['', 'not-a-colour', 'rgba(1,2,3,0.4)', '#808080', '#FFF']) {
    for (const backgrounds of [[], ['nonsense'], ['#FFFFFF'], ['#0B1120', '#131E32']]) {
      const id = pickBrandTone(BRAND_PALETTE, { primary, backgrounds });
      assert.ok(ids.includes(id), `primary=${primary} bg=${backgrounds.join(',')} -> ${id}`);
    }
  }
});

test('when nothing meets the contrast target the most readable colour is used', () => {
  const id = pickBrandTone(BRAND_PALETTE, { primary: '#1A3DFF', backgrounds: ['#01AFFC'], minContrast: 21 });
  const entry = (BRAND_PALETTE as readonly { id: string; hex: string }[]).find((p) => p.id === id)!;
  const best = Math.max(...(BRAND_PALETTE as readonly { hex: string }[]).map((p) => contrastRatio(p.hex, '#01AFFC') ?? 0));
  assert.equal(contrastRatio(entry.hex, '#01AFFC'), best);
});

test('the choice is deterministic', () => {
  assert.equal(pick('#6D28D9', 'light'), pick('#6D28D9', 'light'));
});
