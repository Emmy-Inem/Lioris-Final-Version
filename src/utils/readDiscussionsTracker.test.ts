import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { markHomeAlertAsRead, isHomeAlertReadSync, clearReadHomeAlerts } from './readDiscussionsTracker.ts';

test('alerts are unread by default', async () => {
  await clearReadHomeAlerts();
  assert.equal(isHomeAlertReadSync('alert-1'), false);
  assert.equal(isHomeAlertReadSync('alert-2'), false);
});

test('markHomeAlertAsRead marks alert as read synchronously in cache', async () => {
  await clearReadHomeAlerts();
  await markHomeAlertAsRead('alert-101');
  assert.equal(isHomeAlertReadSync('alert-101'), true);
  assert.equal(isHomeAlertReadSync('alert-102'), false);
});

test('clearing alerts resets read state', async () => {
  await markHomeAlertAsRead('alert-999');
  assert.equal(isHomeAlertReadSync('alert-999'), true);
  await clearReadHomeAlerts();
  assert.equal(isHomeAlertReadSync('alert-999'), false);
});
