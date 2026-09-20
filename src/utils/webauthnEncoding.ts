// Pure helpers for the App Shield. Kept free of React Native / Supabase imports so they can be
// unit-tested under plain Node.

/**
 * WebAuthn hands credential ids back as base64url (`-` and `_`, no padding). The original code fed
 * that straight into `atob`, which only understands standard base64 and throws on `-`/`_`, so about
 * half of all credential ids made biometric unlock fail with "The string to be decoded is not
 * correctly encoded". This decodes base64url properly.
 */
export function base64UrlToBuffer(value: string): ArrayBuffer {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

export function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Why a password check against Supabase failed. Drives the message the lock screen shows. */
export type PasswordCheckFailure = 'invalid_credentials' | 'captcha' | 'rate_limited' | 'network' | 'unknown';

export function classifyPasswordCheckError(
  error?: { message?: string; code?: string; error_code?: string; status?: number } | null,
): PasswordCheckFailure {
  if (!error) return 'unknown';
  const msg = (error.message ?? '').toLowerCase();
  const code = (error.code ?? error.error_code ?? '').toLowerCase();

  // Captcha first: the server answers a correct password with a captcha error when no token is sent,
  // and that must never be reported to the user as "wrong password".
  if (code.includes('captcha') || msg.includes('captcha')) return 'captcha';
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return 'invalid_credentials';
  }
  if (
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    error.status === 429 ||
    msg.includes('rate limit') ||
    msg.includes('too many')
  ) {
    return 'rate_limited';
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout')) return 'network';
  return 'unknown';
}

/**
 * Names the unlock method the way this device calls it. "Face ID / Touch ID" is meaningless on an
 * Android phone (and the long label wrapped onto two lines in the button).
 */
export function describeBiometricMethod(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('android')) return 'fingerprint or screen lock';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'Face ID or Touch ID';
  if (ua.includes('mac os')) return 'Touch ID';
  if (ua.includes('windows')) return 'Windows Hello';
  return 'device biometrics';
}
