import { supabase } from './supabase';
import { assertUuid } from '@/utils/postgrest';
import { throwIfRpcError } from '@/utils/rpcErrors';

/**
 * Wraps admin_get_user_diagnostics() (20261005040000_admin_user_diagnostics.sql):
 * a SECURITY DEFINER read-only summary of a user's mute activity, job alerts,
 * and notification preferences, for admins/staff handling a complaint
 * ("I'm still seeing someone I muted", "I'm not getting my job alerts").
 * The RPC enforces its own admin/staff check (staff are campus-scoped to
 * their own campus) - callers do not need to check the role themselves.
 */

export interface UserDiagnosticsMuteEntry {
  userId: string;
  fullName: string;
  createdAt: string;
}

export interface UserDiagnosticsJobAlert {
  id: string;
  keywords: string | null;
  jobType: string | null;
  remoteOnly: boolean;
  campusCode: string | null;
  isActive: boolean;
  createdAt: string;
  lastNotifiedAt: string | null;
}

export interface UserDiagnostics {
  userId: string;
  mutes: {
    mutedCount: number;
    mutedByCount: number;
    recentMuted: UserDiagnosticsMuteEntry[];
    recentMutedBy: UserDiagnosticsMuteEntry[];
  };
  jobAlerts: {
    activeCount: number;
    totalCount: number;
    alerts: UserDiagnosticsJobAlert[];
  };
  notificationPreferences: {
    /** false when the user never saved a row - the 4 flags below are then the same all-on defaults the client itself assumes. */
    hasCustomRow: boolean;
    pushEnabled: boolean;
    announcementsEnabled: boolean;
    eventsEnabled: boolean;
    digestEnabled: boolean;
    updatedAt: string | null;
  };
}

function mapMuteEntry(row: any): UserDiagnosticsMuteEntry {
  return {
    userId: row.user_id,
    fullName: row.full_name ?? 'Unknown User',
    createdAt: row.created_at,
  };
}

function mapJobAlert(row: any): UserDiagnosticsJobAlert {
  return {
    id: row.id,
    keywords: row.keywords,
    jobType: row.job_type,
    remoteOnly: !!row.remote_only,
    campusCode: row.campus_code,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    lastNotifiedAt: row.last_notified_at,
  };
}

/** Throws on any real failure (not admin/staff, user not found, staff out of campus, network). */
export async function getUserDiagnostics(userId: string): Promise<UserDiagnostics> {
  assertUuid(userId, 'user id');

  const { data, error } = await supabase.rpc('admin_get_user_diagnostics', { p_user_id: userId });
  throwIfRpcError(error, 'Could not load diagnostics for this user.');
  if (!data) {
    throw new Error('Could not load diagnostics for this user.');
  }

  const mutes = data.mutes ?? {};
  const jobAlerts = data.job_alerts ?? {};
  const prefs = data.notification_preferences ?? {};

  return {
    userId: data.user_id,
    mutes: {
      mutedCount: Number(mutes.muted_count ?? 0),
      mutedByCount: Number(mutes.muted_by_count ?? 0),
      recentMuted: (mutes.recent_muted ?? []).map(mapMuteEntry),
      recentMutedBy: (mutes.recent_muted_by ?? []).map(mapMuteEntry),
    },
    jobAlerts: {
      activeCount: Number(jobAlerts.active_count ?? 0),
      totalCount: Number(jobAlerts.total_count ?? 0),
      alerts: (jobAlerts.alerts ?? []).map(mapJobAlert),
    },
    notificationPreferences: {
      hasCustomRow: !!prefs.has_custom_row,
      pushEnabled: prefs.push_enabled ?? true,
      announcementsEnabled: prefs.announcements_enabled ?? true,
      eventsEnabled: prefs.events_enabled ?? true,
      digestEnabled: prefs.digest_enabled ?? true,
      updatedAt: prefs.updated_at ?? null,
    },
  };
}
