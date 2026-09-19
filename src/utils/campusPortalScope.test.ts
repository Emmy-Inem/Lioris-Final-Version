import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { resolveAllowedPortalFilters, resolveActivePortalTarget } from './campusPortalScope.ts';

test('resolveAllowedPortalFilters returns 9 options for admin and staff', () => {
  const adminFilters = resolveAllowedPortalFilters('admin', 'UNILAG');
  assert.equal(adminFilters.length, 9);
  assert.ok(adminFilters.some((f) => f.code === 'ALL'));
  assert.ok(adminFilters.some((f) => f.code === 'UI'));

  const staffFilters = resolveAllowedPortalFilters('staff', 'FUNAAB');
  assert.equal(staffFilters.length, 9);
  assert.ok(staffFilters.some((f) => f.code === 'UNILAG'));
});

test('resolveAllowedPortalFilters restricts regular students to only their campus and national portals', () => {
  const studentFilters = resolveAllowedPortalFilters('student', 'UNILAG', 'University of Lagos');
  assert.equal(studentFilters.length, 2);
  assert.equal(studentFilters[0].code, 'CURRENT');
  assert.equal(studentFilters[0].label, 'University of Lagos Portals');
  assert.equal(studentFilters[1].code, 'GLOBAL');
  assert.equal(studentFilters[1].label, 'National Portals');

  // Must NEVER contain other universities or ALL
  assert.ok(!studentFilters.some((f) => f.code === 'ALL'));
  assert.ok(!studentFilters.some((f) => f.code === 'UI'));
  assert.ok(!studentFilters.some((f) => f.code === 'FUNAAB'));
  assert.ok(!studentFilters.some((f) => f.code === 'UNN'));
  assert.ok(!studentFilters.some((f) => f.code === 'OAU'));
  assert.ok(!studentFilters.some((f) => f.code === 'CU'));
});

test('resolveActivePortalTarget prevents regular students from querying other campuses or ALL', () => {
  // Student on UNILAG
  assert.equal(resolveActivePortalTarget('student', 'CURRENT', 'UNILAG'), 'UNILAG');
  assert.equal(resolveActivePortalTarget('student', 'GLOBAL', 'UNILAG'), 'GLOBAL');

  // Attempting to inject other universities or ALL must be blocked and fallback to their campus
  assert.equal(resolveActivePortalTarget('student', 'ALL', 'UNILAG'), 'UNILAG');
  assert.equal(resolveActivePortalTarget('student', 'UI', 'UNILAG'), 'UNILAG');
  assert.equal(resolveActivePortalTarget('student', 'FUNAAB', 'UNILAG'), 'UNILAG');
  assert.equal(resolveActivePortalTarget('student', 'OAU', 'UNILAG'), 'UNILAG');
});

test('resolveActivePortalTarget allows admins to query any university or ALL', () => {
  assert.equal(resolveActivePortalTarget('admin', 'ALL', 'UNILAG'), 'ALL');
  assert.equal(resolveActivePortalTarget('admin', 'UI', 'UNILAG'), 'UI');
  assert.equal(resolveActivePortalTarget('admin', 'FUNAAB', 'UNILAG'), 'FUNAAB');
  assert.equal(resolveActivePortalTarget('admin', 'CURRENT', 'UNILAG'), 'UNILAG');
});

test('resolveActivePortalTarget handles newly registered users with undefined or GLOBAL campus safely', () => {
  assert.equal(resolveActivePortalTarget('student', 'CURRENT', 'GLOBAL'), 'GLOBAL');
  assert.equal(resolveActivePortalTarget('student', 'CURRENT', ''), 'GLOBAL');
  assert.equal(resolveActivePortalTarget(undefined, 'CURRENT', 'FUNAAB'), 'FUNAAB');
});
