import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import {
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginAttempts,
  checkPasswordResetRateLimit,
  recordPasswordResetAttempt,
  checkResendCooldown,
  recordResendAttempt,
  checkOtpRateLimit,
  recordOtpFailure,
  clearOtpFailures,
  LOGIN_MAX_ATTEMPTS,
} from './authRateLimit.ts';

test('authRateLimit: records failed login attempts and warns when approaching limit', () => {
  const email = 'student_test1@ui.edu.ng';
  clearLoginAttempts(email);

  // Initial check
  const init = checkLoginRateLimit(email);
  assert.equal(init.allowed, true);
  assert.equal(init.remainingAttempts, LOGIN_MAX_ATTEMPTS);
  assert.equal(init.isApproachingLimit, false);

  // Failure 1
  const f1 = recordLoginFailure(email);
  assert.equal(f1.totalAttempts, 1);
  assert.equal(f1.remainingAttempts, 4);
  assert.equal(f1.isApproachingLimit, false);
  assert.equal(f1.warningMessage, undefined);

  // Failure 2
  const f2 = recordLoginFailure(email);
  assert.equal(f2.totalAttempts, 2);
  assert.equal(f2.remainingAttempts, 3);
  assert.equal(f2.isApproachingLimit, false);

  // Failure 3 (Approaching limit: 2 remaining)
  const f3 = recordLoginFailure(email);
  assert.equal(f3.totalAttempts, 3);
  assert.equal(f3.remainingAttempts, 2);
  assert.equal(f3.isApproachingLimit, true);
  assert.match(f3.warningMessage || '', /Warning: 2 attempts remaining/);

  // Failure 4 (Approaching limit: 1 remaining)
  const f4 = recordLoginFailure(email);
  assert.equal(f4.totalAttempts, 4);
  assert.equal(f4.remainingAttempts, 1);
  assert.equal(f4.isApproachingLimit, true);
  assert.match(f4.warningMessage || '', /Warning: 1 attempt remaining/);

  // Failure 5 (Threshold exceeded: Temporary lock)
  const f5 = recordLoginFailure(email);
  assert.equal(f5.totalAttempts, 5);
  assert.equal(f5.isLocked, true);
  assert.equal(f5.remainingLockoutSeconds, 60);

  // Subsequent login attempt must throw lockout countdown
  assert.throws(
    () => checkLoginRateLimit(email),
    (err: any) => {
      return /temporarily locked for security/i.test(err.message) && /try again in/i.test(err.message);
    },
  );

  // Successful auth clears records
  clearLoginAttempts(email);
  const afterClear = checkLoginRateLimit(email);
  assert.equal(afterClear.allowed, true);
  assert.equal(afterClear.remainingAttempts, LOGIN_MAX_ATTEMPTS);
});

test('authRateLimit: password reset rate limit warns on attempt 2 and blocks after limit', () => {
  const email = 'reset_test1@ui.edu.ng';

  // Attempt 1
  checkPasswordResetRateLimit(email);
  const r1 = recordPasswordResetAttempt(email);
  assert.equal(r1.warning, undefined);

  // Attempt 2 (Approaching limit)
  checkPasswordResetRateLimit(email);
  const r2 = recordPasswordResetAttempt(email);
  assert.match(r2.warning || '', /Warning: You have 1 recovery code request remaining/);

  // Attempt 3 (Limit reached)
  checkPasswordResetRateLimit(email);
  const r3 = recordPasswordResetAttempt(email);
  assert.match(r3.warning || '', /Notice: Maximum password recovery requests reached/);

  // Attempt 4 (Blocked)
  assert.throws(
    () => checkPasswordResetRateLimit(email),
    (err: any) => /Too many password reset requests/i.test(err.message),
  );
});

test('authRateLimit: confirmation email resend enforces 60s cooldown', () => {
  const email = 'resend_test1@ui.edu.ng';
  recordResendAttempt(email);

  assert.throws(
    () => checkResendCooldown(email),
    (err: any) => /Please wait \d+s before requesting another confirmation code/i.test(err.message),
  );
});

test('authRateLimit: otp verification warns at 3 and 4, locks at 5', () => {
  const email = 'otp_test1@ui.edu.ng';
  clearOtpFailures(email);

  checkOtpRateLimit(email);
  recordOtpFailure(email);
  recordOtpFailure(email);

  const o3 = recordOtpFailure(email);
  assert.match(o3.warning || '', /Warning: 2 verification attempts remaining/);

  const o4 = recordOtpFailure(email);
  assert.match(o4.warning || '', /Warning: 1 verification attempt remaining/);

  const o5 = recordOtpFailure(email);
  assert.equal(o5.locked, true);
  assert.equal(o5.remainingSec, 300);

  assert.throws(
    () => checkOtpRateLimit(email),
    (err: any) => /Verification temporarily locked/i.test(err.message),
  );

  clearOtpFailures(email);
  assert.doesNotThrow(() => checkOtpRateLimit(email));
});
