import { supabase } from './supabase';
import {
  PodMember,
  PodPost,
  PodPostKind,
  PodRole,
  PodSession,
  StudyGroup,
} from './types';
import { getSessionUser } from '../auth/tokenStorage';
import { isUserBlocked } from './connections';
import { assertUuid } from '../utils/postgrest';
import { RpcError, throwIfRpcError } from '../utils/rpcErrors';

/**
 * Study pods client. Discovery and every change go through database functions (see
 * supabase/migrations/20260925110000_study_pods_v2.sql): the campus wall, private-pod privacy, capacity,
 * join approval, roles and notifications are enforced there, so this file only shapes data. A failure is
 * always a real, readable error - nothing is faked locally.
 */

async function requireSession(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const id = data?.user?.id ?? (await getSessionUser())?.id;
  if (!id) throw new RpcError({ code: 'not_authenticated', message: 'Please sign in again to continue.' });
}

function mapGroup(row: any): StudyGroup {
  return {
    id: row.id,
    name: row.name,
    courseCode: row.course_code || '',
    description: row.description || '',
    isPublic: !row.is_private,
    memberCount: row.member_count ?? 0,
    isJoined: row.my_status === 'active',
    campusCode: row.campus_code || 'GLOBAL',
    lastMessageAt: row.last_activity_at ?? row.created_at ?? null,
    level: row.level ?? null,
    department: row.department ?? null,
    topics: Array.isArray(row.topics) ? row.topics : [],
    scheduleNote: row.schedule_note ?? null,
    goal: row.goal ?? null,
    meetingLink: row.meeting_link ?? null,
    maxMembers: row.max_members ?? null,
    pendingCount: row.pending_count ?? 0,
    creatorId: row.creator_id,
    creatorName: row.creator_name ?? null,
    myStatus: row.my_status ?? null,
    myRole: (row.my_role ?? null) as PodRole | null,
    unreadCount: row.unread_count ?? 0,
    nextSessionAt: row.next_session_at ?? null,
    createdAt: row.created_at ?? null,
    isArchived: !!row.is_archived,
  };
}

// ---------------------------------------------------------------------------------------------------
// discovery
// ---------------------------------------------------------------------------------------------------
export interface ListStudyGroupsOptions {
  q?: string;
  mineOnly?: boolean;
}

/**
 * `campusCode` narrows staff/admin views to one campus; members are always kept to their own campus (plus
 * global pods) by the database whatever is passed.
 */
export async function listStudyGroups(campusCode?: string, options: ListStudyGroupsOptions = {}): Promise<StudyGroup[]> {
  await requireSession();
  const { data, error } = await supabase.rpc('list_study_groups', {
    p_campus: campusCode && campusCode !== 'GLOBAL' ? campusCode : null,
    p_q: options.q?.trim() || null,
    p_id: null,
    p_mine_only: options.mineOnly ?? false,
  });
  throwIfRpcError(error, 'Could not load study pods.');
  return (data ?? []).map(mapGroup).filter((g: StudyGroup) => !g.creatorId || !isUserBlocked(g.creatorId));
}

export async function getStudyGroup(id: string): Promise<StudyGroup | null> {
  assertUuid(id, 'pod id');
  await requireSession();
  const { data, error } = await supabase.rpc('list_study_groups', { p_campus: null, p_q: null, p_id: id, p_mine_only: false });
  throwIfRpcError(error, 'Could not load this study pod.');
  return data && data.length > 0 ? mapGroup(data[0]) : null;
}

// ---------------------------------------------------------------------------------------------------
// create / edit
// ---------------------------------------------------------------------------------------------------
export interface CreateStudyGroupPayload {
  name: string;
  courseCode: string;
  description: string;
  isPublic: boolean;
  level?: string;
  department?: string;
  topics?: string[];
  meetingLink?: string;
  scheduleNote?: string;
  goal?: string;
  maxMembers?: number;
  /** Only honoured for admins; everyone else creates pods on their own campus. */
  campusCode?: string;
}

function podArgs(p: CreateStudyGroupPayload) {
  return {
    p_name: p.name,
    p_course_code: p.courseCode || null,
    p_description: p.description || null,
    p_is_private: !p.isPublic,
    p_level: p.level || null,
    p_department: p.department || null,
    p_topics: p.topics ?? [],
    p_meeting_link: p.meetingLink || null,
    p_schedule_note: p.scheduleNote || null,
    p_goal: p.goal || null,
    p_max_members: p.maxMembers ?? 20,
  };
}

export async function createStudyGroup(payload: CreateStudyGroupPayload): Promise<StudyGroup> {
  await requireSession();
  const { data, error } = await supabase.rpc('create_study_group', {
    ...podArgs(payload),
    p_campus: payload.campusCode && payload.campusCode !== 'GLOBAL' ? payload.campusCode : null,
  });
  throwIfRpcError(error, 'Could not create this study pod. Please try again.');
  const created = await getStudyGroup((data as any).id);
  if (!created) throw new RpcError({ code: 'not_found', message: 'The pod was created but could not be loaded. Pull down to refresh.' });
  return created;
}

export async function updateStudyGroup(id: string, payload: CreateStudyGroupPayload): Promise<void> {
  assertUuid(id, 'pod id');
  const { error } = await supabase.rpc('update_study_group', { p_id: id, ...podArgs(payload) });
  throwIfRpcError(error, 'Could not save your changes.');
}

// ---------------------------------------------------------------------------------------------------
// membership
// ---------------------------------------------------------------------------------------------------
/** 'active' = you are in; 'pending' = a private pod's owner has to approve you. */
export async function joinStudyGroup(id: string, message?: string): Promise<{ status: 'active' | 'pending' }> {
  assertUuid(id, 'pod id');
  const { data, error } = await supabase.rpc('join_study_group', { p_id: id, p_message: message?.trim() || null });
  throwIfRpcError(error, 'Could not join this pod. Please try again.');
  return { status: data === 'pending' ? 'pending' : 'active' };
}

export async function leaveStudyGroup(id: string): Promise<void> {
  assertUuid(id, 'pod id');
  const { error } = await supabase.rpc('leave_study_group', { p_id: id });
  throwIfRpcError(error, 'Could not leave this pod. Please try again.');
}

export async function respondToJoinRequest(groupId: string, userId: string, approve: boolean): Promise<void> {
  assertUuid(groupId, 'pod id');
  assertUuid(userId, 'user id');
  const { error } = await supabase.rpc('respond_study_group_join', { p_id: groupId, p_user: userId, p_approve: approve });
  throwIfRpcError(error, 'Could not answer this request.');
}

export async function removePodMember(groupId: string, userId: string, ban = false): Promise<void> {
  assertUuid(groupId, 'pod id');
  assertUuid(userId, 'user id');
  const { error } = await supabase.rpc('remove_study_group_member', { p_id: groupId, p_user: userId, p_ban: ban });
  throwIfRpcError(error, 'Could not remove this member.');
}

export async function setPodMemberRole(groupId: string, userId: string, role: PodRole): Promise<void> {
  assertUuid(groupId, 'pod id');
  assertUuid(userId, 'user id');
  const { error } = await supabase.rpc('set_study_group_member_role', { p_id: groupId, p_user: userId, p_role: role });
  throwIfRpcError(error, 'Could not change this role.');
}

export async function listPodMembers(groupId: string): Promise<PodMember[]> {
  assertUuid(groupId, 'pod id');
  const { data, error } = await supabase.rpc('list_study_group_members', { p_id: groupId });
  throwIfRpcError(error, 'Could not load members.');
  return (data ?? []).map((r: any) => ({
    userId: r.user_id,
    fullName: r.full_name || 'Member',
    avatarUrl: r.avatar_url,
    department: r.department,
    role: r.role,
    status: r.status,
    joinedAt: r.joined_at,
    requestedMessage: r.requested_message,
  }));
}

// ---------------------------------------------------------------------------------------------------
// discussion
// ---------------------------------------------------------------------------------------------------
function mapPost(r: any): PodPost {
  return {
    id: r.id,
    groupId: r.group_id,
    authorId: r.author_id,
    authorName: r.author_name || 'Member',
    authorAvatar: r.author_avatar,
    authorPodRole: r.author_pod_role,
    parentId: r.parent_id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    linkUrl: r.link_url,
    isPinned: !!r.is_pinned,
    isResolved: !!r.is_resolved,
    replyCount: r.reply_count ?? 0,
    createdAt: r.created_at,
    editedAt: r.edited_at,
  };
}

export async function listPodPosts(groupId: string, parentId?: string | null): Promise<PodPost[]> {
  assertUuid(groupId, 'pod id');
  const { data, error } = await supabase.rpc('list_study_group_posts', {
    p_group: groupId,
    p_parent: parentId ?? null,
    p_limit: 50,
    p_before: null,
  });
  throwIfRpcError(error, 'Could not load the discussion.');
  return (data ?? []).map(mapPost);
}

export interface PodPostPayload {
  body: string;
  kind?: PodPostKind;
  title?: string;
  linkUrl?: string;
  parentId?: string;
}

export async function postToPod(groupId: string, payload: PodPostPayload): Promise<void> {
  assertUuid(groupId, 'pod id');
  const { error } = await supabase.rpc('post_to_study_group', {
    p_group: groupId,
    p_body: payload.body,
    p_kind: payload.kind ?? 'discussion',
    p_title: payload.title?.trim() || null,
    p_link: payload.linkUrl?.trim() || null,
    p_parent: payload.parentId ?? null,
  });
  throwIfRpcError(error, 'Could not post this.');
}

export async function moderatePodPost(postId: string, action: 'pin' | 'unpin' | 'resolve' | 'unresolve'): Promise<void> {
  assertUuid(postId, 'post id');
  const { error } = await supabase.rpc('moderate_study_group_post', { p_post: postId, p_action: action });
  throwIfRpcError(error, 'Could not update this post.');
}

export async function deletePodPost(postId: string): Promise<void> {
  assertUuid(postId, 'post id');
  const { error } = await supabase.from('study_group_posts').delete().eq('id', postId);
  throwIfRpcError(error, 'Could not delete this post.');
}

/** Sends a pod post to the moderation queue (campus staff and admins see it under Reports). */
export async function reportPodPost(postId: string, reason: string): Promise<void> {
  assertUuid(postId, 'post id');
  const { error } = await supabase.rpc('report_study_group_post', { p_post: postId, p_reason: reason });
  throwIfRpcError(error, 'Could not send your report. Please try again.');
}

export async function markPodRead(groupId: string): Promise<void> {
  assertUuid(groupId, 'pod id');
  await supabase.rpc('mark_study_group_read', { p_group: groupId });
}

// ---------------------------------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------------------------------
export async function listPodSessions(groupId: string): Promise<PodSession[]> {
  assertUuid(groupId, 'pod id');
  const { data, error } = await supabase.rpc('list_study_group_sessions', { p_group: groupId });
  throwIfRpcError(error, 'Could not load sessions.');
  return (data ?? []).map((r: any) => ({
    id: r.id,
    groupId: r.group_id,
    title: r.title,
    scheduledAt: r.scheduled_at,
    durationMinutes: r.duration_minutes,
    mode: r.mode,
    location: r.location,
    agenda: r.agenda,
    status: r.status,
    createdBy: r.created_by,
    creatorName: r.creator_name,
    goingCount: r.going_count ?? 0,
    iAmGoing: !!r.i_am_going,
  }));
}

export interface SchedulePodSessionPayload {
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  mode: 'online' | 'in_person';
  location?: string;
  agenda?: string;
}

export async function schedulePodSession(groupId: string, p: SchedulePodSessionPayload): Promise<void> {
  assertUuid(groupId, 'pod id');
  const { error } = await supabase.rpc('schedule_study_group_session', {
    p_group: groupId,
    p_title: p.title,
    p_scheduled_at: p.scheduledAt,
    p_duration: p.durationMinutes,
    p_mode: p.mode,
    p_location: p.location?.trim() || null,
    p_agenda: p.agenda?.trim() || null,
  });
  throwIfRpcError(error, 'Could not schedule this session.');
}

export async function cancelPodSession(sessionId: string): Promise<void> {
  assertUuid(sessionId, 'session id');
  const { error } = await supabase.rpc('cancel_study_group_session', { p_session: sessionId });
  throwIfRpcError(error, 'Could not cancel this session.');
}

export async function rsvpPodSession(sessionId: string, going: boolean): Promise<void> {
  assertUuid(sessionId, 'session id');
  const { error } = await supabase.rpc('rsvp_study_group_session', { p_session: sessionId, p_going: going });
  throwIfRpcError(error, 'Could not update your RSVP.');
}
