import { type ChangeEvent, type FormEvent, type JSX, useCallback, useEffect, useMemo, useState } from 'react';

import { AiWorkspace } from './features/ai/AiWorkspace';
import { convert, formatCurrency, syncRates } from './services/currency';
import { db, type Currency, type Transaction, type TransactionType } from './services/db';
import {
  addTransaction,
  calculateTotalBalance,
  deleteTransaction,
  exportToCSV,
  getAllTransactions,
  importFromCSV,
} from './services/transactions';

const CURRENCIES: readonly Currency[] = ['USD', 'EUR', 'ILS'];
const DEFAULT_RATES: Record<Currency, number> = { USD: 1, EUR: 0.92, ILS: 3.65 };

interface TransactionForm {
  amount: string;
  currency: Currency;
  type: TransactionType;
  description: string;
  category: string;
  date: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function blankForm(): TransactionForm {
  return { amount: '', currency: 'USD', type: 'expense', description: '', category: '', date: today() };
}

export default function App(): JSX.Element {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [rates, setRates] = useState<Record<Currency, number>>(DEFAULT_RATES);
  const [baseCurrency, setBaseCurrency] = useState<Currency>('USD');
  const [form, setForm] = useState<TransactionForm>(blankForm);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setTransactions(await getAllTransactions());
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [savedTransactions, latestRates] = await Promise.all([getAllTransactions(), syncRates()]);
        if (active) {
          setTransactions(savedTransactions);
          setRates(latestRates);
        }
      } catch {
        if (active) setMessage('We could not load all local data. Please refresh and try again.');
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const balance = useMemo(
    () => calculateTotalBalance(transactions, baseCurrency, rates),
    [baseCurrency, rates, transactions],
  );
  const income = useMemo(
    () => transactions.filter((item) => item.type === 'income').reduce(
      (total, item) => total + convert(item.amount, item.currency, baseCurrency, rates), 0),
    [baseCurrency, rates, transactions],
  );
  const expenses = useMemo(
    () => transactions.filter((item) => item.type === 'expense').reduce(
      (total, item) => total + convert(item.amount, item.currency, baseCurrency, rates), 0),
    [baseCurrency, rates, transactions],
  );

  const updateForm = <Key extends keyof TransactionForm>(key: Key, value: TransactionForm[Key]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submitTransaction = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !form.description.trim() || !form.date) {
      setMessage('Add a valid amount, description, and date.');
      return;
    }
    setIsSaving(true);
    try {
      await addTransaction({
        amount,
        currency: form.currency,
        type: form.type,
        description: form.description.trim(),
        ...(form.category.trim() ? { category: form.category.trim() } : {}),
        date: new Date(`${form.date}T12:00:00`).toISOString(),
      });
      await refresh();
      setForm(blankForm());
      setMessage('Transaction saved locally.');
    } catch {
      setMessage('Unable to save the transaction.');
    } finally {
      setIsSaving(false);
    }
  };

  const addDemoData = async (): Promise<void> => {
    setIsSaving(true);
    try {
      const now = new Date();
      const date = now.toISOString();
      await Promise.all([
        addTransaction({ amount: 4200, currency: 'USD', type: 'income', description: 'Monthly salary', category: 'Income', date }),
        addTransaction({ amount: 86.5, currency: 'USD', type: 'expense', description: 'Weekly groceries', category: 'Food', date }),
        addTransaction({ amount: 42, currency: 'EUR', type: 'expense', description: 'Design software', category: 'Tools', date }),
        addTransaction({ amount: 128, currency: 'ILS', type: 'expense', description: 'Dinner with friends', category: 'Dining', date }),
      ]);
      await refresh();
      setMessage('Demo data added.');
    } catch {
      setMessage('Unable to add demo data.');
    } finally {
      setIsSaving(false);
    }
  };

  const clearAllData = async (): Promise<void> => {
    if (!window.confirm('Clear all transactions and cached currency rates? This cannot be undone.')) return;
    try {
      await db.transaction('rw', db.transactions, db.currencyCache, async () => {
        await db.transactions.clear();
        await db.currencyCache.clear();
      });
      setTransactions([]);
      setRates(DEFAULT_RATES);
      setMessage('All local ExpenseCoin data has been cleared.');
    } catch {
      setMessage('Unable to clear local data.');
    }
  };

  const removeTransaction = async (id: string): Promise<void> => {
    try {
      await deleteTransaction(id);
      await refresh();
    } catch {
      setMessage('Unable to delete the transaction.');
    }
  };

  const importCsv = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const count = await importFromCSV(await file.text());
      await refresh();
      setMessage(`${count} transaction${count === 1 ? '' : 's'} imported.`);
    } catch {
      setMessage('This CSV could not be imported.');
    }
  };

  return (
    <main id="dashboard" className="ledger-shell">
      <div className="ledger-page">
        <header className="ledger-header">
          <div><p className="wordmark">EXPENSECOIN</p><p className="ledger-subtitle">LOCAL PERSONAL FINANCE TRACKER</p></div>
          <div className="header-actions"><label className="ledger-button">Import CSV<input className="sr-only" accept=".csv,text/csv" type="file" onChange={importCsv} /></label><button className="ledger-button" disabled={!transactions.length} type="button" onClick={() => exportToCSV(transactions)}>Export CSV</button><button className="ledger-button danger-button" type="button" onClick={() => void clearAllData()}>Clear Data</button></div>
        </header>
        {message && <div className="ledger-notice" role="status" aria-live="polite"><span>{message}</span><button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message">Dismiss</button></div>}
        <section className="ledger-grid">
          <article className="ledger-panel balance-panel">
            <div className="panel-head"><div><p className="panel-label">NET BALANCE</p><h1>{formatCurrency(balance, baseCurrency)}</h1><p className="panel-note">{transactions.length} stored transaction{transactions.length === 1 ? '' : 's'}</p></div><div className="currency-selector" role="group" aria-label="Base currency">{CURRENCIES.map((currency) => <button key={currency} className={baseCurrency === currency ? 'is-selected' : ''} type="button" onClick={() => setBaseCurrency(currency)}>{currency}</button>)}</div></div>
            <div className="metric-grid"><div><p>INCOME</p><strong>+{formatCurrency(income, baseCurrency)}</strong></div><div><p>EXPENSES</p><strong>−{formatCurrency(expenses, baseCurrency)}</strong></div></div>
          </article>
          <article className="ledger-panel rate-panel"><p className="panel-label">VERIFIED RATE SOURCE</p><h2>Currency Rates</h2><p className="panel-note">USD base · cached in IndexedDB for 24 hours</p><div className="rates-table">{CURRENCIES.filter((currency) => currency !== 'USD').map((currency) => <div key={currency}><span>USD / {currency}</span><strong>{rates[currency].toFixed(4)}</strong></div>)}</div></article>
          <article className="ledger-panel entry-panel"><p className="panel-label">NEW RECORD</p><h2>Add Transaction</h2><form className="ledger-form" onSubmit={submitTransaction}><div className="field-row"><label>Amount<input required autoComplete="off" className="input" min="0.01" inputMode="decimal" name="amount" placeholder="0.00" step="0.01" type="number" value={form.amount} onChange={(event) => updateForm('amount', event.target.value)} /></label><label>Currency<select className="input" name="currency" value={form.currency} onChange={(event) => updateForm('currency', event.target.value as Currency)}>{CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select></label></div><div className="field-row"><label>Type<select className="input" name="transactionType" value={form.type} onChange={(event) => updateForm('type', event.target.value as TransactionType)}><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Date<input required autoComplete="off" className="input" name="date" type="date" value={form.date} onChange={(event) => updateForm('date', event.target.value)} /></label></div><label>Description<input required autoComplete="off" className="input" maxLength={120} name="description" placeholder="e.g. Train to Tel Aviv…" value={form.description} onChange={(event) => updateForm('description', event.target.value)} /></label><label>Category <span>optional</span><input autoComplete="off" className="input" maxLength={60} name="category" placeholder="Travel, tools, food…" value={form.category} onChange={(event) => updateForm('category', event.target.value)} /></label><button className="ledger-button primary-button" disabled={isSaving} type="submit">{isSaving ? 'Saving…' : 'Add Transaction'}</button></form></article>
          <AiWorkspace baseCurrency={baseCurrency} rates={rates} totalBalance={balance} transactions={transactions} />
          <article className="ledger-panel history-panel"><div className="history-head"><div><p className="panel-label">ACTIVITY</p><h2>Transaction History</h2><p className="panel-note">{isLoading ? 'Loading local records…' : `${transactions.length} records · newest first`}</p></div></div><div className="transaction-list">{!isLoading && transactions.length === 0 && <div className="empty-state"><p>No transaction records.</p><span>Add your first record or load sample data to test the dashboard.</span><button className="ledger-button primary-button" disabled={isSaving} type="button" onClick={() => void addDemoData()}>Load Demo Data</button></div>}{transactions.map((transaction) => <div key={transaction.id} className="transaction-row"><div className={`transaction-sign ${transaction.type}`}>{transaction.type === 'income' ? 'IN' : 'OUT'}</div><div className="transaction-copy"><p>{transaction.description}</p><span>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(transaction.date))}{transaction.category ? ` · ${transaction.category}` : ''}</span></div><div className="transaction-amount"><strong>{transaction.type === 'income' ? '+' : '−'}{formatCurrency(transaction.amount, transaction.currency)}</strong><button type="button" onClick={() => void removeTransaction(transaction.id)}>Delete</button></div></div>)}</div></article>
        </section>
      </div>
    </main>
  );
}
