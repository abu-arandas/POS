import { SaleTransaction } from '../types';
import { DEFAULT_CURRENCY_DIGITS, formatAmount } from './money';

/**
 * Spreadsheets treat a leading =, +, -, @ (or a leading tab/CR, which Excel
 * strips before parsing) as the start of a formula. A product or customer name
 * like `=HYPERLINK(...)` would then execute in the recipient's spreadsheet
 * rather than display as text. Prefixing with an apostrophe is the standard
 * mitigation: Excel/Sheets/LibreOffice read it as "this cell is literal text"
 * and don't render the apostrophe itself.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * Serializes rows to RFC-4180 CSV. Values containing quotes, commas, or
 * newlines are quoted and inner quotes doubled; values that a spreadsheet would
 * read as a formula are neutralized first.
 */
export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  if (rows.length === 0) return columns ? columns.join(',') : '';
  const cols = columns ?? Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = neutralizeFormula(String(v ?? ''));
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map((column) => esc(column)).join(',');
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n');
  return `${header}\n${body}`;
}

/**
 * Triggers a browser download of CSV text.
 */
export function downloadCsv(filename: string, csv: string): void {
  // Leading BOM so Excel opens the file as UTF-8 rather than the local ANSI
  // codepage; written as an escape so the character stays visible in review.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Flattens transactions into export rows (one per sale). Money columns carry
 * the store currency's fractional digits (`digits`, lib/money.ts), so a dinar
 * export reads 12.500 and reconciles to the till and the receipts.
 */
export function transactionsToCsvRows(
  txns: SaleTransaction[],
  digits: number = DEFAULT_CURRENCY_DIGITS,
): Array<Record<string, unknown>> {
  return txns.map((t) => ({
    id: t.id,
    date: new Date(t.date).toISOString(),
    status: t.status,
    items: t.items.reduce((n, i) => n + i.quantity, 0),
    subtotal: formatAmount(t.subtotal, digits),
    discount: formatAmount(t.discount, digits),
    tax: formatAmount(t.tax, digits),
    total: formatAmount(t.total, digits),
    refunded: formatAmount(t.refundedAmount ?? 0, digits),
    payment_method: t.paymentMethod,
    customer: t.customerName ?? '',
    operator: t.operatorName ?? '',
  }));
}
