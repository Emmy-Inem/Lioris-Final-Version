-- Community moderation: lets a community's creator (or an admin-appointed
-- co-moderator) manage their own space - pin/remove posts and comments
-- inside it, and edit its details - without granting them global admin or
-- staff powers. Previously only `profiles.role IN ('admin','staff')` could
-- do any of this (see the "Authors, admins and staff can ... posts"
-- policies below, and PostCard's MODERATOR CONTROLS gate), so a student or
-- alumnus who created a community had no way to keep it tidy or hand
-- moderation to someone else.

-- Who else, besides the creator, can manage a given community.
CREATE TABLE IF NOT EXISTS forum_community_moderators (
    community_id UUID NOT NULL REFERENCES forum_communities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (community_id, user_id)
);

ALTER TABLE forum_community_moderators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers and self can view moderator list" ON forum_community_moderators;
CREATE POLICY "Managers and self can view moderator list" ON forum_community_moderators FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM forum_communities fc WHERE fc.id = community_id AND fc.created_by = auth.uid()) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
DROP POLICY IF EXISTS "Creator or admin can add moderators" ON forum_community_moderators;
CREATE POLICY "Creator or admin can add moderators" ON forum_community_moderators FOR INSERT TO authenticated WITH CHECK (
    added_by = auth.uid() AND (
        EXISTS (SELECT 1 FROM forum_communities fc WHERE fc.id = community_id AND fc.created_by = auth.uid()) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
);
DROP POLICY IF EXISTS "Creator or admin can remove moderators" ON forum_community_moderators;
CREATE POLICY "Creator or admin can remove moderators" ON forum_community_moderators FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM forum_communities fc WHERE fc.id = community_id AND fc.created_by = auth.uid()) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- True when the caller created, or was appointed to moderate, the
-- community that owns this post category. SECURITY DEFINER so it can read
-- forum_communities/forum_community_moderators regardless of the caller's
-- own RLS visibility into those rows (matches the SECURITY DEFINER pattern
-- already used by enforce_post_pin_authority below).
CREATE OR REPLACE FUNCTION is_community_manager(p_category TEXT) RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM forum_communities fc
        WHERE fc.category = p_category
        AND (
            fc.created_by = auth.uid() OR
            EXISTS (
                SELECT 1 FROM forum_community_moderators fm
                WHERE fm.community_id = fc.id AND fm.user_id = auth.uid()
            )
        )
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Posts: extend the existing author/admin/staff authority with community managers.
DROP POLICY IF EXISTS "Authors, admins and staff can update posts" ON posts;
DROP POLICY IF EXISTS "Authors, admins, staff and community managers can update posts" ON posts;
CREATE POLICY "Authors, admins, staff and community managers can update posts" ON posts FOR UPDATE TO authenticated USING (
    auth.uid() = author_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = posts.campus_code))) OR
    is_community_manager(posts.category)
);
DROP POLICY IF EXISTS "Authors, admins and staff can delete posts" ON posts;
DROP POLICY IF EXISTS "Authors, admins, staff and community managers can delete posts" ON posts;
CREATE POLICY "Authors, admins, staff and community managers can delete posts" ON posts FOR DELETE TO authenticated USING (
    auth.uid() = author_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = posts.campus_code))) OR
    is_community_manager(posts.category)
);

-- Let a community manager pin/unpin inside their own community too, same as
-- the admin/campus-staff carve-out this trigger already made for is_pinned.
CREATE OR REPLACE FUNCTION enforce_post_pin_authority() RETURNS TRIGGER AS $$
DECLARE
  actor_role TEXT;
  actor_campus TEXT;
BEGIN
  IF NEW.is_pinned IS DISTINCT FROM OLD.is_pinned THEN
    SELECT role, campus_code INTO actor_role, actor_campus FROM profiles WHERE id = auth.uid();
    IF NOT (
      actor_role = 'admin' OR
      (actor_role = 'staff' AND actor_campus = OLD.campus_code) OR
      is_community_manager(OLD.category)
    ) THEN
      NEW.is_pinned := OLD.is_pinned;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Comments: same extension, joined through the parent post's category.
DROP POLICY IF EXISTS "Authors, admins and staff can update comments" ON post_comments;
DROP POLICY IF EXISTS "Authors, admins, staff and community managers can update comments" ON post_comments;
CREATE POLICY "Authors, admins, staff and community managers can update comments" ON post_comments FOR UPDATE TO authenticated USING (
    auth.uid() = author_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') OR
    EXISTS (SELECT 1 FROM posts p WHERE p.id = post_comments.post_id AND is_community_manager(p.category))
);
DROP POLICY IF EXISTS "Authors, admins and staff can delete comments" ON post_comments;
DROP POLICY IF EXISTS "Authors, admins, staff and community managers can delete comments" ON post_comments;
CREATE POLICY "Authors, admins, staff and community managers can delete comments" ON post_comments FOR DELETE TO authenticated USING (
    auth.uid() = author_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') OR
    EXISTS (SELECT 1 FROM posts p WHERE p.id = post_comments.post_id AND is_community_manager(p.category))
);

-- Let the creator edit their own community's details (label/description/
-- rules/colors/icon), not just admins. approval_status, rejection_reason,
-- category, slug and created_by stay admin-only - the trigger below silently
-- reverts a creator's attempt to change those (mirrors enforce_post_pin_authority):
-- category is the join key to existing posts, so letting it change would
-- silently orphan them, and approval_status must still go through the
-- separate admin review queue.
DROP POLICY IF EXISTS "Admins moderate communities" ON forum_communities;
DROP POLICY IF EXISTS "Admins moderate communities or creator edits details" ON forum_communities;
CREATE POLICY "Admins moderate communities or creator edits details" ON forum_communities FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') OR
    created_by = auth.uid()
);

CREATE OR REPLACE FUNCTION enforce_community_admin_authority() RETURNS TRIGGER AS $$
DECLARE
  actor_role TEXT;
BEGIN
  SELECT role INTO actor_role FROM profiles WHERE id = auth.uid();
  IF actor_role IS DISTINCT FROM 'admin' THEN
    NEW.approval_status := OLD.approval_status;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.category := OLD.category;
    NEW.slug := OLD.slug;
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_community_admin_authority ON forum_communities;
CREATE TRIGGER trg_enforce_community_admin_authority BEFORE UPDATE ON forum_communities FOR EACH ROW EXECUTE FUNCTION enforce_community_admin_authority();
