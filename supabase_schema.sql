-- ============================================================================
-- LIORIS PLATFORM FULL DATABASE SCHEMA
-- Target Database: Supabase PostgreSQL
-- URL: https://fdtnbluslkabwsmspbem.supabase.co
-- ============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Custom Enumerated Types
DO $$ BEGIN
    CREATE TYPE user_role_type AS ENUM ('student', 'staff', 'alumni', 'admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE verification_status_type AS ENUM ('unverified', 'pending', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE visibility_scope_type AS ENUM ('campus', 'global');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE event_status_type AS ENUM ('upcoming', 'ongoing', 'completed', 'cancelled', 'pending_approval');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE resource_type_enum AS ENUM ('past_question', 'lecture_note', 'handout', 'textbook', 'syllabus', 'exam_guide');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE moderation_item_type AS ENUM ('post', 'comment', 'event', 'resource', 'user_profile');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE moderation_status_type AS ENUM ('pending', 'approved', 'rejected', 'escalated');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 3. CORE INSTITUTIONS & CAMPUSES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS campuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    location TEXT,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#2563EB',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default institutions
INSERT INTO campuses (code, name, short_name, location, primary_color)
VALUES 
    ('GLOBAL', 'Lioris Global Network', 'Global', 'Worldwide', '#2563EB'),
    ('UNILAG', 'University of Lagos', 'UNILAG', 'Akoka, Lagos', '#1E40AF'),
    ('UI', 'University of Ibadan', 'UI', 'Ibadan, Oyo', '#047857'),
    ('UNN', 'University of Nigeria Nsukka', 'UNN', 'Nsukka, Enugu', '#B45309'),
    ('OAU', 'Obafemi Awolowo University', 'OAU', 'Ile-Ife, Osun', '#7C3AED'),
    ('CU', 'Covenant University', 'CU', 'Ota, Ogun', '#DC2626')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 4. USER PROFILES TABLE (Linked to auth.users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE,
    role user_role_type DEFAULT 'student',
    campus_code TEXT REFERENCES campuses(code) ON DELETE SET NULL,
    department TEXT,
    faculty TEXT,
    level TEXT,
    bio TEXT,
    interests TEXT[] DEFAULT '{}',
    avatar_url TEXT,
    banner_url TEXT,
    student_id_number TEXT,
    push_token TEXT,
    verification_status verification_status_type DEFAULT 'unverified',
    custom_accent_color TEXT DEFAULT '#2563EB',
    trust_score NUMERIC(5,2) DEFAULT 80.00,
    is_suspended BOOLEAN DEFAULT FALSE,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for speedy lookups
CREATE INDEX IF NOT EXISTS idx_profiles_campus ON profiles(campus_code);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- ============================================================================
-- 4B. USER BLOCKS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);


-- Ensure Root Admin Account Exists with Admin Privileges
-- (inememmanuel@gmail.com is configured as Platform Root Admin)
CREATE OR REPLACE FUNCTION handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
    detected_campus TEXT;
BEGIN
    detected_campus := COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'campus_code', ''),
        CASE 
            WHEN NEW.email ILIKE '%unilag.edu.ng' THEN 'UNILAG'
            WHEN NEW.email ILIKE '%ui.edu.ng' THEN 'UI'
            WHEN NEW.email ILIKE '%funaab.edu.ng' OR NEW.email ILIKE '%unaab.edu.ng' THEN 'FUNAAB'
            WHEN NEW.email ILIKE '%unn.edu.ng' THEN 'UNN'
            WHEN NEW.email ILIKE '%oauife.edu.ng' THEN 'OAU'
            WHEN NEW.email ILIKE '%covenantuniversity.edu.ng' THEN 'CU'
            ELSE 'GLOBAL'
        END
    );

    INSERT INTO profiles (
        id, 
        email, 
        full_name, 
        role, 
        campus_code, 
        verification_status
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        CASE 
            WHEN NEW.email = 'inememmanuel@gmail.com' THEN 'admin'::user_role_type
            WHEN NEW.raw_user_meta_data->>'role' = 'alumni' THEN 'alumni'::user_role_type
            ELSE 'student'::user_role_type
        END,
        detected_campus,
        CASE 
            WHEN NEW.email = 'inememmanuel@gmail.com' THEN 'verified'::verification_status_type
            ELSE 'unverified'::verification_status_type
        END
    )
    ON CONFLICT (id) DO UPDATE SET
        role = CASE WHEN NEW.email = 'inememmanuel@gmail.com' THEN 'admin'::user_role_type ELSE profiles.role END,
        verification_status = CASE WHEN NEW.email = 'inememmanuel@gmail.com' THEN 'verified'::verification_status_type ELSE profiles.verification_status END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile on auth signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user_profile();

-- ============================================================================
-- 5. POSTS & COMMUNITY FEED TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    campus_code TEXT NOT NULL REFERENCES campuses(code) ON DELETE CASCADE,
    visibility_scope visibility_scope_type DEFAULT 'campus',
    title TEXT,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    image_url TEXT,
    video_url TEXT,
    poll_data JSONB,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    reposts_count INTEGER DEFAULT 0,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_flagged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_campus ON posts(campus_code);
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON posts(visibility_scope);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);

-- Likes Table
CREATE TABLE IF NOT EXISTS post_likes (
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

-- Comments Table
CREATE TABLE IF NOT EXISTS post_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    likes_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 6. CAMPUS & GLOBAL EVENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    campus_code TEXT NOT NULL REFERENCES campuses(code) ON DELETE CASCADE,
    visibility_scope visibility_scope_type DEFAULT 'campus',
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT DEFAULT 'Academic',
    venue TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    banner_url TEXT,
    capacity INTEGER,
    registered_count INTEGER DEFAULT 0,
    is_spotlight BOOLEAN DEFAULT FALSE,
    status event_status_type DEFAULT 'upcoming',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_campus ON events(campus_code);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_spotlight ON events(is_spotlight) WHERE is_spotlight = TRUE;

-- Event Attendees Table
CREATE TABLE IF NOT EXISTS event_attendees (
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    ticket_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (event_id, user_id)
);

-- ============================================================================
-- 7. ACADEMIC RESOURCES & REVIEW QUEUE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    campus_code TEXT NOT NULL REFERENCES campuses(code) ON DELETE CASCADE,
    course_code TEXT NOT NULL,
    course_title TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    resource_type resource_type_enum DEFAULT 'lecture_note',
    file_url TEXT NOT NULL,
    file_size_bytes BIGINT DEFAULT 0,
    file_mime_type TEXT,
    semester TEXT DEFAULT 'First Semester',
    academic_year TEXT DEFAULT '2025/2026',
    downloads_count INTEGER DEFAULT 0,
    upvotes_count INTEGER DEFAULT 0,
    is_approved BOOLEAN DEFAULT FALSE,
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resources_course ON resources(course_code);
CREATE INDEX IF NOT EXISTS idx_resources_campus ON resources(campus_code);
CREATE INDEX IF NOT EXISTS idx_resources_approved ON resources(is_approved);

-- ============================================================================
-- 8. VERIFICATION APPLICATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    campus_code TEXT NOT NULL REFERENCES campuses(code) ON DELETE CASCADE,
    requested_role user_role_type NOT NULL,
    id_card_front_url TEXT NOT NULL,
    id_card_back_url TEXT,
    selfie_url TEXT,
    status moderation_status_type DEFAULT 'pending',
    reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    review_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 9. MODERATION QUEUE & AUDIT LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS moderation_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_type moderation_item_type NOT NULL,
    item_id UUID NOT NULL,
    reporter_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    campus_code TEXT NOT NULL REFERENCES campuses(code) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status moderation_status_type DEFAULT 'pending',
    assigned_admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action_taken TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 10. STUDY GROUPS & WORKSPACES
-- ============================================================================
CREATE TABLE IF NOT EXISTS study_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    campus_code TEXT NOT NULL REFERENCES campuses(code) ON DELETE CASCADE,
    name TEXT NOT NULL,
    course_code TEXT NOT NULL,
    description TEXT,
    meeting_link TEXT,
    max_members INTEGER DEFAULT 20,
    is_private BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_group_members (
    group_id UUID REFERENCES study_groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

-- ============================================================================
-- 11. REAL-TIME CHAT CHANNELS & MESSAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    is_direct_message BOOLEAN DEFAULT FALSE,
    campus_code TEXT REFERENCES campuses(code) ON DELETE SET NULL,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_channel_members (
    channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    media_url TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_channel_members(user_id);

-- Auto-enroll channel creator into chat_channel_members
CREATE OR REPLACE FUNCTION handle_new_chat_channel()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_by IS NOT NULL THEN
        INSERT INTO chat_channel_members (channel_id, user_id)
        VALUES (NEW.id, NEW.created_by)
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_chat_channel_created ON chat_channels;
CREATE TRIGGER on_chat_channel_created
    AFTER INSERT ON chat_channels
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_chat_channel();

-- ============================================================================
-- 12. NOTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT DEFAULT 'system',
    action_url TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id);

ALTER TABLE campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentorships ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

-- Campuses: Public Read, Admin Full Management
CREATE POLICY "Campuses are viewable by everyone" ON campuses FOR SELECT USING (true);
CREATE POLICY "Admins have full campus management access" ON campuses FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- User Blocks: Self Read/Insert/Delete
CREATE POLICY "Users can view their own block list" ON user_blocks FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "Users can block other users" ON user_blocks FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "Users can unblock users" ON user_blocks FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- Profiles: Public Read, Self Insert/Update (Protected against role/verification/suspension/campus escalation), Admin Full Access
CREATE OR REPLACE FUNCTION prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
    -- If role, verification_status, is_suspended, trust_score, or campus_code is modified by non-admin
    IF (NEW.role IS DISTINCT FROM OLD.role)
       OR (NEW.verification_status IS DISTINCT FROM OLD.verification_status)
       OR (NEW.is_suspended IS DISTINCT FROM OLD.is_suspended)
       OR (NEW.trust_score IS DISTINCT FROM OLD.trust_score)
       OR (NEW.campus_code IS DISTINCT FROM OLD.campus_code) THEN
        IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
            NEW.role := OLD.role;
            NEW.verification_status := OLD.verification_status;
            NEW.is_suspended := OLD.is_suspended;
            NEW.trust_score := OLD.trust_score;
            NEW.campus_code := OLD.campus_code;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_prevent_profile_role_escalation ON profiles;
CREATE TRIGGER tr_prevent_profile_role_escalation
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION prevent_profile_role_escalation();

CREATE POLICY "Profiles viewable by same campus or global or self or admin" ON profiles FOR SELECT TO authenticated USING (
    auth.uid() = id OR
    campus_code = 'GLOBAL' OR
    campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid()) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated 
USING (auth.uid() = id)
WITH CHECK (
    auth.uid() = id AND (
        (
            role = (SELECT role FROM profiles WHERE id = auth.uid()) AND
            campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid()) AND
            is_suspended = (SELECT is_suspended FROM profiles WHERE id = auth.uid()) AND
            trust_score = (SELECT trust_score FROM profiles WHERE id = auth.uid()) AND
            verification_status = (SELECT verification_status FROM profiles WHERE id = auth.uid())
        ) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
);
CREATE POLICY "Admins have full profile access" ON profiles FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Posts: Viewable by campus scope or global
CREATE POLICY "Posts viewable by campus or global" ON posts FOR SELECT TO authenticated USING (
    visibility_scope = 'global' OR 
    campus_code = 'GLOBAL' OR
    campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid()) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);
CREATE POLICY "Authenticated users can create posts" ON posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors, admins and staff can update posts" ON posts FOR UPDATE TO authenticated USING (
    auth.uid() = author_id OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = posts.campus_code)))
);
CREATE POLICY "Authors, admins and staff can delete posts" ON posts FOR DELETE TO authenticated USING (
    auth.uid() = author_id OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = posts.campus_code)))
);

-- Post Likes
CREATE POLICY "Post likes are viewable by authenticated users" ON post_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can like posts" ON post_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike posts" ON post_likes FOR DELETE TO authenticated USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Post Comments
CREATE POLICY "Post comments are viewable by authenticated users" ON post_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can comment on posts" ON post_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors, admins and staff can update comments" ON post_comments FOR UPDATE TO authenticated USING (
    auth.uid() = author_id OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Authors, admins and staff can delete comments" ON post_comments FOR DELETE TO authenticated USING (
    auth.uid() = author_id OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Events: Viewable by campus scope or global
CREATE POLICY "Events viewable by campus or global" ON events FOR SELECT TO authenticated USING (
    visibility_scope = 'global' OR
    campus_code = 'GLOBAL' OR
    campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid()) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);
CREATE POLICY "Users can create events" ON events FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators, admins and staff can modify events" ON events FOR UPDATE TO authenticated USING (
    auth.uid() = creator_id OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = events.campus_code)))
);
CREATE POLICY "Creators, admins and staff can delete events" ON events FOR DELETE TO authenticated USING (
    auth.uid() = creator_id OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = events.campus_code)))
);

-- Event Attendees
CREATE POLICY "Event attendees viewable by authenticated users" ON event_attendees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can RSVP to events" ON event_attendees FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can cancel RSVP" ON event_attendees FOR DELETE TO authenticated USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Resources
CREATE POLICY "Resources viewable if approved and matching campus or global or owner or admin or staff" ON resources FOR SELECT TO authenticated USING (
    (
        is_approved = TRUE AND (
            campus_code = 'GLOBAL' OR
            campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid())
        )
    ) OR 
    uploader_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = resources.campus_code)))
);
CREATE POLICY "Users can upload resources" ON resources FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploader_id);
CREATE POLICY "Admins and staff can approve and manage resources" ON resources FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = resources.campus_code)))
);

-- Verifications
CREATE POLICY "Users can view own verification requests, admins view all" ON verifications FOR SELECT TO authenticated USING (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can submit verification requests" ON verifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins and staff can update verification status" ON verifications FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = verifications.campus_code)))
);

-- Moderation Queue & Reports
CREATE POLICY "Users can view their own reports, admins and staff view all" ON moderation_queue FOR SELECT TO authenticated USING (
    reporter_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = moderation_queue.campus_code)))
);
CREATE POLICY "Users can submit reports" ON moderation_queue FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Admins and staff can resolve reports" ON moderation_queue FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = moderation_queue.campus_code)))
);

-- Audit Logs (Strict Admin / Staff only)
CREATE POLICY "Admins and staff can view audit logs" ON audit_logs FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);
CREATE POLICY "Admins and staff can create audit log entries" ON audit_logs FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = actor_id AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);

-- Study Groups
CREATE POLICY "Study groups viewable by campus or global" ON study_groups FOR SELECT TO authenticated USING (
    campus_code = 'GLOBAL' OR
    campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid()) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);
CREATE POLICY "Users can create study groups" ON study_groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators, admins and staff can update study groups" ON study_groups FOR UPDATE TO authenticated USING (
    auth.uid() = creator_id OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = study_groups.campus_code)))
);
CREATE POLICY "Creators, admins and staff can delete study groups" ON study_groups FOR DELETE TO authenticated USING (
    auth.uid() = creator_id OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = study_groups.campus_code)))
);

-- Study Group Members
CREATE POLICY "Study group members viewable by authenticated users" ON study_group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can join study groups" ON study_group_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave study groups" ON study_group_members FOR DELETE TO authenticated USING (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Chat Channels & Membership (Strict Privacy)
CREATE POLICY "Users can view channels they belong to" ON chat_channels FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = chat_channels.id AND user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Authenticated users can create chat channels" ON chat_channels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can manage chat channels" ON chat_channels FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Channel members viewable by channel participants" ON chat_channel_members FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM chat_channel_members m WHERE m.channel_id = chat_channel_members.channel_id AND m.user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can join or add members to channels" ON chat_channel_members FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = chat_channel_members.channel_id AND user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Chat Messages (Strict Channel Membership & Non-spoofable Sender)
CREATE POLICY "Chat messages viewable only by channel members" ON chat_messages FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = chat_messages.channel_id AND user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can only send messages as themselves to channels they belong to" ON chat_messages FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = chat_messages.channel_id AND user_id = auth.uid())
);
CREATE POLICY "Senders and admins can update message status" ON chat_messages FOR UPDATE TO authenticated USING (
    auth.uid() = sender_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Senders and admins can delete messages" ON chat_messages FOR DELETE TO authenticated USING (
    auth.uid() = sender_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Notifications (Strict Sender & Recipient Security)
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT TO authenticated USING (
    auth.uid() = recipient_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins or authentic senders can create notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff')) OR
    (auth.uid() = sender_id OR auth.uid() = recipient_id)
);
CREATE POLICY "Users can update own notification read state" ON notifications FOR UPDATE TO authenticated USING (
    auth.uid() = recipient_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE TO authenticated USING (
    auth.uid() = recipient_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================================================
-- 14. NETWORKING, MENTORSHIP, MARKETPLACE & WAITLIST TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (requester_id, recipient_id)
);

CREATE POLICY "Connections viewable by participants or admin" ON connections FOR SELECT TO authenticated USING (
    auth.uid() = requester_id OR auth.uid() = recipient_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can create connection requests" ON connections FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = requester_id
);
CREATE POLICY "Participants can update connection status" ON connections FOR UPDATE TO authenticated USING (
    auth.uid() = requester_id OR auth.uid() = recipient_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Participants can delete connections" ON connections FOR DELETE TO authenticated USING (
    auth.uid() = requester_id OR auth.uid() = recipient_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE TABLE IF NOT EXISTS mentorships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    mentor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    focus_area TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE POLICY "Mentorships viewable by student, mentor, or admin" ON mentorships FOR SELECT TO authenticated USING (
    auth.uid() = student_id OR auth.uid() = mentor_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Students can request mentorship" ON mentorships FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = student_id
);
CREATE POLICY "Mentors and students can update mentorship status" ON mentorships FOR UPDATE TO authenticated USING (
    auth.uid() = student_id OR auth.uid() = mentor_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Participants can cancel mentorship" ON mentorships FOR DELETE TO authenticated USING (
    auth.uid() = student_id OR auth.uid() = mentor_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE TABLE IF NOT EXISTS marketplace_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    campus_code TEXT REFERENCES campuses(code) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    price_kobo BIGINT NOT NULL DEFAULT 0,
    price_display TEXT NOT NULL,
    currency TEXT DEFAULT 'NGN',
    condition TEXT DEFAULT 'good',
    category TEXT NOT NULL,
    image_url TEXT,
    is_sold BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE POLICY "Marketplace listings viewable by campus or global" ON marketplace_listings FOR SELECT TO authenticated USING (
    campus_code = 'GLOBAL' OR
    campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid()) OR
    auth.uid() = seller_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'staff'))
);
CREATE POLICY "Authenticated users can create marketplace listings" ON marketplace_listings FOR INSERT TO authenticated WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "Sellers, admins and staff can update listings" ON marketplace_listings FOR UPDATE TO authenticated USING (
    auth.uid() = seller_id OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = marketplace_listings.campus_code)))
);
CREATE POLICY "Sellers, admins and staff can delete listings" ON marketplace_listings FOR DELETE TO authenticated USING (
    auth.uid() = seller_id OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = marketplace_listings.campus_code)))
);

-- ============================================================================
-- 15. CAMPUS & GLOBAL ANNOUNCEMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    campus_code TEXT REFERENCES campuses(code) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    audience_scope TEXT NOT NULL DEFAULT 'global', -- 'global', 'student', 'alumni', 'staff'
    priority TEXT NOT NULL DEFAULT 'normal', -- 'normal', 'high', 'critical'
    published_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_campus ON announcements(campus_code);
CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(published_at DESC);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Announcements viewable by target audience and campus" ON announcements FOR SELECT TO authenticated USING (
    (campus_code IS NULL OR campus_code = 'GLOBAL' OR campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid())) AND
    (audience_scope = 'global' OR audience_scope = (SELECT role::text FROM profiles WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
);

CREATE POLICY "Admins and staff can publish announcements" ON announcements FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = author_id AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'staff'))
);

CREATE POLICY "Admins and staff can update announcements" ON announcements FOR UPDATE TO authenticated USING (
    auth.uid() = author_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = announcements.campus_code)))
);

CREATE POLICY "Admins and staff can delete announcements" ON announcements FOR DELETE TO authenticated USING (
    auth.uid() = author_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR (role = 'staff' AND campus_code = announcements.campus_code)))
);

CREATE TABLE IF NOT EXISTS waitlist_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_name TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform settings viewable by authenticated users" ON platform_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage platform settings" ON platform_settings FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Waitlist viewable by admins" ON waitlist_entries FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Anyone can join waitlist" ON waitlist_entries FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins can update waitlist" ON waitlist_entries FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================================
-- 15. CAMPUS PORTAL DIRECTORIES & SHORTCUTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS portal_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_code TEXT REFERENCES campuses(code) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Academic',
    icon TEXT NOT NULL DEFAULT 'link-outline',
    is_active BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_links_campus ON portal_links(campus_code);

ALTER TABLE portal_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read portal_links" ON portal_links
FOR SELECT USING (true);

CREATE POLICY "Admins can manage portal_links" ON portal_links
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Seed Real Portal Links for UNILAG, UI, FUNAAB and Global fallback
INSERT INTO portal_links (campus_code, title, url, category, icon, display_order)
VALUES
    -- UNILAG
    ('UNILAG', 'UNILAG Student Portal', 'https://studentportal.unilag.edu.ng/', 'Academic', 'school-outline', 1),
    ('UNILAG', 'UNILAG e-Learning LMS', 'https://lms.unilag.edu.ng/', 'Classes', 'laptop-outline', 2),
    ('UNILAG', 'Main Library Catalog & Archives', 'https://library.unilag.edu.ng/', 'Library', 'book-outline', 3),
    ('UNILAG', 'Bursary & Payments (Remita)', 'https://payments.unilag.edu.ng/', 'Finance', 'card-outline', 4),
    ('UNILAG', 'Hostel Accommodation Balloting', 'https://studentportal.unilag.edu.ng/hostel', 'Housing', 'home-outline', 5),
    ('UNILAG', 'Medical Centre e-Services', 'https://medical.unilag.edu.ng/', 'Health', 'medkit-outline', 6),

    -- UI (University of Ibadan)
    ('UI', 'UI Undergraduate Portal', 'https://portal.ui.edu.ng/', 'Academic', 'school-outline', 1),
    ('UI', 'UI DLC LMS & Virtual Classroom', 'https://dlc.ui.edu.ng/', 'Classes', 'laptop-outline', 2),
    ('UI', 'Kenneth Dike Memorial Library', 'https://library.ui.edu.ng/', 'Library', 'book-outline', 3),
    ('UI', 'University Bursary & Invoicing', 'https://bursary.ui.edu.ng/', 'Finance', 'card-outline', 4),
    ('UI', 'Halls of Residence Allocation', 'https://portal.ui.edu.ng/hostels', 'Housing', 'home-outline', 5),
    ('UI', 'Jaja Health Services Clinic', 'https://uhs.ui.edu.ng/', 'Health', 'medkit-outline', 6),

    -- FUNAAB
    ('FUNAAB', 'FUNAAB Student Portal', 'https://portal.unaab.edu.ng/', 'Academic', 'school-outline', 1),
    ('FUNAAB', 'FUNAAB LMS e-Learning', 'https://lms.unaab.edu.ng/', 'Classes', 'laptop-outline', 2),
    ('FUNAAB', 'Nimbe Adedipe Digital Library', 'https://library.unaab.edu.ng/', 'Library', 'book-outline', 3),
    ('FUNAAB', 'Bursary & Student Billing', 'https://portal.unaab.edu.ng/payments', 'Finance', 'card-outline', 4),
    ('FUNAAB', 'Hostel Accommodation System', 'https://portal.unaab.edu.ng/accommodation', 'Housing', 'home-outline', 5),
    ('FUNAAB', 'Directorate of Health Services', 'https://healthservices.unaab.edu.ng/', 'Health', 'medkit-outline', 6),

    -- GLOBAL fallback
    ('GLOBAL', 'Campus Student Portal', 'https://studentportal.unilag.edu.ng/', 'Academic', 'school-outline', 1),
    ('GLOBAL', 'LMS Virtual Classroom', 'https://lms.unilag.edu.ng/', 'Classes', 'laptop-outline', 2),
    ('GLOBAL', 'Academic Library & Archives', 'https://library.unilag.edu.ng/', 'Library', 'book-outline', 3),
    ('GLOBAL', 'Tuition & Bursary Services', 'https://payments.unilag.edu.ng/', 'Finance', 'card-outline', 4),
    ('GLOBAL', 'Campus Accommodation Portal', 'https://studentportal.unilag.edu.ng/hostel', 'Housing', 'home-outline', 5),
    ('GLOBAL', 'University Health Center', 'https://medical.unilag.edu.ng/', 'Health', 'medkit-outline', 6)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 16. REALTIME REPLICATION CONFIGURATION
-- ============================================================================
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE posts, events, post_comments, event_attendees, chat_messages, chat_channels, notifications, moderation_queue, verifications, connections, mentorships, marketplace_listings, portal_links, announcements;
EXCEPTION WHEN OTHERS THEN null; END $$;

-- ============================================================================
-- 17. STORAGE BUCKETS & POLICIES (Academic Documents, Media & Private Verifications)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('resources', 'resources', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('campus-media', 'campus-media', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('verifications', 'verifications', false)
ON CONFLICT (id) DO NOTHING;

-- Public Storage RLS Policies (resources, avatars & campus-media)
CREATE POLICY "Public storage objects viewable by anyone" ON storage.objects
FOR SELECT USING (bucket_id IN ('resources', 'avatars', 'campus-media'));

CREATE POLICY "Authenticated users can upload public storage objects" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('resources', 'avatars', 'campus-media'));

CREATE POLICY "Users and admins can update public storage objects" ON storage.objects
FOR UPDATE TO authenticated USING (
    bucket_id IN ('resources', 'avatars', 'campus-media') AND (
        auth.uid()::text = (storage.foldername(name))[1] OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
);

CREATE POLICY "Users and admins can delete public storage objects" ON storage.objects
FOR DELETE TO authenticated USING (
    bucket_id IN ('resources', 'avatars', 'campus-media') AND (
        auth.uid()::text = (storage.foldername(name))[1] OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
);

-- Private Storage RLS Policies (verifications PII protection)
CREATE POLICY "Verifications viewable only by owner and admins" ON storage.objects
FOR SELECT TO authenticated USING (
    bucket_id = 'verifications' AND (
        auth.uid()::text = (storage.foldername(name))[1] OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
);

CREATE POLICY "Users can upload their own verification documents" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'verifications' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users and admins can update their verification documents" ON storage.objects
FOR UPDATE TO authenticated USING (
    bucket_id = 'verifications' AND (
        auth.uid()::text = (storage.foldername(name))[1] OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
);

CREATE POLICY "Users and admins can delete their verification documents" ON storage.objects
FOR DELETE TO authenticated USING (
    bucket_id = 'verifications' AND (
        auth.uid()::text = (storage.foldername(name))[1] OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
);






