import { SaleTransaction } from '../types';

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
    const s = neutralizeFormula(v == null ? '' : String(v));
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
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Flattens transactions into export rows (one per sale).
 */
export function transactionsToCsvRows(txns: SaleTransaction[]): Array<Record<string, unknown>> {
  return txns.map((t) => ({
    id: t.id,
    date: new Date(t.date).toISOString(),
    status: t.status,
    items: t.items.reduce((n, i) => n + i.quantity, 0),
    subtotal: t.subtotal.toFixed(2),
    discount: t.discount.toFixed(2),
    tax: t.tax.toFixed(2),
    total: t.total.toFixed(2),
    refunded: (t.refundedAmount ?? 0).toFixed(2),
    payment_method: t.paymentMethod,
    customer: t.customerName ?? '',
    operator: t.operatorName ?? '',
  }));
}
