import { supabase } from './supabase';

export interface MyDevice {
  id: string;
  platform: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * "Devices with notifications registered" for the signed-in user - built on
 * push_tokens (supabase_launch_hardening_2026.sql), one row per device the
 * app was opened on and granted push permission. There is no separate
 * session/device table, so this is the closest real signal of "where am I
 * signed in" the backend has; it will not list a device that never enabled
 * push.
 */
export async function listMyDevices(): Promise<MyDevice[]> {
  const { data, error } = await supabase
    .from('push_tokens')
    .select('id, platform, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) {
    console.warn('[Devices] listMyDevices failed:', error.message);
    return [];
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    platform: row.platform,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function removeMyDevice(id: string): Promise<void> {
  const { error } = await supabase.from('push_tokens').delete().eq('id', id);
  if (error) {
    console.warn('[Devices] removeMyDevice failed:', error.message);
    throw new Error('Could not remove this device. Please try again.');
  }
}
