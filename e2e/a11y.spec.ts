import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect, seedAuthenticatedSession, waitForApp, type TestUserRole } from './fixtures';

// Block release-level accessibility failures. Minor/moderate suggestions remain visible
// in the axe report, while serious and critical WCAG violations fail CI immediately.
const FAIL_ON = ['serious', 'critical'];

const PAGES = [
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
  { name: 'privacy', path: '/privacy' },
  { name: 'terms', path: '/terms' },
];

async function expectNoBlockingViolations(
  page: Page,
  testInfo: TestInfo,
  name: string,
  scope?: string,
) {
    await page.waitForLoadState('networkidle');

    let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    if (scope) builder = builder.include(scope);
    const results = await builder.analyze();

    const blocking = results.violations.filter((v) => v.impact && FAIL_ON.includes(v.impact));
    if (blocking.length > 0) {
      const text = JSON.stringify(blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes })), null, 2);
      await testInfo.attach(`${name}-blocking-a11y-violations.json`, { body: text, contentType: 'application/json' });
    }
    expect(
      blocking.map((v) =>
        `${v.impact}/${v.id}: ${v.help} (${v.nodes.length} nodes) ` +
        v.nodes.map((node) => `${node.target.join(' > ')} => ${node.html}`).join(', '),
      ),
      'serious or critical accessibility violations',
    ).toEqual([]);
}

for (const { name, path } of PAGES) {
  test(`a11y: ${name} has no serious or critical axe violations`, async ({ page }, testInfo) => {
    await page.goto(path);
    await waitForApp(page);
    await expectNoBlockingViolations(page, testInfo, name);
  });
}

const ROLE_DASHBOARDS: ReadonlyArray<{ role: TestUserRole; path: string; marker: RegExp }> = [
  { role: 'student', path: '/(student)/dashboard', marker: /Quick Services/i },
  { role: 'alumni', path: '/(alumni)/dashboard', marker: /Alumni Action Hub/i },
  { role: 'staff', path: '/(staff)/dashboard', marker: /Faculty Staff/i },
  { role: 'admin', path: '/(admin)/dashboard', marker: /Needs attention/i },
];

for (const { role, path, marker } of ROLE_DASHBOARDS) {
  test(`a11y: ${role} dashboard has no serious or critical axe violations`, async ({ page }, testInfo) => {
    await seedAuthenticatedSession(page, role);
    await page.goto(path);
    await waitForApp(page);
    await expect(page.getByText(marker).first()).toBeVisible();
    await expectNoBlockingViolations(page, testInfo, `${role}-dashboard`);
  });
}

test('a11y: required legal re-consent dialog has no serious or critical violations', async ({ page }, testInfo) => {
  await seedAuthenticatedSession(page, 'student', { currentConsent: false });
  await page.goto('/(student)/dashboard');
  await expect(page.getByText(/We updated our Terms & Privacy Policy/i)).toBeVisible();
  await expectNoBlockingViolations(page, testInfo, 'legal-re-consent', '[role="dialog"]');
});

test('a11y: first-run navigation guide has no serious or critical violations', async ({ page }, testInfo) => {
  await seedAuthenticatedSession(page, 'student', { tutorialComplete: false });
  await page.goto('/(student)/dashboard');
  await expect(page.getByText('Home Dashboard')).toBeVisible();
  await expectNoBlockingViolations(page, testInfo, 'navigation-guide', '[role="dialog"]');
});

// Regression guard for the web accessibility fixes (aria state mirroring, tablists, labelled
// switches, image alt text, nested interactives, colour contrast): one representative screen per
// feature area for every role. react-native-web does not map `accessibilityState` to aria-*, so a
// regression here would reach screen-reader users silently. The tests are independent, so Playwright
// runs them in parallel, and the stubbed network keeps each one to a few seconds.
const EVENT_ID = '00000000-0000-4000-8000-000000000001';
const ROLE_SCREENS: ReadonlyArray<{ role: TestUserRole; paths: readonly string[] }> = [
  {
    role: 'student',
    paths: [
      '/(student)/feed',
      '/(student)/mentorship',
      '/(student)/search',
      '/(student)/forum/explore',
      `/(student)/events/${EVENT_ID}`,
      '/(student)/calendar',
    ],
  },
  { role: 'alumni', paths: ['/(alumni)/jobs', '/(alumni)/notifications', '/(alumni)/forum'] },
  { role: 'staff', paths: ['/(staff)/forum'] },
  {
    role: 'admin',
    paths: [
      '/(admin)/feature-controls',
      '/(admin)/super-admin-config',
      '/(admin)/moderation-queue',
      '/(admin)/audit-logs',
      '/(admin)/platform-config',
      '/(admin)/user-directory',
      '/(admin)/content-desk',
    ],
  },
];

for (const { role, paths } of ROLE_SCREENS) {
  for (const path of paths) {
    test(`a11y: ${role} ${path.replace(EVENT_ID, ':id')} has no serious or critical axe violations`, async ({ page }, testInfo) => {
      await seedAuthenticatedSession(page, role);
      await page.goto(path);
      await waitForApp(page);
      // Fade-in animations (modals, cards) would make axe sample half-transparent text.
      await page
        .waitForFunction(() =>
          document
            .getAnimations()
            .every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
        )
        .catch(() => undefined);
      await expectNoBlockingViolations(page, testInfo, `${role}-${path.replace(/[^a-z0-9]+/gi, '-')}`);
    });
  }
}
