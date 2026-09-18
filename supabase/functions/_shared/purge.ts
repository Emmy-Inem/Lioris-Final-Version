// Shared account-erasure logic used by BOTH delete-my-account (self service) and
// admin-delete-user, so admin deletions never orphan storage objects or DB rows.
//
// Order matters and every step is idempotent, so a failed run can simply be retried:
//   1. remove every Storage object under `<uid>/` in the user-owned buckets
//   2. purge_user_data(uid) RPC (deletes all DB rows of the user, service_role only)
//   3. auth.admin.deleteUser(uid)  <- only reached when 1 and 2 succeeded

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const USER_STORAGE_BUCKETS = ['avatars', 'resources', 'campus-media', 'verifications'] as const;

const PAGE_SIZE = 100;
const REMOVE_BATCH = 100;
const MAX_DEPTH = 8;
const MAX_OBJECTS_PER_BUCKET = 20000;

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isMissingBucket(err: { message?: string; statusCode?: string | number; status?: number } | null): boolean {
  if (!err) return false;
  const msg = (err.message ?? '').toLowerCase();
  return msg.includes('bucket not found') || String(err.statusCode ?? err.status) === '404';
}

/** Recursively collect every object path under `prefix` (folders have a null id). */
async function collectPaths(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
  depth: number,
  out: string[],
): Promise<void> {
  if (depth > MAX_DEPTH) throw new Error(`Storage tree under ${bucket}/${prefix} is too deep.`);
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    if (!data || data.length === 0) return;
    for (const entry of data) {
      const full = `${prefix}/${entry.name}`;
      if (entry.id === null || entry.id === undefined) {
        await collectPaths(admin, bucket, full, depth + 1, out);
      } else {
        out.push(full);
      }
      if (out.length > MAX_OBJECTS_PER_BUCKET) {
        throw new Error(`Too many objects under ${bucket}/${prefix}.`);
      }
    }
    if (data.length < PAGE_SIZE) return;
    offset += PAGE_SIZE;
  }
}

/** Remove specific objects from a bucket in batches. Returns the number removed. */
export async function removeObjects(admin: SupabaseClient, bucket: string, paths: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    const batch = paths.slice(i, i + REMOVE_BATCH);
    const { data, error } = await admin.storage.from(bucket).remove(batch);
    if (error) throw error;
    removed += data?.length ?? batch.length;
  }
  return removed;
}

/** Delete ALL storage objects belonging to the user. Throws on any failure. */
export async function purgeUserStorage(admin: SupabaseClient, uid: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const bucket of USER_STORAGE_BUCKETS) {
    const paths: string[] = [];
    try {
      await collectPaths(admin, bucket, uid, 0, paths);
    } catch (err) {
      if (isMissingBucket(err as { message?: string })) {
        counts[bucket] = 0;
        continue;
      }
      throw err;
    }
    counts[bucket] = await removeObjects(admin, bucket, paths);
  }
  return counts;
}

/** Call the purge_user_data RPC (deletes all DB rows of the user, NOT storage files). */
export async function purgeUserData(admin: SupabaseClient, uid: string): Promise<unknown> {
  const { data, error } = await admin.rpc('purge_user_data', { p_user_id: uid });
  if (error) throw error;
  return data;
}

/** Number of admins that are not suspended, optionally excluding one id. */
export async function countActiveAdmins(admin: SupabaseClient, excludeId?: string): Promise<number> {
  let q = admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .or('is_suspended.is.null,is_suspended.eq.false');
  if (excludeId) q = q.neq('id', excludeId);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Full erasure: storage -> DB rows -> Auth user. Returns normally only when all
 * three succeeded. Throws (with the failing step attached) otherwise; the Auth
 * user is NOT deleted unless the earlier steps succeeded, so callers may retry.
 */
export async function eraseUser(
  admin: SupabaseClient,
  uid: string,
): Promise<{ storage: Record<string, number> }> {
  let storage: Record<string, number>;
  try {
    storage = await purgeUserStorage(admin, uid);
  } catch (err) {
    throw Object.assign(new Error('storage_cleanup_failed'), { cause: err });
  }
  try {
    await purgeUserData(admin, uid);
  } catch (err) {
    throw Object.assign(new Error('data_purge_failed'), { cause: err });
  }
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) {
    throw Object.assign(new Error('auth_delete_failed'), { cause: error });
  }
  return { storage };
}
