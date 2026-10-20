import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// @ts-ignore TS5097
import { buildEventListFilters, ilikeLiteral } from './eventListFilters.ts';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const CUTOFF = '2026-10-15T12:00:00.000Z';

describe('buildEventListFilters', () => {
  it('applies the 5-day window (end_time, else start_time) for regular members', () => {
    const [windowFilter] = buildEventListFilters({ skipEndedWindow: false, activeCampus: 'ALL', now: NOW });
    assert.equal(windowFilter, `end_time.gte.${CUTOFF},and(end_time.is.null,start_time.gte.${CUTOFF})`);
  });

  it('skips the window for staff / admins / scope all', () => {
    assert.deepEqual(buildEventListFilters({ skipEndedWindow: true, activeCampus: 'ALL', now: NOW }), []);
  });

  it('ALL campuses adds no campus filter', () => {
    assert.equal(buildEventListFilters({ skipEndedWindow: false, activeCampus: 'all', now: NOW }).length, 1);
  });

  it('GLOBAL sees global campus rows and global-visibility events', () => {
    const filters = buildEventListFilters({ skipEndedWindow: true, activeCampus: 'GLOBAL', now: NOW });
    assert.deepEqual(filters, ['campus_code.is.null,campus_code.ilike.GLOBAL,visibility_scope.eq.global']);
  });

  it('a campus sees its own events plus GLOBAL, case-insensitively', () => {
    const filters = buildEventListFilters({ skipEndedWindow: true, activeCampus: 'unilag', now: NOW });
    assert.deepEqual(filters, ['campus_code.is.null,campus_code.ilike.GLOBAL,campus_code.ilike.UNILAG']);
  });

  it('never injects an unsafe campus code into the filter (the JS pass still isolates campuses)', () => {
    assert.deepEqual(buildEventListFilters({ skipEndedWindow: true, activeCampus: 'X),id.neq.0', now: NOW }), []);
  });

  it('defaults a missing campus to GLOBAL', () => {
    assert.equal(buildEventListFilters({ skipEndedWindow: true, activeCampus: '', now: NOW }).length, 1);
  });
});

describe('ilikeLiteral', () => {
  it('escapes LIKE wildcards', () => {
    assert.equal(ilikeLiteral('A_B%C'), 'A\\_B\\%C');
    assert.equal(ilikeLiteral('PLAIN'), 'PLAIN');
  });
});
