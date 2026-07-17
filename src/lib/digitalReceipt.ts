import { SaleTransaction, StoreSettings } from '../types';

// Plain-text receipt for digital delivery (email body / share / clipboard).
// Pure and testable — no DOM.
export function receiptPlainText(tx: SaleTransaction, settings: StoreSettings): string {
  const cur = settings.currency;
  const lines: string[] = [];
  lines.push(settings.storeName);
  if (settings.storeAddress) lines.push(settings.storeAddress);
  if (settings.storePhone) lines.push(settings.storePhone);
  lines.push('');
  lines.push(`Receipt: ${tx.id}`);
  lines.push(`Date: ${new Date(tx.date).toLocaleString()}`);
  if (tx.operatorName) lines.push(`Served by: ${tx.operatorName}`);
  if (tx.customerName) lines.push(`Member: ${tx.customerName}`);
  lines.push('--------------------------------');
  for (const item of tx.items) {
    lines.push(`${item.quantity}x ${item.productName}  ${cur}${item.total.toFixed(2)}`);
  }
  lines.push('--------------------------------');
  lines.push(`Subtotal: ${cur}${tx.subtotal.toFixed(2)}`);
  if (tx.discount > 0) lines.push(`Discount: -${cur}${tx.discount.toFixed(2)}`);
  lines.push(`Tax: ${cur}${tx.tax.toFixed(2)}`);
  lines.push(`Total: ${cur}${tx.total.toFixed(2)}`);
  lines.push(`Paid via: ${tx.paymentMethod.toUpperCase()}`);
  if (tx.payments && tx.payments.length > 1) {
    for (const p of tx.payments) lines.push(`  ${p.method.toUpperCase()}: ${cur}${p.amount.toFixed(2)}`);
  }
  if (tx.refundedAmount) lines.push(`Refunded: ${cur}${tx.refundedAmount.toFixed(2)}`);
  lines.push('');
  lines.push('Thank you for your visit!');
  return lines.join('\n');
}

export type ShareOutcome = 'shared' | 'copied' | 'error';

// Shares the receipt via the Web Share API when available, otherwise copies the
// text to the clipboard. Returns which happened so the UI can confirm.
export async function shareReceipt(
  tx: SaleTransaction,
  settings: StoreSettings,
): Promise<ShareOutcome> {
  const text = receiptPlainText(tx, settings);
  const title = `${settings.storeName} — ${tx.id}`;
  try {
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; text?: string }) => Promise<void>;
    };
    if (nav.share) {
      await nav.share({ title, text });
      return 'shared';
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
    return 'error';
  } catch (e) {
    // A user-cancelled share throws AbortError — treat as a non-error no-op.
    if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
    console.error('Share receipt failed:', e);
    return 'error';
  }
}

// Opens the OS mail client with a pre-filled receipt (to the customer if known).
export function emailReceipt(tx: SaleTransaction, settings: StoreSettings, toEmail?: string): void {
  const subject = `Receipt ${tx.id} — ${settings.storeName}`;
  const body = receiptPlainText(tx, settings);
  const to = toEmail ? encodeURIComponent(toEmail) : '';
  const url = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = url;
}
