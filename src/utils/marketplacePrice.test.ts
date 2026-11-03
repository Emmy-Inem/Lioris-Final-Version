import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore TS5097
import { MAX_LISTING_PRICE_NAIRA, parseNairaToKobo } from './marketplacePrice.ts';

test('whole naira amounts convert to kobo', () => {
  assert.equal(parseNairaToKobo('15000'), 1_500_000);
  assert.equal(parseNairaToKobo('₦15,000'), 1_500_000);
  assert.equal(parseNairaToKobo(' NGN 2,500 '), 250_000);
});

test('kobo are kept instead of being multiplied by 100 (old parser turned 15,000.50 into 1,500,050 naira)', () => {
  assert.equal(parseNairaToKobo('15,000.50'), 1_500_050);
  assert.equal(parseNairaToKobo('₦1500.5'), 150_050);
  // The bug being fixed, for the record: stripping non-digits read this as 1500050 whole naira.
  assert.equal(Number('15,000.50'.replace(/[^0-9]/g, '')) * 100, 150_005_000);
});

test('text that is not a plain amount is refused rather than guessed', () => {
  for (const bad of ['15k', '1.5m', 'free', '', '0', '₦0', '-500', '1,50', '1.500', '12abc', '1e5', '1,000,0']) {
    assert.equal(parseNairaToKobo(bad), null, bad);
  }
});

test('absurd prices are refused', () => {
  assert.equal(parseNairaToKobo(String(MAX_LISTING_PRICE_NAIRA)), MAX_LISTING_PRICE_NAIRA * 100);
  assert.equal(parseNairaToKobo(String(MAX_LISTING_PRICE_NAIRA + 1)), null);
  assert.equal(parseNairaToKobo('9'.repeat(30)), null);
});
