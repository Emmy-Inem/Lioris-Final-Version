-- ============================================================================
-- Expand saved_items.kind check constraint to support marketplace listings
-- ============================================================================
ALTER TABLE public.saved_items DROP CONSTRAINT IF EXISTS saved_items_kind_check;
ALTER TABLE public.saved_items ADD CONSTRAINT saved_items_kind_check CHECK (kind IN ('post', 'resource', 'event', 'job', 'marketplace'));
