-- Fixes: "Verify student/alumni ID" appears to do nothing from the
-- student's own side, even though the request really is recorded and
-- shows up correctly in the admin Verify Credentials queue.
--
-- Root cause: tr_prevent_profile_role_escalation (added to stop a user
-- from self-granting privileged columns) reverts ANY self-update to
-- verification_status, with no exception. ApplyForVerificationModal's
-- submit flow inserts the verifications row correctly, then tries to set
-- the caller's own profiles.verification_status to 'pending' so the UI can
-- show "Verification Pending Review" - the trigger silently reverts that
-- second write back to its old value every time, so the profile is stuck
-- showing "Verify Student Identity" forever, even after a real request has
-- been filed and is sitting in the admin queue.
--
-- Fix: carve out exactly one self-service transition - unverified/rejected
-- -> pending (i.e. "I'm submitting my documents for review") - while still
-- blocking every other self-update to verification_status, in particular
-- self-granting 'verified' or reverting out of 'pending'/'verified'. Every
-- other protected column (role, is_suspended, trust_score, campus_code) is
-- untouched by this change.

CREATE OR REPLACE FUNCTION prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_role VARCHAR(50);
    v_caller_campus VARCHAR(50);
    v_self_submitting_for_review BOOLEAN;
BEGIN
    SELECT role, campus_code INTO v_caller_role, v_caller_campus
    FROM profiles WHERE id = auth.uid();

    -- Allow Admin full authority over all profiles
    IF v_caller_role = 'admin' THEN
        RETURN NEW;
    END IF;

    -- Allow Campus Staff to update is_suspended and verification_status for users in their same campus or when staff has GLOBAL scope
    IF v_caller_role = 'staff' AND (v_caller_campus = OLD.campus_code OR v_caller_campus = 'GLOBAL' OR OLD.campus_code = 'GLOBAL') THEN
        -- Role and campus code cannot be escalated by staff
        NEW.role := OLD.role;
        NEW.campus_code := OLD.campus_code;
        RETURN NEW;
    END IF;

    -- A user submitting their own verification request is allowed to move
    -- their own row from unverified/rejected to pending - this is not a
    -- privilege grant, just a "my documents are under review now" flag.
    -- Self-granting 'verified' (or any other transition) is still blocked
    -- below like every other protected column.
    v_self_submitting_for_review :=
        NEW.verification_status = 'pending'
        AND OLD.verification_status IN ('unverified', 'rejected');

    -- For regular users / self updates: prevent mutating role, verification, suspension, trust_score, campus_code
    IF (NEW.role IS DISTINCT FROM OLD.role)
       OR (NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NOT v_self_submitting_for_review)
       OR (NEW.is_suspended IS DISTINCT FROM OLD.is_suspended)
       OR (NEW.trust_score IS DISTINCT FROM OLD.trust_score)
       OR (NEW.campus_code IS DISTINCT FROM OLD.campus_code) THEN
        NEW.role := OLD.role;
        IF NOT v_self_submitting_for_review THEN
            NEW.verification_status := OLD.verification_status;
        END IF;
        NEW.is_suspended := OLD.is_suspended;
        NEW.trust_score := OLD.trust_score;
        NEW.campus_code := OLD.campus_code;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
