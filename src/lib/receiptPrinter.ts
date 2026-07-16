import { SaleTransaction, StoreSettings, PrinterConfig } from '../types';
import { escapeHtml as esc } from './escapeHtml';

export type PrintOutcome = 'printed' | 'popup-blocked' | 'esc-pos';

const FALLBACK_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';

function receiptHtml(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
): string {
  const cur = esc(settings.currency);

  return `
    <div class="receipt">
      <div class="logo">
        ${
          settings.storeLogo
            ? `<img src="${esc(settings.storeLogo)}" style="max-height: 40px; width: auto;" />`
            : FALLBACK_LOGO_SVG
        }
      </div>
      <div class="center bold">${esc(settings.storeName)}</div>
      <div class="center">${esc(settings.storeAddress)}</div>
      <div class="center">Phone: ${esc(settings.storePhone)}</div>
      <div class="divider"></div>

      <div class="flex-row"><span>DATE:</span><span>${esc(new Date(tx.date).toLocaleString())}</span></div>
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

      <div class="bold">ITEMS:</div>
      ${tx.items
        .map(
          (item) => `
        <div class="flex-row">
          <span>${item.quantity}x ${esc(item.productName)}</span>
          <span>${cur}${item.total.toFixed(2)}</span>
        </div>`,
        )
        .join('')}

      <div class="divider"></div>

      <div class="flex-row"><span>SUBTOTAL:</span><span>${cur}${tx.subtotal.toFixed(2)}</span></div>
      ${
        tx.discount > 0
          ? `<div class="flex-row"><span>DISCOUNT:</span><span>-${cur}${tx.discount.toFixed(2)}</span></div>`
          : ''
      }
      <div class="flex-row"><span>TAX:</span><span>${cur}${tx.tax.toFixed(2)}</span></div>
      <div class="flex-row text-lg"><span>TOTAL PAID:</span><span>${cur}${tx.total.toFixed(2)}</span></div>

      <div class="divider"></div>

      <div class="flex-row"><span>METHOD:</span><span class="bold uppercase">${esc(tx.paymentMethod)}</span></div>
      ${
        tx.paymentMethod === 'cash'
          ? `
      <div class="flex-row"><span>CASH PAID:</span><span>${cur}${(tx.cashPaid ?? 0).toFixed(2)}</span></div>
      <div class="flex-row bold"><span>CHANGE:</span><span>${cur}${(tx.cashChange ?? 0).toFixed(2)}</span></div>`
          : ''
      }

      <div class="divider"></div>

      <div class="center bold uppercase">${esc(tx.status)}</div>
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

      <div class="center">${esc(printerConfig.footerMessage || 'Thank you for your business!')}</div>
      ${
        printerConfig.showBarcode
          ? `
      <div class="center mt-1" style="font-size: 8px; letter-spacing: 2px; color: #444;">
        ||||| ||| ||| |||| | | |||| |||
      </div>
      <div class="center" style="font-size: 8px;">* AUTH-${esc(tx.id)} *</div>`
          : ''
      }
    </div>`;
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

  const printWindow = window.open('', '_blank');
  if (!printWindow) return 'popup-blocked';

  const rollWidth = printerConfig.paperSize === '58mm' ? '58mm' : '80mm';
  const receiptsHtml = txs
    .map((tx) => receiptHtml(tx, settings, printerConfig))
    .join('<div class="page-break"></div>');

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
          .text-lg { font-size: 14px; font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .logo { text-align: center; margin-bottom: 8px; }
          .logo svg { width: 32px; height: 32px; }
          .flex-row { display: flex; justify-content: space-between; }
          .mt-1 { margin-top: 4px; }
          @media print {
            .page-break { page-break-after: always; }
          }
        </style>
      </head>
      <body onload="window.print(); window.close();">
        ${receiptsHtml}
      </body>
    </html>
  `);
  printWindow.document.close();
  return 'printed';
}
