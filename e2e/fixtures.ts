import { test as base, expect, type Page } from '@playwright/test';

// Shared fixtures: hermetic network + collectors for console errors and CSP violations.

export interface PageProblems {
  /** console.error output and uncaught page errors */
  consoleErrors: string[];
  /** securitypolicyviolation events (blocked by our own CSP) */
  cspViolations: string[];
  /** requests to the client error sink (window errors / ErrorBoundary reports) */
  errorReports: string[];
}

// Stand-in for https://challenges.cloudflare.com/turnstile/v0/api.js. It behaves like a
// widget that solves instantly, so forms are testable without the real CAPTCHA.
const TURNSTILE_STUB = `
window.turnstile = {
  render: function (el, params) {
    if (params && typeof params.callback === 'function') {
      setTimeout(function () { params.callback('e2e-turnstile-token'); }, 0);
    }
    return 'e2e-widget';
  },
  reset: function () {},
  remove: function () {},
};
`;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

async function stubNetwork(page: Page, problems: PageProblems) {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: TURNSTILE_STUB }),
  );

  // Any Supabase call (auth refresh, REST, realtime negotiation) is answered locally.
  // NOTE: Playwright matches the most recently registered route first, so the specific
  // error-sink route below must be registered AFTER this generic one.
  await page.route(/https:\/\/[a-z0-9]+\.supabase\.co\/(auth|rest|functions|storage)\/.*/, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = route.request().url();
    const body = url.includes('/rest/v1/') ? '[]' : '{}';
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body });
  });

  // The client error sink: record what the app tried to report, never hit the network.
  await page.route('**/functions/v1/report-client-error', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    problems.errorReports.push(route.request().postData() ?? '');
    await route.fulfill({ status: 204, headers: CORS, body: '' });
  });
}

export const test = base.extend<{ problems: PageProblems }>({
  problems: [async ({ page }, use) => {
    const problems: PageProblems = { consoleErrors: [], cspViolations: [], errorReports: [] };

    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => problems.consoleErrors.push(`pageerror: ${err.message}`));

    await page.addInitScript(() => {
      (window as any).__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        (window as any).__cspViolations.push(`${e.violatedDirective} blocked ${e.blockedURI}`);
      });
    });
    await stubNetwork(page, problems);

    await use(problems);

    const violations = await page
      .evaluate(() => (window as any).__cspViolations as string[])
      .catch(() => [] as string[]);
    problems.cspViolations.push(...violations);
  }, { auto: true }],
});

export { expect };

export async function collectCspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => ((window as any).__cspViolations as string[]) ?? []);
}

/** Waits for the app shell (React tree) to render something inside #root. */
export async function waitForApp(page: Page) {
  await page.waitForFunction(() => {
    const root = document.getElementById('root');
    return !!root && root.innerText.trim().length > 0;
  });
}

export type TestUserRole = 'student' | 'alumni' | 'staff' | 'admin';

/**
 * Seeds the same small, encrypted-at-rest session projection that the app
 * restores before asking Supabase to refresh the live session. Network calls
 * remain stubbed, so authenticated portal smoke tests never touch production.
 */
export async function seedAuthenticatedSession(
  page: Page,
  role: TestUserRole,
  options: { currentConsent?: boolean; tutorialComplete?: boolean } = {},
) {
  const { currentConsent = true, tutorialComplete = true } = options;
  // A dashboard test should inspect the dashboard, not the separate legal
  // re-consent flow. A dedicated accessibility test covers that dialog.
  await page.route('**/rest/v1/rpc/latest_consent', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(currentConsent ? '2026-09-24' : null),
    }),
  );

  await page.addInitScript(({ seedRole, hasCompletedTutorial }) => {
    const user = {
      id: `e2e-${seedRole}-user`,
      fullName: `E2E ${seedRole[0].toUpperCase()}${seedRole.slice(1)}`,
      email: `${seedRole}.e2e@example.com`,
      role: seedRole,
      actualRole: seedRole,
      onboardingComplete: true,
      mfaVerified: true,
    };

    localStorage.setItem('lioris.accessToken', `e2e-${seedRole}-access-token`);
    localStorage.setItem('lioris.refreshToken', `e2e-${seedRole}-refresh-token`);
    localStorage.setItem('lioris.sessionUser', JSON.stringify(user));
    if (hasCompletedTutorial) {
      localStorage.setItem(`lioris_nav_walkthrough_${user.id}`, 'true');
    }
  }, { seedRole: role, hasCompletedTutorial: tutorialComplete });
}
