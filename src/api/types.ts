// Mirrors PRD Section 14 (Data Models). Kept intentionally close to the
// server shapes so API responses can be typed without a mapping layer.

export type UserRole = 'student' | 'alumni' | 'staff' | 'admin';

export interface UserProfile {
  id: string;
  fullName: string;
  username: string;
  email: string;
  userType: UserRole;
  graduationYear?: number | null;
  connectionsCount: number;
  bio?: string | null;
  department?: string | null;
  interests?: string[];
  institutionName?: string;
  institutionCode?: string;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  isVerified: boolean;
  /**
   * 'verified' = blue tick shown on profile. Auto-set at registration
   * for matching university emails; otherwise starts'none'and only
   * becomes'verified'after a submitted document is approved (see
   * src/api/verification.ts). isVerified is kept in sync with this as
   * a convenience for existing UI checks.
   */
  verificationStatus: 'none' | 'pending' | 'verified';
  // Gamification — ported from the reference app's UserProfile entity
  // (xp/level/reputationScore/trustLevel/streakDays).
  xp: number;
  level: number;
  reputationScore: number;
  trustLevel: number;
  streakDays: number;
  postsCount: number;
  resourcesCount: number;
  eventsCount: number;
  badgesCount: number;
  followersCount: number;
  followingCount: number;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: Pick<UserProfile, 'id' | 'fullName'> & { role: UserRole; email?: string };
}

export type PostVisibilityScope = 'global' | 'alumni' | 'staff' | 'student';

export interface PostPollOption {
  id: string;
  label: string;
  votes: number;
  isVotedByMe?: boolean;
}

export interface PostPoll {
  question: string;
  options: PostPollOption[];
  totalVotes: number;
  expiresIn?: string;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  authorRole: UserRole;
  authorTrustLevel?: number;
  title: string;
  content: string;
  category: string;
  visibilityScope: PostVisibilityScope;
  /** Institution-scope badge (Campus/Global/Private) — orthogonal to visibilityScope's audience targeting. */
  scopeVisibility?: 'campus' | 'global' | 'private';
  /** Which launch university this post belongs to when scopeVisibility is'campus'. Omitted entirely for'global'posts — that's what makes them visible across every university. */
  institutionCode?: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  pollQuestion?: string | null;
  poll?: PostPoll | null;
  likesCount: number;
  commentsCount: number;
  isLikedByMe?: boolean;
  isPinned?: boolean;
  createdAt: string;
  /** Collected in PublishThreadModal's checkbox but previously never stored anywhere — now backs a"Sponsored"badge on PostCard. */
  sponsored?: boolean;
  /** Free-text course codes (e.g. "CSC 301, MTH 101") collected in PublishThreadModal's"Course Tags"field — previously discarded, now shown on PostCard. */
  courseTags?: string;
  /** "Thread"vs"Rapid-Fire Conversation"toggle in PublishThreadModal — previously collected but discarded. Stored as metadata only; doesn't change posting behavior, just shown as a small tag on PostCard. */
  postFormat?: 'Thread' | 'Rapid-Fire Conversation';
}

export type EventCategory =
  | 'academic'
  | 'career'
  | 'alumni'
  | 'student'
  | 'seminar'
  | 'workshop';

export interface CampusEvent {
  id: string;
  organizerId: string;
  organizerName?: string;
  title: string;
  description: string;
  category: EventCategory;
  location: string;
  visibilityScope: 'global' | 'student' | 'alumni';
  startAt: string;
  endAt: string;
  capacity?: number | null;
  rsvpCount: number;
  isRsvpd?: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  attendeeNames?: string[];
  sponsored?: boolean;
  isSpotlight?: boolean;
  coverImageUrl?: string | null;
  venueType?: 'Physical Auditorium' | 'Virtual (Google Meet/Zoom)' | 'Hybrid Room';
  virtualLink?: string | null;
  ticketPrice?: string;
  speakers?: { name: string; title: string }[];
  targetCohort?: string;
  rsvpDeadline?: string;
}

export type ConnectionStatus = 'none' | 'pending' | 'accepted' | 'declined' | 'blocked';

export interface Connection {
  id: string;
  requesterId: string;
  recipientId: string;
  status: ConnectionStatus;
  createdAt: string;
  respondedAt?: string | null;
}

// Display-friendly shape for the incoming-requests inbox — Connection
// itself only carries IDs, not enough to render a request card.
export interface IncomingConnectionRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterAvatarUrl?: string | null;
  requesterHeadline?: string | null;
  createdAt: string;
}

export interface AlumniDirectoryEntry {
  id: string;
  fullName: string;
  graduationYear?: number | null;
  department?: string | null;
  bio?: string | null;
  industry?: string | null;
  company?: string | null;
  avatarUrl?: string | null;
  connectionStatus: ConnectionStatus;
}

export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: 'text' | 'system';
  status: MessageStatus;
  sentAt: string;
  deliveredAt?: string | null;
  readAt?: string | null;
}

export interface Conversation {
  id: string;
  participantId: string; // the other participant, from the current user's POV
  participantName: string;
  participantAvatarUrl?: string | null;
  isOnline?: boolean;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  unreadCount: number;
}

export type NotificationType =
  | 'announcement'
  | 'event'
  | 'message'
  | 'moderation'
  | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  channel: 'in_app' | 'push' | 'email';
  deliveryStatus: 'pending' | 'delivered' | 'failed';
  openedAt?: string | null;
  createdAt: string;
  deepLinkPath?: string | null;
}

export interface MentorProfile {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  department?: string;
  expertiseTags: string[];
  bio: string;
  company?: string;
  availableSlots: number;
}

export type MentorshipStatus = 'pending' | 'active' | 'completed' | 'declined';

export interface Mentorship {
  id: string;
  studentId: string;
  studentName?: string | null;
  mentorId: string;
  mentorName: string;
  status: MentorshipStatus;
  focusArea?: string | null;
}

export type ReportStatus = 'open' | 'under_review' | 'resolved' | 'dismissed';

export interface Report {
  id: string;
  reporterId: string;
  targetType: 'post' | 'message' | 'user' | 'event';
  targetId: string;
  reason: string;
  status: ReportStatus;
  assignedAdminId?: string | null;
  createdAt: string;
  /** Which launch institution this report originated from — backs the Staff/Admin moderation scoping distinction. */
  institutionCode?: string;
}

// PRD Section 14 (AuditLog model) / Section 6.2's acceptance criteria
// ("moderation decisions must be audit-logged"). Deliberately narrow to
// actions that change something real for another user or the platform
// (report decisions, event takedowns, verification decisions, the two
// high-risk Super Admin actions) rather than every button tap.
export type AuditLogAction =
  | 'report_resolved'
  | 'report_dismissed'
  | 'event_approval_revoked'
  | 'event_purged'
  | 'verification_approved'
  | 'verification_rejected'
  | 'escrow_funds_released'
  | 'impersonation_started';

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: AuditLogAction;
  /** One-line human-readable description, e.g. "Resolved report on a marketplace listing". */
  summary: string;
  targetType: 'report' | 'event' | 'verification_request' | 'user' | 'escrow' | 'post' | 'resource';
  targetId: string;
  /** Free-text reason, present when the action required one (impersonation, escrow release). */
  reason?: string;
  /** Scopes the entry to a launch institution, mirroring Report's scoping — omitted for global actions. */
  institutionCode?: string;
  createdAt: string;
}

export type AnnouncementPriority = 'normal' | 'high' | 'critical';

export interface Announcement {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  audienceScope: 'global' | 'student' | 'alumni' | 'staff';
  priority: AnnouncementPriority;
  publishedAt: string;
  expiresAt?: string | null;
}

export interface MarketplaceListing {
  id: string;
  title: string;
  description: string;
  price: string;
  condition: 'New' | 'Like New' | 'Fair';
  category: 'Electronics' | 'Books/Academic' | 'Furniture/Room Accessories';
  imageUrl?: string | null;
  sellerName: string;
  sellerAvatarUrl?: string | null;
  sellerId: string;
  sellerTrustLevel: number;
  createdAt: string;
}

export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  type: 'Full-time' | 'Part-time' | 'Internship';
  remote: boolean;
  applyUrl: string;
  postedByName: string;
  createdAt: string;
}

export interface StudyGroup {
  id: string;
  name: string;
  courseCode: string;
  description: string;
  memberCount: number;
  isPublic: boolean;
  isJoined: boolean;
  lastMessageAt?: string | null;
}

export interface Resource {
  id: string;
  title: string;
  description: string;
  category: 'Notes' | 'Past Questions' | 'Projects';
  department: string;
  courseCode: string;
  fileSize: string;
  authorName: string;
  authorId?: string;
  authorRole?: UserRole;
  likesCount: number;
  downloadsCount: number;
  createdAt: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string | null;
  fileUrl?: string | null;
  fileType?: 'PDF' | 'DOCX' | 'ZIP' | 'EPUB';
  semester?: 'Harmattan / First' | 'Rain / Second';
  academicLevel?: '100L' | '200L' | '300L' | '400L' | '500L' | 'Postgraduate';
  syllabusTopic?: string;
}
