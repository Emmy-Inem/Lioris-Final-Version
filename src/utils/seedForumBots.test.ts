import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
// @ts-ignore TS5097
import { SEED_BOT_USERS, getSeedBotProfileById } from '../data/seedBotProfiles.ts';
// @ts-ignore TS5097
import { SEED_FORUM_POSTS } from '../data/seedForumPosts.ts';

test('campus community bot personas and forum posts integrity', async (t) => {
  await t.test('contains exactly 20 bot accounts for UI, UNILAG, and FUNAAB only', () => {
    assert.equal(SEED_BOT_USERS.length, 20);

    const uiBots = SEED_BOT_USERS.filter((b: any) => b.campusCode === 'UI');
    const unilagBots = SEED_BOT_USERS.filter((b: any) => b.campusCode === 'UNILAG');
    const funaabBots = SEED_BOT_USERS.filter((b: any) => b.campusCode === 'FUNAAB');

    assert.equal(uiBots.length, 7, 'UI must have exactly 7 bot accounts');
    assert.equal(unilagBots.length, 7, 'UNILAG must have exactly 7 bot accounts');
    assert.equal(funaabBots.length, 6, 'FUNAAB must have exactly 6 bot accounts');

    const other = SEED_BOT_USERS.filter(
      (b: any) => !['UI', 'UNILAG', 'FUNAAB'].includes(b.campusCode),
    );
    assert.equal(other.length, 0, 'Only UI, UNILAG, and FUNAAB are permitted');
  });

  await t.test('every bot account has realistic, complete, and verified metadata', () => {
    const idSet = new Set<string>();
    const usernameSet = new Set<string>();
    const emailSet = new Set<string>();

    for (const b of SEED_BOT_USERS) {
      assert.ok(b.id, 'id required');
      assert.ok(!idSet.has(b.id), `duplicate bot id: ${b.id}`);
      idSet.add(b.id);

      assert.ok(b.fullName && b.fullName.length > 2, `invalid full name for ${b.id}`);
      assert.ok(b.username && b.username.length >= 3, `invalid username for ${b.id}`);
      assert.ok(!usernameSet.has(b.username), `duplicate username: ${b.username}`);
      usernameSet.add(b.username);

      assert.ok(b.email && b.email.includes('@'), `invalid email for ${b.id}`);
      assert.ok(!emailSet.has(b.email), `duplicate email: ${b.email}`);
      emailSet.add(b.email);

      assert.ok(b.bio && b.bio.length > 15, `bio must be descriptive: ${b.username}`);
      assert.ok(b.department && b.department.length > 2, `missing department: ${b.username}`);
      assert.ok(b.avatarUrl && (b.avatarUrl.startsWith('https://') || b.avatarUrl.startsWith('bot_')), `avatar required: ${b.username}`);
      assert.equal(b.isVerified, true, 'bots must be verified');

      const profile = getSeedBotProfileById(b.id);
      assert.ok(profile, `Profile should resolve for bot id ${b.id}`);
      assert.equal(profile.id, b.id);
      assert.equal(profile.isVerified, true);
      assert.equal(profile.verificationStatus, 'verified');
    }
  });

  await t.test('every bot account has a unique display picture with no duplicate images', () => {
    const avatarUrls = new Set<string>();
    const imageHashes = new Map<string, string>();

    for (const b of SEED_BOT_USERS) {
      assert.ok(!avatarUrls.has(b.avatarUrl), `Duplicate avatarUrl detected: ${b.avatarUrl} for bot ${b.username}`);
      avatarUrls.add(b.avatarUrl);

      const fileName = b.avatarUrl.endsWith('.jpg') ? b.avatarUrl : `${b.avatarUrl}.jpg`;
      const filePath = path.join(process.cwd(), 'assets', 'images', 'bots', fileName);
      assert.ok(fs.existsSync(filePath), `Bot image file must exist: ${filePath}`);

      const content = fs.readFileSync(filePath);
      assert.ok(content.length > 5000, `Bot image file too small: ${filePath}`);
      const hash = crypto.createHash('md5').update(content).digest('hex');
      assert.ok(!imageHashes.has(hash), `Duplicate image hash detected: ${fileName} has same image as ${imageHashes.get(hash)}`);
      imageHashes.set(hash, fileName);
    }

    assert.equal(avatarUrls.size, 20, 'All 20 bots must have distinct avatar presets');
    assert.equal(imageHashes.size, 20, 'All 20 bots must have distinct physical images');
  });

  await t.test('contains exactly 20 insightful forum posts covering all discussion spaces', () => {
    assert.equal(SEED_FORUM_POSTS.length, 20);

    const categories = new Set(SEED_FORUM_POSTS.map((p: any) => p.category));
    assert.ok(categories.has('Tech Hub'), 'Tech Hub space must be covered');
    assert.ok(categories.has('General'), 'General space must be covered');
    assert.ok(categories.has('Academic'), 'Academic space must be covered');
    assert.ok(categories.has('Polls'), 'Polls space must be covered');
    assert.ok(categories.has('Housing'), 'Housing space must be covered');
    assert.ok(categories.has('Social'), 'Social space must be covered');
    assert.ok(categories.has('Lost & Found'), 'Lost & Found space must be covered');

    const botIdSet = new Set(SEED_BOT_USERS.map((b: any) => b.id));
    const postIdSet = new Set<string>();

    for (const p of SEED_FORUM_POSTS) {
      assert.ok(p.id, 'post id required');
      assert.ok(!postIdSet.has(p.id), `duplicate post id: ${p.id}`);
      postIdSet.add(p.id);

      assert.ok(botIdSet.has(p.authorId), `Post author ${p.authorId} must exist in bot users`);
      assert.ok(p.title && p.title.length > 15, `Post title too short: ${p.id}`);
      assert.ok(p.content && p.content.length > 80, `Post content must be insightful: ${p.id}`);
      assert.ok(['UI', 'UNILAG', 'FUNAAB'].includes(p.institutionCode), 'Campus code must be UI, UNILAG, or FUNAAB');
      assert.equal(p.status, 'published');
      assert.ok(p.likesCount >= 0);
      assert.ok(p.commentsCount >= 0);

      if (p.category === 'Polls') {
        assert.ok(p.poll, `Poll post ${p.id} must have a valid poll object`);
        assert.ok(p.poll.options && p.poll.options.length >= 2, `Poll options missing for ${p.id}`);
        assert.ok(p.poll.totalVotes > 0, `Poll totalVotes should be greater than 0`);
      }
    }
  });
});
