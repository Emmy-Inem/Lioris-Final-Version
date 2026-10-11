-- Fix: "invalid input value for enum verification_status_type: 'none'" raised on EVERY profile update by
-- a regular user (onboarding Continue failed -> department never saved -> onboarding loop).
-- Cause: enum column compared against the literal 'none' (not an enum member). Cast to text.
BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_role VARCHAR(50);
    v_caller_admin_role VARCHAR(50);
    v_caller_campus VARCHAR(50);
    v_caller_email TEXT;
    v_domain_campus TEXT;
    v_self_submitting_verification BOOLEAN;
BEGIN
    -- Allow direct database migrations / service_role
    IF auth.uid() IS NULL OR auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    SELECT LOWER(COALESCE(role::text, '')),
           COALESCE(admin_role, ''),
           COALESCE(campus_code, ''),
           LOWER(COALESCE(email, ''))
    INTO v_caller_role, v_caller_admin_role, v_caller_campus, v_caller_email 
    FROM public.profiles WHERE id = auth.uid();

    -- Root Super Admin (inememmanuel@gmail.com or super_admin) retains absolute authority
    IF (v_caller_role = 'admin' AND v_caller_admin_role = 'super_admin')
       OR v_caller_email = 'inememmanuel@gmail.com' THEN
        RETURN NEW;
    END IF;

    -- Protect Super Admin accounts from being modified by ANY non-super admin
    IF (OLD.admin_role = 'super_admin' OR LOWER(COALESCE(OLD.email, '')) = 'inememmanuel@gmail.com') THEN
        NEW.role := OLD.role;
        NEW.admin_role := OLD.admin_role;
        NEW.campus_code := OLD.campus_code;
        NEW.is_suspended := OLD.is_suspended;
        NEW.suspension_reason := OLD.suspension_reason;
        NEW.trust_score := OLD.trust_score;
        NEW.verification_status := OLD.verification_status;
        NEW.is_campus_ambassador := OLD.is_campus_ambassador;
        RETURN NEW;
    END IF;

    -- Campus Admin authority: strictly scoped to non-admins on their own campus node
    IF v_caller_role = 'admin' AND (v_caller_admin_role = 'campus_admin' OR v_caller_admin_role IS NULL) THEN
        -- Cannot modify other admins or promote anyone to admin / change admin_role
        IF OLD.role::text = 'admin' OR NEW.role::text = 'admin' OR (NEW.admin_role IS DISTINCT FROM OLD.admin_role) THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_suspended := OLD.is_suspended;
            NEW.suspension_reason := OLD.suspension_reason;
            NEW.trust_score := OLD.trust_score;
            NEW.verification_status := OLD.verification_status;
            RETURN NEW;
        END IF;

        -- Cannot transfer users across campuses
        IF NEW.campus_code IS DISTINCT FROM OLD.campus_code THEN
            NEW.campus_code := OLD.campus_code;
        END IF;

        -- If target is outside their campus, prevent moderating
        IF v_caller_campus IS NOT NULL AND v_caller_campus <> 'GLOBAL' AND OLD.campus_code <> v_caller_campus THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_suspended := OLD.is_suspended;
            NEW.suspension_reason := OLD.suspension_reason;
            NEW.trust_score := OLD.trust_score;
            NEW.verification_status := OLD.verification_status;
            NEW.is_campus_ambassador := OLD.is_campus_ambassador;
            RETURN NEW;
        END IF;

        RETURN NEW;
    END IF;

    -- Campus Staff authority
    IF v_caller_role = 'staff' THEN
        IF OLD.role::text IN ('admin', 'staff') THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_suspended := OLD.is_suspended;
            NEW.suspension_reason := OLD.suspension_reason;
            NEW.trust_score := OLD.trust_score;
            NEW.verification_status := OLD.verification_status;
            RETURN NEW;
        END IF;

        IF (v_caller_campus = OLD.campus_code OR v_caller_campus = 'GLOBAL' OR OLD.campus_code = 'GLOBAL') THEN
            NEW.role := OLD.role;
            NEW.admin_role := OLD.admin_role;
            NEW.campus_code := OLD.campus_code;
            NEW.is_campus_ambassador := OLD.is_campus_ambassador;
            RETURN NEW;
        END IF;
    END IF;

    -- Regular users (self-updates):
    -- 1. Role and admin_role can NEVER be changed by regular user
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        NEW.role := OLD.role;
    END IF;
    IF NEW.admin_role IS DISTINCT FROM OLD.admin_role THEN
        NEW.admin_role := OLD.admin_role;
    END IF;

    -- 2. Suspension and trust_score can NEVER be changed by regular user
    IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
        NEW.is_suspended := OLD.is_suspended;
    END IF;
    IF NEW.trust_score IS DISTINCT FROM OLD.trust_score THEN
        NEW.trust_score := OLD.trust_score;
    END IF;

    -- 3. Campus Ambassador can NEVER be self-assigned
    IF NEW.is_campus_ambassador IS DISTINCT FROM OLD.is_campus_ambassador THEN
        NEW.is_campus_ambassador := OLD.is_campus_ambassador;
    END IF;

    -- 4. Verification Status:
    -- User can ONLY submit for verification (unverified/none/rejected -> pending)
    v_self_submitting_verification := (
        NEW.verification_status::text = 'pending'
        AND (OLD.verification_status IS NULL OR OLD.verification_status::text IN ('none', 'unverified', 'rejected'))
    );
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NOT v_self_submitting_verification THEN
        NEW.verification_status := OLD.verification_status;
    END IF;

    -- 5. Campus Code:
    -- Allow updating campus_code if:
    --  a) OLD.campus_code is NULL or 'GLOBAL' (initial onboarding or unassigned), OR
    --  b) User is not domain-verified (personal email student choosing/updating their university).
    -- If user has an official institutional email matching a domain, lock to that domain.
    IF NEW.campus_code IS DISTINCT FROM OLD.campus_code THEN
        -- Target campus must be a valid active campus or 'GLOBAL'
        IF NEW.campus_code IS NOT NULL AND NEW.campus_code <> 'GLOBAL' AND NOT EXISTS (SELECT 1 FROM public.campuses WHERE code = NEW.campus_code AND is_active = true) THEN
            NEW.campus_code := OLD.campus_code;
        ELSE
            -- Check if user is verified with official institutional domain
            IF OLD.verification_status::text = 'verified' AND OLD.email IS NOT NULL THEN
                BEGIN
                    v_domain_campus := public.campus_for_email(OLD.email);
                EXCEPTION WHEN OTHERS THEN
                    v_domain_campus := NULL;
                END;
                IF v_domain_campus IS NOT NULL AND v_domain_campus <> NEW.campus_code THEN
                    NEW.campus_code := OLD.campus_code;
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS tr_prevent_profile_role_escalation ON public.profiles;
DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER tr_prevent_profile_role_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_escalation();

COMMIT;

