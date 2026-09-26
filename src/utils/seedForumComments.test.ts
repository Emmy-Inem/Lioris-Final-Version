import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { SEED_FORUM_COMMENTS, getSeedCommentsForPost } from '../data/seedForumComments.ts';

test('seed forum comments provide authentic peer discourse', async (t) => {
  await t.test('contains rich authentic educational comments', () => {
    const allComments = Object.values(SEED_FORUM_COMMENTS).flat();
    assert.ok(allComments.length >= 15, 'contains at least 15 seed comments');
    for (const c of allComments) {
      assert.ok(c.postId, 'comment must be linked to a post');
      assert.ok(c.authorName, 'comment has author name');
      assert.ok(c.content.length > 5, 'comment has substance');
      assert.ok(c.authorRole, 'comment has author role');
    }
  });

  await t.test('getSeedCommentsForPost correctly filters comments by post ID', () => {
    const postIds = Object.keys(SEED_FORUM_COMMENTS);
    assert.ok(postIds.length >= 5, 'multiple posts have comment discussions');
    const firstPostId = postIds[0];
    const postComments = getSeedCommentsForPost(firstPostId);
    assert.ok(postComments.length >= 1);
    for (const pc of postComments) {
      assert.equal(pc.postId, firstPostId);
    }

    const nonExistent = getSeedCommentsForPost('non-existent-id');
    assert.ok(nonExistent.length >= 1, 'fallback seed comments for unkeyed post');
  });
});
