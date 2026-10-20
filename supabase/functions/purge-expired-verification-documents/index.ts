// purge-expired-verification-documents
//
// Data-retention job: removes identity-verification evidence documents from the
// private `verifications` bucket once they are older than the retention window
// (30 days). The list of expired objects comes from the service_role-only RPC
// public.list_expired_verification_documents(p_days[, p_limit]), and the objects are
// removed through the Storage API (deleting the storage.objects row directly would
// orphan the underlying file).
//
// Batched: each round lists at most BATCH_SIZE documents (p_limit), removes them, then reports the
// removed rows' verification ids to public.clear_verification_document_paths(uuid[]) so the evidence
// path columns are forgotten too. Rounds repeat until the list is empty, or MAX_BATCHES is reached
// (then `more: true` is returned and the next scheduled run continues). Both RPC extras are used
// defensively: an older database whose list function has no p_limit is called without it (one
// unbatched pass), and a missing clear function is simply skipped.
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
// Response: { success: true, expired: <n>, removed: <n>, cleared: <n>, batches: <n>, more: <bool>,
//             buckets: { <bucket>: <n> } }
// On failure: 500 { error: 'Purge failed.', partial: { expired, removed, cleared, batches } } - the
// counts of what DID complete before the failure. The function is idempotent; re-running only
// removes what is still expired.

import { timingSafeEqual } from '../_shared/auth.ts';
import { createServiceClient } from '../_shared/ratelimit.ts';
import { removeObjects } from '../_shared/purge.ts';

const RETENTION_DAYS = 30;
const ALLOWED_BUCKETS = new Set(['verifications']);
const BATCH_SIZE = 200;
const MAX_BATCHES = 25;
const REMOVE_PIECE = 100;

interface ExpiredRow {
  bucket: string;
  path: string;
  verification_id?: string | null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** True when PostgREST says the RPC (or that overload / parameter) does not exist. */
function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return error.code === 'PGRST202' || error.code === '42883' || msg.includes('could not find the function');
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

  const buckets: Record<string, number> = {};
  let expired = 0;
  let removed = 0;
  let cleared = 0;
  let batches = 0;
  let more = false;
  let supportsLimit = true;
  let clearAvailable = true;

  try {
    while (true) {
      if (batches >= MAX_BATCHES) {
        more = true;
        break;
      }

      let listed = supportsLimit
        ? await admin.rpc('list_expired_verification_documents', { p_days: RETENTION_DAYS, p_limit: BATCH_SIZE })
        : await admin.rpc('list_expired_verification_documents', { p_days: RETENTION_DAYS });
      if (listed.error && supportsLimit && isMissingRpc(listed.error)) {
        // Older database: the list function has no p_limit. One unbatched pass.
        supportsLimit = false;
        listed = await admin.rpc('list_expired_verification_documents', { p_days: RETENTION_DAYS });
      }
      if (listed.error) throw listed.error;

      const rows = ((Array.isArray(listed.data) ? listed.data : []) as ExpiredRow[]).filter(
        (r) => r?.bucket && r?.path && ALLOWED_BUCKETS.has(r.bucket),
      );
      if (rows.length === 0) break;
      batches++;
      expired += rows.length;

      // Remove in pieces so we know exactly which paths are gone.
      const goneKeys = new Set<string>();
      let pieceFailed = false;
      const byBucket = new Map<string, string[]>();
      for (const r of rows) {
        const list = byBucket.get(r.bucket) ?? [];
        list.push(r.path);
        byBucket.set(r.bucket, list);
      }
      for (const [bucket, paths] of byBucket) {
        for (let i = 0; i < paths.length; i += REMOVE_PIECE) {
          const piece = paths.slice(i, i + REMOVE_PIECE);
          try {
            const n = await removeObjects(admin, bucket, piece);
            buckets[bucket] = (buckets[bucket] ?? 0) + n;
            removed += n;
            for (const p of piece) goneKeys.add(`${bucket}\u0000${p}`);
          } catch (err) {
            pieceFailed = true;
            console.error(
              '[purge-expired-verification-documents] remove failed:',
              err instanceof Error ? err.message : 'unknown',
            );
          }
        }
      }

      // Forget the evidence paths of verification requests whose every listed object is gone.
      if (clearAvailable) {
        const incomplete = new Set<string>();
        const ids = new Set<string>();
        for (const r of rows) {
          if (!r.verification_id) continue;
          if (goneKeys.has(`${r.bucket}\u0000${r.path}`)) ids.add(r.verification_id);
          else incomplete.add(r.verification_id);
        }
        const toClear = [...ids].filter((id) => !incomplete.has(id));
        if (toClear.length > 0) {
          const { data, error } = await admin.rpc('clear_verification_document_paths', { p_ids: toClear });
          if (error) {
            if (isMissingRpc(error)) clearAvailable = false; // RPC not deployed: ignore
            else console.error('[purge-expired-verification-documents] clear paths failed:', error.message);
          } else if (typeof data === 'number') {
            cleared += data;
          }
        }
      }

      // A round that removed nothing would list the same rows again forever; stop and report.
      if (goneKeys.size === 0 || pieceFailed) throw new Error('storage removal failed');
      // Without p_limit the function already returned everything in one pass.
      if (!supportsLimit) break;
      // A short page means the backlog is drained.
      if (rows.length < BATCH_SIZE) break;
    }

    return json({ success: true, expired, removed, cleared, batches, more, buckets }, 200);
  } catch (err) {
    console.error(
      '[purge-expired-verification-documents] failed:',
      err instanceof Error ? err.message : 'unknown',
    );
    return json({ error: 'Purge failed.', partial: { expired, removed, cleared, batches } }, 500);
  }
});
