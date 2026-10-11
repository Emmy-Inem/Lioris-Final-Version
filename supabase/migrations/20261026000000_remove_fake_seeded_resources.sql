-- Remove the 10 placeholder "resources" seeded by 20261022000000 section 12.
-- Their file_url points at storage objects (resources/academic_docs/*.pdf) that were never
-- uploaded, so opening or downloading them returns {"error":"Bucket not found"} / "No preview".
-- The match is deliberately narrow: only rows whose file_url is under that exact seeded path.
-- Real uploads live under <user-id>/..., and the genuine FUNAAB/NOUN seeds use external https URLs,
-- so neither is touched.
BEGIN;

DELETE FROM public.resources
WHERE file_url LIKE 'https://fdtnbluslkabwsmspbem.supabase.co/storage/v1/object/public/resources/academic_docs/%';

COMMIT;
