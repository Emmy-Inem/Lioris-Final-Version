-- ============================================================================
-- LIORIS - AUDIT FIXES 2026
-- ============================================================================
-- Source: audit of supabase_schema.sql (and the supabase_fix_* history it
-- already carries). Each fix below is its own section and is safe to re-run.
--
-- Fixes in this file:
--   1. Staff can silently overwrite trust_score via the profiles UPDATE
--      policy, because the escalation-prevention trigger never protected
--      that column for staff (only for regular self-updates).
--   2. chat_channels / chat_channel_members have no per-user "archive"
--      mechanism, so the app's archiveConversation() has to fall back to
--      deleting the whole channel - destroying it for every member.
--   3. user_blocks has no admin/staff bypass policy, so abuse investigations
--      can't see who has blocked whom.
--   4. Missing indexes on frequently-filtered foreign-key / status columns.
-- ============================================================================


-- ============================================================================
-- 1. Staff can tamper with profiles.trust_score (CRITICAL)
-- ============================================================================
-- Cause:
--   "Staff can update profiles for their campus" (supabase_schema.sql,
--   ~line 1415) is a FOR UPDATE policy with USING but no WITH CHECK, so
--   Postgres allows the new row through unchecked at the RLS layer. The only
--   backstop is the BEFORE UPDATE trigger prevent_profile_role_escalation(),
--   but its staff branch (~line 472) only reverts NEW.role and
--   NEW.campus_code - it never touches NEW.trust_score. A staff account can
--   therefore raise or zero out any user's trust_score.
--
-- Fix:
--   Extend the staff branch to also revert trust_score (and, for good
--   measure, is_suspended / verification_status stay staff-editable exactly
--   as before - this fix is scoped to trust_score only, matching the audit).
--   Same revert-in-trigger pattern already used for role/campus_code and for
--   the non-staff branch below it.
-- ============================================================================
CREATE OR REPLACE FUNCTION prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_role VARCHAR(50);
    v_caller_campus VARCHAR(50);
BEGIN
    SELECT role, campus_code INTO v_caller_role, v_caller_campus
    FROM profiles WHERE id = auth.uid();

    -- Allow Admin full authority over all profiles
    IF v_caller_role = 'admin' THEN
        RETURN NEW;
    END IF;

    -- Allow Campus Staff to update is_suspended and verification_status for users in their same campus or when staff has GLOBAL scope
    IF v_caller_role = 'staff' AND (v_caller_campus = OLD.campus_code OR v_caller_campus = 'GLOBAL' OR OLD.campus_code = 'GLOBAL') THEN
        -- Role and campus code cannot be escalated by staff, and staff must
        -- not be able to move trust_score via the profiles UPDATE policy
        -- either (that policy has no WITH CHECK, so this trigger is the
        -- only thing standing between staff and trust_score tampering).
        NEW.role := OLD.role;
        NEW.campus_code := OLD.campus_code;
        NEW.trust_score := OLD.trust_score;
        RETURN NEW;
    END IF;

    -- For regular users / self updates: prevent mutating role, verification, suspension, trust_score, campus_code
    IF (NEW.role IS DISTINCT FROM OLD.role)
       OR (NEW.verification_status IS DISTINCT FROM OLD.verification_status)
       OR (NEW.is_suspended IS DISTINCT FROM OLD.is_suspended)
       OR (NEW.trust_score IS DISTINCT FROM OLD.trust_score)
       OR (NEW.campus_code IS DISTINCT FROM OLD.campus_code) THEN
        NEW.role := OLD.role;
        NEW.verification_status := OLD.verification_status;
        NEW.is_suspended := OLD.is_suspended;
        NEW.trust_score := OLD.trust_score;
        NEW.campus_code := OLD.campus_code;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger definition is unchanged (same function, same firing), but re-create
-- it defensively in case this file is ever run before the trigger exists.
DROP TRIGGER IF EXISTS tr_prevent_profile_role_escalation ON profiles;
CREATE TRIGGER tr_prevent_profile_role_escalation
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION prevent_profile_role_escalation();


-- ============================================================================
-- 2. Per-user chat archive (CRITICAL)
-- ============================================================================
-- Cause:
--   chat_channel_members has no UPDATE/DELETE policy at all, and
--   chat_channels only has "Admins can manage chat channels" (FOR ALL).
--   There is no member/creator DELETE policy on chat_channels either. The
--   app's archiveConversation() (src/api/messaging.ts) calls
--   `.delete()` on chat_channels, which (a) would be blocked by RLS as-is,
--   and (b) is the wrong operation regardless - deleting the channel removes
--   it for every participant, not just the one archiving it.
--
-- Fix (schema/RLS only - see NOTE at the bottom of this section):
--   Add a join table, chat_channel_archives(channel_id, user_id), so each
--   member can mark a channel archived for themselves without affecting any
--   other member's view of it. A join table is used instead of an
--   `archived_by uuid[]` column on chat_channels because it doesn't require
--   every archiving/unarchiving write to hold a lock on the shared channel
--   row, and it composes cleanly with RLS (one row you own vs. array
--   membership checks).
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_channel_archives (
    channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    archived_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_channel_archives_user ON chat_channel_archives(user_id);

ALTER TABLE chat_channel_archives ENABLE ROW LEVEL SECURITY;

-- A user may see only their own archive rows.
DROP POLICY IF EXISTS "Users can view their own channel archive state" ON chat_channel_archives;
CREATE POLICY "Users can view their own channel archive state"
ON chat_channel_archives FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- A user may archive a channel for themselves only if they are (or were) a
-- member of it - reuses the same is_channel_member() helper introduced in
-- supabase_fix_chat_rls.sql, so no recursive sub-query on
-- chat_channel_members is introduced here.
DROP POLICY IF EXISTS "Channel members can archive their own copy" ON chat_channel_archives;
CREATE POLICY "Channel members can archive their own copy"
ON chat_channel_archives FOR INSERT TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND public.is_channel_member(channel_id)
);

-- Unarchiving (re-opening a conversation) is just deleting your own row.
DROP POLICY IF EXISTS "Users can unarchive their own copy" ON chat_channel_archives;
CREATE POLICY "Users can unarchive their own copy"
ON chat_channel_archives FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Admins can see archive state for moderation/support purposes.
DROP POLICY IF EXISTS "Admins have full access to channel archives" ON chat_channel_archives;
CREATE POLICY "Admins have full access to channel archives"
ON chat_channel_archives FOR ALL TO authenticated
USING (public.auth_profile_role() = 'admin')
WITH CHECK (public.auth_profile_role() = 'admin');

-- NOTE (follow-up required, out of scope for this migration):
--   src/api/messaging.ts:archiveConversation() still calls
--     supabase.from('chat_channels').delete().eq('id', id)
--   That needs to change to an upsert into chat_channel_archives (and the
--   conversation list query needs to exclude channels the current user has
--   archived, e.g. via a NOT IN / left-join-is-null against this table).
--   This migration only makes the schema/RLS ready for that change; the
--   application code change is intentionally left for a separate PR.


-- ============================================================================
-- 3. user_blocks has no admin bypass (HIGH)
-- ============================================================================
-- Cause:
--   Unlike other tables (profiles, connections, mentorships, chat_channels,
--   ...), user_blocks only has self-scoped SELECT/INSERT/DELETE policies -
--   no admin/staff FOR ALL bypass - so admins can't look up who has blocked
--   whom when investigating an abuse report.
--
-- Fix:
--   Add an admin bypass FOR ALL policy, matching the pattern used elsewhere
--   (e.g. "Admins have full profile access" / "Admins can manage chat
--   channels"), using the RLS-safe public.auth_profile_role() helper from
--   supabase_fix_profiles_rls.sql instead of a raw sub-query on profiles.
-- ============================================================================
DROP POLICY IF EXISTS "Admins have full access to user blocks" ON user_blocks;
CREATE POLICY "Admins have full access to user blocks"
ON user_blocks FOR ALL TO authenticated
USING (public.auth_profile_role() = 'admin')
WITH CHECK (public.auth_profile_role() = 'admin');


-- ============================================================================
-- 4. Missing indexes (HIGH, performance)
-- ============================================================================
-- Verified against supabase_schema.sql:
--   posts.author_id                       (line ~181, no existing index)
--   connections.requester_id/recipient_id (line ~772-773, no existing index)
--   mentorships.student_id/mentor_id      (line ~796-797, no existing index)
--   moderation_queue.status/campus_code   (lines ~314, ~312, no existing index)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);

CREATE INDEX IF NOT EXISTS idx_connections_requester ON connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_connections_recipient ON connections(recipient_id);

CREATE INDEX IF NOT EXISTS idx_mentorships_student ON mentorships(student_id);
CREATE INDEX IF NOT EXISTS idx_mentorships_mentor ON mentorships(mentor_id);

CREATE INDEX IF NOT EXISTS idx_moderation_queue_status_campus ON moderation_queue(status, campus_code);

NOTIFY pgrst, 'reload schema';
