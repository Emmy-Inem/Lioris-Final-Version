import AxeBuilder from '@axe-core/playwright';
import { test, expect, seedAuthenticatedSession, stubAdultMemberStatus, waitForApp } from './fixtures';

// The verified badge in a post header must keep explaining itself when tapped (it used to be made inert to avoid a
// button nested in a button, so a tap opened the author's profile instead). It is now a sibling of the author
// buttons: both work, and axe finds no nested interactive controls.

const AUTHOR = 'Ada Verified';

async function seedFeedWithVerifiedAuthor(page: import('@playwright/test').Page) {
  await seedAuthenticatedSession(page, 'student', { verified: true });
  await page.route(/\/rest\/v1\/posts\?/, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const row = {
      id: '00000000-0000-4000-8000-0000000000a1',
      author_id: 'e2e-author-1',
      title: 'Welcome thread',
      content: 'Hello from a verified member.',
      category: 'General',
      campus_code: 'UI',
      visibility_scope: 'campus',
      audience_scope: 'global',
      status: 'published',
      created_at: new Date().toISOString(),
      likes_count: 0,
      comments_count: 0,
      reposts_count: 0,
      is_pinned: false,
      post_likes: [],
      profiles: { full_name: AUTHOR, role: 'student', verification_status: 'verified', avatar_url: null },
    };
    const wantsObject = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(wantsObject ? row : [row]),
    });
  });
}

test.describe('verified badge in a post header', () => {
  test('is its own button next to the author button, with zero nested-interactive findings', async ({ page }) => {
    await seedFeedWithVerifiedAuthor(page);
    await page.goto('/(student)/feed');
    await waitForApp(page);

    await expect(page.getByRole('button', { name: `View ${AUTHOR}'s profile` }).first()).toBeVisible();
    const badge = page.getByRole('button', { name: 'What does verified mean?' }).first();
    await expect(badge).toBeVisible();

    const results = await new AxeBuilder({ page }).withRules(['nested-interactive']).analyze();
    expect(
      results.violations.map((v) => v.nodes.map((n) => n.html)),
      'nested interactive controls',
    ).toEqual([]);
  });

  test('tapping the badge opens the explanation, not the profile; the name still opens the profile', async ({ page }) => {
    await seedFeedWithVerifiedAuthor(page);
    await page.goto('/(student)/feed');
    await waitForApp(page);

    await page.getByRole('button', { name: 'What does verified mean?' }).first().click();
    await expect(page.getByText('Verified Account', { exact: true })).toBeVisible();
    await expect(page.getByText('Verified Institutional Standing')).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByText('Verified Account', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: `View ${AUTHOR}'s profile` }).first().click();
    await expect(page.getByText('Verified Account', { exact: true })).toHaveCount(0);
    // The profile sheet is open: the author's name now appears more than once (card + sheet).
    await expect.poll(() => page.getByText(AUTHOR).count()).toBeGreaterThan(1);
  });
});

test.describe('verified badge in a user-directory row', () => {
  test('explains itself on tap and never nests a button inside the row button', async ({ page }) => {
    await seedAuthenticatedSession(page, 'admin');
    await stubAdultMemberStatus(page);
    await page.route('**/rest/v1/rpc/admin_get_user_profiles', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify([
          {
            id: 'e2e-member-1',
            full_name: 'Grace Directory',
            username: 'grace',
            email: 'grace@example.com',
            role: 'student',
            campus_code: 'UI',
            department: 'Physics',
            student_id_number: '12345',
            is_suspended: false,
            verification_status: 'verified',
            created_at: '2025-01-01T00:00:00Z',
          },
        ]),
      }),
    );
    await page.goto('/(admin)/user-directory');
    await waitForApp(page);

    const badge = page.getByRole('button', { name: 'What does verified mean?' }).first();
    await expect(badge).toBeVisible();

    const results = await new AxeBuilder({ page }).withRules(['nested-interactive']).analyze();
    expect(results.violations.map((v) => v.nodes.map((n) => n.html)), 'nested interactive controls').toEqual([]);

    await badge.click();
    await expect(page.getByText('Verified Account', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByText('Verified Account', { exact: true })).toHaveCount(0);
  });
});
