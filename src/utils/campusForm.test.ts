import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { isPlausibleDomain, isValidCampusCode, isValidHexColor, normaliseDomainInput, suggestCampusCode } from './campusForm.ts';

test('suggestCampusCode builds initials or falls back to the distinctive word', () => {
  assert.equal(suggestCampusCode('Federal University of Technology Akure'), 'FUTA');
  assert.equal(suggestCampusCode('Lagos State University'), 'LSU');
  assert.equal(suggestCampusCode('University of Ilorin'), 'ILORIN');
  assert.equal(suggestCampusCode(''), '');
});

test('normaliseDomainInput accepts pasted emails, urls and @domains', () => {
  assert.equal(normaliseDomainInput('  @LASU.edu.ng '), 'lasu.edu.ng');
  assert.equal(normaliseDomainInput('student@Mail.LASU.edu.ng'), 'mail.lasu.edu.ng');
  assert.equal(normaliseDomainInput('https://www.lasu.edu.ng/about?x=1'), 'lasu.edu.ng');
  assert.equal(normaliseDomainInput('lasu.edu.ng.'), 'lasu.edu.ng');
});

test('isPlausibleDomain rejects things that are not domains', () => {
  assert.equal(isPlausibleDomain('lasu.edu.ng'), true);
  assert.equal(isPlausibleDomain('not a domain'), false);
  assert.equal(isPlausibleDomain('localhost'), false);
  assert.equal(isPlausibleDomain('-bad.edu.ng'), false);
});

test('code and colour validation', () => {
  assert.equal(isValidCampusCode('lasu'), true);
  assert.equal(isValidCampusCode('GLOBAL'), false);
  assert.equal(isValidCampusCode('1ABC'), false);
  assert.equal(isValidCampusCode('A'), false);
  assert.equal(isValidHexColor('#1D4ED8'), true);
  assert.equal(isValidHexColor('1D4ED8'), false);
  assert.equal(isValidHexColor('#12345'), false);
});
