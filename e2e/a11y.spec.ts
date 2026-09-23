import AxeBuilder from '@axe-core/playwright';
import { test, expect, waitForApp } from './fixtures';

// Block release-level accessibility failures. Minor/moderate suggestions remain visible
// in the axe report, while serious and critical WCAG violations fail CI immediately.
const FAIL_ON = ['serious', 'critical'];

const PAGES = [
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
  { name: 'privacy', path: '/privacy' },
  { name: 'terms', path: '/terms' },
];

for (const { name, path } of PAGES) {
  test(`a11y: ${name} has no serious or critical axe violations`, async ({ page }, testInfo) => {
    await page.goto(path);
    await waitForApp(page);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter((v) => v.impact && FAIL_ON.includes(v.impact));
    if (blocking.length > 0) {
      const text = JSON.stringify(blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes })), null, 2);
      await testInfo.attach(`${name}-blocking-a11y-violations.json`, { body: text, contentType: 'application/json' });
    }
    expect(
      blocking.map((v) => `${v.impact}/${v.id}: ${v.help} (${v.nodes.length} nodes)`),
      'serious or critical accessibility violations',
    ).toEqual([]);
  });
}
