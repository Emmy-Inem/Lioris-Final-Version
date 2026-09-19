import test from 'node:test';
import assert from 'node:assert/strict';
// Node's type stripping needs the explicit .ts extension; tsc does not allow it without allowImportingTsExtensions.
// @ts-ignore TS5097
import { isUnverifiedPersonalUser, getCampusVerificationInfo } from './verificationGate.ts';

test('isUnverifiedPersonalUser flags unverified gmail and yahoo accounts', () => {
  assert.equal(
    isUnverifiedPersonalUser({
      email: 'student@gmail.com',
      isVerified: false,
      verificationStatus: 'none',
      userType: 'student',
    }),
    true
  );

  assert.equal(
    isUnverifiedPersonalUser({
      email: 'student@yahoo.com',
      isVerified: false,
      verificationStatus: 'none',
      userType: 'student',
    }),
    true
  );

  assert.equal(
    isUnverifiedPersonalUser({
      email: 'student@hotmail.com',
      isVerified: false,
      verificationStatus: 'pending',
      userType: 'student',
    }),
    true
  );
});

test('isUnverifiedPersonalUser does not flag verified accounts', () => {
  assert.equal(
    isUnverifiedPersonalUser({
      email: 'student@gmail.com',
      isVerified: true,
      verificationStatus: 'verified',
      userType: 'student',
    }),
    false
  );
});

test('isUnverifiedPersonalUser does not flag institutional email domains', () => {
  assert.equal(
    isUnverifiedPersonalUser({
      email: 'student@unilag.edu.ng',
      isVerified: false,
      verificationStatus: 'none',
      userType: 'student',
    }),
    false
  );

  assert.equal(
    isUnverifiedPersonalUser({
      email: 'student@ui.edu.ng',
      isVerified: false,
      verificationStatus: 'none',
      userType: 'student',
    }),
    false
  );
});

test('isUnverifiedPersonalUser does not flag admins or staff', () => {
  assert.equal(
    isUnverifiedPersonalUser({
      email: 'admin@gmail.com',
      isVerified: false,
      verificationStatus: 'none',
      userType: 'admin',
    }),
    false
  );

  assert.equal(
    isUnverifiedPersonalUser({
      email: 'moderator@yahoo.com',
      isVerified: false,
      verificationStatus: 'none',
      userType: 'staff',
    }),
    false
  );
});

test('isUnverifiedPersonalUser handles null or undefined profiles safely', () => {
  assert.equal(isUnverifiedPersonalUser(null), false);
  assert.equal(isUnverifiedPersonalUser(undefined), false);
});

test('getCampusVerificationInfo returns appropriate campus gate details', () => {
  const unilagInfo = getCampusVerificationInfo('UNILAG');
  assert.equal(unilagInfo.campusCode, 'UNILAG');
  assert.ok(unilagInfo.lockTitle.includes('UNILAG'));
  assert.ok(unilagInfo.commentsGateMessage.includes('UNILAG'));
  assert.ok(unilagInfo.venueGateMessage.includes('UNILAG'));

  const uiInfo = getCampusVerificationInfo('UI');
  assert.equal(uiInfo.campusCode, 'UI');
  assert.ok(uiInfo.lockTitle.includes('UI'));
});
