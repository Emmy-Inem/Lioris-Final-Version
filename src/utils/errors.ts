/**
 * Centralized, human-friendly error mapping utility for Lioris.
 * Translates low-level Postgres, Supabase, network, and storage error codes
 * into clear, actionable, friendly messages for university students and staff.
 */

export interface ErrorShape {
  message?: string;
  code?: string;
  error_description?: string;
  status?: number | string;
  name?: string;
}

/**
 * Converts any unknown error, exception, or API response into a clear,
 * human-readable message.
 */
export function getFriendlyErrorMessage(error: unknown, fallback?: string): string {
  if (!error) {
    return fallback || 'An unexpected error occurred. Please try again.';
  }

  // Extract message string from various shapes
  let rawMsg = '';
  let rawCode = '';

  if (typeof error === 'string') {
    rawMsg = error;
  } else if (typeof error === 'object' && error !== null) {
    const err = error as ErrorShape;
    rawMsg = err.message || err.error_description || (error as Error).name || '';
    rawCode = (err.code ? String(err.code) : '') || (err.status ? String(err.status) : '');
  }

  const msg = rawMsg.toLowerCase().trim();
  const code = rawCode.toLowerCase().trim();

  // 1. Password & Credential Failures
  if (
    msg.includes('invalid login credentials') ||
    msg.includes('invalid credentials') ||
    msg.includes('invalid_credentials') ||
    msg.includes('wrong password') ||
    msg.includes('invalid password') ||
    code === 'invalid_grant'
  ) {
    return 'Incorrect password. Please verify your password and try again, or reset it if forgotten.';
  }

  // 2. Email Confirmation Failures
  if (
    msg.includes('email not confirmed') ||
    msg.includes('email has not been confirmed') ||
    msg.includes('confirm your email') ||
    code === 'email_not_confirmed' ||
    code === 'email_unconfirmed'
  ) {
    return 'Please confirm your campus email address before signing in. Check your inbox or request a new code.';
  }

  // 3. User Already Exists / Duplicate Account
  if (
    msg.includes('user already registered') ||
    msg.includes('user_already_exists') ||
    msg.includes('already exists') ||
    msg.includes('duplicate key') && msg.includes('email') ||
    code === '23505' && msg.includes('email')
  ) {
    return 'An account with this email address already exists. Please sign in or reset your password.';
  }

  if (
    msg.includes('username is already taken') ||
    msg.includes('username') && (msg.includes('already taken') || msg.includes('duplicate')) ||
    code === '23505' && msg.includes('username')
  ) {
    return 'This username is already taken. Please choose another username.';
  }

  // 4. User Not Found
  if (
    msg.includes('user not found') ||
    msg.includes('no user found') ||
    code === 'user_not_found' ||
    code === 'pgrst116'
  ) {
    return 'No account was found with those details. Please check your spelling or create a new account.';
  }

  // 5. Rate Limits / Lockouts
  if (
    msg.includes('over_email_send_rate_limit') ||
    msg.includes('email rate limit exceeded') ||
    msg.includes('too many emails')
  ) {
    return 'Too many emails requested. Please wait 60 seconds before requesting another code.';
  }

  if (
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('too many failed') ||
    msg.includes('locked for security') ||
    code === '429'
  ) {
    return 'Too many attempts. Please slow down and try again in a few moments.';
  }

  // 6. OTP & Recovery Code Failures
  if (
    msg.includes('otp has expired') ||
    msg.includes('token has expired') ||
    msg.includes('expired recovery code') ||
    msg.includes('expired or is invalid') ||
    msg.includes('token_expired')
  ) {
    return 'This verification code or recovery link has expired. Please request a fresh one.';
  }

  if (
    msg.includes('invalid otp') ||
    msg.includes('invalid or expired recovery code') ||
    msg.includes('invalid recovery code') ||
    msg.includes('invalid verification code') ||
    msg.includes('token is invalid')
  ) {
    return 'Incorrect code. Please double-check the 6-digit code sent to your email.';
  }

  // 7. Password Policy
  if (
    msg.includes('password should be at least') ||
    msg.includes('password does not meet') ||
    msg.includes('weak password')
  ) {
    return 'Password does not meet the security criteria (at least 8 characters with uppercase, lowercase, numbers, and symbols).';
  }

  if (msg.includes('same_password') || msg.includes('same as old')) {
    return 'New password cannot be the same as your current password.';
  }

  // 8. Storage & File Upload Errors
  if (
    msg.includes('violates row-level security') ||
    msg.includes('security policy') ||
    code === '42501'
  ) {
    return "You don't have permission to perform this action. Please check your verification status or sign in again.";
  }

  if (
    msg.includes('payload too large') ||
    msg.includes('entity too large') ||
    msg.includes('file size') ||
    code === '413'
  ) {
    return 'The selected file is too large. Maximum allowed file size is 10 MB.';
  }

  if (msg.includes('bucket not found')) {
    return 'File storage is temporarily unreachable. Please try again in a few minutes.';
  }

  if (msg.includes('invalid mime') || msg.includes('unsupported file') || msg.includes('mime type')) {
    return 'Unsupported file format. Please upload an image (JPG, PNG) or PDF document.';
  }

  // 9. Network & Server Errors
  if (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('err_connection_refused') ||
    msg.includes('err_name_not_resolved') ||
    msg.includes('err_internet_disconnected') ||
    msg.includes('timeout') ||
    msg.includes('aborterror') ||
    code === 'econnrefused' ||
    code === 'enetunreach'
  ) {
    return 'Unable to connect to campus servers. Please check your internet connection and try again.';
  }

  // 10. Security / Captcha
  if (
    msg.includes('captcha') ||
    msg.includes('turnstile') ||
    code === 'captcha_failed'
  ) {
    return 'Security verification check failed or expired. Please complete the security check and try again.';
  }

  // 11. Account Suspension
  if (msg.includes('suspended') || msg.includes('revoked')) {
    return 'Your campus account has been suspended by administration. Access has been revoked.';
  }

  // If rawMsg is already a clean user-facing sentence (e.g. without SQL or technical keywords), return it
  if (
    rawMsg &&
    !rawMsg.includes('PGRST') &&
    !rawMsg.includes('syntax error') &&
    !rawMsg.includes('violates') &&
    !rawMsg.includes('column') &&
    !rawMsg.includes('relation') &&
    !rawMsg.includes('HTTP ') &&
    rawMsg.length < 150
  ) {
    return rawMsg;
  }

  return fallback || 'Something went wrong. Please check your information and try again.';
}

/** Returns true if the error was caused by offline / network unavailability */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  const msg = (typeof error === 'string' ? error : (error as any)?.message || '').toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('err_connection') ||
    msg.includes('internet') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused')
  );
}

/** Returns true if the error indicates a password or credentials mistake */
export function isCredentialError(error: unknown): boolean {
  if (!error) return false;
  const msg = (typeof error === 'string' ? error : (error as any)?.message || '').toLowerCase();
  return (
    msg.includes('invalid login credentials') ||
    msg.includes('invalid credentials') ||
    msg.includes('wrong password') ||
    msg.includes('invalid password') ||
    msg.includes('incorrect password')
  );
}
