# supabase_posts_features_2026.sql

Reposts, drafts, scheduled posts, per-voter poll votes with closing times, and a unified
saved/bookmark store.

Apply **after** `supabase_schema.sql`, `supabase_security_hardening_2026.sql` and
`supabase_launch_hardening_2026.sql` (all three already applied in production).
One `BEGIN`/`COMMIT`, idempotent, guarded with `to_regclass` / `information_schema` /
`pg_constraint` checks so a missing optional object downgrades to a `NOTICE`.

## What it creates

| Object | Purpose |
| --- | --- |
| `public.post_reposts` | The repost join table that never existed. `unique(post_id, user_id)`, FKs cascade from `posts` and `auth.users`. Indexes on `(user_id, created_at desc)` and `(post_id)`. |
| `sync_post_reposts_count()` + `trigger_sync_post_reposts` | Keeps `posts.reposts_count` correct on INSERT/DELETE. `SECURITY DEFINER`, `search_path = public, pg_temp`, same shape as `sync_post_likes_count()`. |
| `posts.status` | `'published' | 'draft' | 'scheduled'`, `NOT NULL DEFAULT 'published'`, CHECK `posts_status_check`. |
| `posts.scheduled_at` | `timestamptz`; CHECK `posts_scheduled_at_check` forces it to be set when `status = 'scheduled'`. |
| `publish_due_scheduled_posts()` | `service_role`-only `SECURITY DEFINER` sweep; flips due rows to `published`, sets `created_at = now()`, returns the count. |
| `public.saved_items` | One bookmark store for `post` / `resource` / `event` / `job`. `unique(user_id, kind, item_id)`, index `(user_id, kind, created_at desc)`. `item_id` is `text` because bundled resources and jobs have non-uuid ids. |
| `public.post_poll_votes` | One row per voter per poll. `unique(post_id, user_id)`, so changing a vote is an UPDATE of `option_id` and holding two votes at once is impossible. Indexes on `(post_id)` and `(user_id)`. |
| `recount_poll_votes()` + `trigger_sync_poll_votes` | Recomputes the `votes` / `totalVotes` numbers inside `poll_data` from `post_poll_votes` on every insert, update and delete. `SECURITY DEFINER`, fixed `search_path`. |
| `enforce_poll_vote_validity()` + `trg_poll_vote_guard` | BEFORE INSERT/UPDATE: refuses a vote on a post with no poll, on an option that is not in the poll, or after `closesAt` has passed. |
| `strip_poll_is_voted_by_me()` + `trg_strip_poll_is_voted_by_me` | BEFORE INSERT/UPDATE OF `poll_data` on `posts`: removes `isVotedByMe` from every option, so per-viewer state can never be stored in a shared row again - not even by a stale client. |

## RLS

**`post_reposts`** - SELECT open to every authenticated user (the client needs it both to
count reposts and to answer "did I repost this"; a repost is a public act).
INSERT own row only and only when not suspended (same condition as the `post_likes`
INSERT policy). DELETE own row, or an admin. No UPDATE policy at all, so a row cannot be
re-pointed at another post to dodge the unique constraint. `anon` is revoked explicitly.

**`saved_items`** - owner-only for all four verbs. Deliberately no admin read policy:
what a user saved is private.

**`post_poll_votes`** - SELECT open to every authenticated user (tallies are public
anyway). INSERT and UPDATE own row only and only when not suspended; UPDATE pins the row
to the caller in both `USING` and `WITH CHECK`, so a vote cannot be re-pointed at another
user. DELETE own row, or an admin. `anon` is revoked explicitly.

**`posts` SELECT** - the existing policy `"Posts viewable by campus or global"` is
**dropped and recreated**. Every campus/visibility condition from `supabase_schema.sql` is
copied over unchanged; a second condition is ANDed on:

```sql
COALESCE(status, 'published') = 'published'
  OR author_id = auth.uid()
  OR caller is admin/staff
```

So a draft or a scheduled post is visible only to its author (plus admins and staff, who
already see every post for moderation). **If the campus rules in `supabase_schema.sql`
ever change, they must be changed in both places.** The harness asserts both halves:
a UI student still cannot see a UNILAG campus post, and `s2` cannot see `s1`'s draft.

No new UPDATE policy is needed - `"Authors, admins and staff can update posts"` already
lets an author flip their own row's status, which is what "publish draft", "reschedule"
and the client-side fallback below rely on. `trg_enforce_post_pin_authority` only guards
`is_pinned`. `trg_rate_limit_posts` is `BEFORE INSERT`, so a draft costs one unit of the
20-posts-per-hour budget when it is created, not again when it is published.

## pg_cron: NOT installed on production

The `*/5 * * * *` schedule for `publish_due_scheduled_posts()` is inside a guarded `DO`
block; **pg_cron is not enabled on the production project today**, so the job is skipped
with a `NOTICE` and nothing server-side publishes due posts.

Until pg_cron is enabled (Dashboard -> Database -> Extensions, then re-run this script),
the **client-side fallback in `src/api/posts.ts` is what publishes due posts**:
`listMyScheduled()` and `listMyPosts()` flip the *caller's own* rows whose
`scheduled_at <= now()` to `published` with an ordinary authenticated UPDATE (allowed by
the author policy). Consequence: a scheduled post goes live the first time its **author**
opens the app after the due time, not at the exact minute. An external scheduler calling
`publish_due_scheduled_posts()` with the service key every few minutes is the other option.

## Polls: per-voter votes in a table, tally and closing time in `poll_data`

**The bug this replaces.** Votes used to live entirely inside the `poll_data` blob,
*including* `isVotedByMe`. That is per-viewer state stored in a row every viewer reads:
whoever voted last, everybody saw that person's selection as their own, and one user
changing their vote changed it on everyone's screen. "Change your vote" is unshippable on
top of that, so `post_poll_votes` was added.

**Who voted what** is now one row per voter in `post_poll_votes` (`unique(post_id,
user_id)`). Cast = INSERT, change = UPDATE of `option_id`, clear = DELETE.

**The tally** stays in `poll_data` so every existing reader keeps working, but the numbers
are **derived**: `trigger_sync_poll_votes` recomputes them from `post_poll_votes` on every
write. The client never writes them any more, it re-reads them. Drift is therefore
impossible, and two devices racing cannot corrupt a count.

**`isVotedByMe` is never persisted again.** `trg_strip_poll_is_voted_by_me` removes it from
`poll_data` on every insert/update of the column, and `decoratePoll()` in
`src/api/posts.ts` ignores whatever is in the stored JSON and computes the flag from the
viewer's own vote row.

The stored shape:

```json
{ "question": "...",
  "options": [{ "id": "opt-1", "label": "...", "votes": 0 }],
  "totalVotes": 0,
  "closesAt": "2026-10-01T09:00:00.000Z" }
```

**Closing time** is still an ISO string in the blob rather than its own column - nothing
server-side queries polls by closing time, and the votes have their own table now. It is
**enforced server-side**: `trg_poll_vote_guard` reads `closesAt` out of the blob and
refuses an INSERT or UPDATE once it has passed (it also refuses an option id that is not
in the poll). `closesAt` absent (every legacy poll) = never closes; `isClosed` is derived
client-side and never stored. DELETE is deliberately **not** guarded - blocking it would
make `purge_user_data()` fail for any user who ever voted in a poll that has since closed.

### Migrating existing polls

The `isVotedByMe: true` flags sitting in production blobs cannot be attributed to a user -
the old code never recorded *who* voted - so **no vote rows are invented from them**. The
migration only strips the flag. Practical effect: **a pre-existing poll keeps its totals,
but nobody is shown as having voted**, and the first real vote cast through the new table
triggers a recount that replaces those legacy totals with the true count.

## reposts_count backfill

`post_reposts` starts empty, so the one-off backfill does not restore anything - it
**normalises `posts.reposts_count` down to the real number of repost rows** (0 for every
existing post), discarding the numbers the old client-side `reposts_count + 1` increment
left behind. Those were not backed by anything and could never be undone by the user who
made them. Re-running recomputes the same value, so it stays idempotent.

## Erasure (GDPR)

`purge_user_data()` discovers the tables it must clear by walking single-column foreign
keys pointing at `public.profiles` / `auth.users` and hard-deletes the `ON DELETE CASCADE`
ones. `post_reposts.user_id`, `saved_items.user_id` and `post_poll_votes.user_id` are
exactly that, so **all three are picked up automatically with no change to the function**.
Section 6 of the migration verifies that at apply time and raises an exception if a future
edit breaks the assumption; the harness asserts the purge really empties all three (and
that the tally a purged vote contributed to is recounted).

## Realtime

`post_reposts` is added to the `supabase_realtime` publication (guarded) so repost counts
update live. `saved_items` is left out on purpose - private, per-user, nothing subscribes.
`post_poll_votes` is left out too: a vote changes `posts.poll_data`, and `posts` is
already published, so the tally reaches subscribers without publishing the vote rows.

## Verification

`tools/sql-harness/run.mjs` applies every repo migration plus this one into an in-memory
Postgres 17 (PGlite) with Supabase's roles and `auth`/`storage`/`realtime` stubbed, then
asserts behaviour as different roles. **92/92 checks pass** (30 of them are this
migration's). Run it with:

```
cd tools/sql-harness && npm install && node run.mjs
```

Checks added for this migration: clean apply + idempotent second run; a second user cannot
see another user's draft or scheduled post while the author, admins and staff can; the
original cross-campus rule still holds; status/scheduled_at CHECK constraints; an author
can publish their own draft but not someone else's; `publish_due_scheduled_posts()` is
service_role-only and only touches due rows; reposting twice is rejected by the unique
constraint; a repost cannot be forged or deleted on another user's behalf; insert/delete
of a repost increments/decrements `reposts_count`; a suspended user cannot repost;
reposts are readable by any authenticated user but not by `anon`; `saved_items` are
invisible to other users *and* to admins, duplicates and bad `kind` values are rejected;
two users vote independently and each sees only their own selection; `isVotedByMe` is
stripped even when a client writes it straight into `poll_data`; changing a vote moves the
tally by exactly one; a user holds at most one vote per poll and cannot vote for an option
that does not exist; withdrawing a vote clears it from the tally; a closed poll rejects
both a new vote and a change of vote; a suspended user can neither vote nor change a vote;
a vote cannot be forged, changed or deleted on someone else's behalf; `anon` cannot read
`post_poll_votes`; `purge_user_data()` empties all three new tables; and the whole script
applies on a database without pg_cron or the optional tables.
