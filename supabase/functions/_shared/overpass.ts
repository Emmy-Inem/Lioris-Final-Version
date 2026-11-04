// Pure helper (no Deno / network imports, so node --test can import it).
//
// Overpass answers HTTP 200 with a valid JSON body even when the query failed: a busy mirror returns
// { "elements": [], "remark": "runtime error: Query timed out ..." } (or "out of memory", "rate_limited").
// Treating that as success would hand an empty map to the client AND cache it for 10 minutes for the whole
// 1 km grid cell, so the proxy only accepts a body that is a real result and lets the next mirror win.

export function isUsableOverpassResponse(text: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const { elements, remark } = parsed as { elements?: unknown; remark?: unknown };
  if (!Array.isArray(elements)) return false;
  if (typeof remark === 'string' && /runtime error|out of memory|timed out|rate_limited|too many requests/i.test(remark)) {
    return false;
  }
  return true;
}
