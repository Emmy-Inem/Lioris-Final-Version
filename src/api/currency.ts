/**
 * Real-Time Currency Exchange & Price Converter API
 * Powered by Open Exchange Rates API (open.er-api.com) - 100% Free, zero auth required.
 * Provides live conversions from NGN (Nigerian Naira) to USD, EUR, GBP, CAD, GHS, KES.
 */

export type CurrencyCode = 'NGN' | 'USD' | 'EUR' | 'GBP' | 'CAD' | 'GHS' | 'KES';

export interface CurrencyRateInfo {
  base: string;
  date: string;
  rates: Record<string, number>;
  fetchedAt: string;
}

export interface CurrencyMetadata {
  code: CurrencyCode;
  symbol: string;
  name: string;
  flag: string;
}

export const SUPPORTED_CURRENCIES: CurrencyMetadata[] = [
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', flag: '🇳🇬' },
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
  { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧' },
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', flag: '🇨🇦' },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi', flag: '🇬🇭' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', flag: '🇰🇪' },
];

const FALLBACK_RATES: Record<string, number> = {
  NGN: 1,
  USD: 0.00067,
  GBP: 0.00052,
  EUR: 0.00062,
  CAD: 0.00091,
  GHS: 0.0102,
  KES: 0.086,
};

let cachedRateData: CurrencyRateInfo = {
  base: 'NGN',
  date: new Date().toISOString().split('T')[0],
  rates: FALLBACK_RATES,
  fetchedAt: new Date().toISOString(),
};

let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function fetchExchangeRates(): Promise<CurrencyRateInfo> {
  const now = Date.now();
  if (now - lastFetchTime < CACHE_TTL_MS && Object.keys(cachedRateData.rates).length > 2) {
    return cachedRateData;
  }

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/NGN');
    if (!res.ok) {
      throw new Error(`Currency API status ${res.status}`);
    }

    const json = await res.json();
    if (json && json.rates) {
      cachedRateData = {
        base: 'NGN',
        date: json.time_last_update_utc || new Date().toISOString().split('T')[0],
        rates: {
          NGN: 1,
          USD: json.rates.USD || FALLBACK_RATES.USD,
          GBP: json.rates.GBP || FALLBACK_RATES.GBP,
          EUR: json.rates.EUR || FALLBACK_RATES.EUR,
          CAD: json.rates.CAD || FALLBACK_RATES.CAD,
          GHS: json.rates.GHS || FALLBACK_RATES.GHS,
          KES: json.rates.KES || FALLBACK_RATES.KES,
        },
        fetchedAt: new Date().toISOString(),
      };
      lastFetchTime = now;
      return cachedRateData;
    }
  } catch (err: any) {
    console.warn('[CurrencyAPI] Live rates fetch failed, using fallback exchange rates:', err?.message ?? err);
  }

  return cachedRateData;
}

export function convertFromNgn(amountInNgn: number, target: CurrencyCode): number {
  if (target === 'NGN') return amountInNgn;
  const rate = cachedRateData.rates[target] || FALLBACK_RATES[target] || 0.00067;
  return amountInNgn * rate;
}

export function formatConvertedPrice(amountInNgn: number, target: CurrencyCode): string {
  const meta = SUPPORTED_CURRENCIES.find((c) => c.code === target) || SUPPORTED_CURRENCIES[0];
  if (target === 'NGN') {
    return `₦${amountInNgn.toLocaleString()}`;
  }
  const converted = convertFromNgn(amountInNgn, target);
  return `${meta.symbol}${converted.toFixed(2)} ${target}`;
}
