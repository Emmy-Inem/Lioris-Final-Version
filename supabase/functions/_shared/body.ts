// Bounded request-body reader. Rejects oversized bodies BEFORE JSON parsing, both
// via Content-Length (fast path) and by counting streamed bytes (defence against
// a lying / absent Content-Length).

export type BodyResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 413; error: string };

export async function readJsonBody<T = Record<string, unknown>>(
  req: Request,
  maxBytes: number,
): Promise<BodyResult<T>> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, error: 'Request body too large.' };
  }
  if (!req.body) return { ok: false, status: 400, error: 'Invalid JSON request body.' };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413, error: 'Request body too large.' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON request body.' };
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(merged));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, status: 400, error: 'Invalid JSON request body.' };
    }
    return { ok: true, value: parsed as T };
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON request body.' };
  }
}
