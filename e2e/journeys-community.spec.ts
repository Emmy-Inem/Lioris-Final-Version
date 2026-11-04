import { test, expect } from './fixtures';
import { openAs, IDS } from './fixtures-data';

// Journeys through the forum as a verified student, against the in-memory sample backend (fixtures-data.ts). Each
// test asserts what the click actually SENT, not just what the screen shows.

const FEED = '/(student)/feed';
const POST = `/(student)/post/${IDS.post}`;

test.describe('forum: create a thread', () => {
  test('an empty thread is refused with a message; text, then a valid post sends exactly one insert and closes the form', async ({ page }) => {
    const backend = await openAs(page, 'student', FEED);
    await page.getByText('+ Post Thread').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Post now' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Post now' }).click();
    await expect(dialog.getByText('Please write something before posting.')).toBeVisible();
    expect(backend.count('POST', 'posts')).toBe(0);

    await dialog.getByPlaceholder('Give your post a catchy title...').fill('Study group for MTH 201');
    await dialog.getByPlaceholder('Ask a question, share an idea, or start a discussion...').fill('Who wants to meet on Thursday?');
    await dialog.getByRole('button', { name: 'Post now' }).dblclick();
    await expect(dialog).toHaveCount(0);

    const inserts = backend.calls.filter((c) => c.method === 'POST' && c.table === 'posts');
    expect(inserts, 'double-clicking Post now must publish once').toHaveLength(1);
    expect(inserts[0].body.title).toBe('Study group for MTH 201');
    expect(inserts[0].body.content).toBe('Who wants to meet on Thursday?');
    expect(inserts[0].body.status ?? 'published').toBe('published');
  });

  test('a poll thread sends the question and its options', async ({ page }) => {
    const backend = await openAs(page, 'student', FEED);
    await page.getByText('+ Post Thread').first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Ask a question, share an idea, or start a discussion...').fill('Pick one');
    await dialog.getByRole('button', { name: 'Attach a poll' }).click();
    await dialog.getByPlaceholder('e.g. Which programming language for CSC301?').fill('Best language?');
    await dialog.getByPlaceholder('Option 1').fill('TypeScript');
    await dialog.getByPlaceholder('Option 2').fill('Python');
    await dialog.getByRole('button', { name: 'Post now' }).click();
    await expect(dialog).toHaveCount(0);
    const insert = backend.calls.find((c) => c.method === 'POST' && c.table === 'posts');
    expect(insert?.body.poll_data?.question).toBe('Best language?');
    expect(insert?.body.poll_data?.options?.map((o: any) => o.label)).toEqual(['TypeScript', 'Python']);
  });

  test('scheduling asks for a time first, then sends a scheduled (not published) thread', async ({ page }) => {
    const backend = await openAs(page, 'student', FEED);
    await page.getByText('+ Post Thread').first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Ask a question, share an idea, or start a discussion...').fill('See you all tomorrow');
    await dialog.getByRole('button', { name: 'Schedule...' }).click();
    await expect(dialog.getByText('Pick when this should go live, then tap Schedule again.')).toBeVisible();
    expect(backend.count('POST', 'posts')).toBe(0);
    await dialog.getByRole('button', { name: 'Schedule', exact: true }).click();
    await expect(page.getByText('Post scheduled')).toBeVisible();
    const insert = backend.calls.find((c) => c.method === 'POST' && c.table === 'posts');
    expect(insert?.body.status).toBe('scheduled');
    expect(new Date(insert?.body.scheduled_at).getTime()).toBeGreaterThan(Date.now());
  });

  test('a draft needs a headline or text, and a failed publish keeps what was typed', async ({ page }) => {
    const backend = await openAs(page, 'student', FEED);
    await page.getByText('+ Post Thread').first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Save draft' }).click();
    await expect(dialog.getByText('Add a headline or some text before saving a draft.')).toBeVisible();

    const body = dialog.getByPlaceholder('Ask a question, share an idea, or start a discussion...');
    await body.fill('This will fail to publish');
    backend.failWith('posts', 500);
    const post = dialog.getByRole('button', { name: 'Post now' });
    await post.click();
    await expect(dialog.getByText(/Could not publish this post|try again/i).first()).toBeVisible();
    await expect(body).toHaveValue('This will fail to publish');
    await expect(post).toBeEnabled();
  });

  test('a photo can be attached from the device and removed again', async ({ page }) => {
    await openAs(page, 'student', FEED);
    await page.getByText('+ Post Thread').first().click();
    const dialog = page.getByRole('dialog');
    const chooser = page.waitForEvent('filechooser');
    await dialog.getByRole('button', { name: 'Attach a photo' }).click();
    // 1x1 transparent PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await (await chooser).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
    await expect(dialog.getByRole('img', { name: 'Attached image 1 preview' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Remove image' }).click();
    await expect(dialog.getByRole('img', { name: 'Attached image 1 preview' })).toHaveCount(0);
  });
});

test.describe('forum: react to a thread', () => {
  test('liking sends one request however fast it is tapped, and un-liking sends the delete', async ({ page }) => {
    const backend = await openAs(page, 'student', FEED);
    backend.delay('post_likes', 300);
    const like = page.getByRole('button', { name: 'Mark thread as helpful' }).first();
    await like.dblclick();
    await expect.poll(() => backend.count('POST', 'post_likes')).toBe(1);
    await page.waitForTimeout(500);
    expect(backend.count('POST', 'post_likes')).toBe(1);
    await page.getByRole('button', { name: 'Remove helpful mark' }).first().click();
    await expect.poll(() => backend.count('DELETE', 'post_likes')).toBe(1);
  });

  test('saving a thread inserts one saved item; the button flips and can be undone', async ({ page }) => {
    const backend = await openAs(page, 'student', FEED);
    await page.getByRole('button', { name: 'Save this post' }).first().dblclick();
    await expect(page.getByRole('button', { name: 'Remove from saved items' }).first()).toBeVisible();
    await expect.poll(() => backend.count('POST', 'saved_items')).toBe(1);
    await page.getByRole('button', { name: 'Remove from saved items' }).first().click();
    await expect.poll(() => backend.count('DELETE', 'saved_items')).toBe(1);
  });

  test('voting in a poll sends the vote', async ({ page }) => {
    const backend = await openAs(page, 'student', FEED);
    await page.getByRole('button', { name: 'Vote for Library' }).click();
    await expect.poll(() => backend.calls.filter((c) => /post_poll_votes|vote_on_poll|posts/.test(c.table) && c.method !== 'GET').length).toBeGreaterThan(0);
  });

  test('reporting a thread: an empty reason is refused with a message, a reason files exactly one report', async ({ page }) => {
    const backend = await openAs(page, 'student', FEED);
    await page.getByRole('button', { name: 'Post options' }).first().click();
    await page.getByText('Report Thread to Moderation').click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Report Policy Violation' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Submit Report' }).click();
    await expect(dialog.getByText('Tell moderators what is wrong with this post.')).toBeVisible();
    expect(backend.count('POST', 'moderation_queue')).toBe(0);

    backend.delay('moderation_queue', 300);
    await dialog.getByPlaceholder(/Harassment, unauthorized exam paper/).fill('Shares exam answers');
    await expect(dialog.getByText('Tell moderators what is wrong with this post.')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Submit Report' }).dblclick();
    await expect(page.getByText('Report Dispatched')).toBeVisible();
    const filed = backend.calls.filter((c) => c.method === 'POST' && c.table === 'moderation_queue');
    expect(filed, 'a double click must file one report').toHaveLength(1);
    expect(filed[0].body.reason).toBe('Shares exam answers');
    expect(filed[0].body.item_id).toBe(IDS.post);
  });
});

test.describe('forum: comment on a thread', () => {
  test('the reply button stays disabled until there is text; a reply sends one comment insert and clears the box', async ({ page }) => {
    const backend = await openAs(page, 'student', POST);
    const box = page.getByPlaceholder('Write a reply...');
    const send = page.getByText('Reply', { exact: true }).last();
    await expect(box).toBeVisible();
    // Nothing typed yet: the Reply button is disabled, so a click sends nothing.
    await send.click({ force: true });
    expect(backend.count('POST', 'post_comments')).toBe(0);
    await box.fill('Count me in!');
    backend.delay('post_comments', 300);
    await send.dblclick();
    await expect.poll(() => backend.count('POST', 'post_comments')).toBeGreaterThan(0);
    await expect(box).toHaveValue('');
    expect(backend.count('POST', 'post_comments')).toBe(1);
    expect(backend.calls.find((c) => c.method === 'POST' && c.table === 'post_comments')?.body.content).toBe('Count me in!');
  });

  test('a failed reply keeps the typed text and shows why', async ({ page }) => {
    const backend = await openAs(page, 'student', POST);
    const box = page.getByPlaceholder('Write a reply...');
    await box.fill('This one fails');
    backend.failWith('post_comments', 500);
    await page.getByText('Reply', { exact: true }).last().click();
    await expect(page.getByText('Reply Failed')).toBeVisible();
    await expect(box).toHaveValue('This one fails');
  });

  test('a comment by someone else can be liked but not edited or deleted by an ordinary student', async ({ page }) => {
    const backend = await openAs(page, 'student', POST);
    await expect(page.getByText('I am in! Library at 4pm?')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit comment' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete comment' })).toHaveCount(0);
    await page.getByText('Helpful', { exact: true }).first().click();
    await expect.poll(() => backend.count('POST', 'post_comment_likes')).toBe(1);
  });
});
