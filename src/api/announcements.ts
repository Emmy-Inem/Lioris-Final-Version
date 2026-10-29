import { supabase } from './supabase';
import { getSessionUser } from '../auth/tokenStorage';
import { Announcement } from './types';
import { generateUUID } from '../utils/uuid';
import { escapePostgrestLike } from '../utils/postgrest';
import { broadcastNotification } from './notifications';
import { recordAuditLogEntry } from './auditLog';

// Announcements this session has *successfully* written to Supabase, kept
// here only so they render instantly before the next refetch. There are no
// bundled fixtures: the local pool holds nothing but those own creations.
let locallyCreatedAnnouncements: Announcement[] = [];



export async function listAnnouncements(options?: { campusCode?: string; [key: string]: any }): Promise<Announcement[]> {
  let q = supabase
    .from('announcements')
    .select('*, author:profiles!announcements_author_id_fkey(full_name)')
    .order('published_at', { ascending: false });

  const targetCampus = options && typeof options === 'object' && typeof options.campusCode === 'string'
    ? options.campusCode
    : undefined;

  if (targetCampus && targetCampus !== 'ALL') {
    // Campus codes are plain identifiers: strip anything else before it goes into a PostgREST filter string.
    const safeCampus = escapePostgrestLike(targetCampus).replace(/[^A-Za-z0-9_-]/g, '');
    q = safeCampus
      ? q.or(`campus_code.eq.${safeCampus},campus_code.eq.GLOBAL,campus_code.is.null`)
      : q.or('campus_code.eq.GLOBAL,campus_code.is.null');
  }

  const { data, error } = await q;

 if (error) throw error;

 const dbItems: Announcement[] = (data ?? []).map((row: any) => ({
 id: row.id,
 authorId: row.author_id,
 authorName: row.author?.full_name || 'Campus Administrator',
 campusCode: row.campus_code || 'GLOBAL',
 title: row.title,
 content: row.content,
 audienceScope: row.audience_scope as any,
 priority: row.priority as any,
 publishedAt: row.published_at,
 expiresAt: row.expires_at,
 }));

 const merged = [...dbItems];
  for (const item of [...locallyCreatedAnnouncements]) {
 if (!merged.some((m) => m.id === item.id)) {
 merged.push(item);
 }
 }
 return merged;
}

export interface PublishAnnouncementPayload {
 title: string;
 content: string;
 audienceScope: Announcement['audienceScope'];
 priority: Announcement['priority'];
 campusCode?: string;
 expiresAt?: string;
}

/** The saved announcement plus what the notification fan-out really did. */
export type PublishedAnnouncement = Announcement & {
 /** How many members were notified (0 when the fan-out failed - see notifyError). */
 notifiedCount: number;
 /** Set when the announcement was saved but its notifications could not be sent. */
 notifyError?: string;
};

/** Maps an announcement's scope + campus onto the broadcast audience (GLOBAL announcements reach every campus). */
function audienceFor(
 scope: Announcement['audienceScope'],
 campus: string,
): { campusCode: string; roles?: Array<'student' | 'alumni' | 'staff'> } {
 const roles = scope === 'student' || scope === 'alumni' || scope === 'staff' ? [scope] : undefined;
 return { campusCode: !campus || campus === 'GLOBAL' ? 'ALL' : campus, roles };
}

/**
 * How many members an announcement would reach right now (same authority checks and filters as the
 * real send, nothing is sent). Used by the composer's confirmation dialog. Throws when the sender is
 * not allowed to reach that audience.
 */
export async function previewAnnouncementAudience(
 payload: Pick<PublishAnnouncementPayload, 'audienceScope' | 'campusCode'>,
 fallbackCampus?: string,
): Promise<number> {
 const campus = payload.campusCode || fallbackCampus || 'GLOBAL';
 const { recipients } = await broadcastNotification({
 ...audienceFor(payload.audienceScope, campus),
 type: 'announcement',
 title: 'preview',
 body: 'preview',
 dryRun: true,
 });
 return recipients;
}

/**
 * Throws if there's no authenticated author or the Supabase insert fails,
 * instead of quietly reporting a campus-wide announcement as published
 * when nobody actually received it. Callers must catch this and show a
 * real error - see the staff Announcements screen.
 */
export async function publishAnnouncement(
 payload: PublishAnnouncementPayload,
): Promise<PublishedAnnouncement> {
 const announcementId = generateUUID();

 const { data: authData } = await supabase.auth.getUser();
 const realAuthorId = authData?.user?.id;

 if (!realAuthorId) {
 throw new Error('You need to be signed in to publish an announcement.');
 }

 const sessionUser = await getSessionUser();
 const authorName = sessionUser?.fullName || authData?.user?.user_metadata?.full_name || 'Campus Staff';

 const { data: prof } = await supabase
 .from('profiles')
 .select('campus_code')
 .eq('id', realAuthorId)
 .maybeSingle();

 const userCampus = payload.campusCode || prof?.campus_code || 'GLOBAL';
 const publishedAt = new Date().toISOString();

 const { error } = await supabase.from('announcements').insert({
 id: announcementId,
 author_id: realAuthorId,
 campus_code: userCampus,
 title: payload.title,
 content: payload.content,
 audience_scope: payload.audienceScope,
 priority: payload.priority,
 published_at: publishedAt,
 expires_at: payload.expiresAt || null,
 });

 if (error) {
 console.warn('[Announcements] Database insert error:', error.message);
 throw new Error('Could not publish this announcement. Please try again.');
 }

 // Notify the audience through admin_broadcast_notification(): the database resolves the audience
 // (suspended / bot accounts and members who muted announcements are skipped), checks that the sender
 // may reach it, rate limits, links the notifications to this announcement (deleting the announcement
 // removes them) and writes the audit entry in the same transaction. The announcement row above is
 // already saved, so a failure here does not undo it - but it is REPORTED, never swallowed.
 let notifiedCount = 0;
 let notifyError: string | undefined;
 try {
 const result = await broadcastNotification({
 ...audienceFor(payload.audienceScope, userCampus),
 type: 'announcement',
 title: payload.priority === 'critical' ? `\u26A0\uFE0F ${payload.title}` : payload.title,
 body: payload.content,
 deepLinkPath: '/dashboard',
 announcementId,
 });
 notifiedCount = result.recipients;
 } catch (err) {
 notifyError = err instanceof Error ? err.message : 'The notifications could not be sent.';
 console.warn('[Announcements] Notification fan-out failed:', err);
 }

 const created: Announcement = {
 id: announcementId,
 authorId: realAuthorId,
 authorName,
 campusCode: userCampus,
 publishedAt,
 ...payload,
 };

 locallyCreatedAnnouncements = [created, ...locallyCreatedAnnouncements];
 return { ...created, notifiedCount, notifyError };
}

export interface UpdateAnnouncementPayload {
 title?: string;
 content?: string;
 audienceScope?: Announcement['audienceScope'];
 priority?: Announcement['priority'];
 /** Pass `null` to clear an expiry that was previously set. */
 expiresAt?: string | null;
}

/**
 * Edits an announcement in place. Mirrors updatePost's (src/api/posts.ts) error-handling
 * convention: throws both when the `update()` call itself errors AND when it matches zero rows -
 * the latter is how the "Admins and staff can update announcements" UPDATE policy's USING clause
 * shows up for someone it doesn't cover (it filters the row out rather than raising a Postgres
 * error), so a silently-ignored edit never gets reported back to the caller as saved.
 */
export async function updateAnnouncement(
 announcementId: string,
 updates: UpdateAnnouncementPayload,
): Promise<void> {
 const dbPayload: Record<string, any> = {};
 if (updates.title !== undefined) dbPayload.title = updates.title;
 if (updates.content !== undefined) dbPayload.content = updates.content;
 if (updates.audienceScope !== undefined) dbPayload.audience_scope = updates.audienceScope;
 if (updates.priority !== undefined) dbPayload.priority = updates.priority;
 if (updates.expiresAt !== undefined) dbPayload.expires_at = updates.expiresAt;

 if (Object.keys(dbPayload).length === 0) return;

 const { data, error } = await supabase.from('announcements').update(dbPayload).eq('id', announcementId).select('id');
 if (error) {
 console.warn('[Announcements] updateAnnouncement error:', error.message);
 throw new Error('Could not save this announcement. Please try again.');
 }
 if (!data || data.length === 0) {
 throw new Error('This announcement could not be updated. You may not have permission to edit it.');
 }

 void recordAuditLogEntry({
 action: 'announcement_updated',
 summary: `Edited announcement${updates.title ? `: "${updates.title}"` : ''} (${Object.keys(dbPayload).join(', ')})`,
 targetType: 'announcement',
 targetId: announcementId,
 });

 locallyCreatedAnnouncements = locallyCreatedAnnouncements.map((a) =>
 a.id === announcementId
 ? {
 ...a,
 ...(updates.title !== undefined ? { title: updates.title } : {}),
 ...(updates.content !== undefined ? { content: updates.content } : {}),
 ...(updates.audienceScope !== undefined ? { audienceScope: updates.audienceScope } : {}),
 ...(updates.priority !== undefined ? { priority: updates.priority } : {}),
 ...(updates.expiresAt !== undefined ? { expiresAt: updates.expiresAt } : {}),
 }
 : a,
 );
}

/**
 * Unpublishes/removes an announcement. Mirrors deletePost's (src/api/posts.ts) RLS-aware
 * convention: a DELETE that RLS silently filters out reports success with zero rows affected, so
 * the deleted row is re-selected for - still existing means the caller lacked permission, already
 * gone means someone else's delete (or this call) already took effect and is not an error.
 */
export async function deleteAnnouncement(announcementId: string): Promise<void> {
 const previous = locallyCreatedAnnouncements;
 locallyCreatedAnnouncements = locallyCreatedAnnouncements.filter((a) => a.id !== announcementId);

 try {
 const { data: before } = await supabase.from('announcements').select('title, campus_code').eq('id', announcementId).maybeSingle();
 const { data, error } = await supabase.from('announcements').delete().eq('id', announcementId).select('id');
 if (error) throw error;

 if (!data || data.length === 0) {
 const { data: still } = await supabase.from('announcements').select('id').eq('id', announcementId).maybeSingle();
 if (still) {
 locallyCreatedAnnouncements = previous;
 throw new Error('This announcement could not be deleted. You may not have permission to remove it.');
 }
 } else {
 // The notifications that were sent for it (linked by announcement_id) are removed with it by the database.
 void recordAuditLogEntry({
 action: 'announcement_deleted',
 summary: `Deleted announcement${before?.title ? `: "${before.title}"` : ''}`,
 targetType: 'announcement',
 targetId: announcementId,
 institutionCode: before?.campus_code ?? undefined,
 });
 }
 } catch (err) {
 if (err instanceof Error && /could not be deleted/.test(err.message)) throw err;
 console.warn('[Announcements] deleteAnnouncement error:', err);
 locallyCreatedAnnouncements = previous;
 throw new Error('Could not delete this announcement. Please check your connection and try again.');
 }
}
