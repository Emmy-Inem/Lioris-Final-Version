import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { getFriendlyErrorMessage, isCredentialError, isMinorRestrictedError, isNetworkError } from './errors.ts';

test('translates invalid login credentials to clear incorrect password message', () => {
  const result = getFriendlyErrorMessage(new Error('Invalid login credentials'));
  assert.equal(
    result,
    'Incorrect password. Please verify your password and try again, or reset it if forgotten.',
  );
  assert.equal(isCredentialError(new Error('Invalid login credentials')), true);
});

test('translates email confirmation required', () => {
  const result = getFriendlyErrorMessage({ message: 'Email not confirmed' });
  assert.equal(
    result,
    'Please confirm your email address before signing in. Check your inbox or request a new code.',
  );
});

test('translates duplicate user email', () => {
  const result = getFriendlyErrorMessage(new Error('User already registered'));
  assert.equal(
    result,
    'An account with this email address already exists. Please sign in or reset your password.',
  );
});

test('translates storage row level security violation to friendly message', () => {
  const result = getFriendlyErrorMessage(
    new Error('new row violates row-level security policy for table "objects"'),
  );
  assert.equal(
    result,
    "You don't have permission to perform this action. Please check your verification status or sign in again.",
  );
});

test('translates file size limit exceeded', () => {
  const result = getFriendlyErrorMessage({ message: 'Payload too large', code: '413' });
  assert.equal(
    result,
    'The selected file is too large. Maximum allowed file size is 10 MB.',
  );
});

test('translates network offline errors', () => {
  const err = new Error('Failed to fetch');
  assert.equal(isNetworkError(err), true);
  assert.equal(
    getFriendlyErrorMessage(err),
    'Unable to connect to campus servers. Please check your internet connection and try again.',
  );
});

test('translates rate limit errors', () => {
  const result = getFriendlyErrorMessage({ message: 'over_email_send_rate_limit' });
  assert.equal(
    result,
    'Too many emails requested. Please wait 60 seconds before requesting another code.',
  );
});

test('translates expired tokens', () => {
  const result = getFriendlyErrorMessage(new Error('Token has expired or is invalid'));
  assert.equal(
    result,
    'This verification code or recovery link has expired. Please request a fresh one.',
  );
});

test('preserves approaching limit warnings and lockout countdowns intact', () => {
  const warnMsg = 'Incorrect password. (Warning: 2 attempts remaining before temporary account lock.)';
  assert.equal(getFriendlyErrorMessage(new Error(warnMsg)), warnMsg);

  const lockMsg = 'Too many failed login attempts. Account temporarily locked for security. Please try again in 54s.';
  assert.equal(getFriendlyErrorMessage(new Error(lockMsg)), lockMsg);
});

test('age-rule refusals from the database show their own sentence, even with the generic permission code', () => {
  const restricted = { code: '42501', message: 'MINOR_RESTRICTED: Members under 18 cannot create marketplace listings.' };
  assert.equal(getFriendlyErrorMessage(restricted), 'Members under 18 cannot create marketplace listings.');
  assert.equal(isMinorRestrictedError(restricted), true);
  assert.equal(isMinorRestrictedError(new Error('new row violates row-level security policy')), false);
  assert.equal(
    getFriendlyErrorMessage({ message: 'AGE_UNDER_13: You must be at least 13 years old to create a Lioris account.' }),
    'You must be at least 13 years old to create a Lioris account.',
  );
  assert.equal(
    getFriendlyErrorMessage(new Error('DOB_LOCKED: Your date of birth is already on record and cannot be changed. Contact support to correct a mistake.')),
    'Your date of birth is already on record and cannot be changed. Contact support to correct a mistake.',
  );
  assert.equal(
    getFriendlyErrorMessage({ code: 'P0001', message: 'GUARDIAN_INVALID: Enter your parent or guardian\'s full name.' }),
    "Enter your parent or guardian's full name.",
  );
  // an ordinary row-level-security failure keeps the generic wording
  assert.match(getFriendlyErrorMessage({ code: '42501', message: 'permission denied for table x' }), /permission/);
});

test('raw database and runtime text never reaches the member, even when short and without a code', () => {
  const raw = [
    'invalid input syntax for type uuid: "abc"',
    'value too long for type character varying(100)',
    'function public.get_feed(uuid) does not exist',
    'Could not find the function public.foo(p_id) in the schema cache',
    "Cannot read properties of undefined (reading 'id')",
    "undefined is not an object (evaluating 'row.title')",
    'x.map is not a function',
    'Unexpected token < in JSON at position 0',
    'deadlock detected',
  ];
  for (const message of raw) {
    assert.equal(getFriendlyErrorMessage({ message }, 'FALLBACK'), 'FALLBACK', message);
  }
});

test('"already exists" only means a duplicate account when the message is about an account or e-mail', () => {
  assert.equal(
    getFriendlyErrorMessage({ message: 'A community with that name already exists.' }, 'FALLBACK'),
    'A community with that name already exists.',
  );
  assert.match(getFriendlyErrorMessage({ message: 'User already registered' }), /account with this email/i);
  assert.match(getFriendlyErrorMessage({ message: 'A user with this email address already exists' }), /account with this email/i);
});

test('app-written sentences are still passed through', () => {
  assert.equal(getFriendlyErrorMessage({ message: 'This listing has expired.' }, 'FALLBACK'), 'This listing has expired.');
  assert.equal(getFriendlyErrorMessage({ message: 'Event does not exist anymore.' }, 'FALLBACK'), 'Event does not exist anymore.');
});

test('a bare "permission denied" from the database gets the permission message', () => {
  assert.match(getFriendlyErrorMessage({ message: 'permission denied for table profiles' }), /don't have permission/i);
});

test('an upload size refusal keeps the bucket-specific limit instead of the generic 10 MB text', () => {
  const msg = 'File size (30.0MB) exceeds the maximum allowed limit of 25MB for campus-media.';
  assert.equal(getFriendlyErrorMessage(new Error(msg)), msg);
  // The storage server's own wording (no limit given) still gets the generic message.
  assert.match(getFriendlyErrorMessage({ message: 'The object exceeded the maximum allowed size', status: 413 }), /too large/i);
});
