-- ==============================================================================
-- Migration: 20261024000000_dynamic_role_permissions_and_platform_governance.sql
-- Description: Dynamic Role Permissions, Configurable Access Governance,
--              and Platform Infrastructure for Super Admin Control.
-- ==============================================================================

-- 1. Create role_permissions table
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL CHECK (role IN ('student', 'alumni', 'staff', 'campus_admin', 'super_admin')),
    permission_key TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    label TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    is_critical BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT role_permission_unique UNIQUE (role, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_key ON public.role_permissions(permission_key);

-- 2. Enable Row Level Security
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Read policy: Any authenticated or anonymous client can query permissions to enforce UI access
DROP POLICY IF EXISTS "Anyone can read role permissions" ON public.role_permissions;
CREATE POLICY "Anyone can read role permissions"
ON public.role_permissions
FOR SELECT
TO authenticated, anon
USING (true);

-- Write policy: Only Super Admin can modify or insert permissions
DROP POLICY IF EXISTS "Super admins can manage role permissions" ON public.role_permissions;
CREATE POLICY "Super admins can manage role permissions"
ON public.role_permissions
FOR ALL
TO authenticated
USING (public.auth_is_super_admin())
WITH CHECK (public.auth_is_super_admin());

-- 3. Seed baseline role permissions
INSERT INTO public.role_permissions (role, permission_key, category, label, description, enabled, is_critical)
VALUES
    -- Student Permissions
    ('student', 'can_post_forum', 'Discussion & Forum', 'Create Forum Threads', 'Publish new discussion topics and questions in campus spaces', true, false),
    ('student', 'can_comment_forum', 'Discussion & Forum', 'Comment & Reply', 'Participate in discussion spaces and comment on peer threads', true, false),
    ('student', 'can_create_spaces', 'Discussion & Forum', 'Propose Spaces', 'Propose new student and departmental communities', true, false),
    ('student', 'can_upload_resources', 'Academic Resources', 'Upload Course Notes & Past Questions', 'Submit academic past questions, course summaries, and lecture notes', true, false),
    ('student', 'can_download_resources', 'Academic Resources', 'Download Academic Materials', 'Read and download verified course notes and study materials', true, false),
    ('student', 'can_review_resources', 'Academic Resources', 'Moderate Academic Submissions', 'Index, approve, or reject student study uploads', false, false),
    ('student', 'can_create_events', 'Campus Events', 'Host Campus Events', 'Publish campus workshops, meetups, seminars, and calendar entries', false, false),
    ('student', 'can_rsvp_events', 'Campus Events', 'Event RSVP & Bookings', 'Register for upcoming campus events and sync personal schedules', true, false),
    ('student', 'can_access_marketplace', 'Commerce & Career', 'Browse Marketplace', 'Explore student-to-student textbooks, tech, and dorm essentials', true, false),
    ('student', 'can_list_marketplace', 'Commerce & Career', 'Sell on Marketplace', 'List personal textbooks and items for sale on campus', true, false),
    ('student', 'can_access_jobs', 'Commerce & Career', 'View Job Opportunities', 'Browse internships, work-study, and graduate employment listings', true, false),
    ('student', 'can_post_jobs', 'Commerce & Career', 'Post Job Openings', 'Publish student jobs and employment opportunities', false, false),
    ('student', 'can_join_study_pods', 'Peer Collaboration', 'Join Study Squads', 'Check in at campus study zones and join active revision groups', true, false),
    ('student', 'can_create_study_pods', 'Peer Collaboration', 'Create Study Squads', 'Form new exam revision hubs for your cohort and course code', true, false),
    ('student', 'can_access_mentorship', 'Peer Collaboration', 'Mentorship Network', 'Seek academic and career mentorship guidance from alumni', true, false),
    ('student', 'can_offer_mentorship', 'Peer Collaboration', 'Offer Mentorship', 'Accept mentee inquiries and guide students', false, false),
    ('student', 'can_send_messages', 'Peer Collaboration', 'Direct Messages', '1-on-1 private messaging with peers and verified mentors', true, false),
    ('student', 'can_moderate_campus', 'Campus Moderation', 'Moderate Campus Content', 'Take action on flagged threads, events, and reports', false, false),
    ('student', 'can_verify_students', 'Campus Moderation', 'ID & Credential Verification', 'Review student ID cards and admission letters', false, false),
    ('student', 'can_broadcast_announcements', 'Campus Moderation', 'Campus Broadcasts', 'Send official broadcasts to student network', false, false),
    ('student', 'can_manage_roles', 'Platform Governance', 'Manage Roles & Campuses', 'Promote users and reassign institutional campuses', false, false),
    ('student', 'can_configure_platform', 'Platform Governance', 'Platform Governance', 'Configure system feature switches and permission matrix', false, false),

    -- Alumni Permissions
    ('alumni', 'can_post_forum', 'Discussion & Forum', 'Create Forum Threads', 'Publish new discussion topics and questions in campus spaces', true, false),
    ('alumni', 'can_comment_forum', 'Discussion & Forum', 'Comment & Reply', 'Participate in discussion spaces and comment on peer threads', true, false),
    ('alumni', 'can_create_spaces', 'Discussion & Forum', 'Propose Spaces', 'Propose new alumni and professional networking spaces', true, false),
    ('alumni', 'can_upload_resources', 'Academic Resources', 'Upload Course Notes & Past Questions', 'Submit professional notes and reference materials', true, false),
    ('alumni', 'can_download_resources', 'Academic Resources', 'Download Academic Materials', 'Read and download verified course notes and study materials', true, false),
    ('alumni', 'can_review_resources', 'Academic Resources', 'Moderate Academic Submissions', 'Index, approve, or reject student study uploads', false, false),
    ('alumni', 'can_create_events', 'Campus Events', 'Host Campus Events', 'Publish alumni talks, reunions, and professional webinars', true, false),
    ('alumni', 'can_rsvp_events', 'Campus Events', 'Event RSVP & Bookings', 'Register for upcoming campus events and sync personal schedules', true, false),
    ('alumni', 'can_access_marketplace', 'Commerce & Career', 'Browse Marketplace', 'Explore student-to-student textbooks, tech, and dorm essentials', true, false),
    ('alumni', 'can_list_marketplace', 'Commerce & Career', 'Sell on Marketplace', 'List personal textbooks and items for sale on campus', true, false),
    ('alumni', 'can_access_jobs', 'Commerce & Career', 'View Job Opportunities', 'Browse internships, work-study, and graduate employment listings', true, false),
    ('alumni', 'can_post_jobs', 'Commerce & Career', 'Post Job Openings', 'Publish career opportunities and graduate roles for students', true, false),
    ('alumni', 'can_join_study_pods', 'Peer Collaboration', 'Join Study Squads', 'Check in at campus study zones and join active revision groups', false, false),
    ('alumni', 'can_create_study_pods', 'Peer Collaboration', 'Create Study Squads', 'Form new exam revision hubs for your cohort and course code', false, false),
    ('alumni', 'can_access_mentorship', 'Peer Collaboration', 'Mentorship Network', 'Browse fellow alumni and student inquiries', true, false),
    ('alumni', 'can_offer_mentorship', 'Peer Collaboration', 'Offer Mentorship', 'Offer mentorship sessions to current undergraduates', true, false),
    ('alumni', 'can_send_messages', 'Peer Collaboration', 'Direct Messages', '1-on-1 private messaging with peers and verified mentors', true, false),
    ('alumni', 'can_moderate_campus', 'Campus Moderation', 'Moderate Campus Content', 'Take action on flagged threads, events, and reports', false, false),
    ('alumni', 'can_verify_students', 'Campus Moderation', 'ID & Credential Verification', 'Review student ID cards and admission letters', false, false),
    ('alumni', 'can_broadcast_announcements', 'Campus Moderation', 'Campus Broadcasts', 'Send official broadcasts to student network', false, false),
    ('alumni', 'can_manage_roles', 'Platform Governance', 'Manage Roles & Campuses', 'Promote users and reassign institutional campuses', false, false),
    ('alumni', 'can_configure_platform', 'Platform Governance', 'Platform Governance', 'Configure system feature switches and permission matrix', false, false),

    -- Staff / Faculty Permissions
    ('staff', 'can_post_forum', 'Discussion & Forum', 'Create Forum Threads', 'Publish faculty bulletins and academic discussions', true, false),
    ('staff', 'can_comment_forum', 'Discussion & Forum', 'Comment & Reply', 'Participate in discussion spaces and answer student queries', true, false),
    ('staff', 'can_create_spaces', 'Discussion & Forum', 'Propose Spaces', 'Create faculty and departmental discussion spaces', true, false),
    ('staff', 'can_upload_resources', 'Academic Resources', 'Upload Course Notes & Past Questions', 'Upload official lecture outlines and syllabus materials', true, false),
    ('staff', 'can_download_resources', 'Academic Resources', 'Download Academic Materials', 'Read and download verified course notes and study materials', true, false),
    ('staff', 'can_review_resources', 'Academic Resources', 'Moderate Academic Submissions', 'Index, approve, or reject student study uploads', true, false),
    ('staff', 'can_create_events', 'Campus Events', 'Host Campus Events', 'Publish departmental seminars, lectures, and exams schedules', true, false),
    ('staff', 'can_rsvp_events', 'Campus Events', 'Event RSVP & Bookings', 'Register for upcoming campus events and sync personal schedules', true, false),
    ('staff', 'can_access_marketplace', 'Commerce & Career', 'Browse Marketplace', 'Explore campus marketplace items', true, false),
    ('staff', 'can_list_marketplace', 'Commerce & Career', 'Sell on Marketplace', 'Sell items on campus marketplace', false, false),
    ('staff', 'can_access_jobs', 'Commerce & Career', 'View Job Opportunities', 'Browse career opportunities and research fellowships', true, false),
    ('staff', 'can_post_jobs', 'Commerce & Career', 'Post Job Openings', 'Publish teaching assistantships and campus research roles', true, false),
    ('staff', 'can_join_study_pods', 'Peer Collaboration', 'Join Study Squads', 'Join study squads', false, false),
    ('staff', 'can_create_study_pods', 'Peer Collaboration', 'Create Study Squads', 'Create study squads', false, false),
    ('staff', 'can_access_mentorship', 'Peer Collaboration', 'Mentorship Network', 'Connect with academic mentees', true, false),
    ('staff', 'can_offer_mentorship', 'Peer Collaboration', 'Offer Mentorship', 'Offer academic advisement and mentorship to students', true, false),
    ('staff', 'can_send_messages', 'Peer Collaboration', 'Direct Messages', '1-on-1 private messaging with students and faculty peers', true, false),
    ('staff', 'can_moderate_campus', 'Campus Moderation', 'Moderate Campus Content', 'Review and action moderation reports for your campus', true, false),
    ('staff', 'can_verify_students', 'Campus Moderation', 'ID & Credential Verification', 'Review and verify student ID submissions for your campus', true, false),
    ('staff', 'can_broadcast_announcements', 'Campus Moderation', 'Campus Broadcasts', 'Publish official administrative bulletins and notifications', true, false),
    ('staff', 'can_manage_roles', 'Platform Governance', 'Manage Roles & Campuses', 'Promote users and reassign institutional campuses', false, false),
    ('staff', 'can_configure_platform', 'Platform Governance', 'Platform Governance', 'Configure system feature switches and permission matrix', false, false),

    -- Campus Admin Permissions
    ('campus_admin', 'can_post_forum', 'Discussion & Forum', 'Create Forum Threads', 'Publish official campus forum topics', true, false),
    ('campus_admin', 'can_comment_forum', 'Discussion & Forum', 'Comment & Reply', 'Participate and moderate forum discussions', true, false),
    ('campus_admin', 'can_create_spaces', 'Discussion & Forum', 'Propose Spaces', 'Create and manage campus spaces', true, false),
    ('campus_admin', 'can_upload_resources', 'Academic Resources', 'Upload Course Notes & Past Questions', 'Upload verified academic resources', true, false),
    ('campus_admin', 'can_download_resources', 'Academic Resources', 'Download Academic Materials', 'Download and audit all academic course materials', true, false),
    ('campus_admin', 'can_review_resources', 'Academic Resources', 'Moderate Academic Submissions', 'Approve, reject, and index campus academic submissions', true, false),
    ('campus_admin', 'can_create_events', 'Campus Events', 'Host Campus Events', 'Publish and feature official campus events', true, false),
    ('campus_admin', 'can_rsvp_events', 'Campus Events', 'Event RSVP & Bookings', 'Register and manage event guest lists', true, false),
    ('campus_admin', 'can_access_marketplace', 'Commerce & Career', 'Browse Marketplace', 'Audit campus marketplace listings', true, false),
    ('campus_admin', 'can_list_marketplace', 'Commerce & Career', 'Sell on Marketplace', 'Sell items on campus marketplace', true, false),
    ('campus_admin', 'can_access_jobs', 'Commerce & Career', 'View Job Opportunities', 'Audit and review job postings', true, false),
    ('campus_admin', 'can_post_jobs', 'Commerce & Career', 'Post Job Openings', 'Publish employment and internship postings', true, false),
    ('campus_admin', 'can_join_study_pods', 'Peer Collaboration', 'Join Study Squads', 'Join and inspect study pods', true, false),
    ('campus_admin', 'can_create_study_pods', 'Peer Collaboration', 'Create Study Squads', 'Create designated study squad hubs', true, false),
    ('campus_admin', 'can_access_mentorship', 'Peer Collaboration', 'Mentorship Network', 'Oversee mentorship interactions', true, false),
    ('campus_admin', 'can_offer_mentorship', 'Peer Collaboration', 'Offer Mentorship', 'Offer leadership mentorship', true, false),
    ('campus_admin', 'can_send_messages', 'Peer Collaboration', 'Direct Messages', 'Direct messaging with campus members', true, false),
    ('campus_admin', 'can_moderate_campus', 'Campus Moderation', 'Moderate Campus Content', 'Full moderation power over campus posts, comments, events, and reports', true, false),
    ('campus_admin', 'can_verify_students', 'Campus Moderation', 'ID & Credential Verification', 'Approve or reject ID card verification requests for your campus', true, false),
    ('campus_admin', 'can_broadcast_announcements', 'Campus Moderation', 'Campus Broadcasts', 'Broadcast urgent and regular notifications to all campus members', true, false),
    ('campus_admin', 'can_manage_roles', 'Platform Governance', 'Manage Roles & Campuses', 'Promote students, alumni, and staff within your campus', true, false),
    ('campus_admin', 'can_configure_platform', 'Platform Governance', 'Platform Governance', 'Configure system feature switches and permission matrix', false, false),

    -- Super Admin Permissions (All enabled, critical controls locked)
    ('super_admin', 'can_post_forum', 'Discussion & Forum', 'Create Forum Threads', 'Publish global and campus forum topics', true, true),
    ('super_admin', 'can_comment_forum', 'Discussion & Forum', 'Comment & Reply', 'Participate across all campus and global threads', true, true),
    ('super_admin', 'can_create_spaces', 'Discussion & Forum', 'Propose Spaces', 'Create and oversee spaces across all universities', true, true),
    ('super_admin', 'can_upload_resources', 'Academic Resources', 'Upload Course Notes & Past Questions', 'Upload national and campus academic resources', true, true),
    ('super_admin', 'can_download_resources', 'Academic Resources', 'Download Academic Materials', 'Unrestricted access to all university academic repositories', true, true),
    ('super_admin', 'can_review_resources', 'Academic Resources', 'Moderate Academic Submissions', 'Approve or reject any resource across all universities', true, true),
    ('super_admin', 'can_create_events', 'Campus Events', 'Host Campus Events', 'Publish national and multi-campus events', true, true),
    ('super_admin', 'can_rsvp_events', 'Campus Events', 'Event RSVP & Bookings', 'Register for any event across all networks', true, true),
    ('super_admin', 'can_access_marketplace', 'Commerce & Career', 'Browse Marketplace', 'Oversee marketplace transactions across all campuses', true, true),
    ('super_admin', 'can_list_marketplace', 'Commerce & Career', 'Sell on Marketplace', 'List marketplace items', true, true),
    ('super_admin', 'can_access_jobs', 'Commerce & Career', 'View Job Opportunities', 'Full visibility over all career postings', true, true),
    ('super_admin', 'can_post_jobs', 'Commerce & Career', 'Post Job Openings', 'Publish national and campus career postings', true, true),
    ('super_admin', 'can_join_study_pods', 'Peer Collaboration', 'Join Study Squads', 'Join and inspect any study hub', true, true),
    ('super_admin', 'can_create_study_pods', 'Peer Collaboration', 'Create Study Squads', 'Form study squads', true, true),
    ('super_admin', 'can_access_mentorship', 'Peer Collaboration', 'Mentorship Network', 'Inspect mentorship connections', true, true),
    ('super_admin', 'can_offer_mentorship', 'Peer Collaboration', 'Offer Mentorship', 'Offer mentorship', true, true),
    ('super_admin', 'can_send_messages', 'Peer Collaboration', 'Direct Messages', 'Platform-wide direct messaging', true, true),
    ('super_admin', 'can_moderate_campus', 'Campus Moderation', 'Moderate Campus Content', 'Global content takedown and moderation power', true, true),
    ('super_admin', 'can_verify_students', 'Campus Moderation', 'ID & Credential Verification', 'Approve or reject any ID verification nationwide', true, true),
    ('super_admin', 'can_broadcast_announcements', 'Campus Moderation', 'Campus Broadcasts', 'Publish national platform broadcasts', true, true),
    ('super_admin', 'can_manage_roles', 'Platform Governance', 'Manage Roles & Campuses', 'Promote, demote, or reassign any user across any campus', true, true),
    ('super_admin', 'can_configure_platform', 'Platform Governance', 'Platform Governance', 'Configure runtime feature switches, system health, and role permissions', true, true)
ON CONFLICT (role, permission_key) DO UPDATE
SET
    category = EXCLUDED.category,
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_critical = EXCLUDED.is_critical;

-- 4. RPC Functions for Super Admin Governance
CREATE OR REPLACE FUNCTION public.admin_set_role_permission(
    p_role TEXT,
    p_permission_key TEXT,
    p_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_super boolean;
    v_is_critical boolean;
    v_updated_row public.role_permissions%ROWTYPE;
BEGIN
    SELECT public.auth_is_super_admin() INTO v_is_super;
    IF NOT COALESCE(v_is_super, false) THEN
        RAISE EXCEPTION 'Access denied: Only a Super Administrator can modify role permissions.'
            USING ERRCODE = '42501';
    END IF;

    -- Guard: Super admin critical permissions cannot be disabled
    SELECT is_critical INTO v_is_critical
    FROM public.role_permissions
    WHERE role = p_role AND permission_key = p_permission_key;

    IF p_role = 'super_admin' AND v_is_critical AND NOT p_enabled THEN
        RAISE EXCEPTION 'Cannot disable critical permissions for the Super Administrator role.'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.role_permissions
    SET
        enabled = p_enabled,
        updated_at = NOW(),
        updated_by = auth.uid()
    WHERE role = p_role AND permission_key = p_permission_key
    RETURNING * INTO v_updated_row;

    IF NOT FOUND THEN
        INSERT INTO public.role_permissions (role, permission_key, category, label, enabled, updated_by)
        VALUES (p_role, p_permission_key, 'Custom', p_permission_key, p_enabled, auth.uid())
        RETURNING * INTO v_updated_row;
    END IF;

    RETURN to_jsonb(v_updated_row);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_role_permission(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_role_permission(TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

-- 5. RPC to reset role permissions to factory baseline
CREATE OR REPLACE FUNCTION public.admin_reset_role_permissions(p_role TEXT DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_super boolean;
BEGIN
    SELECT public.auth_is_super_admin() INTO v_is_super;
    IF NOT COALESCE(v_is_super, false) THEN
        RAISE EXCEPTION 'Access denied: Only a Super Administrator can reset role permissions.'
            USING ERRCODE = '42501';
    END IF;

    IF p_role IS NULL OR p_role = 'student' THEN
        UPDATE public.role_permissions SET enabled = true WHERE role = 'student' AND permission_key IN ('can_post_forum', 'can_comment_forum', 'can_create_spaces', 'can_upload_resources', 'can_download_resources', 'can_rsvp_events', 'can_access_marketplace', 'can_list_marketplace', 'can_access_jobs', 'can_join_study_pods', 'can_create_study_pods', 'can_access_mentorship', 'can_send_messages');
        UPDATE public.role_permissions SET enabled = false WHERE role = 'student' AND permission_key IN ('can_review_resources', 'can_create_events', 'can_post_jobs', 'can_offer_mentorship', 'can_moderate_campus', 'can_verify_students', 'can_broadcast_announcements', 'can_manage_roles', 'can_configure_platform');
    END IF;

    IF p_role IS NULL OR p_role = 'alumni' THEN
        UPDATE public.role_permissions SET enabled = true WHERE role = 'alumni' AND permission_key NOT IN ('can_review_resources', 'can_join_study_pods', 'can_create_study_pods', 'can_moderate_campus', 'can_verify_students', 'can_broadcast_announcements', 'can_manage_roles', 'can_configure_platform');
        UPDATE public.role_permissions SET enabled = false WHERE role = 'alumni' AND permission_key IN ('can_review_resources', 'can_join_study_pods', 'can_create_study_pods', 'can_moderate_campus', 'can_verify_students', 'can_broadcast_announcements', 'can_manage_roles', 'can_configure_platform');
    END IF;

    IF p_role IS NULL OR p_role = 'staff' THEN
        UPDATE public.role_permissions SET enabled = true WHERE role = 'staff' AND permission_key NOT IN ('can_list_marketplace', 'can_join_study_pods', 'can_create_study_pods', 'can_manage_roles', 'can_configure_platform');
        UPDATE public.role_permissions SET enabled = false WHERE role = 'staff' AND permission_key IN ('can_list_marketplace', 'can_join_study_pods', 'can_create_study_pods', 'can_manage_roles', 'can_configure_platform');
    END IF;

    IF p_role IS NULL OR p_role = 'campus_admin' THEN
        UPDATE public.role_permissions SET enabled = true WHERE role = 'campus_admin' AND permission_key <> 'can_configure_platform';
        UPDATE public.role_permissions SET enabled = false WHERE role = 'campus_admin' AND permission_key = 'can_configure_platform';
    END IF;

    IF p_role IS NULL OR p_role = 'super_admin' THEN
        UPDATE public.role_permissions SET enabled = true WHERE role = 'super_admin';
    END IF;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_role_permissions(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_role_permissions(TEXT) TO authenticated, service_role;

-- 6. Ensure platform_settings table has read policy for non-secret keys
DROP POLICY IF EXISTS "Public read non-secret platform settings" ON public.platform_settings;
CREATE POLICY "Public read non-secret platform settings"
ON public.platform_settings
FOR SELECT
TO authenticated, anon
USING (NOT public.is_secret_setting_key(key));
