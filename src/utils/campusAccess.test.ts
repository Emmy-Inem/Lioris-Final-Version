import assert from 'node:assert/strict';
import test from 'node:test';
import { isSuperAdminIdentity, resolveCampusReadScope } from './campusAccess.ts';

test('students cannot widen or change their campus scope', () => {
  const student = { role: 'student', campusCode: 'UI' };
  assert.equal(resolveCampusReadScope(student, 'ALL'), 'UI');
  assert.equal(resolveCampusReadScope(student, 'UNILAG'), 'UI');
});

test('campus admins remain pinned to their assigned campus', () => {
  const campusAdmin = { role: 'admin', adminRole: 'campus_admin', campusCode: 'FUNAAB' };
  assert.equal(isSuperAdminIdentity(campusAdmin), false);
  assert.equal(resolveCampusReadScope(campusAdmin, 'ALL'), 'FUNAAB');
  assert.equal(resolveCampusReadScope(campusAdmin, 'UI'), 'FUNAAB');
});

test('super admins default to all campuses and may narrow deliberately', () => {
  const superAdmin = { role: 'admin', adminRole: 'super_admin', campusCode: 'GLOBAL' };
  assert.equal(isSuperAdminIdentity(superAdmin), true);
  assert.equal(resolveCampusReadScope(superAdmin), 'ALL');
  assert.equal(resolveCampusReadScope(superAdmin, 'UNILAG'), 'UNILAG');
  assert.equal(resolveCampusReadScope(superAdmin, 'GLOBAL'), 'GLOBAL');
});

test('super admin previewing student role still has cross-campus access', () => {
  const previewing = {
    role: 'student',
    actualRole: 'admin',
    isSuperAdmin: true,
    campusCode: 'UI',
    email: 'inememmanuel@gmail.com',
  };
  assert.equal(isSuperAdminIdentity(previewing), true);
  assert.equal(resolveCampusReadScope(previewing), 'ALL');
  assert.equal(resolveCampusReadScope(previewing, 'ALL'), 'ALL');
  assert.equal(resolveCampusReadScope(previewing, 'UNILAG'), 'UNILAG');
});
