import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { getFriendlyErrorMessage, isCredentialError, isNetworkError } from './errors.ts';

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
    'Please confirm your campus email address before signing in. Check your inbox or request a new code.',
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
