-- ============================================================================
-- LIORIS - ALUMNI PROFILE EXTRAS: LINKEDIN URL + PEER SKILL ENDORSEMENTS
-- ============================================================================
-- Two gaps found in a profile-completeness review:
--
--   1. linkedin_url only ever existed on mentor_profiles (mentor_profiles.
--      linkedin_url, MentorProfile/MyMentorProfile in src/api/types.ts) - an
--      alum who never registers as a mentor has nowhere to put a LinkedIn
--      link, even though it is surfaced to peers in the directory and on
--      connections. Adds profiles.linkedin_url.
--
--      profiles has had table-level SELECT revoked from authenticated/anon
--      since 20260929000000_close_open_security_findings.sql - only
--      explicitly re-granted columns are readable (table-level grants are
--      additive in Postgres; there is no way to "subtract" a column from a
--      table-level grant, see that migration's own comment). A new column
--      is invisible to everyone, including its own owner via a plain
--      select(), until it is explicitly re-granted here - this exact bug
--      class has bitten this codebase before. Same public-directory tier as
--      graduation_year/industry/company/job_title/location, added the same
--      way in 20261001000000_workflow_gaps.sql section 2.
--
--   2. The only skills signal on a profile was a single free-text "Skills &
--      Interests" field (profiles.interests, comma-separated in the client)
--      - self-declared and unverifiable, with no way for a peer to vouch for
--      one of the listed skills. Adds public.skill_endorsements: a signed-in
--      member can endorse one of another member's listed skills once.
--      Self-endorsement is blocked by a CHECK constraint (server-side, so it
--      holds even if a client UI bug ever offered the affordance) on top of
--      the client never offering it for the profile owner's own skills.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. profiles.linkedin_url
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS linkedin_url TEXT
  CHECK (linkedin_url IS NULL OR linkedin_url ~* '^https://([a-z]{2,3}\.)?linkedin\.com/');

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'linkedin_url'
    ) THEN
        EXECUTE 'GRANT SELECT (linkedin_url) ON public.profiles TO authenticated, anon';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. skill_endorsements
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.skill_endorsements (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- whose skill is being endorsed
    profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    skill       TEXT NOT NULL CHECK (char_length(skill) BETWEEN 1 AND 50),
    -- who is doing the endorsing
    endorser_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- one endorsement per person per skill
    UNIQUE (profile_id, skill, endorser_id),
    -- cannot endorse your own skill (mirrors the self-check-constraint shape
    -- this codebase already uses for other self-action guards)
    CONSTRAINT skill_endorsements_not_self_chk CHECK (profile_id <> endorser_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_endorsements_profile ON public.skill_endorsements(profile_id, skill);

ALTER TABLE public.skill_endorsements ENABLE ROW LEVEL SECURITY;

-- Endorsement rows (counts, and who gave them) are visible to anyone signed
-- in, the same tier as post_comment_likes - an endorser's identity is not
-- sensitive, and the UI needs "has the viewer already endorsed this skill"
-- as well as the aggregate count, both cheaply derived from the raw rows.
DROP POLICY IF EXISTS "Endorsements readable by anyone authenticated" ON public.skill_endorsements;
CREATE POLICY "Endorsements readable by anyone authenticated" ON public.skill_endorsements
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "A user endorses a skill as themself" ON public.skill_endorsements;
CREATE POLICY "A user endorses a skill as themself" ON public.skill_endorsements
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = endorser_id);

DROP POLICY IF EXISTS "A user removes only their own endorsement" ON public.skill_endorsements;
CREATE POLICY "A user removes only their own endorsement" ON public.skill_endorsements
  FOR DELETE TO authenticated USING (auth.uid() = endorser_id);

REVOKE ALL ON public.skill_endorsements FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.skill_endorsements TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
