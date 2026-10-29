import { convert } from './currency';
import { db, type Currency, type Transaction, type TransactionType } from './db';

type NewTransaction = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

const CSV_HEADERS = [
  'id',
  'amount',
  'currency',
  'type',
  'description',
  'category',
  'date',
  'createdAt',
  'updatedAt',
] as const;

function isCurrency(value: string): value is Currency {
  return value === 'USD' || value === 'EUR' || value === 'ILS';
}

function isTransactionType(value: string): value is TransactionType {
  return value === 'income' || value === 'expense';
}

function isValidDate(value: string): boolean {
  return value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function escapeCsvField(value: string | number | undefined): string {
  const field = String(value ?? '');
  return /[",\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
}

/** Parses RFC 4180-style quoted CSV fields, including line breaks inside quotes. */
function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (character === '"') {
      if (inQuotes && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && content[index + 1] === '\n') {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new Error('CSV contains an unclosed quoted field');
  }

  row.push(field);
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

export async function addTransaction(transaction: NewTransaction): Promise<string> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const record: Transaction = {
    ...transaction,
    id,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.transactions.add(record);
    return id;
  } catch (error) {
    throw new Error('Unable to save transaction', { cause: error });
  }
}

export async function getAllTransactions(): Promise<Transaction[]> {
  try {
    return await db.transactions.orderBy('date').reverse().toArray();
  } catch (error) {
    throw new Error('Unable to load transactions', { cause: error });
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  if (!id.trim()) {
    throw new Error('A transaction ID is required');
  }

  try {
    await db.transactions.delete(id);
  } catch (error) {
    throw new Error('Unable to delete transaction', { cause: error });
  }
}

export function exportToCSV(transactions: Transaction[]): void {
  const lines = [
    CSV_HEADERS.join(','),
    ...transactions.map((transaction) =>
      CSV_HEADERS.map((header) => escapeCsvField(transaction[header])).join(','),
    ),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  try {
    anchor.href = url;
    anchor.download = 'expensecoin_backup.csv';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}

export async function importFromCSV(csvContent: string): Promise<number> {
  if (!csvContent.trim()) {
    return 0;
  }

  const rows = parseCsv(csvContent.replace(/^\uFEFF/, ''));
  const [headerRow, ...dataRows] = rows;

  if (!headerRow) {
    return 0;
  }

  const headerIndex = new Map(headerRow.map((header, index) => [header.trim(), index]));
  const requiredHeaders = ['amount', 'currency', 'type', 'description', 'date'];

  if (!requiredHeaders.every((header) => headerIndex.has(header))) {
    throw new Error('CSV must include amount, currency, type, description, and date columns');
  }

  const validTransactions: NewTransaction[] = [];

  for (const row of dataRows) {
    const valueFor = (header: string): string => row[headerIndex.get(header) ?? -1]?.trim() ?? '';
    const amount = Number(valueFor('amount'));
    const currency = valueFor('currency');
    const type = valueFor('type');
    const description = valueFor('description');
    const date = valueFor('date');
    const category = valueFor('category');

    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      !isCurrency(currency) ||
      !isTransactionType(type) ||
      !description ||
      !isValidDate(date)
    ) {
      continue;
    }

    validTransactions.push({
      amount,
      currency,
      type,
      description,
      ...(category ? { category } : {}),
      date,
    });
  }

  try {
    await db.transaction('rw', db.transactions, async () => {
      for (const transaction of validTransactions) {
        const now = new Date().toISOString();
        await db.transactions.add({
          ...transaction,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    return validTransactions.length;
  } catch (error) {
    throw new Error('Unable to import transactions', { cause: error });
  }
}

export function calculateTotalBalance(
  transactions: Transaction[],
  baseCurrency: Currency,
  rates: Record<Currency, number>,
): number {
  return transactions.reduce((total, transaction) => {
    const convertedAmount = convert(transaction.amount, transaction.currency, baseCurrency, rates);
    return transaction.type === 'income' ? total + convertedAmount : total - convertedAmount;
  }, 0);
}
