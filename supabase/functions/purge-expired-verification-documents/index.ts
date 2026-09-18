// purge-expired-verification-documents
//
// Data-retention job: removes identity-verification evidence documents from the
// private `verifications` bucket once they are older than the retention window
// (30 days). The list of expired objects comes from the service_role-only RPC
// public.list_expired_verification_documents(p_days), and the objects are removed
// through the Storage API (deleting the storage.objects row directly would orphan
// the underlying file).
//
// Invoked by a scheduled Supabase cron (pg_cron + pg_net, or an external scheduler),
// NOT by users, so it is deployed WITHOUT JWT verification and instead requires a
// shared secret header compared in constant time:
//
//   x-cron-secret: <CRON_SECRET>
//
// Deployment:
//   supabase functions deploy purge-expired-verification-documents --no-verify-jwt
//   supabase secrets set CRON_SECRET=<long random string> SUPABASE_SERVICE_ROLE_KEY=<...>
//
// Response: { success: true, expired: <n>, removed: <n>, buckets: { <bucket>: <n> } }
// The function is idempotent; re-running only removes what is still expired.

import { timingSafeEqual } from '../_shared/auth.ts';
import { createServiceClient } from '../_shared/ratelimit.ts';
import { removeObjects } from '../_shared/purge.ts';

const RETENTION_DAYS = 30;
const ALLOWED_BUCKETS = new Set(['verifications']);

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request) => {
  // Machine-to-machine endpoint: no CORS headers are emitted on purpose.
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || secret.length < 16) {
    console.error('[purge-expired-verification-documents] CRON_SECRET missing or too short.');
    return json({ error: 'Server misconfiguration.' }, 500);
  }
  const provided = req.headers.get('x-cron-secret') ?? '';
  if (!timingSafeEqual(provided, secret)) {
    return json({ error: 'Unauthorized.' }, 401);
  }

  const admin = createServiceClient();
  if (!admin) {
    console.error('[purge-expired-verification-documents] Missing service role secret.');
    return json({ error: 'Server misconfiguration.' }, 500);
  }

  try {
    const { data, error } = await admin.rpc('list_expired_verification_documents', { p_days: RETENTION_DAYS });
    if (error) throw error;

    const rows = (Array.isArray(data) ? data : []) as { bucket: string; path: string }[];
    const byBucket = new Map<string, string[]>();
    for (const row of rows) {
      if (!row?.bucket || !row?.path || !ALLOWED_BUCKETS.has(row.bucket)) continue;
      const list = byBucket.get(row.bucket) ?? [];
      list.push(row.path);
      byBucket.set(row.bucket, list);
    }

    const buckets: Record<string, number> = {};
    let removed = 0;
    for (const [bucket, paths] of byBucket) {
      const n = await removeObjects(admin, bucket, paths);
      buckets[bucket] = n;
      removed += n;
    }

    return json({ success: true, expired: rows.length, removed, buckets }, 200);
  } catch (err) {
    console.error(
      '[purge-expired-verification-documents] failed:',
      err instanceof Error ? err.message : 'unknown',
    );
    return json({ error: 'Purge failed.' }, 500);
  }
});
