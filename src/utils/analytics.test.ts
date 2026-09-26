import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { isBotId } from './botVisibility.ts';

test('analytics and bot visibility logic', async (t) => {
  await t.test('isBotId correctly distinguishes bot personas from real users', () => {
    // Seeded bot profile prefix
    assert.equal(isBotId('00000000-0000-4000-a000-000000000001'), true);
    assert.equal(isBotId('00000000-0000-4000-a000-000000000020'), true);

    // Seeded bot forum post prefix
    assert.equal(isBotId('00000000-0000-4000-b000-000000000001'), true);
    assert.equal(isBotId('00000000-0000-4000-b000-000000000020'), true);

    // Real users and normal items
    assert.equal(isBotId('00000000-0000-4000-8000-000000000005'), false);
    assert.equal(isBotId('c880be86-4fbf-4b47-b2eb-680c1081387d'), false);
    assert.equal(isBotId(undefined), false);
    assert.equal(isBotId(null), false);
    assert.equal(isBotId(''), false);
  });

  await t.test('bot filter logic strips bot posts when showBots is false', () => {
    const mockPosts = [
      { id: 'real-post-1', authorId: 'real-user-1', title: 'Real Post' },
      { id: '00000000-0000-4000-b000-000000000001', authorId: '00000000-0000-4000-a000-000000000001', title: 'Bot Post 1' },
      { id: '00000000-0000-4000-b000-000000000002', authorId: '00000000-0000-4000-a000-000000000002', title: 'Bot Post 2' },
      { id: 'real-post-2', authorId: 'real-user-2', title: 'Real Post 2' },
    ];

    const filterWithBots = (posts: any[], showBots: boolean) => {
      if (showBots) return posts;
      return posts.filter((p) => !isBotId(p.id) && !isBotId(p.authorId));
    };

    assert.equal(filterWithBots(mockPosts, true).length, 4);
    const hidden = filterWithBots(mockPosts, false);
    assert.equal(hidden.length, 2);
    assert.deepEqual(hidden.map((p) => p.id), ['real-post-1', 'real-post-2']);
  });

  await t.test('relative time calculations reflect active and login thresholds', () => {
    const now = Date.now();
    const isOnline = (lastActive: string | null) => {
      if (!lastActive) return false;
      return now - new Date(lastActive).getTime() <= 15 * 60 * 1000;
    };

    const twoMinutesAgo = new Date(now - 2 * 60 * 1000).toISOString();
    const twentyMinutesAgo = new Date(now - 20 * 60 * 1000).toISOString();
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();

    assert.equal(isOnline(twoMinutesAgo), true);
    assert.equal(isOnline(twentyMinutesAgo), false);
    assert.equal(isOnline(threeDaysAgo), false);
    assert.equal(isOnline(null), false);
  });

  await t.test('analytics is situated under the platform admin group', async () => {
    // @ts-ignore TS5097
    const { adminGroupForPath } = await import('../components/admin/adminNav.ts');
    const groupForAnalytics = adminGroupForPath('/analytics');
    assert.ok(groupForAnalytics, 'group should be resolved');
    assert.equal(groupForAnalytics.key, 'platform', 'analytics must belong to platform group');

    const groupForAdminAnalytics = adminGroupForPath('/(admin)/analytics');
    assert.ok(groupForAdminAnalytics);
    assert.equal(groupForAdminAnalytics.key, 'platform');
  });

  await t.test('all bot personas use authentic Nigerian student avatars', async () => {
    // @ts-ignore TS5097
    const { SEED_BOT_USERS } = await import('../data/seedBotProfiles.ts');
    for (const bot of SEED_BOT_USERS) {
      assert.ok(
        bot.avatarUrl.includes('Law_Students_Nigeria') ||
        bot.avatarUrl.includes('Discovery_For_Youth') ||
        bot.avatarUrl.startsWith('bot_ui_') ||
        bot.avatarUrl.startsWith('bot_unilag_') ||
        bot.avatarUrl.startsWith('bot_funaab_'),
        `Bot ${bot.username} avatar must be authentic Nigerian student photo`);
      assert.ok(!bot.avatarUrl.includes('images.unsplash.com/photo-1534528741775'), 'Must not use stock white photo');
    }
  });
});
