import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import {
  isPortalVisitedInLast3Months,
  THREE_MONTHS_MS,
} from './portalVisits.ts';

test('isPortalVisitedInLast3Months returns false for unvisited portals', () => {
  const portal = { id: 'unilag-1', url: 'https://studentportal.unilag.edu.ng/' };
  const visits: Record<string, number> = {};
  assert.equal(isPortalVisitedInLast3Months(portal, visits), false);
});

test('isPortalVisitedInLast3Months returns true for portals visited within 3 months', () => {
  const portal = { id: 'unilag-1', url: 'https://studentportal.unilag.edu.ng/' };
  const now = Date.now();
  const visits: Record<string, number> = {
    'unilag-1': now - (10 * 24 * 60 * 60 * 1000), // 10 days ago
  };
  assert.equal(isPortalVisitedInLast3Months(portal, visits, now), true);
});

test('isPortalVisitedInLast3Months matches by normalized URL', () => {
  const portal = { id: 'other-id', url: 'https://portal.ui.edu.ng/' };
  const now = Date.now();
  const visits: Record<string, number> = {
    'portal.ui.edu.ng': now - (30 * 24 * 60 * 60 * 1000), // 30 days ago
  };
  assert.equal(isPortalVisitedInLast3Months(portal, visits, now), true);
});

test('isPortalVisitedInLast3Months returns false for portals visited more than 3 months ago (90+ days)', () => {
  const portal = { id: 'unilag-1', url: 'https://studentportal.unilag.edu.ng/' };
  const now = Date.now();
  const visits: Record<string, number> = {
    'unilag-1': now - (THREE_MONTHS_MS + 86400000), // 91 days ago
  };
  assert.equal(isPortalVisitedInLast3Months(portal, visits, now), false);
});
