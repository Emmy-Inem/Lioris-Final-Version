import { supabase } from './supabase';

export interface NotificationPreferences {
  push: boolean;
  announcements: boolean;
  events: boolean;
  emailDigest: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push: true,
  announcements: true,
  events: true,
  emailDigest: true,
};

/** No row yet means every category defaults on - mirrors the column defaults server-side. */
export async function getMyNotificationPreferences(): Promise<NotificationPreferences> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('push_enabled, announcements_enabled, events_enabled, digest_enabled')
    .maybeSingle();
  if (error || !data) return DEFAULT_NOTIFICATION_PREFERENCES;
  return {
    push: data.push_enabled ?? true,
    announcements: data.announcements_enabled ?? true,
    events: data.events_enabled ?? true,
    emailDigest: data.digest_enabled ?? true,
  };
}

export async function updateMyNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id;
  if (!userId) throw new Error('You need to be signed in to update notification preferences.');

  const { error } = await supabase.from('notification_preferences').upsert({
    user_id: userId,
    push_enabled: prefs.push,
    announcements_enabled: prefs.announcements,
    events_enabled: prefs.events,
    digest_enabled: prefs.emailDigest,
  });
  if (error) {
    console.warn('[NotificationPreferences] upsert failed:', error.message);
    throw new Error('Could not save your notification preferences. Please try again.');
  }
}
