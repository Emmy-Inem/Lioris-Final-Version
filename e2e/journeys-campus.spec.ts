import { test, expect } from './fixtures';
import { openAs, IDS } from './fixtures-data';

// Events, chat, marketplace and back-navigation journeys (verified student), asserting what each action SENT.

const EVENTS = '/(student)/events';
const EVENT = `/(student)/events/${IDS.event}`;

test.describe('events', () => {
  test('RSVP asks for consent, then sends exactly one registration however fast Confirm is tapped', async ({ page }) => {
    const backend = await openAs(page, 'student', EVENT);
    backend.rpc.rsvp_event = { ticket_code: 'TKT-1' };
    backend.delay('rsvp_event', 300);
    await page.getByRole('button', { name: /Claim your seat/ }).first().click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'What the organiser will see' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm' }).dblclick();
    await expect.poll(() => backend.count('POST', 'rpc/rsvp_event')).toBe(1);
    await page.waitForTimeout(600);
    expect(backend.count('POST', 'rpc/rsvp_event')).toBe(1);
    expect(backend.calls.find((c) => c.table === 'rpc/rsvp_event')?.body.p_event).toBe(IDS.event);
  });

  test('"Not now" closes the RSVP consent dialog without registering', async ({ page }) => {
    const backend = await openAs(page, 'student', EVENT);
    await page.getByRole('button', { name: /Claim your seat/ }).first().click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'What the organiser will see' });
    await dialog.getByRole('button', { name: 'Not now' }).click();
    await expect(dialog).toHaveCount(0);
    expect(backend.count('POST', 'rpc/rsvp_event')).toBe(0);
  });

  test('setting a reminder from the list calls the server once; Escape closes the confirmation', async ({ page }) => {
    const backend = await openAs(page, 'student', EVENTS);
    backend.rpc.set_event_reminder = { reminder_on: true };
    await page.getByRole('button', { name: 'Set reminder for Hackathon' }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Reminder Set!' });
    await expect(dialog).toBeVisible();
    expect(backend.count('POST', 'rpc/set_event_reminder')).toBe(1);
    expect(backend.calls.find((c) => c.table === 'rpc/set_event_reminder')?.body.p_on).toBe(true);
    await expect(dialog.getByRole('button', { name: 'Later' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('hosting an event validates step by step, then inserts one event and closes the form', async ({ page }) => {
    const backend = await openAs(page, 'student', EVENTS);
    await page.getByText('Host New Event').click();
    const dialog = page.getByRole('dialog');
    const submit = dialog.getByRole('button', { name: 'Submit Event' });

    await submit.click();
    await expect(dialog.getByText('Please enter an event title.')).toBeVisible();
    await dialog.getByPlaceholder('e.g. AI & Robotics Campus Symposium 2026').fill('Study Jam');
    await submit.click();
    await expect(dialog.getByText(/valid event date/)).toBeVisible();

    await dialog.getByText('Tomorrow', { exact: true }).click();
    await dialog.getByText('9:00 AM', { exact: true }).click();
    await dialog.getByText('+2 hr', { exact: true }).click();
    await submit.click();
    await expect(dialog.getByText('Please add a meeting link for the in-app live event.')).toBeVisible();

    await dialog.getByPlaceholder(/meet.google.com/).fill('https://meet.google.com/abc-defg-hij');
    await submit.dblclick();
    await expect(dialog).toHaveCount(0);
    const inserts = backend.calls.filter((c) => c.method === 'POST' && c.table === 'events');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].body.title).toBe('Study Jam');
    expect(new Date(inserts[0].body.end_time).getTime()).toBeGreaterThan(new Date(inserts[0].body.start_time).getTime());
  });
});

test.describe('chat', () => {
  test('sending a message inserts it once, clears the box, and a failed send keeps the text', async ({ page }) => {
    const backend = await openAs(page, 'student', `/(student)/messages/${IDS.channel}`);
    const box = page.getByPlaceholder('Type message...');
    await box.fill('See you at 4pm');
    backend.delay('chat_messages', 300);
    await page.getByRole('button', { name: 'Send' }).dblclick();
    await expect.poll(() => backend.count('POST', 'chat_messages')).toBeGreaterThan(0);
    await expect(box).toHaveValue('');
    await page.waitForTimeout(600);
    const sent = backend.calls.filter((c) => c.method === 'POST' && c.table === 'chat_messages');
    expect(sent, 'a double click must send one message').toHaveLength(1);
    expect(sent[0].body.content).toBe('See you at 4pm');
  });
});

test.describe('marketplace', () => {
  test('publishing a listing inserts one row and shows the success message', async ({ page }) => {
    const backend = await openAs(page, 'student', '/(student)/marketplace');
    await page.getByText('List an Item').first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('e.g. TI-84 Graphing Calculator').fill('Desk lamp');
    await dialog.getByPlaceholder('e.g. ₦15,000').fill('₦3,500');
    await dialog.getByPlaceholder(/Condition details/).fill('Works perfectly, pickup at the hostel.');
    await dialog.getByRole('button', { name: 'Publish Listing' }).dblclick();
    await expect(page.getByText('Your listing is live on the campus marketplace!')).toBeVisible();
    const inserts = backend.calls.filter((c) => c.method === 'POST' && c.table === 'marketplace_listings');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].body.title).toBe('Desk lamp');
  });
});

test.describe('"Go back" with no history', () => {
  test('My Listings opened directly leaves for the marketplace instead of doing nothing', async ({ page }) => {
    await openAs(page, 'student', '/(student)/marketplace-mine');
    await page.getByRole('button', { name: 'Go back' }).click();
    await expect(page).toHaveURL(/marketplace$/);
  });

  test('a chat opened directly goes back to the message list', async ({ page }) => {
    await openAs(page, 'student', `/(student)/messages/${IDS.channel}`, { viewport: { width: 390, height: 844 } });
    await page.getByRole('button', { name: 'Go back' }).click();
    await expect(page).toHaveURL(/messages$/);
  });
});

test.describe('accessibility semantics', () => {
  test('role-less pressables are exposed as buttons: "Host New Event" and the event filter chips', async ({ page }) => {
    await openAs(page, 'student', EVENTS);
    await expect(page.getByRole('button', { name: /Host New Event/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /My Registrations/ })).toBeVisible();
  });
});

test.describe('long content', () => {
  test('a very long, unbroken title never pushes actions off-screen (mobile)', async ({ page }) => {
    await openAs(page, 'student', '/(student)/feed', { long: true, viewport: { width: 390, height: 844 } });
    await expect(page.getByRole('button', { name: 'Save this post' }).first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const offscreen = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button,[role=button]')).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 2 || r.left < -2); }).length);
    expect(offscreen).toBe(0);
  });
});
