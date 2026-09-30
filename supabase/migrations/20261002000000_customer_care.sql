-- ============================================================================
-- LIORIS - CUSTOMER CARE: AI SUPPORT CHAT + FEEDBACK CATEGORY
-- ============================================================================
-- support_tickets already exists (20260922155000_admin_support.sql) with full
-- user/admin/staff RLS and an admin triage desk (Support & Resolution Desk).
-- This migration only extends it for the new AI-assisted flow:
--
--   1. 'feedback' joins the category CHECK, alongside the existing 'bug_report' -
--      a dedicated place for "I like/wish this app did X", distinct from a defect
--      report, so admins can tell the two apart without reading every ticket body.
--   2. origin/chat_transcript record how a ticket was created. The AI assistant
--      (supabase/functions/support-ai-chat) is stateless and never writes to the
--      database itself - a conversation lives only in the client's memory unless
--      the AI cannot help, at which point the transcript is embedded verbatim
--      into the ticket it creates. A resolved AI conversation is never persisted
--      at all: nothing to review, nothing extra retained about the user.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_category_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_category_check CHECK (category IN (
    'account_issue',
    'matric_id_correction',
    'campus_transfer',
    'verification_appeal',
    'content_issue',
    'bug_report',
    'feedback',
    'general'
));

ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'user'
  CHECK (origin IN ('user', 'ai_escalation'));
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS chat_transcript TEXT
  CHECK (chat_transcript IS NULL OR char_length(chat_transcript) <= 12000);

NOTIFY pgrst, 'reload schema';

COMMIT;
