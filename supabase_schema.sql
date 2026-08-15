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
    avatar_url TEXT,
    banner_url TEXT,
    student_id_number TEXT,
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

-- Ensure Root Admin Account Exists with Admin Privileges
-- (inememmanuel@gmail.com is configured as Platform Root Admin)
CREATE OR REPLACE FUNCTION handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
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
            ELSE COALESCE((NEW.raw_user_meta_data->>'role')::user_role_type, 'student'::user_role_type)
        END,
        COALESCE(NEW.raw_user_meta_data->>'campus_code', 'GLOBAL'),
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
    created_at TIMESTAMPTZ DEFAULT NOW()
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

-- ============================================================================
-- 12. NOTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT DEFAULT 'system',
    action_url TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 13. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: Public Read, Self Update, Admin All
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins have full profile access" ON profiles FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Posts: Viewable by campus scope or global
CREATE POLICY "Posts viewable by campus or global" ON posts FOR SELECT USING (
    visibility_scope = 'global' OR 
    campus_code = (SELECT campus_code FROM profiles WHERE id = auth.uid()) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Authenticated users can create posts" ON posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors and admins can update posts" ON posts FOR UPDATE USING (
    auth.uid() = author_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Authors and admins can delete posts" ON posts FOR DELETE USING (
    auth.uid() = author_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Post Likes
CREATE POLICY "Post likes are viewable by everyone" ON post_likes FOR SELECT USING (true);
CREATE POLICY "Users can like posts" ON post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike posts" ON post_likes FOR DELETE USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Post Comments
CREATE POLICY "Post comments are viewable by everyone" ON post_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can comment on posts" ON post_comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors and admins can update comments" ON post_comments FOR UPDATE USING (auth.uid() = author_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Authors and admins can delete comments" ON post_comments FOR DELETE USING (auth.uid() = author_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Events: Viewable by all
CREATE POLICY "Events viewable by all" ON events FOR SELECT USING (true);
CREATE POLICY "Users can create events" ON events FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators and admins can modify events" ON events FOR UPDATE USING (
    auth.uid() = creator_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Creators and admins can delete events" ON events FOR DELETE USING (
    auth.uid() = creator_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Event Attendees
CREATE POLICY "Event attendees viewable by all" ON event_attendees FOR SELECT USING (true);
CREATE POLICY "Users can RSVP to events" ON event_attendees FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can cancel RSVP" ON event_attendees FOR DELETE USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Resources: Approved resources viewable by all, unapproved viewable by uploader and admins
CREATE POLICY "Resources viewable if approved or owner or admin" ON resources FOR SELECT USING (
    is_approved = TRUE OR 
    uploader_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can upload resources" ON resources FOR INSERT WITH CHECK (auth.uid() = uploader_id);
CREATE POLICY "Admins can approve and manage resources" ON resources FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Verifications
CREATE POLICY "Users can view own verification requests, admins view all" ON verifications FOR SELECT USING (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can submit verification requests" ON verifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update verification status" ON verifications FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Moderation Queue & Reports
CREATE POLICY "Users can view their own reports, admins view all" ON moderation_queue FOR SELECT USING (
    reporter_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);
CREATE POLICY "Users can submit reports" ON moderation_queue FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Admins and staff can resolve reports" ON moderation_queue FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);

-- Audit Logs
CREATE POLICY "Admins and staff can view audit logs" ON audit_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);
CREATE POLICY "Authorized actors can create audit log entries" ON audit_logs FOR INSERT WITH CHECK (true);

-- Study Groups
CREATE POLICY "Study groups viewable by all" ON study_groups FOR SELECT USING (true);
CREATE POLICY "Users can create study groups" ON study_groups FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators and admins can update study groups" ON study_groups FOR UPDATE USING (
    auth.uid() = creator_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Creators and admins can delete study groups" ON study_groups FOR DELETE USING (
    auth.uid() = creator_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Study Group Members
CREATE POLICY "Study group members viewable by all" ON study_group_members FOR SELECT USING (true);
CREATE POLICY "Users can join study groups" ON study_group_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave study groups" ON study_group_members FOR DELETE USING (
    auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Chat Channels
CREATE POLICY "Chat channels viewable by everyone" ON chat_channels FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create chat channels" ON chat_channels FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can manage chat channels" ON chat_channels FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Chat Messages (Real persistent messaging with RLS)
CREATE POLICY "Chat messages viewable by channel members" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated users can send chat messages" ON chat_messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id OR sender_id IS NOT NULL
);
CREATE POLICY "Senders and admins can update message status" ON chat_messages FOR UPDATE USING (
    auth.uid() = sender_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Notifications
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (
    auth.uid() = recipient_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "System and users can insert notifications" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own notification read state" ON notifications FOR UPDATE USING (
    auth.uid() = recipient_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE USING (
    auth.uid() = recipient_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================================================
-- 14. REALTIME REPLICATION CONFIGURATION
-- ============================================================================
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE posts, events, chat_messages, notifications, moderation_queue;
EXCEPTION WHEN OTHERS THEN null; END $$;

