/**
 * Generates an RFC4122 version 4 compliant UUID.
 * Compatible across Web, iOS, Android, and Node environments.
 * Prefers a cryptographically secure source; only falls back to Math.random
 * when no Web Crypto implementation is available.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      try {
        return crypto.randomUUID();
      } catch {
        // fall through to getRandomValues
      }
    }
    if (typeof crypto.getRandomValues === 'function') {
      try {
        const b = crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
        return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h
          .slice(8, 10)
          .join('')}-${h.slice(10, 16).join('')}`;
      } catch {
        // fall through to Math.random
      }
    }
  }

  // RFC4122 v4 compliant fallback (non-cryptographic)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
