-- ============================================================================
-- LIORIS - ADMIN SUPPORT & GOVERNANCE MIGRATION 2026
-- ============================================================================
-- Fixes in this migration:
--   1. Creates the support_tickets table for in-app user support and ticket
--      resolution (decoupling user help requests from moderation reports).
--   2. Sets up full RLS policies for user submission/viewing and admin/staff triage.
--   3. Adds missing admin DELETE policies on verifications, moderation_queue,
--      waitlist_entries, and chat_channel_members.
--   4. Adds performance indexes and schema reload notification.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SUPPORT TICKETS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN (
        'account_issue',
        'matric_id_correction',
        'campus_transfer',
        'verification_appeal',
        'content_issue',
        'bug_report',
        'general'
    )),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
        'open',
        'in_progress',
        'resolved',
        'closed'
    )),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN (
        'low',
        'medium',
        'high',
        'urgent'
    )),
    admin_notes TEXT,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for lightning fast admin filtering
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON public.support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON public.support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON public.support_tickets(category);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER tr_support_tickets_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.handle_support_tickets_updated_at();

-- ----------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY ON SUPPORT TICKETS
-- ----------------------------------------------------------------------------
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Regular users can view their own submitted tickets
DROP POLICY IF EXISTS "Users can view own support tickets" ON public.support_tickets;
CREATE POLICY "Users can view own support tickets"
ON public.support_tickets FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Regular users can submit support tickets
DROP POLICY IF EXISTS "Users can insert own support tickets" ON public.support_tickets;
CREATE POLICY "Users can insert own support tickets"
ON public.support_tickets FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Admins have full access to view, update, triage, and delete all support tickets
DROP POLICY IF EXISTS "Admins have full access to support tickets" ON public.support_tickets;
CREATE POLICY "Admins have full access to support tickets"
ON public.support_tickets FOR ALL TO authenticated
USING (public.auth_profile_role() = 'admin')
WITH CHECK (public.auth_profile_role() = 'admin');

-- Staff can view and update support tickets submitted by users in their campus
DROP POLICY IF EXISTS "Staff can manage campus support tickets" ON public.support_tickets;
CREATE POLICY "Staff can manage campus support tickets"
ON public.support_tickets FOR ALL TO authenticated
USING (
    public.auth_profile_role() = 'staff'
    AND (
        EXISTS (
            SELECT 1 FROM public.profiles p_user, public.profiles p_staff
            WHERE p_user.id = support_tickets.user_id
              AND p_staff.id = auth.uid()
              AND (p_staff.campus_code = p_user.campus_code OR p_staff.campus_code = 'GLOBAL')
        )
    )
)
WITH CHECK (
    public.auth_profile_role() = 'staff'
    AND (
        EXISTS (
            SELECT 1 FROM public.profiles p_user, public.profiles p_staff
            WHERE p_user.id = support_tickets.user_id
              AND p_staff.id = auth.uid()
              AND (p_staff.campus_code = p_user.campus_code OR p_staff.campus_code = 'GLOBAL')
        )
    )
);

-- ----------------------------------------------------------------------------
-- 3. MISSING ADMIN DELETE POLICIES
-- ----------------------------------------------------------------------------

-- Admin delete on verifications
DROP POLICY IF EXISTS "Admins can delete verifications" ON public.verifications;
CREATE POLICY "Admins can delete verifications"
ON public.verifications FOR DELETE TO authenticated
USING (public.auth_profile_role() = 'admin');

-- Admin delete on moderation_queue
DROP POLICY IF EXISTS "Admins can delete moderation queue entries" ON public.moderation_queue;
CREATE POLICY "Admins can delete moderation queue entries"
ON public.moderation_queue FOR DELETE TO authenticated
USING (public.auth_profile_role() = 'admin');

-- Admin delete on waitlist_entries
DROP POLICY IF EXISTS "Admins can delete waitlist entries" ON public.waitlist_entries;
CREATE POLICY "Admins can delete waitlist entries"
ON public.waitlist_entries FOR DELETE TO authenticated
USING (public.auth_profile_role() = 'admin');

-- Admin delete on chat_channel_members
DROP POLICY IF EXISTS "Admins can remove members from chat channels" ON public.chat_channel_members;
CREATE POLICY "Admins can remove members from chat channels"
ON public.chat_channel_members FOR DELETE TO authenticated
USING (public.auth_profile_role() = 'admin');

-- ----------------------------------------------------------------------------
-- 4. NOTIFY SCHEMA RELOAD
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
