import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { ADULT_AGE, MIN_SIGNUP_AGE, ageBand, ageInYears, dobHint, parseDobInput, parseIsoDob } from './age.ts';
// @ts-ignore TS5097
import { INDEPENDENT_AGE, MIN_AGE } from '../constants/legal.ts';

// A fixed "today" (local time): 15 June 2026.
const TODAY = new Date(2026, 5, 15, 10, 30);

test('the thresholds match the legal constants the policy pages print', () => {
  assert.equal(MIN_SIGNUP_AGE, MIN_AGE);
  assert.equal(ADULT_AGE, INDEPENDENT_AGE);
  assert.equal(MIN_SIGNUP_AGE, 13);
  assert.equal(ADULT_AGE, 18);
});

test('ageInYears counts whole years and flips on the birthday itself', () => {
  assert.equal(ageInYears(2013, 6, 15, TODAY), 13); // birthday today
  assert.equal(ageInYears(2013, 6, 16, TODAY), 12); // tomorrow
  assert.equal(ageInYears(2013, 6, 14, TODAY), 13); // yesterday
  assert.equal(ageInYears(2008, 6, 15, TODAY), 18);
  assert.equal(ageInYears(2008, 6, 16, TODAY), 17);
  assert.equal(ageInYears(2008, 12, 31, TODAY), 17);
  assert.equal(ageInYears(2008, 1, 1, TODAY), 18);
});

test('ageBand: under 13 / minor / adult boundaries', () => {
  assert.equal(ageBand(12), 'under_13');
  assert.equal(ageBand(13), 'minor');
  assert.equal(ageBand(17), 'minor');
  assert.equal(ageBand(18), 'adult');
  assert.equal(ageBand(60), 'adult');
});

test('parseDobInput: complete, real dates are classified', () => {
  assert.deepEqual(parseDobInput('15', '6', '2013', TODAY), { status: 'minor', iso: '2013-06-15', age: 13 });
  assert.deepEqual(parseDobInput('16', '06', '2013', TODAY), { status: 'under_13', iso: '2013-06-16', age: 12 });
  assert.deepEqual(parseDobInput(' 1 ', ' 2 ', ' 2000 ', TODAY), { status: 'adult', iso: '2000-02-01', age: 26 });
  assert.deepEqual(parseDobInput('16', '6', '2008', TODAY), { status: 'minor', iso: '2008-06-16', age: 17 });
  assert.deepEqual(parseDobInput('15', '6', '2008', TODAY), { status: 'adult', iso: '2008-06-15', age: 18 });
});

test('parseDobInput: incomplete while typing, invalid for impossible / future / implausible dates', () => {
  assert.equal(parseDobInput('', '6', '2000', TODAY).status, 'incomplete');
  assert.equal(parseDobInput('15', '', '2000', TODAY).status, 'incomplete');
  assert.equal(parseDobInput('15', '6', '20', TODAY).status, 'incomplete');
  assert.equal(parseDobInput('31', '2', '2000', TODAY).status, 'invalid');
  assert.equal(parseDobInput('29', '2', '2001', TODAY).status, 'invalid');
  assert.equal(parseDobInput('29', '2', '2000', TODAY).status, 'adult');
  assert.equal(parseDobInput('0', '1', '2000', TODAY).status, 'invalid');
  assert.equal(parseDobInput('1', '13', '2000', TODAY).status, 'invalid');
  assert.equal(parseDobInput('ab', '1', '2000', TODAY).status, 'invalid');
  assert.equal(parseDobInput('1', '1', '20x0', TODAY).status, 'invalid');
  assert.equal(parseDobInput('16', '6', '2026', TODAY).status, 'invalid'); // tomorrow
  assert.equal(parseDobInput('15', '6', '2026', TODAY).status, 'under_13'); // born today is a valid (baby) date
  assert.equal(parseDobInput('1', '1', '1890', TODAY).status, 'invalid');
  assert.equal(parseDobInput('15', '6', '1906', TODAY).status, 'adult'); // exactly 120
  assert.equal(parseDobInput('14', '6', '1905', TODAY).status, 'invalid');
});

test('parseIsoDob reads server dates and tolerates timestamps and junk', () => {
  assert.equal(parseIsoDob('2008-06-16', TODAY).status, 'minor');
  assert.equal(parseIsoDob('2008-06-15T00:00:00.000Z', TODAY).status, 'adult');
  assert.equal(parseIsoDob(null, TODAY).status, 'incomplete');
  assert.equal(parseIsoDob('nonsense', TODAY).status, 'incomplete');
});

test('dobHint speaks only when something needs saying', () => {
  assert.equal(dobHint('adult'), null);
  assert.equal(dobHint('incomplete'), null);
  assert.equal(dobHint('invalid')?.tone, 'critical');
  assert.match(dobHint('under_13')!.message, /at least 13/);
  assert.equal(dobHint('under_13')!.tone, 'critical');
  assert.match(dobHint('minor')!.message, /parent or guardian/);
});
