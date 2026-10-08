import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CAMPUS_CODES = ['UI', 'UNILAG', 'FUNAAB', 'UNN', 'OAU', 'CU', 'KDU', 'NOUN', 'ESUT', 'MUN'];
const REQUIRED_REGISTRIES = [
  'src/api/institutions.ts',
  'src/api/portalLinks.ts',
  'src/api/campusMap.ts',
  'src/api/weather.ts',
  'src/data/departments.ts',
  'src/utils/verificationGate.ts',
];

test('every active campus appears in every required platform registry', () => {
  for (const file of REQUIRED_REGISTRIES) {
    const source = readFileSync(file, 'utf8');
    for (const code of CAMPUS_CODES) {
      assert.match(source, new RegExp(`\\b${code}\\b`), `${code} is missing from ${file}`);
    }
  }
});
