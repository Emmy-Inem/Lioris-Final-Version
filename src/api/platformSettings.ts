import { supabase } from './supabase';

/**
 * Runtime platform settings kept in public.platform_settings (key -> jsonb), written from
 * Admin > Platform > Campuses & Security and read here so they actually take effect:
 *   maintenance_mode   boolean                        -> <MaintenanceGate/> shows members a maintenance screen
 *   storage_quotas     { maxImageMb, maxPdfMb }       -> checked by every upload before it is sent
 */

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

export async function getPlatformSetting<T>(key: string, fallback: T, opts: { force?: boolean } = {}): Promise<T> {
  const hit = cache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  try {
    const { data, error } = await supabase.from('platform_settings').select('value').eq('key', key).maybeSingle();
    if (error) throw error;
    const raw = data?.value;
    const value = (typeof raw === 'string' ? safeParse(raw) : raw) ?? fallback;
    cache.set(key, { at: Date.now(), value });
    return value as T;
  } catch {
    // Unreadable (signed out, offline): fall back rather than blocking anyone.
    return hit ? (hit.value as T) : fallback;
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Forget cached values, e.g. right after an admin saves a setting on this device. */
export function clearPlatformSettingsCache() {
  cache.clear();
}

export interface StorageQuotas {
  maxImageMb: number;
  maxPdfMb: number;
}

export const DEFAULT_STORAGE_QUOTAS: StorageQuotas = { maxImageMb: 5, maxPdfMb: 25 };

function positiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function getStorageQuotas(): Promise<StorageQuotas> {
  const raw = await getPlatformSetting<Partial<StorageQuotas>>('storage_quotas', DEFAULT_STORAGE_QUOTAS);
  return {
    maxImageMb: positiveNumber(raw?.maxImageMb, DEFAULT_STORAGE_QUOTAS.maxImageMb),
    maxPdfMb: positiveNumber(raw?.maxPdfMb, DEFAULT_STORAGE_QUOTAS.maxPdfMb),
  };
}

/**
 * Throws a readable error when a file is larger than the admin-set limit.
 * `kind` picks which limit applies: images (photos, covers) or documents (notes, PDFs, slides).
 */
export async function assertWithinStorageQuota(bytes: number, kind: 'image' | 'document'): Promise<void> {
  const quotas = await getStorageQuotas();
  const limitMb = kind === 'image' ? quotas.maxImageMb : quotas.maxPdfMb;
  if (bytes > limitMb * 1024 * 1024) {
    throw new Error(
      `${kind === 'image' ? 'Images' : 'Documents'} can be at most ${limitMb} MB. This file is ${(bytes / (1024 * 1024)).toFixed(1)} MB.`,
    );
  }
}

export async function isMaintenanceModeOn(force = false): Promise<boolean> {
  return (await getPlatformSetting<boolean>('maintenance_mode', false, { force })) === true;
}
