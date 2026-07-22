import { SaleTransaction, StoreSettings, PrinterConfig } from '../types';
import { escapeHtml as esc } from './escapeHtml';
import { code128Svg } from './barcode';

export type PrintOutcome = 'printed' | 'popup-blocked' | 'esc-pos';

const FALLBACK_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';

// Builds the escaped HTML for a single receipt. Exported for unit testing; the
// print path composes these into a print window below.
export function buildReceiptHtml(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
): string {
  const cur = esc(settings.currency);
  const d = new Date(tx.date);
  const itemCount = tx.items.reduce((s, i) => s + i.quantity, 0);
  const isCash = tx.paymentMethod === 'cash' || (tx.payments ?? []).some((p) => p.method === 'cash');
  const taxLabel = settings.taxRate > 0 ? `TAX (${settings.taxRate}%)` : 'TAX';

  return `
    <div class="receipt">
      <div class="logo">
        ${
          settings.storeLogo
            ? `<img src="${esc(settings.storeLogo)}" style="max-height: 40px; width: auto;" />`
            : FALLBACK_LOGO_SVG
        }
      </div>
      <div class="center bold store-name">${esc(settings.storeName)}</div>
      <div class="center muted">${esc(settings.storeAddress)}</div>
      <div class="center muted">Phone: ${esc(settings.storePhone)}</div>
      <div class="divider"></div>

      <div class="flex-row"><span>DATE:</span><span>${esc(d.toLocaleDateString())}</span></div>
      <div class="flex-row"><span>TIME:</span><span>${esc(d.toLocaleTimeString())}</span></div>
      <div class="flex-row"><span>RECEIPT:</span><span class="bold">${esc(tx.id)}</span></div>
      ${
        tx.operatorName
          ? `<div class="flex-row"><span>OPERATOR:</span><span>${esc(tx.operatorName)}</span></div>`
          : ''
      }
      ${
        tx.customerName
          ? `<div class="flex-row bold"><span>MEMBER:</span><span>${esc(tx.customerName)}</span></div>`
          : ''
      }

      <div class="divider"></div>

      ${tx.items
        .map(
          (item) => `
        <div class="flex-row">
          <span>${item.quantity}x ${esc(item.productName)}</span>
          <span>${cur}${item.total.toFixed(2)}</span>
        </div>${
          item.quantity > 1
            ? `<div class="flex-row muted item-unit"><span>@ ${cur}${item.price.toFixed(2)} ea</span><span></span></div>`
            : ''
        }`,
        )
        .join('')}

      <div class="divider"></div>

      <div class="flex-row muted"><span>ITEMS:</span><span>${itemCount}</span></div>
      <div class="flex-row"><span>SUBTOTAL:</span><span>${cur}${tx.subtotal.toFixed(2)}</span></div>
      ${
        tx.discount > 0
          ? `<div class="flex-row"><span>DISCOUNT:</span><span>-${cur}${tx.discount.toFixed(2)}</span></div>`
          : ''
      }
      <div class="flex-row"><span>${taxLabel}:</span><span>${cur}${tx.tax.toFixed(2)}</span></div>
      <div class="flex-row text-lg total-row"><span>TOTAL PAID:</span><span>${cur}${tx.total.toFixed(2)}</span></div>

      ${
        tx.discount > 0
          ? `<div class="center bold savings">YOU SAVED ${cur}${tx.discount.toFixed(2)}</div>`
          : ''
      }

      <div class="divider"></div>

      <div class="flex-row"><span>METHOD:</span><span class="bold uppercase">${esc(tx.paymentMethod)}</span></div>
      ${
        tx.payments && tx.payments.length > 1
          ? tx.payments
              .map(
                (p) =>
                  `<div class="flex-row"><span>&nbsp;&nbsp;${esc(p.method.toUpperCase())}</span><span>${cur}${p.amount.toFixed(2)}</span></div>`,
              )
              .join('')
          : ''
      }
      ${
        isCash
          ? `
      <div class="flex-row"><span>CASH PAID:</span><span>${cur}${(tx.cashPaid ?? 0).toFixed(2)}</span></div>
      <div class="flex-row bold"><span>CHANGE:</span><span>${cur}${(tx.cashChange ?? 0).toFixed(2)}</span></div>`
          : ''
      }
      ${
        tx.customerName && (tx.pointsEarned ?? 0) > 0
          ? `<div class="flex-row"><span>POINTS EARNED:</span><span class="bold">${tx.pointsEarned}</span></div>`
          : ''
      }

      <div class="divider"></div>

      <div class="center bold uppercase status-line status-${esc(tx.status)}">${esc(tx.status)}</div>
      ${
        tx.refundDate
          ? `<div class="center">REFUND: ${esc(new Date(tx.refundDate).toLocaleDateString())}</div>`
          : ''
      }
      ${
        tx.refundAuthorizedBy
          ? `<div class="center">REFUND AUTH: ${esc(tx.refundAuthorizedBy)}</div>`
          : ''
      }

      <div class="divider"></div>

      <div class="center footer-msg">${esc(printerConfig.footerMessage || 'Thank you for your business!')}</div>
      ${
        printerConfig.showBarcode
          ? `
      <div class="center barcode">${code128Svg(tx.id, { height: 42, moduleWidth: 1.5 })}</div>
      <div class="center barcode-label">${esc(tx.id)}</div>`
          : ''
      }
    </div>`;
}

// Kitchen ticket HTML: order id, time, who rang it, and large-type
// quantities/items — no prices or payment details. An optional stationName
// titles the ticket for per-station routing. Exported for unit testing.
export function buildKitchenTicketHtml(
  tx: SaleTransaction,
  settings: StoreSettings,
  stationName?: string,
): string {
  const unitCount = tx.items.reduce((s, i) => s + i.quantity, 0);
  const title = stationName ? `*** ${esc(stationName.toUpperCase())} ***` : '*** KITCHEN ***';
  return `
    <div class="receipt">
      <div class="center bold kitchen-title">${title}</div>
      <div class="center">${esc(settings.storeName)}</div>
      <div class="divider"></div>

      <div class="flex-row"><span>ORDER:</span><span class="bold">${esc(tx.id)}</span></div>
      <div class="flex-row"><span>TIME:</span><span>${esc(new Date(tx.date).toLocaleTimeString())}</span></div>
      ${
        tx.operatorName
          ? `<div class="flex-row"><span>OPERATOR:</span><span>${esc(tx.operatorName)}</span></div>`
          : ''
      }
      ${
        tx.customerName
          ? `<div class="flex-row"><span>CUSTOMER:</span><span>${esc(tx.customerName)}</span></div>`
          : ''
      }

      <div class="divider"></div>

      ${tx.items
        .map(
          (item) =>
            `<div class="kitchen-item">${item.quantity}x ${esc(item.productName)}</div>`,
        )
        .join('')}

      <div class="divider"></div>
      <div class="center bold">${unitCount} ITEMS</div>
    </div>`;
}

// Shared print-window scaffolding: writes the given receipt HTML into a new
// window sized to the thermal roll and triggers the OS print dialog.
function openPrintWindow(bodyHtml: string, rollWidth: string): PrintOutcome {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return 'popup-blocked';

  printWindow.document.write(`
    <html>
      <head>
        <title>POS Receipts</title>
        <style>
          body {
            font-family: 'Courier New', Courier, monospace;
            width: ${rollWidth};
            padding: 8px;
            margin: 0;
            font-size: 11px;
            color: #000;
            line-height: 1.3;
          }
          .receipt { margin-bottom: 20px; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .uppercase { text-transform: uppercase; }
          .muted { color: #555; }
          .text-lg { font-size: 14px; font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .logo { text-align: center; margin-bottom: 8px; }
          .logo svg { width: 32px; height: 32px; }
          .flex-row { display: flex; justify-content: space-between; }
          .mt-1 { margin-top: 4px; }
          .store-name { font-size: 15px; letter-spacing: 1px; text-transform: uppercase; }
          .item-unit { font-size: 10px; margin-bottom: 2px; }
          .total-row { border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; }
          .savings { margin-top: 6px; border: 1px dashed #000; padding: 3px 0; }
          .status-line { font-size: 12px; letter-spacing: 2px; margin: 2px 0; }
          .status-refunded, .status-partial { }
          .footer-msg { margin: 4px 0; }
          .barcode { margin-top: 10px; }
          .barcode svg { max-width: 90%; height: auto; }
          .barcode-label {
            font-family: 'Courier New', monospace;
            font-size: 10px;
            letter-spacing: 3px;
            margin-top: 2px;
          }
          .kitchen-title { font-size: 16px; }
          .kitchen-item { font-size: 16px; font-weight: bold; margin: 4px 0; }
          @media print {
            .page-break { page-break-after: always; }
          }
        </style>
      </head>
      <body onload="window.print(); window.close();">
        ${bodyHtml}
      </body>
    </html>
  `);
  printWindow.document.close();
  return 'printed';
}

// Opens a print window for one or more receipts on the "system" printer type;
// non-system types are mocked (ESC/POS handoff message). Returns an outcome the
// caller can surface to the operator; all dynamic values are HTML-escaped.
export function printTransactions(
  txs: SaleTransaction[],
  settings: StoreSettings,
  printerConfig: PrinterConfig,
): PrintOutcome {
  if (printerConfig.type !== 'system') return 'esc-pos';
  if (txs.length === 0) return 'printed';

  const rollWidth = printerConfig.paperSize === '58mm' ? '58mm' : '80mm';
  const receiptsHtml = txs
    .map((tx) => buildReceiptHtml(tx, settings, printerConfig))
    .join('<div class="page-break"></div>');
  return openPrintWindow(receiptsHtml, rollWidth);
}

// System-print path for the kitchen ticket format. Optionally titled with a
// station name for per-station routing.
export function printKitchenTicketSystem(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  stationName?: string,
): PrintOutcome {
  if (printerConfig.type !== 'system') return 'esc-pos';
  const rollWidth = printerConfig.paperSize === '58mm' ? '58mm' : '80mm';
  return openPrintWindow(buildKitchenTicketHtml(tx, settings, stationName), rollWidth);
}
