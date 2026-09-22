-- src/api/communities.ts calls this through supabase.rpc() (PostDetailScreen's
-- single-post view, where fetching the bulk "categories I manage" set the feed
-- uses isn't worth it for just one post) - match the explicit GRANT convention
-- every other RPC'd function in this schema already follows.
GRANT EXECUTE ON FUNCTION public.is_community_manager(TEXT) TO authenticated;
