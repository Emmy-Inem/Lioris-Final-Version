# Campus access control — plan

**Status:** proposal, not built. **Author:** engineering. **Date:** 2026-09-20.

Goal: stop people who are not verified members of a campus from reading or writing that campus's
private content, without locking out the people who legitimately cannot hold a student email
(alumni, staff, students at a university whose domain we have not onboarded).

Everything in "Findings" below was verified against the live project, not assumed.

---

## 1. Findings — what is actually broken today

### F1. Campus membership is self-declared (critical)

`handle_new_user_profile()` assigns the campus as:

```sql
COALESCE(campus_for_email(NEW.email), NEW.raw_user_meta_data->>'campus_code', 'GLOBAL')
```

The middle term is supplied by the client at signup. Anyone can register with a personal email,
choose "UNILAG" in the picker, confirm the address, and be placed inside the UNILAG node.

### F2. `verification_status` gates nothing (critical)

It appears in **zero** RLS policies. It drives a badge in the UI and nothing else. Meanwhile
**eight** policies grant access on `campus_code` alone:

`posts`, `events`, `resources`, `study_groups`, `marketplace_listings`, `announcements`,
`jobs`, `profiles` (the directory) — each with
`campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid())`.

F1 + F2 together mean the campus wall does not exist at all right now.

### F3. Uploaded files are world-readable (critical, independent of this feature)

`resources`, `avatars` and `campus-media` are **public** buckets, and the storage policy is:

```sql
CREATE POLICY "Public storage objects viewable by anyone" ON storage.objects
FOR SELECT USING (bucket_id IN ('resources', 'avatars', 'campus-media'));
```

No role restriction. Verified on production on 2026-09-20:

1. With only the **public anon key** (published in the JS bundle by design), the `resources`
   bucket can be **listed**, enumerating user-id folders and exact object names, sizes and types.
2. With **no credentials at all**, an object then downloads: `HTTP 200`, a 9.8 MB `.pptx`.

So "past questions require verified status to download" **cannot be enforced by gating the
`resources` table**. The row is RLS-protected; the file is not. This is a live exposure of
students' uploaded material today, before any of this feature is built, and should be fixed
whether or not the rest of this plan is approved.

### F4. Walling the directory breaks author names

The `profiles` SELECT policy is the same campus rule. If an unverified user loses campus access,
they also lose the ability to read the profile row of any campus-scoped author — so authors of
*global* posts would render with a blank name. Any plan that tightens `profiles` must add a
minimal public projection at the same time, or it ships a visible regression.

This is also the fix for an item from the earlier security audit: same-campus users can currently
read each other's `email`, `student_id_number` and `trust_score`. One change closes both.

---

## 2. Why the client-side approach in the original plan does not work

The proposal was to filter in `src/api/posts.ts`, `events.ts` and `communities.ts`. Those ship in
the public bundle, and the anon key is public. The filter is bypassed with:

```bash
curl 'https://<project>.supabase.co/rest/v1/posts?select=*' \
  -H "apikey: <public anon key>" -H "Authorization: Bearer <the user's own token>"
```

Client filters are the *explanation*. RLS is the *boundary*. Same lesson as the client-bundle admin
backdoor, the client-only draft hiding and the shared `isVotedByMe` flag, all fixed earlier.

Second defect in that proposal: `!isVerified && isPersonalEmail(email)`. That treats an unverified
user with a non-gmail address as trusted — so any `.edu.ng` domain we have not onboarded, any
look-alike domain, and any foreign university walks straight through. The correct signal is
`verification_status = 'verified'` on its own: it already encodes both legitimate paths, needs no
domain list, and has no bypass.

---

## 3. The model

One idea, applied once: **campus membership is earned, not declared.**

`profiles.campus_code` stays exactly as it is — "the campus this person claims". A new
server-side function answers the only question that matters:

```sql
-- The campus code the CALLER is actually entitled to see, or NULL.
CREATE OR REPLACE FUNCTION public.auth_campus_access()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN NOT public.campus_wall_enabled() THEN p.campus_code          -- kill switch, see §6
    WHEN p.role IN ('admin', 'staff')     THEN p.campus_code          -- moderators keep reach
    WHEN p.verification_status = 'verified' THEN p.campus_code
    ELSE NULL
  END
  FROM public.profiles p
  WHERE p.id = auth.uid()
$$;
```

Then every campus branch in RLS changes by one token:

```sql
-- before
campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid())
-- after
campus_code = public.auth_campus_access()
```

`NULL` never equals anything, so an unverified user silently matches no campus row and is left with
`GLOBAL` content only. No new conditions to keep in sync across eight policies, one place to audit,
one place to change if the rule evolves.

---

## 4. What gets restricted, and how

Not a blanket A/B/C. The right treatment differs by surface:

| Surface | Treatment | Reasoning |
| --- | --- | --- |
| Posts, confessions, forum threads | **Hard wall** | For a confession thread the *title is the payload*. A "teaser" leaks exactly the sensitive part. |
| Chat channels, DMs | **Hard wall** on campus channels; cannot *initiate* a DM to a campus member; may reply inside a channel someone else created | Prevents cold-DM harvesting of students |
| Student directory / profiles | **Hard wall**, plus the public projection from F4 | Stops directory scraping |
| Resource vault (files) | **Hard wall, enforced in storage** (see §5) | DB gating alone is useless here |
| Study groups, marketplace, jobs | **Hard wall** | Same campus rule, same helper |
| Events | **Aggregate teaser**: "12 campus events this week — verify to see them", with counts by category. No titles, no venues, no dates. | Drives verification with **zero** leak. Column-level teasers need view gymnastics and still leak titles; a count does not. |
| Announcements | Hard wall on campus-scoped; GLOBAL announcements stay visible | Unverified users still get platform notices |

**Writes matter as much as reads.** The original plan only covered reading. An unverified account
must also not be able to: post into a campus feed, comment on campus posts, RSVP to campus events,
upload to the campus vault, create a campus study group, or list on the campus marketplace. Each of
those is the `WITH CHECK` side of the same policies and uses the same helper.

---

## 5. Storage — the part that cannot be done in the database

F3 must be fixed by changing how files are served, not by RLS on `resources`.

1. Flip `resources` and `campus-media` to **private** buckets
   (`UPDATE storage.buckets SET public = false WHERE id IN ('resources','campus-media')`).
2. Replace the blanket `SELECT` policy with one that requires an authenticated caller and, for
   campus-scoped material, campus entitlement via `auth_campus_access()`.
3. Serve every file through a **short-lived signed URL** (300 s), the pattern already used for the
   private `verifications` bucket in the admin review flow.
4. `avatars` can stay public — a profile picture is not campus-private, and making it private
   means signing a URL for every avatar in every list, which is a real performance cost.

**This is a breaking change for existing content.** Every `resources.file_url` currently holds a
public URL. Those rows need migrating to store the object **path**, with the client minting signed
URLs on demand — exactly the change already made for verification documents. Budget for it; it is
the largest single piece of work in this plan.

**Do step 1–3 regardless of whether the campus wall ships.** Today any stranger can enumerate and
download students' uploads with no account.

---

## 6. Rollout safety

**Kill switch in the database, not in a deploy.** `campus_wall_enabled()` reads a
`platform_settings` row so the wall can be turned off instantly if it goes wrong, without shipping
a build:

```sql
CREATE OR REPLACE FUNCTION public.campus_wall_enabled()
RETURNS boolean LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT (value->>'enabled')::boolean
                   FROM public.platform_settings WHERE key = 'campus_wall'), false)
$$;
```

Default **false**. Ship the migration dark, verify nothing changed, then flip it.

**Sequence**

| Step | Action | Gate |
| --- | --- | --- |
| 0 | Run the count query in §8. Decide if the number is tolerable. | — |
| 1 | Ship storage privatisation (§5) — independent of the wall | Files no longer world-readable |
| 2 | Ship the public-profile projection (F4) | Author names still render |
| 3 | Ship the helpers + policy rewrites, wall **off** | Production behaves identically |
| 4 | Ship the client prompts, verification CTA, event teaser | Visible but inert |
| 5 | Email unverified campus users: "verify within 14 days" | Grace period starts |
| 6 | Flip `campus_wall` to true | Wall live, instantly reversible |

**Never flip step 6 before the admin review queue is staffed.** The moment the wall goes up,
verification becomes the critical path to the whole product — see §7.

---

## 7. The part that decides whether this succeeds

Walling content only works if verification is fast and reachable. Today:

- Institutional email in `campuses.email_domains` → auto-verified on confirmation. Good.
- Anyone else → upload a document, wait for a human. **No SLA, no queue staffing, no notification
  on approval, and the admin could not even see the uploaded document until the fix earlier today.**

Before the wall goes up:

1. **Staff the queue** with the SLA already written in `docs/operations/moderation-runbook.md`, and
   measure it. A student who waits three days churns.
2. **Notify on decision.** Approved and rejected both need a push/email; rejection needs a reason
   and a re-apply path (the `rejected` enum value exists and is currently a dead end).
3. **Widen auto-verification.** Every campus domain we onboard is one less manual review. Add the
   sub-domain forms students actually have (`student.unilag.edu.ng`, etc.) — `campus_for_email()`
   already handles subdomains correctly.
4. **Alumni cannot hold a live student email.** They are a first-class user type here and will
   *always* need the document path. Their review must not be slower than students'.
5. **Staff at an un-onboarded campus** hit the same wall. Give admins a direct "verify this user"
   action (`adminDirectVerifyUser` exists) and make sure it is discoverable.

---

## 8. Before building — numbers I do not have

The public key cannot read `profiles`. Run this and decide from the result:

```sql
-- How many people lose access the day the wall goes up?
SELECT verification_status, role, count(*)
FROM public.profiles
WHERE campus_code IS NOT NULL AND campus_code <> 'GLOBAL'
GROUP BY 1, 2
ORDER BY 3 DESC;

-- How big is the pending queue, and how old is the oldest item?
SELECT status, count(*), min(created_at) AS oldest
FROM public.verifications
GROUP BY 1;
```

If most campus users are unverified, step 5's grace period needs to be longer and the queue needs
real staffing before step 6.

---

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Mass lockout on flip day | Kill switch (§6), grace period, count query first |
| Verification queue becomes the bottleneck | §7 — staff it and measure before flipping |
| Author names break | F4 projection ships first (step 2) |
| Signed-URL migration breaks existing resources | Migrate `file_url` → path with a resolver for legacy rows, same approach already used for verification documents |
| The eight policies drift apart again | All of them route through one helper; a harness check asserts no policy still inlines the old campus sub-select |
| Admins lock themselves out | `role IN ('admin','staff')` short-circuit in the helper, plus a harness check |

---

## 10. Verification before it ships

Extend `tools/sql-harness/run.mjs` (92 checks today) with, at minimum:

- an unverified campus user reads zero campus posts/events/resources/study groups, and **can** read
  GLOBAL ones;
- the same user cannot INSERT into any campus-scoped table;
- a verified same-campus user reads them normally;
- admin and staff are unaffected;
- a verified user who is later set back to `rejected` loses access immediately;
- flipping `campus_wall` off restores the old behaviour exactly;
- no policy still contains the inlined `campus_code = (SELECT campus_code FROM profiles ...)`;
- anon can read neither the profiles projection nor any campus row.

Storage cannot be covered by the harness (PGlite has no storage service) and must be checked
against a real project with curl, the same way F3 was found.
