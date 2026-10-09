-- ============================================================================
-- LIORIS - PROFILE MEDIA, CHAT ATTACHMENTS & LEARNER GAP FIXES
-- ============================================================================
-- 1. Profiles banner URL:
--    uploadCoverImage (src/api/profile.ts) saves to the private `campus-media`
--    bucket, persisting the stable storage path "<uid>/cover_<ts>.ext" which
--    components resolve to signed URLs on read via useSignedUrl.
--    chk_profiles_banner_url_url_scheme previously demanded ^https?://, which
--    caused Postgres to reject every cover upload with code 23514.
--    Relax constraint to accept http(s), asset:, the "<uid>/<file>" storage path,
--    and stock banner preset keys.
--
-- 2. Profiles avatar URL:
--    uploadAvatarImage and preset avatars can store either http(s) URLs,
--    bare storage paths "<uid>/avatar_<ts>.ext", or preset keys (avatar_female, etc.).
--    chk_profiles_avatar_url_url_scheme previously rejected bare paths and preset keys.
--    Relax constraint to accept http(s), asset:, the storage path shape, and preset keys.
--
-- 3. Chat messages media URL:
--    sendMessage (src/api/messaging.ts) uploads media to the private `resources`
--    bucket and persists the storage path "<uid>/<file>".
--    chk_chat_messages_media_url_url_scheme previously rejected bare paths.
--    Relax constraint to accept storage paths.
--
-- 4. Resources file URL:
--    Relax chk_resources_file_url_url_scheme to accept storage paths as well as
--    full http(s) URLs so both bare storage references and hosted links work.
--
-- Safe and idempotent to run multiple times.
-- ============================================================================

BEGIN;

-- 1. profiles.banner_url
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_banner_url_url_scheme;
ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_banner_url_url_scheme CHECK (
  banner_url IS NULL
  OR banner_url ~* '^https?://'
  OR banner_url ~* '^asset:'
  OR banner_url ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9_.-]+$'
  OR banner_url ~ '^[A-Za-z0-9_-]+$'
);

-- 2. profiles.avatar_url
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_avatar_url_url_scheme;
ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_avatar_url_url_scheme CHECK (
  avatar_url IS NULL
  OR avatar_url ~* '^https?://'
  OR avatar_url ~* '^asset:'
  OR avatar_url ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9_.-]+$'
  OR avatar_url ~ '^[A-Za-z0-9_-]+$'
);

-- 3. chat_messages.media_url
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chk_chat_messages_media_url_url_scheme;
ALTER TABLE public.chat_messages ADD CONSTRAINT chk_chat_messages_media_url_url_scheme CHECK (
  media_url IS NULL
  OR media_url ~* '^https?://'
  OR media_url ~* '^asset:'
  OR media_url ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9_.-]+$'
);

-- 4. resources.file_url
ALTER TABLE public.resources DROP CONSTRAINT IF EXISTS chk_resources_file_url_url_scheme;
ALTER TABLE public.resources ADD CONSTRAINT chk_resources_file_url_url_scheme CHECK (
  file_url IS NULL
  OR file_url ~* '^https?://'
  OR file_url ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9_.-]+$'
);

COMMIT;
