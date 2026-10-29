import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import {
  isBotId,
  isBotProfile,
  isBotPost,
  isBotVisibilityEnabled,
  setMemoryBotVisibility,
} from './botVisibility.ts';

// Rows created by the retired community-bot seed migration can still exist in a database until
// 20261114000000_remove_seed_bot_content.sql has run, so the client keeps recognising them. The
// client no longer ships any seed posts or personas: these are hand-written samples of that shape.
const SAMPLE_BOT_USERS = [
  { id: '00000000-0000-4000-a000-000000000101', fullName: 'Sample Bot One', is_bot: true },
  { id: '00000000-0000-4000-a000-000000000205', fullName: 'Sample Bot Two' },
];
const SAMPLE_BOT_POSTS = [
  { id: '00000000-0000-4000-b000-000000000101', authorId: '00000000-0000-4000-a000-000000000101', title: 'Sample bot post' },
  { id: 'e6988888-1234-4000-8000-0000000000aa', authorId: '00000000-0000-4000-a000-000000000205', title: 'Bot-authored, real-looking id' },
  { id: 'e6988888-1234-4000-8000-0000000000ab', authorId: 'real-author', isBot: true, title: 'Flagged bot post' },
];

test('botVisibility utility suite', async (t) => {
  await t.test('isBotId identifies seed bot IDs correctly', () => {
    assert.equal(isBotId('00000000-0000-4000-a000-000000000101'), true);
    assert.equal(isBotId('00000000-0000-4000-b000-000000000105'), true);
    assert.equal(isBotId('c8466b0a-313d-4c3e-8c38-df645ce1e5fb'), false);
    assert.equal(isBotId(undefined), false);
    assert.equal(isBotId(null), false);
    assert.equal(isBotId(''), false);
  });

  await t.test('isBotProfile identifies bot accounts from metadata or id', () => {
    assert.equal(isBotProfile({ id: '00000000-0000-4000-a000-000000000101', full_name: 'Tunde' }), true);
    assert.equal(isBotProfile({ id: 'real-user-123', is_bot: true }), true);
    assert.equal(isBotProfile({ id: 'real-user-456', isBot: true }), true);
    assert.equal(isBotProfile({ id: 'real-user-789', full_name: 'Real Human', is_bot: false }), false);
    assert.equal(isBotProfile(null), false);
  });

  await t.test('isBotPost identifies bot posts by post id, author id and flags', () => {
    for (const post of SAMPLE_BOT_POSTS) {
      assert.equal(
        isBotPost(post),
        true,
        `Sample bot post ${post.id} by author ${post.authorId} must be identified as a bot post`,
      );
    }

    const humanPost = {
      id: 'e6988888-1234-4000-8000-000000000001',
      authorId: 'e6988888-1234-4000-8000-000000000002',
      authorName: 'Adeola Adeleke',
      title: 'Real study question for EEE 311',
      content: 'Can anyone help explain Laplace transforms?',
    };
    assert.equal(isBotPost(humanPost), false);
  });

  await t.test('setMemoryBotVisibility and isBotVisibilityEnabled synchronize state', () => {
    setMemoryBotVisibility(false);
    assert.equal(isBotVisibilityEnabled(), false);

    setMemoryBotVisibility(true);
    assert.equal(isBotVisibilityEnabled(), true);
  });

  await t.test('every bot post is filtered out when bot visibility is disabled', () => {
    const mixedFeed = [
      ...SAMPLE_BOT_POSTS,
      {
        id: 'real-post-001',
        authorId: 'real-author-001',
        title: 'Real Campus Announcement',
        content: 'Campus library is open till 10 PM',
      },
      {
        id: 'real-post-002',
        authorId: 'real-author-002',
        title: 'Alumni Dinner Registration',
        content: 'Register for Saturday reunion',
      },
    ];

    const filtered = mixedFeed.filter((p) => !isBotPost(p));
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].id, 'real-post-001');
    assert.equal(filtered[1].id, 'real-post-002');
  });

  await t.test('every sample bot user is detected as a bot profile', () => {
    for (const bot of SAMPLE_BOT_USERS) {
      assert.equal(
        isBotProfile(bot),
        true,
        `Bot user ${bot.id} (${bot.fullName}) must be identified as bot`,
      );
    }
  });
});
