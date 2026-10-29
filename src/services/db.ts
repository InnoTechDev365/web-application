import Dexie, { type Table } from 'dexie';

/** The only currencies supported by ExpenseCoin. */
export type Currency = 'USD' | 'EUR' | 'ILS';

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  amount: number;
  currency: Currency;
  type: TransactionType;
  description: string;
  category?: string;
  /** ISO 8601 date-time string representing when the transaction occurred. */
  date: string;
  /** ISO 8601 date-time string representing when this record was created. */
  createdAt: string;
  /** ISO 8601 date-time string representing when this record was last changed. */
  updatedAt: string;
}

export interface CurrencyCache {
  /** API base currency. ExpenseCoin always uses USD as its exchange-rate base. */
  baseCurrency: 'USD';
  rates: Record<Currency, number>;
  fetchedAt: number;
  expiresAt: number;
}

export class ExpenseCoinDB extends Dexie {
  transactions!: Table<Transaction, string>;
  currencyCache!: Table<CurrencyCache, 'USD'>;

  constructor() {
    super('ExpenseCoinDB');

    this.version(1).stores({
      transactions: 'id, date, type, currency, category, createdAt',
      currencyCache: '&baseCurrency, expiresAt',
    });
  }
}

export const db = new ExpenseCoinDB();
