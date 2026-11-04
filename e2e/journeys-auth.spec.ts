import { test, expect, waitForApp } from './fixtures';
import type { Page } from '@playwright/test';

// End-to-end journeys for the signed-out screens: register, login, reset password. The Supabase auth endpoints are
// answered locally (fixtures.ts stubs everything else); the CAPTCHA widget is the instant-solving stub.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

async function stubAuth(
  page: Page,
  handlers: { token?: { status: number; body: unknown }; signup?: { status: number; body: unknown }; recover?: { status: number; body: unknown }; usernameAvailable?: boolean },
) {
  const seen = { token: 0, signup: 0, recover: 0 };
  if (handlers.usernameAvailable !== undefined) {
    await page.route(/\/rest\/v1\/rpc\/check_username_available/, (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(handlers.usernameAvailable) });
    });
  }
  const serve = (kind: 'token' | 'signup' | 'recover', spec?: { status: number; body: unknown }) =>
    page.route(new RegExp(`/auth/v1/${kind}`), async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      seen[kind] += 1;
      // A small delay keeps the in-flight state observable (double-click guard).
      await new Promise((r) => setTimeout(r, 150));
      const s = spec ?? { status: 200, body: {} };
      return route.fulfill({ status: s.status, contentType: 'application/json', headers: CORS, body: JSON.stringify(s.body) });
    });
  await serve('token', handlers.token);
  await serve('signup', handlers.signup);
  await serve('recover', handlers.recover);
  return seen;
}

test.describe('login journey', () => {
  async function fill(page: Page, email: string, password: string) {
    await page.goto('/login');
    await waitForApp(page);
    await page.getByPlaceholder('Email or Username (@handle)').fill(email);
    await page.getByPlaceholder('Password').fill(password);
  }

  test('a wrong password shows the incorrect-password message, keeps what was typed and can be retried', async ({ page }) => {
    const seen = await stubAuth(page, {
      token: { status: 400, body: { code: 'invalid_credentials', error_code: 'invalid_credentials', error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' } },
    });
    await fill(page, 'student@example.com', 'wrong-password-1');
    const submit = page.getByRole('button', { name: 'Secure Login' });
    await submit.click();
    await expect(page.getByText('Incorrect Password').first()).toBeVisible();
    await expect(page.getByPlaceholder('Email or Username (@handle)')).toHaveValue('student@example.com');
    await expect(page.getByPlaceholder('Password')).toHaveValue('wrong-password-1');
    await expect(submit).toBeEnabled();
    expect(seen.token).toBe(1);
    // Editing a field clears the stale error.
    await page.getByPlaceholder('Password').fill('another-try-2');
    await expect(page.getByText('Incorrect Password')).toHaveCount(0);
  });

  test('an over-limit answer (HTTP 429) is reported as rate limiting, not as a wrong password', async ({ page }) => {
    await stubAuth(page, { token: { status: 429, body: { code: 'over_request_rate_limit', error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' } } });
    await fill(page, 'student@example.com', 'whatever-123');
    await page.getByRole('button', { name: 'Secure Login' }).click();
    await expect(page.getByText(/Too many sign-in attempts/)).toBeVisible();
    await expect(page.getByText('Incorrect Password')).toHaveCount(0);
  });

  test('an unverified e-mail is sent to the confirmation-code screen', async ({ page }) => {
    await stubAuth(page, { token: { status: 400, body: { code: 'email_not_confirmed', error_code: 'email_not_confirmed', msg: 'Email not confirmed' } } });
    await fill(page, 'new.student@example.com', 'whatever-123');
    await page.getByRole('button', { name: 'Secure Login' }).click();
    await expect(page).toHaveURL(/verify-email/);
  });

  test('a password shorter than 6 characters is refused locally, without a request', async ({ page }) => {
    const seen = await stubAuth(page, {});
    await fill(page, 'student@example.com', '12345');
    await page.getByRole('button', { name: 'Secure Login' }).click();
    await expect(page.getByText('Password must be at least 6 characters.')).toBeVisible();
    expect(seen.token).toBe(0);
  });

  test('double-clicking Secure Login sends exactly one sign-in request', async ({ page }) => {
    const seen = await stubAuth(page, { token: { status: 400, body: { code: 'invalid_credentials', msg: 'Invalid login credentials' } } });
    await fill(page, 'student@example.com', 'wrong-password-1');
    await page.getByRole('button', { name: 'Secure Login' }).dblclick();
    await expect(page.getByText('Incorrect Password').first()).toBeVisible();
    expect(seen.token).toBe(1);
  });

  test('Enter in the password field submits the form', async ({ page }) => {
    const seen = await stubAuth(page, { token: { status: 400, body: { code: 'invalid_credentials', msg: 'Invalid login credentials' } } });
    await fill(page, 'student@example.com', 'wrong-password-1');
    await page.getByPlaceholder('Password').press('Enter');
    await expect(page.getByText('Incorrect Password').first()).toBeVisible();
    expect(seen.token).toBe(1);
  });
});

test.describe('register journey', () => {
  async function fillValid(page: Page, overrides: Partial<{ name: string; email: string; password: string; username: string }> = {}) {
    await page.getByPlaceholder('Inem Light').fill(overrides.name ?? 'E2E Tester');
    await page.getByPlaceholder('you@example.com').fill(overrides.email ?? 'e2e.tester@example.com');
    await page.getByPlaceholder('••••••••').first().fill(overrides.password ?? 'Str0ng!Passw0rd#1');
    await page.getByPlaceholder('e.g. starboy').fill(overrides.username ?? 'e2e.tester');
  }
  async function fillAdultDob(page: Page) {
    const year = new Date().getFullYear();
    await page.getByLabel('Day of birth').fill('15');
    await page.getByLabel('Month of birth').fill('06');
    await page.getByLabel('Year of birth').fill(String(year - 25));
  }

  test('field validation: name, e-mail, password rules and username format each produce a message and no signup call', async ({ page }) => {
    const seen = await stubAuth(page, { usernameAvailable: true });
    await page.goto('/register');
    await waitForApp(page);
    const submit = page.getByRole('button', { name: 'Configure & Join' });

    await submit.click();
    await expect(page.getByText('Please enter your full display name.')).toBeVisible();

    await page.getByPlaceholder('Inem Light').fill('E2E Tester');
    await page.getByPlaceholder('you@example.com').fill('not-an-email');
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await submit.click();
    await expect(page.getByText('Please enter a valid email address.')).toBeVisible();

    await page.getByPlaceholder('you@example.com').fill('e2e.tester@example.com');
    await page.getByPlaceholder('••••••••').first().fill('short');
    await expect(page.getByText(/Weak strength|Fair strength|Very weak strength/i).first()).toBeVisible();
    await submit.click();
    await expect(page.getByText(/Password must meet all security criteria/)).toBeVisible();

    await page.getByPlaceholder('••••••••').first().fill('Str0ng!Passw0rd#1');
    await page.getByPlaceholder('e.g. starboy').fill('a!');
    await expect(page.getByText('3-24 characters: letters, numbers, dots, underscores')).toBeVisible();
    await submit.click();
    await expect(page.getByText(/Username must be 3-24 characters/)).toBeVisible();
    expect(seen.signup).toBe(0);
  });

  test('username availability: free shows a confirmation, taken shows an error and blocks submit', async ({ page }) => {
    await stubAuth(page, { usernameAvailable: true });
    await page.goto('/register');
    await waitForApp(page);
    await page.getByPlaceholder('e.g. starboy').fill('free.handle');
    await expect(page.getByText('@free.handle is available')).toBeVisible();

    // Same page, now the handle is taken.
    await page.unroute(/\/rest\/v1\/rpc\/check_username_available/);
    await page.route(/\/rest\/v1\/rpc\/check_username_available/, (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: CORS })
        : route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: 'false' }),
    );
    await page.getByPlaceholder('e.g. starboy').fill('taken.handle');
    await expect(page.getByText('@taken.handle is already taken. Please choose another.').first()).toBeVisible();
    await expect(page.getByText('@taken.handle is available')).toHaveCount(0);
  });

  test('a date of birth under 13 is refused and no account is created', async ({ page }) => {
    const seen = await stubAuth(page, { usernameAvailable: true });
    await page.goto('/register');
    await waitForApp(page);
    await fillValid(page);
    const year = new Date().getFullYear();
    await page.getByLabel('Day of birth').fill('15');
    await page.getByLabel('Month of birth').fill('06');
    await page.getByLabel('Year of birth').fill(String(year - 10));
    await page.getByRole('button', { name: 'Configure & Join' }).click();
    await expect(page.getByText(/to create a Lioris account/)).toBeVisible();
    expect(seen.signup).toBe(0);
  });

  test('a valid registration sends one signup request, passes the CAPTCHA token and lands on e-mail confirmation', async ({ page }) => {
    const signupBodies: any[] = [];
    const seen = await stubAuth(page, {
      usernameAvailable: true,
      // GoTrue answers a sign-up with a user and NO session when e-mail confirmation is on.
      signup: { status: 200, body: { id: 'new-user-1', email: 'e2e.tester@example.com', identities: [{ id: 'i1' }], user_metadata: {} } },
    });
    page.on('request', (req) => {
      if (/\/auth\/v1\/signup/.test(req.url()) && req.method() === 'POST') signupBodies.push(req.postDataJSON());
    });
    await page.goto('/register');
    await waitForApp(page);
    await fillValid(page, { email: 'e2e.tester@ui.edu.ng' });
    await fillAdultDob(page);
    await page.getByRole('checkbox', { name: /date of birth I entered is mine/ }).click();
    const terms = page.getByRole('checkbox', { name: /Terms of Service/ });
    await terms.click();
    const submit = page.getByRole('button', { name: 'Configure & Join' });
    await submit.dblclick();
    await expect(page).toHaveURL(/verify-email/, { timeout: 20_000 });
    expect(seen.signup).toBe(1);
    expect(signupBodies[0]?.gotrue_meta_security?.captcha_token ?? signupBodies[0]?.captcha_token).toBeTruthy();
    expect(signupBodies[0]?.data?.date_of_birth).toMatch(/^\d{4}-06-15$/);
  });
});

test.describe('reset password journey', () => {
  test('Send Reset Email stays disabled until an address is typed, then sends one request and moves to the code step', async ({ page }) => {
    const seen = await stubAuth(page, { recover: { status: 200, body: {} } });
    await page.goto('/reset-password');
    await waitForApp(page);
    const send = page.getByRole('button', { name: 'Send Reset Email' });
    await expect(send).toBeDisabled();
    await page.getByPlaceholder('name@university.edu.ng').fill('student@example.com');
    await expect(send).toBeEnabled();
    await send.dblclick();
    await expect(page.getByText('6-Digit Recovery Code').first()).toBeVisible();
    expect(seen.recover).toBe(1);
    // The code step only accepts digits and enables Verify Code at exactly six.
    const code = page.getByPlaceholder('123456');
    await code.fill('12ab34');
    await expect(code).toHaveValue('1234');
    await expect(page.getByRole('button', { name: 'Verify Code' })).toBeDisabled();
    await code.fill('123456');
    await expect(page.getByRole('button', { name: 'Verify Code' })).toBeEnabled();
  });
});
