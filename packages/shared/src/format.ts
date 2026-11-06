import type { CurrencyCode } from './stages.js';

const cache = new Map<string, Intl.NumberFormat>();

function formatter(currency: CurrencyCode, decimals: boolean) {
  const key = `${currency}:${decimals}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      // Whole amounts read cleaner without ".00"; anything else always shows cents.
      minimumFractionDigits: decimals ? undefined : 0,
      maximumFractionDigits: decimals ? undefined : 0
    });
    cache.set(key, f);
  }
  return f;
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  const n = Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
  return formatter(currency, !Number.isInteger(n)).format(n);
}

export function currencySymbol(currency: CurrencyCode): string {
  return formatMoney(0, currency).replace(/[\d.,\s]/g, '');
}
