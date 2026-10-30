import { test, expect, seedAuthenticatedSession, failDataCalls, waitForApp } from './fixtures';

// The messages list sits behind the verification gate ("Verified UI Students Only"), which follows the member's
// own profile row. Fixture users are unverified unless `verified: true` is passed, so these tests cover the
// screen the gate normally hides.

test.describe('messages list (verified student)', () => {
  test('an empty backend shows the empty state, not the verification gate or an error', async ({ page }) => {
    await seedAuthenticatedSession(page, 'student', { verified: true });
    await page.goto('/(student)/messages');
    await waitForApp(page);

    await expect(page.getByText(/No Conversations/i).first()).toBeVisible();
    await expect(page.getByText(/Students Only/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try Again' })).toHaveCount(0);
  });

  test('an unverified student still gets the verification gate', async ({ page }) => {
    await seedAuthenticatedSession(page, 'student');
    await page.goto('/(student)/messages');
    await waitForApp(page);

    await expect(page.getByText(/Verified UI Students Only/i).first()).toBeVisible();
    await expect(page.getByText(/No Conversations/i)).toHaveCount(0);
  });

  test('when every data call fails (HTTP 500) it shows an error with Retry, never "No conversations"', async ({ page }) => {
    await seedAuthenticatedSession(page, 'student', { verified: true });
    await failDataCalls(page);
    await page.goto('/(student)/messages');
    await waitForApp(page);

    const retry = page.getByRole('button', { name: 'Try Again' });
    await expect(retry).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Couldn.t load conversations/i).first()).toBeVisible();
    await expect(page.getByText(/No Conversations/i)).toHaveCount(0);

    // Retry re-requests the list: it fails again here, and the error stays instead of an empty list.
    await retry.click();
    await expect(page.getByText(/Couldn.t load conversations/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/No Conversations/i)).toHaveCount(0);
  });
});
