import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore TS5097
import { queryClient } from '../api/queryClient.ts';
// @ts-ignore TS5097
import { isNetworkError } from './errors.ts';

test('queryClient retry policy rejects permanent client errors (401, 403, 404)', () => {
  const defaultQueries = queryClient.getDefaultOptions().queries;
  assert.ok(defaultQueries, 'Default queries configuration should exist');

  const retryFn = defaultQueries.retry as (count: number, err: any) => boolean;
  assert.equal(typeof retryFn, 'function', 'retry policy should be a custom evaluation function');

  // Should NOT retry 401 unauthorized
  assert.equal(retryFn(0, { status: 401 }), false);
  // Should NOT retry 403 forbidden
  assert.equal(retryFn(0, { status: 403 }), false);
  // Should NOT retry 404 not found
  assert.equal(retryFn(0, { status: 404 }), false);
  // Should NOT retry 422 unprocessable entity
  assert.equal(retryFn(0, { status: 422 }), false);
});

test('queryClient retry policy retries transient network failures and 5xx server errors up to 2 times', () => {
  const defaultQueries = queryClient.getDefaultOptions().queries;
  const retryFn = defaultQueries?.retry as (count: number, err: any) => boolean;

  // Retry 500 internal server error
  assert.equal(retryFn(0, { status: 500 }), true);
  assert.equal(retryFn(1, { status: 500 }), true);
  assert.equal(retryFn(2, { status: 500 }), false);

  // Retry 503 service unavailable
  assert.equal(retryFn(0, { status: 503 }), true);
  assert.equal(retryFn(2, { status: 503 }), false);

  // Retry network drops (no status code, generic TypeError / fetch failure)
  assert.equal(retryFn(0, new Error('Failed to fetch')), true);
  assert.equal(retryFn(1, new Error('Network request failed')), true);
  assert.equal(retryFn(2, new Error('Network request failed')), false);
});

test('queryClient retryDelay uses exponential backoff capped at 8 seconds', () => {
  const defaultQueries = queryClient.getDefaultOptions().queries;
  const delayFn = defaultQueries?.retryDelay as (attempt: number) => number;
  assert.equal(typeof delayFn, 'function', 'retryDelay should be a function');

  assert.equal(delayFn(0), 1000); // 1000 * 2^0 = 1000ms
  assert.equal(delayFn(1), 2000); // 1000 * 2^1 = 2000ms
  assert.equal(delayFn(2), 4000); // 1000 * 2^2 = 4000ms
  assert.equal(delayFn(3), 8000); // 1000 * 2^3 = 8000ms
  assert.equal(delayFn(4), 8000); // capped at 8000ms
});

test('network failure detector identifies common cellular and Wi-Fi drop patterns', () => {
  assert.equal(isNetworkError(new Error('Failed to fetch')), true);
  assert.equal(isNetworkError(new Error('Network request failed')), true);
  assert.equal(isNetworkError(new Error('The network connection was lost')), true);
  assert.equal(isNetworkError(new Error('ETIMEDOUT: Connection timed out')), true);
  assert.equal(isNetworkError(new Error('ECONNRESET: socket hang up')), true);
  assert.equal(isNetworkError(new Error('User not found in database')), false);
});

test('Skeleton.tsx declares all required specialized preset components', () => {
  const filePath = path.resolve('src/components/Skeleton.tsx');
  const code = fs.readFileSync(filePath, 'utf8');

  const requiredExports = [
    'export function Skeleton',
    'export const ShimmerSkeleton',
    'export function PostCardSkeleton',
    'export function PostCardSkeletonList',
    'export function ResourceCardSkeleton',
    'export function ResourceCardSkeletonGrid',
    'export function EventCardSkeleton',
    'export function EventCardSkeletonGrid',
    'export function MarketplaceCardSkeleton',
    'export function MarketplaceCardSkeletonGrid',
    'export function AnalyticsSummarySkeleton',
    'export function ListItemSkeleton',
    'export function ListItemSkeletonList',
    'export function ShimmerCardList',
  ];

  for (const exp of requiredExports) {
    assert.ok(code.includes(exp), `Skeleton.tsx must export ${exp}`);
  }
});

test('ErrorStateView.tsx and OfflineBanner.tsx declare all required exports', () => {
  const errorPath = path.resolve('src/components/ErrorStateView.tsx');
  const errorCode = fs.readFileSync(errorPath, 'utf8');
  assert.ok(errorCode.includes('export function ErrorStateView'), 'ErrorStateView component must be exported');

  const offlinePath = path.resolve('src/components/OfflineBanner.tsx');
  const offlineCode = fs.readFileSync(offlinePath, 'utf8');
  assert.ok(offlineCode.includes('export function OfflineBanner'), 'OfflineBanner component must be exported');
  assert.ok(offlineCode.includes('export function setupNetworkAwareQueries'), 'setupNetworkAwareQueries must be exported');
});
