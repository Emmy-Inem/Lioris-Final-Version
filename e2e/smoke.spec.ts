import {
  test,
  expect,
  collectCspViolations,
  seedAuthenticatedSession,
  waitForApp,
  type TestUserRole,
} from './fixtures';

const CRASH_TEXT = 'Something went wrong';

test.describe('landing and auth pages', () => {
  test('login page loads with no console errors and no CSP violations', async ({ page, problems }) => {
    await page.goto('/login');
    await waitForApp(page);
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
    // Let late resources (fonts, images, the Turnstile stub) settle.
    await page.waitForLoadState('networkidle');

    expect(await collectCspViolations(page), 'CSP violations').toEqual([]);
    expect(problems.consoleErrors, 'console errors').toEqual([]);
    await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
  });

  test('landing page (/) loads with no console errors and no CSP violations', async ({ page, problems }) => {
    await page.goto('/');
    await waitForApp(page);
    await page.waitForLoadState('networkidle');

    expect(await collectCspViolations(page), 'CSP violations').toEqual([]);
    expect(problems.consoleErrors, 'console errors').toEqual([]);
    await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
  });

  test('login -> register -> back navigation works and never shows the crash screen', async ({ page }) => {
    await page.goto('/login');
    await waitForApp(page);

    await page.getByText("Don't have an account? Sign Up").click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByRole('button', { name: 'Configure & Join' })).toBeVisible();
    await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
  });

  // Regression: `queryString.stringify` inside expo-router's getPathFromState threw on
  // any URL that carried query params, which crashed the whole app into the ErrorBoundary.
  test('deep link with query params renders (query-string regression)', async ({ page, problems }) => {
    await page.goto('/register?ref=e2e&campus=UI');
    await waitForApp(page);

    await expect(page.getByRole('button', { name: 'Configure & Join' })).toBeVisible();
    await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
    expect(problems.consoleErrors, 'console errors').toEqual([]);
  });

  test('deep link with query params survives in-app navigation', async ({ page }) => {
    await page.goto('/login?redirect=%2Fdashboard&utm_source=e2e');
    await waitForApp(page);
    await page.getByText("Don't have an account? Sign Up").click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
  });
});

test.describe('legal pages', () => {
  for (const [route, heading] of [
    ['/privacy', /privacy/i],
    ['/terms', /terms/i],
    ['/community-rules', /community/i],
    ['/copyright', /copyright/i],
  ] as const) {
    test(`${route} renders`, async ({ page }) => {
      await page.goto(route);
      await waitForApp(page);
      await expect(page.getByText(heading).first()).toBeVisible();
      await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
      // Real content, not an empty shell.
      const text = await page.evaluate(() => document.getElementById('root')?.innerText.length ?? 0);
      expect(text).toBeGreaterThan(300);
    });
  }
});

test.describe('registration guard rails', () => {
  test('submit is blocked until the age-eligibility and terms checkboxes are ticked', async ({ page }) => {
    const signupRequests: string[] = [];
    page.on('request', (req) => {
      if (/\/auth\/v1\/signup/.test(req.url()) || /functions\/v1\/.*(register|signup)/.test(req.url())) {
        signupRequests.push(req.url());
      }
    });

    await page.goto('/register');
    await waitForApp(page);

    await page.getByPlaceholder('Inem Light').fill('E2E Tester');
    await page.getByPlaceholder('you@example.com').fill('e2e.tester@example.com');
    await page.getByPlaceholder('••••••••').first().fill('Str0ng!Passw0rd#1');
    await page.getByPlaceholder('e.g. starboy').fill('e2e.tester');

    const submit = page.getByRole('button', { name: 'Configure & Join' });

    // Neither box ticked: the age gate is checked first.
    await submit.click();
    await expect(page.getByText(/Confirm that you are 18\+/)).toBeVisible();

    // Age ticked, terms not: the terms message appears.
    await page.getByRole('checkbox', { name: /I am 18 or older/ }).click();
    await submit.click();
    await expect(page.getByText(/Please accept the Terms of Service/)).toBeVisible();

    expect(signupRequests, 'no signup request may be sent').toEqual([]);
  });
});

test.describe('route protection', () => {
  for (const route of ['/(student)/dashboard', '/dashboard', '/(admin)/dashboard', '/(admin)/platform-config']) {
    test(`unauthenticated visit to ${route} does not expose the app`, async ({ page }) => {
      await page.goto(route);
      await waitForApp(page);
      await expect(page).toHaveURL(/\/(login|$)|\/$/, { timeout: 20_000 });
      // Nothing role-specific may render for an anonymous visitor.
      await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
      const url = new URL(page.url());
      expect(url.pathname).not.toMatch(/dashboard|platform-config/);
    });
  }
});

test.describe('authenticated role portals', () => {
  const portals: ReadonlyArray<{ role: TestUserRole; route: string; marker: RegExp }> = [
    { role: 'student', route: '/(student)/dashboard', marker: /Student Services/i },
    { role: 'alumni', route: '/(alumni)/dashboard', marker: /Alumni Action Hub/i },
    { role: 'staff', route: '/(staff)/dashboard', marker: /Faculty Staff/i },
    { role: 'admin', route: '/(admin)/dashboard', marker: /Needs attention/i },
  ];

  for (const portal of portals) {
    test(`${portal.role} dashboard restores a session and renders`, async ({ page, problems }) => {
      await seedAuthenticatedSession(page, portal.role);
      await page.goto(portal.route);
      await waitForApp(page);

      await expect(page.getByText(portal.marker).first()).toBeVisible();
      await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
      expect(problems.consoleErrors, 'console errors').toEqual([]);
    });
  }

  test('a student cannot open the admin portal by URL', async ({ page }) => {
    await seedAuthenticatedSession(page, 'student');
    await page.goto('/(admin)/dashboard');
    await waitForApp(page);

    await expect(page).toHaveURL(/dashboard/, { timeout: 20_000 });
    await expect(page.getByText(/Student Services/i)).toBeVisible();
    await expect(page.getByText(/Needs attention/i)).toHaveCount(0);
  });

  test('an admin can inspect a student portal without losing admin identity', async ({ page }) => {
    await seedAuthenticatedSession(page, 'admin');
    await page.goto('/(student)/dashboard');
    await waitForApp(page);

    await expect(page.getByText(/Student Services/i)).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lioris.sessionUser') || '{}'));
    expect(stored.actualRole).toBe('admin');
  });
});

test.describe('security headers', () => {
  test('document responses carry the hardening headers', async ({ page }) => {
    const response = await page.goto('/login');
    expect(response, 'navigation response').not.toBeNull();
    const headers = response!.headers();

    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('payment=()');
    expect(headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');

    const csp = headers['content-security-policy'];
    expect(csp, 'CSP header').toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  });
});

test.describe('client error reporting', () => {
  test('an uncaught error is reported to the sink with PII scrubbed', async ({ page, problems }) => {
    await page.goto('/login');
    await waitForApp(page);

    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('e2e boom for jane.doe@example.com Bearer abcdefghijklmnop');
      }, 0);
    });

    await expect.poll(() => problems.errorReports.length, { timeout: 10_000 }).toBeGreaterThan(0);
    const body = JSON.parse(problems.errorReports[0]);
    expect(body.message).toContain('e2e boom');
    expect(body.message).not.toContain('jane.doe@example.com');
    expect(body.message).not.toContain('abcdefghijklmnop');
    expect(body.url).toBe('/login');
    expect(body.fingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(body.session_id).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/\?[a-z]+=/);
  });
});
