import {
  MentorAvailability,
  MentorProfile,
  MentorSessionMode,
  Mentorship,
  MentorshipFeedback,
  MentorshipGoal,
  MentorshipSession,
  MentorshipUpdate,
  MyMentorProfile,
} from './types';
import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { assertUuid } from '../utils/postgrest';
import { throwIfRpcError, RpcError } from '../utils/rpcErrors';

/**
 * Mentorship v2 client. All state changes are database functions (see
 * supabase/migrations/20260925100000_mentorship_v2.sql) that check who is asking, the current state and the
 * mentor's capacity, then notify the other person - so nothing here writes the mentorship tables directly and
 * a failure is always a real, readable error (never a fabricated "success").
 */

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data?.user?.id ?? (await getSessionUser())?.id;
  if (!id) throw new RpcError({ code: 'not_authenticated', message: 'Please sign in again to continue.' });
  assertUuid(id, 'user id');
  return id;
}

// ---------------------------------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------------------------------
function mapMentorship(row: any): Mentorship {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name ?? null,
    studentDepartment: row.student_department ?? null,
    studentAvatarUrl: row.student_avatar ?? null,
    mentorId: row.mentor_id,
    mentorName: row.mentor_name || 'Mentor',
    mentorAvatarUrl: row.mentor_avatar ?? null,
    mentorHeadline: row.mentor_headline ?? null,
    status: row.status,
    focusArea: row.track ?? null,
    academicLevel: row.level ?? null,
    pitch: row.pitch ?? null,
    goals: row.goals ?? null,
    cadence: row.cadence ?? null,
    planOutline: row.plan_outline ?? null,
    documentUrl: row.document_url ?? null,
    documentName: row.document_name ?? null,
    declineReason: row.decline_reason ?? null,
    endReason: row.end_reason ?? null,
    startedAt: row.started_at ?? null,
    endedAt: row.ended_at ?? null,
    lastActivityAt: row.last_activity_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

function mapMentor(row: any): MentorProfile {
  return {
    id: row.user_id,
    fullName: row.full_name || 'Mentor',
    avatarUrl: row.avatar_url ?? null,
    department: row.department || undefined,
    campusCode: row.campus_code || 'GLOBAL',
    headline: row.headline || undefined,
    about: row.about || undefined,
    jobTitle: row.job_title || undefined,
    company: row.company || undefined,
    yearsExperience: row.years_experience ?? null,
    expertiseTags: Array.isArray(row.expertise) ? row.expertise : [],
    industries: Array.isArray(row.industries) ? row.industries : [],
    sessionModes: Array.isArray(row.session_modes) ? row.session_modes : [],
    availability: (row.availability ?? {}) as MentorAvailability,
    linkedinUrl: row.linkedin_url ?? null,
    isAccepting: !!row.is_accepting,
    maxMentees: row.max_mentees ?? 3,
    activeMentees: row.active_mentees ?? 0,
    openSlots: row.open_slots ?? 0,
    completedCount: row.completed_count ?? 0,
    avgRating: row.avg_rating != null ? Number(row.avg_rating) : null,
    ratingCount: row.rating_count ?? 0,
    matchScore: row.match_score ?? 0,
    myRequestStatus: row.my_request_status ?? null,
  };
}

// ---------------------------------------------------------------------------------------------------
// mentorships
// ---------------------------------------------------------------------------------------------------
export async function listMentorships(): Promise<Mentorship[]> {
  await currentUserId();
  const { data, error } = await supabase.rpc('list_my_mentorships', { p_id: null });
  throwIfRpcError(error, 'Could not load your mentorships.');
  return (data ?? []).map(mapMentorship);
}

export async function getMentorship(id: string): Promise<Mentorship | null> {
  assertUuid(id, 'mentorship id');
  const { data, error } = await supabase.rpc('list_my_mentorships', { p_id: id });
  throwIfRpcError(error, 'Could not load this mentorship.');
  return data && data.length > 0 ? mapMentorship(data[0]) : null;
}

export interface RequestMentorshipPayload {
  mentorId: string;
  focusArea: string;
  academicLevel?: string;
  pitch?: string;
  goals?: string;
  cadence?: string;
  planOutline?: string;
  documentUrl?: string;
  documentName?: string;
}

/** Throws a readable RpcError (mentor_full, already_requested, cooldown ...) when the request is refused. */
export async function requestMentorship(payload: RequestMentorshipPayload): Promise<Mentorship> {
  await currentUserId();
  assertUuid(payload.mentorId, 'mentor id');
  const { data, error } = await supabase.rpc('request_mentorship', {
    p_mentor_id: payload.mentorId,
    p_track: payload.focusArea,
    p_level: payload.academicLevel ?? null,
    p_pitch: payload.pitch ?? null,
    p_goals: payload.goals ?? null,
    p_cadence: payload.cadence ?? null,
    p_plan_outline: payload.planOutline ?? null,
    p_document_url: payload.documentUrl ?? null,
    p_document_name: payload.documentName ?? null,
  });
  throwIfRpcError(error, 'Could not send this mentorship request. Please try again.');
  return mapMentorship({ ...(data as any), mentor_name: null });
}

export async function respondToMentorshipRequest(
  mentorshipId: string,
  action: 'accept' | 'decline',
  message?: string,
): Promise<Mentorship> {
  assertUuid(mentorshipId, 'mentorship id');
  const { data, error } = await supabase.rpc('respond_mentorship', {
    p_id: mentorshipId,
    p_action: action,
    p_message: message?.trim() || null,
  });
  throwIfRpcError(error, 'Could not answer this request. Please try again.');
  return mapMentorship(data);
}

/** withdraw = student cancels a pending request; complete = finished well; end = stop early. */
export async function endMentorship(
  mentorshipId: string,
  action: 'withdraw' | 'complete' | 'end',
  reason?: string,
): Promise<Mentorship> {
  assertUuid(mentorshipId, 'mentorship id');
  const { data, error } = await supabase.rpc('end_mentorship', {
    p_id: mentorshipId,
    p_action: action,
    p_reason: reason?.trim() || null,
  });
  throwIfRpcError(error, 'Could not update this mentorship. Please try again.');
  return mapMentorship(data);
}

// ---------------------------------------------------------------------------------------------------
// mentor directory + my mentor profile
// ---------------------------------------------------------------------------------------------------
export interface MentorSearchQuery {
  focusArea?: string;
  q?: string;
  /** Campus code to limit to, or omit / 'ALL' for every campus. */
  campusCode?: string;
  /** Default true: hide mentors who switched requests off. */
  onlyAccepting?: boolean;
}

export async function searchMentors(query: MentorSearchQuery = {}): Promise<MentorProfile[]> {
  await currentUserId();
  const campus = query.campusCode && query.campusCode !== 'GLOBAL' ? query.campusCode : null;
  const { data, error } = await supabase.rpc('mentor_directory', {
    p_q: query.q?.trim() || null,
    p_expertise: query.focusArea && query.focusArea !== 'All Fields' ? query.focusArea : null,
    p_campus: campus,
    p_only_accepting: query.onlyAccepting ?? true,
    p_limit: 60,
  });
  throwIfRpcError(error, 'Could not load mentors.');
  return (data ?? []).map(mapMentor);
}

export const EMPTY_MENTOR_PROFILE = (userId: string): MyMentorProfile => ({
  userId,
  headline: '',
  about: '',
  jobTitle: '',
  company: '',
  yearsExperience: null,
  expertise: [],
  industries: [],
  sessionModes: ['video', 'chat'],
  availability: { days: [], window: 'flexible', timezone: 'Africa/Lagos', notes: '' },
  linkedinUrl: '',
  isAccepting: true,
  maxMentees: 3,
});

/** null when the alumnus has never set up a mentor profile (they are then not listed to students). */
export async function getMyMentorProfile(): Promise<MyMentorProfile | null> {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('mentor_profiles').select('*').eq('user_id', userId).maybeSingle();
  throwIfRpcError(error, 'Could not load your mentor profile.');
  if (!data) return null;
  return {
    userId,
    headline: data.headline ?? '',
    about: data.about ?? '',
    jobTitle: data.job_title ?? '',
    company: data.company ?? '',
    yearsExperience: data.years_experience ?? null,
    expertise: Array.isArray(data.expertise) ? data.expertise : [],
    industries: Array.isArray(data.industries) ? data.industries : [],
    sessionModes: (Array.isArray(data.session_modes) ? data.session_modes : ['video', 'chat']) as MentorSessionMode[],
    availability: (data.availability ?? {}) as MentorAvailability,
    linkedinUrl: data.linkedin_url ?? '',
    isAccepting: !!data.is_accepting,
    maxMentees: data.max_mentees ?? 3,
  };
}

export async function saveMyMentorProfile(profile: MyMentorProfile): Promise<void> {
  const userId = await currentUserId();
  const linkedin = profile.linkedinUrl.trim();
  const { error } = await supabase.from('mentor_profiles').upsert(
    {
      user_id: userId,
      headline: profile.headline.trim() || null,
      about: profile.about.trim() || null,
      job_title: profile.jobTitle.trim() || null,
      company: profile.company.trim() || null,
      years_experience: profile.yearsExperience,
      expertise: profile.expertise,
      industries: profile.industries,
      session_modes: profile.sessionModes.length > 0 ? profile.sessionModes : ['chat'],
      availability: profile.availability,
      linkedin_url: linkedin || null,
      is_accepting: profile.isAccepting,
      max_mentees: profile.maxMentees,
    },
    { onConflict: 'user_id' },
  );
  throwIfRpcError(error, 'Could not save your mentor profile.');
}

export async function setMentorAccepting(accepting: boolean): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('mentor_profiles').update({ is_accepting: accepting }).eq('user_id', userId);
  throwIfRpcError(error, 'Could not update your availability.');
}

export interface MentorReview {
  mentorshipId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  fromName?: string | null;
  track?: string | null;
}

export async function listMyMentorReviews(): Promise<MentorReview[]> {
  const { data, error } = await supabase.rpc('list_my_mentor_reviews');
  throwIfRpcError(error, 'Could not load your reviews.');
  return (data ?? []).map((r: any) => ({
    mentorshipId: r.mentorship_id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
    fromName: r.from_name,
    track: r.track,
  }));
}

// ---------------------------------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------------------------------
function mapSession(row: any): MentorshipSession {
  return {
    id: row.id,
    mentorshipId: row.mentorship_id,
    proposedBy: row.proposed_by,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    mode: row.mode,
    location: row.location,
    agenda: row.agenda,
    status: row.status,
    decisionNote: row.decision_note,
    outcomeNotes: row.outcome_notes,
  };
}

export async function listMentorshipSessions(mentorshipId: string): Promise<MentorshipSession[]> {
  assertUuid(mentorshipId, 'mentorship id');
  const { data, error } = await supabase
    .from('mentorship_sessions')
    .select('*')
    .eq('mentorship_id', mentorshipId)
    .order('scheduled_at', { ascending: true });
  throwIfRpcError(error, 'Could not load sessions.');
  return (data ?? []).map(mapSession);
}

export interface ProposeSessionPayload {
  scheduledAt: string;
  durationMinutes: number;
  mode: MentorSessionMode;
  location?: string;
  agenda?: string;
}

export async function proposeMentorshipSession(mentorshipId: string, p: ProposeSessionPayload): Promise<MentorshipSession> {
  assertUuid(mentorshipId, 'mentorship id');
  const { data, error } = await supabase.rpc('propose_mentorship_session', {
    p_id: mentorshipId,
    p_scheduled_at: p.scheduledAt,
    p_duration: p.durationMinutes,
    p_mode: p.mode,
    p_location: p.location?.trim() || null,
    p_agenda: p.agenda?.trim() || null,
  });
  throwIfRpcError(error, 'Could not propose this session.');
  return mapSession(data);
}

export async function respondToMentorshipSession(
  sessionId: string,
  action: 'confirm' | 'decline' | 'cancel' | 'complete',
  note?: string,
): Promise<MentorshipSession> {
  assertUuid(sessionId, 'session id');
  const { data, error } = await supabase.rpc('respond_mentorship_session', {
    p_session: sessionId,
    p_action: action,
    p_note: note?.trim() || null,
  });
  throwIfRpcError(error, 'Could not update this session.');
  return mapSession(data);
}

// ---------------------------------------------------------------------------------------------------
// goals (row-level security keeps this to the two participants, and only while the mentorship is active)
// ---------------------------------------------------------------------------------------------------
function mapGoal(row: any): MentorshipGoal {
  return {
    id: row.id,
    mentorshipId: row.mentorship_id,
    title: row.title,
    dueDate: row.due_date,
    isDone: !!row.is_done,
    doneAt: row.done_at,
    createdBy: row.created_by,
  };
}

export async function listMentorshipGoals(mentorshipId: string): Promise<MentorshipGoal[]> {
  assertUuid(mentorshipId, 'mentorship id');
  const { data, error } = await supabase
    .from('mentorship_goals')
    .select('*')
    .eq('mentorship_id', mentorshipId)
    .order('created_at', { ascending: true });
  throwIfRpcError(error, 'Could not load goals.');
  return (data ?? []).map(mapGoal);
}

export async function addMentorshipGoal(mentorshipId: string, title: string, dueDate?: string | null): Promise<MentorshipGoal> {
  const userId = await currentUserId();
  assertUuid(mentorshipId, 'mentorship id');
  const { data, error } = await supabase
    .from('mentorship_goals')
    .insert({ mentorship_id: mentorshipId, title: title.trim(), due_date: dueDate || null, created_by: userId })
    .select('*')
    .single();
  throwIfRpcError(error, 'Could not add this goal.');
  return mapGoal(data);
}

export async function setMentorshipGoalDone(goalId: string, done: boolean): Promise<void> {
  assertUuid(goalId, 'goal id');
  const { error } = await supabase.from('mentorship_goals').update({ is_done: done }).eq('id', goalId);
  throwIfRpcError(error, 'Could not update this goal.');
}

export async function deleteMentorshipGoal(goalId: string): Promise<void> {
  assertUuid(goalId, 'goal id');
  const { error } = await supabase.from('mentorship_goals').delete().eq('id', goalId);
  throwIfRpcError(error, 'Could not remove this goal.');
}

// ---------------------------------------------------------------------------------------------------
// shared journal + feedback
// ---------------------------------------------------------------------------------------------------
export async function listMentorshipUpdates(mentorshipId: string): Promise<MentorshipUpdate[]> {
  assertUuid(mentorshipId, 'mentorship id');
  const { data, error } = await supabase.rpc('list_mentorship_updates', { p_id: mentorshipId, p_limit: 80 });
  throwIfRpcError(error, 'Could not load updates.');
  return (data ?? []).map((r: any) => ({
    id: r.id,
    mentorshipId: r.mentorship_id,
    authorId: r.author_id,
    authorName: r.author_name,
    kind: r.kind,
    body: r.body,
    linkUrl: r.link_url,
    createdAt: r.created_at,
  }));
}

export async function postMentorshipUpdate(
  mentorshipId: string,
  body: string,
  kind: 'note' | 'progress' | 'resource' = 'note',
  linkUrl?: string,
): Promise<void> {
  assertUuid(mentorshipId, 'mentorship id');
  const { error } = await supabase.rpc('post_mentorship_update', {
    p_id: mentorshipId,
    p_body: body,
    p_kind: kind,
    p_link: linkUrl?.trim() || null,
  });
  throwIfRpcError(error, 'Could not post this update.');
}

export async function listMentorshipFeedback(mentorshipId: string): Promise<MentorshipFeedback[]> {
  assertUuid(mentorshipId, 'mentorship id');
  const { data, error } = await supabase.from('mentorship_feedback').select('*').eq('mentorship_id', mentorshipId);
  throwIfRpcError(error, 'Could not load feedback.');
  return (data ?? []).map((r: any) => ({
    mentorshipId: r.mentorship_id,
    fromUser: r.from_user,
    toUser: r.to_user,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
  }));
}

export async function submitMentorshipFeedback(mentorshipId: string, rating: number, comment?: string): Promise<void> {
  assertUuid(mentorshipId, 'mentorship id');
  const { error } = await supabase.rpc('submit_mentorship_feedback', {
    p_id: mentorshipId,
    p_rating: rating,
    p_comment: comment?.trim() || null,
  });
  throwIfRpcError(error, 'Could not save your feedback.');
}
