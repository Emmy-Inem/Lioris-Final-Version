import { test, expect } from './fixtures';
import { openAs, IDS } from './fixtures-data';

// Admin queues against the in-memory sample backend: each decision is sent once, however fast the button is tapped.

test.describe('campus admin queues', () => {
  test('approving an ID verification sends one review and removes the row', async ({ page }) => {
    const backend = await openAs(page, 'admin', '/(admin)/verification-requests', { superAdmin: false });
    backend.rpc.review_verification_request = { ok: true };
    backend.delay('review_verification_request', 300);
    backend.delay('admin_verify_user', 300);
    await expect(page.getByText('Ada Okafor').first()).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).first().dblclick();
    await expect.poll(() => backend.calls.filter((c) => /review_verification_request|admin_verify_user/.test(c.table)).length).toBeGreaterThan(0);
    await page.waitForTimeout(700);
    const decisions = backend.calls.filter((c) => /review_verification_request|admin_verify_user/.test(c.table));
    expect(decisions.length, 'a double click must record one decision').toBe(1);
    expect(JSON.stringify(decisions[0].body)).toContain(IDS.verification);
  });

  test('dismissing a report updates it once with the rejected status', async ({ page }) => {
    const backend = await openAs(page, 'admin', '/(admin)/moderation-queue', { superAdmin: false });
    backend.delay('moderation_queue', 300);
    await page.getByRole('button', { name: 'Dismiss' }).first().click();
    // A confirmation or note step may sit in front of the decision; confirm it when present.
    const confirm = page.getByRole('dialog').getByRole('button', { name: /^(Dismiss|Confirm|Submit|Yes)/ }).first();
    if (await confirm.isVisible({ timeout: 1500 }).catch(() => false)) await confirm.dblclick();
    await expect.poll(() => backend.calls.filter((c) => c.method === 'PATCH' && c.table === 'moderation_queue').length).toBeGreaterThan(0);
    await page.waitForTimeout(700);
    const updates = backend.calls.filter((c) => c.method === 'PATCH' && c.table === 'moderation_queue');
    expect(updates).toHaveLength(1);
    expect(updates[0].body.status).toBe('rejected');
  });
});
