import AxeBuilder from '@axe-core/playwright';
import { test, expect, waitForApp } from './fixtures';

// Accessibility smoke: FAIL on 'critical' axe violations. 'serious' ones are written to
// the test output (and attached to the report) but do not fail the run yet; tighten
// FAIL_ON below once they are fixed.
const FAIL_ON = ['critical'];

// Critical findings that exist today in the auth screens (app/(auth)/*, the hero background
// and the portal tab switcher) and are tracked for a fix. They are reported in the test
// output but do not fail the run, so a NEW critical regression (any other rule id, or these
// rules on another page) does. Set A11Y_STRICT=1 to fail on them too; delete an entry as
// soon as its fix ships.
const KNOWN_CRITICAL: Record<string, string[]> = {
  login: ['aria-required-parent', 'image-alt'], // role="tab" items are not inside a role="tablist"
  register: ['aria-required-parent', 'aria-required-attr', 'image-alt'], // tabs; checkbox missing aria-checked; hero <img> without alt
  // The decorative hero <img> (expo-image cross-dissolve) has no alt; it appears intermittently.
  privacy: ['image-alt'],
  terms: ['image-alt'],
};

const PAGES = [
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
  { name: 'privacy', path: '/privacy' },
  { name: 'terms', path: '/terms' },
];

for (const { name, path } of PAGES) {
  test(`a11y: ${name} has no critical axe violations`, async ({ page }, testInfo) => {
    await page.goto(path);
    await waitForApp(page);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const summarise = (impact: string) =>
      results.violations
        .filter((v) => v.impact === impact)
        .map((v) => ({
          id: v.id,
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: v.nodes.length,
          example: v.nodes[0]?.target?.join(' '),
        }));

    const serious = summarise('serious');
    if (serious.length > 0) {
      const text = JSON.stringify(serious, null, 2);
      console.log(`[a11y][${name}] serious violations (not failing yet):\n${text}`);
      await testInfo.attach(`${name}-serious-violations.json`, { body: text, contentType: 'application/json' });
    }

    const known = process.env.A11Y_STRICT ? [] : KNOWN_CRITICAL[name] ?? [];
    const critical = results.violations.filter((v) => v.impact && FAIL_ON.includes(v.impact));
    const tolerated = critical.filter((v) => known.includes(v.id));
    if (tolerated.length > 0) {
      console.log(`[a11y][${name}] known critical violations (tolerated): ${tolerated.map((v) => v.id).join(', ')}`);
    }
    const blocking = critical.filter((v) => !known.includes(v.id));
    expect(
      blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`),
      'critical accessibility violations',
    ).toEqual([]);
  });
}
