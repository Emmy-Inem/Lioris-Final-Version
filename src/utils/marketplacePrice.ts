// Pure parsing of a free-typed marketplace asking price. Used by src/api/marketplace.ts.

/** The most a listing may ask for, in naira. Keeps price_kobo far inside a bigint and inside JS's safe integers. */
export const MAX_LISTING_PRICE_NAIRA = 1_000_000_000;

/**
 * "₦15,000", "15000", "NGN 15,000.50" -> kobo (1,500,000 / 1,500,000 / 1,500,050), or null when the text is not a
 * plain naira amount greater than zero.
 *
 * The old parser deleted every non-digit, so "15,000.50" became 1,500,050 NAIRA (the point vanished: 100x too high)
 * and "15k" silently became ₦15. Anything that is not digits with optional thousands commas and at most two decimals
 * is now refused so the seller corrects it instead of publishing a wrong price.
 */
export function parseNairaToKobo(text: string): number | null {
  const cleaned = String(text ?? '')
    .replace(/NGN/gi, '')
    .replace(/₦/g, '')
    .replace(/\s+/g, '');
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const naira = Number(cleaned.replace(/,/g, ''));
  if (!Number.isFinite(naira) || naira <= 0 || naira > MAX_LISTING_PRICE_NAIRA) return null;
  return Math.round(naira * 100);
}
