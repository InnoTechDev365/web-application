import { db, type Currency, type CurrencyCache } from './db';

const EXCHANGE_RATE_URL = 'https://open.er-api.com/v6/latest/USD';
const CACHE_KEY = 'USD';
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

const FALLBACK_RATES: Record<Currency, number> = {
  USD: 1,
  EUR: 0.92,
  ILS: 3.65,
};

interface ExchangeRateApiResponse {
  result?: string;
  rates?: Record<string, unknown>;
}

function isValidRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function getSupportedRates(rates: Record<string, unknown>): Record<Currency, number> | null {
  const eur = rates.EUR;
  const ils = rates.ILS;

  if (!isValidRate(eur) || !isValidRate(ils)) {
    return null;
  }

  return { USD: 1, EUR: eur, ILS: ils };
}

/**
 * Returns USD-based rates, using a 24-hour IndexedDB cache when available.
 * Expired cached rates remain a last-resort offline fallback.
 */
export async function syncRates(): Promise<Record<Currency, number>> {
  let cachedRate: CurrencyCache | undefined;

  try {
    cachedRate = await db.currencyCache.get(CACHE_KEY);

    if (cachedRate && Date.now() < cachedRate.expiresAt) {
      return cachedRate.rates;
    }
  } catch {
    // IndexedDB may be unavailable (for example, in private browsing mode).
    // Continue with a network request instead of preventing the app from working.
  }

  try {
    const response = await fetch(EXCHANGE_RATE_URL);

    if (!response.ok) {
      throw new Error(`Exchange-rate request failed with status ${response.status}`);
    }

    const payload: ExchangeRateApiResponse = await response.json();
    const rates = payload.rates ? getSupportedRates(payload.rates) : null;

    if (!rates) {
      throw new Error('Exchange-rate response did not contain valid supported rates');
    }

    const fetchedAt = Date.now();
    const cacheEntry: CurrencyCache = {
      baseCurrency: CACHE_KEY,
      rates,
      fetchedAt,
      expiresAt: fetchedAt + CACHE_TTL_MS,
    };

    try {
      await db.currencyCache.put(cacheEntry);
    } catch {
      // A successful network response is still useful when the cache cannot be written.
    }

    return rates;
  } catch {
    return cachedRate?.rates ?? FALLBACK_RATES;
  }
}

/** Converts an amount through the USD base currency. */
export function convert(
  amount: number,
  from: Currency,
  to: Currency,
  rates: Record<Currency, number>,
): number {
  if (!Number.isFinite(amount)) {
    return 0;
  }

  if (from === to) {
    return amount;
  }

  const fromRate = rates[from];
  const toRate = rates[to];

  if (!isValidRate(fromRate) || !isValidRate(toRate)) {
    return 0;
  }

  return (amount / fromRate) * toRate;
}

/** Formats a monetary value using the required en-US locale. */
export function formatCurrency(amount: number, code: Currency): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
  }).format(Number.isFinite(amount) ? amount : 0);
}
