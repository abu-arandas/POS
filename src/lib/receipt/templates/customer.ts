import i18n from '../../i18n';
import { code128Svg } from '../../barcode';
import { escapeHtml as esc } from '../../utils/formatting';
import { formatDateTime, resolveCustomerLayout } from '../../receiptFormat';
import { PrinterConfig, ReceiptLayout, SaleTransaction, StoreSettings } from '../../../types';

const FALLBACK_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 512 512">' +
  '<g fill="none" stroke="#000" stroke-width="48" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M148 402 L256 148"/><path d="M256 148 L364 402"/><path d="M205 352 L307 352"/></g>' +
  '<path d="M96 322 C 150 232, 262 190, 356 214" fill="none" stroke="#000" stroke-width="28" stroke-linecap="round"/>' +
  '<path d="M330 168 L410 206 L344 258 Z" fill="#000"/>' +
  '<path d="M398 62 L411 104 L453 117 L411 130 L398 172 L385 130 L343 117 L385 104 Z" fill="#000"/>' +
  '</svg>';

// Tender labels. The receipt used to print the raw enum ('cash'), which is
// untranslated and reads as a stray English word on an Arabic receipt.
function payMethodLabel(method: string): string {
  const key = `register.pay${method.charAt(0).toUpperCase()}${method.slice(1)}`;
  return i18n.t(key, method.toUpperCase());
}

/**
 * Builds the escaped HTML for a single receipt. Exported for unit testing; the
 * print path composes these into a print window below.
 */
export function buildReceiptHtml(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  layout?: ReceiptLayout,
): string {
  const cur = esc(settings.currency);
  const d = new Date(tx.date);
  const itemCount = tx.items.reduce((s, i) => s + i.quantity, 0);
  const isCash =
    tx.paymentMethod === 'cash' || (tx.payments ?? []).some((p) => p.method === 'cash');
  const taxStr = i18n.t('history.tax', 'TAX:').replace(':', '');
  const taxLabel = settings.taxRate > 0 ? `${taxStr} (${settings.taxRate}%)` : taxStr;
  const L = resolveCustomerLayout(layout, printerConfig);
  const S = L.show;

  return `
    <div class="receipt">
      ${L.header ? `<div class="center bold receipt-header">${esc(L.header)}</div>` : ''}
      ${
        S.logo
          ? `<div class="logo">${
              settings.storeLogo
                ? `<img src="${esc(settings.storeLogo)}" style="max-height: 40px; width: auto;" />`
                : FALLBACK_LOGO_SVG
            }</div>`
          : ''
      }
      ${S.storeName ? `<div class="center bold store-name">${esc(settings.storeName)}</div>` : ''}
      ${S.branchName && settings.branchName ? `<div class="center muted">${esc(settings.branchName)}</div>` : ''}
      ${S.address && settings.storeAddress ? `<div class="center muted">${esc(settings.storeAddress)}</div>` : ''}
      ${S.phone && settings.storePhone ? `<div class="center muted">${esc(i18n.t('receipt.phone', 'Phone'))}: ${esc(settings.storePhone)}</div>` : ''}
      ${S.taxNumber && settings.taxNumber ? `<div class="center muted">${esc(i18n.t('receipt.vat', 'VAT'))}: ${esc(settings.taxNumber)}</div>` : ''}
      <div class="divider"></div>

      ${S.date ? `<div class="flex-row"><span>${esc(i18n.t('history.date', 'DATE:'))}</span><span class="ltr">${esc(formatDateTime(d, L.dateFormat))}</span></div>` : ''}
      ${S.time ? `<div class="flex-row"><span>${esc(i18n.t('receiptCfg.tg_time', 'Time').toUpperCase())}:</span><span class="ltr">${esc(formatDateTime(d, L.timeFormat))}</span></div>` : ''}
      ${S.receiptNumber ? `<div class="flex-row"><span>${esc(i18n.t('history.receipt', 'RECEIPT:'))}</span><span class="bold ltr">${esc(tx.id)}</span></div>` : ''}
      ${
        S.operator && tx.operatorName
          ? `<div class="flex-row"><span>${esc(i18n.t('history.operator', 'OPERATOR:'))}</span><span>${esc(tx.operatorName)}</span></div>`
          : ''
      }
      ${
        S.customer && tx.customerName
          ? `<div class="flex-row bold"><span>${esc(i18n.t('history.member', 'MEMBER:'))}</span><span>${esc(tx.customerName)}</span></div>`
          : ''
      }

      <div class="divider"></div>

      ${tx.items
        .map(
          (item) => `
        <div class="flex-row">
          <span>${item.quantity}x ${esc(item.productName)}</span>
          ${S.priceColumn ? `<span class="ltr">${cur}${item.total.toFixed(2)}</span>` : ''}
        </div>${
          S.priceColumn && S.itemUnitPrice && item.quantity > 1
            ? `<div class="flex-row muted item-unit"><span>@ ${cur}${item.price.toFixed(2)} ${esc(i18n.t('register.each', 'ea'))}</span><span></span></div>`
            : ''
        }`,
        )
        .join('')}

      <div class="divider"></div>

      ${
        S.totals
          ? `
      <div class="flex-row muted"><span>${esc(i18n.t('history.itemsUpper', 'ITEMS:'))}</span><span class="ltr">${itemCount}</span></div>
      <div class="flex-row"><span>${esc(i18n.t('history.subtotal', 'SUBTOTAL:'))}</span><span class="ltr">${cur}${tx.subtotal.toFixed(2)}</span></div>
      ${
        tx.discount > 0
          ? `<div class="flex-row"><span>${esc(i18n.t('history.discount', 'DISCOUNT:'))}</span><span class="ltr">-${cur}${tx.discount.toFixed(2)}</span></div>`
          : ''
      }
      <div class="flex-row"><span>${esc(taxLabel)}:</span><span class="ltr">${cur}${tx.tax.toFixed(2)}</span></div>
      <div class="flex-row text-lg total-row"><span>${esc(i18n.t('history.totalPaid', 'TOTAL PAID:'))}</span><span class="ltr">${cur}${tx.total.toFixed(2)}</span></div>
      ${
        tx.discount > 0
          ? `<div class="center bold savings">${esc(i18n.t('history.savings', 'YOU SAVED'))} ${cur}${tx.discount.toFixed(2)}</div>`
          : ''
      }`
          : ''
      }

      <div class="divider"></div>

      ${
        S.paymentDetails
          ? `<div class="flex-row"><span>${esc(i18n.t('history.payMethod', 'METHOD:'))}</span><span class="bold">${esc(payMethodLabel(tx.paymentMethod))}</span></div>
      ${
        tx.payments && tx.payments.length > 1
          ? tx.payments
              .map(
                (p) =>
                  `<div class="flex-row"><span>&nbsp;&nbsp;${esc(payMethodLabel(p.method))}</span><span class="ltr">${cur}${p.amount.toFixed(2)}</span></div>`,
              )
              .join('')
          : ''
      }`
          : ''
      }
      ${
        S.changeDue && isCash
          ? `
      <div class="flex-row"><span>${esc(i18n.t('history.cashPaid', 'CASH PAID:'))}</span><span class="ltr">${cur}${(tx.cashPaid ?? 0).toFixed(2)}</span></div>
      <div class="flex-row bold"><span>${esc(i18n.t('history.cashChange', 'CHANGE:'))}</span><span class="ltr">${cur}${(tx.cashChange ?? 0).toFixed(2)}</span></div>`
          : ''
      }
      ${
        S.loyalty && tx.customerName && (tx.pointsEarned ?? 0) > 0
          ? `<div class="flex-row"><span>${esc(i18n.t('history.pointsEarned', 'POINTS EARNED:'))}</span><span class="bold ltr">${tx.pointsEarned}</span></div>`
          : ''
      }

      <div class="divider"></div>

      <div class="center bold uppercase status-line status-${esc(tx.status)}">${esc(i18n.t(`receipt.status_${tx.status}`, tx.status))}</div>
      ${
        tx.refundDate
          ? `<div class="center">${esc(i18n.t('history.refund', 'REFUND:'))} ${esc(formatDateTime(new Date(tx.refundDate), L.dateFormat))}</div>`
          : ''
      }
      ${
        tx.refundAuthorizedBy
          ? `<div class="center">${esc(i18n.t('history.refundAuthBy', 'REFUND AUTH:'))} ${esc(tx.refundAuthorizedBy)}</div>`
          : ''
      }

      <div class="divider"></div>

      ${L.footer ? `<div class="center footer-msg">${esc(L.footer)}</div>` : ''}
      ${
        S.barcode
          ? `
      <div class="center barcode">${code128Svg(tx.id, { height: 42, moduleWidth: 1.5 })}</div>
      <div class="center barcode-label">${esc(tx.id)}</div>`
          : ''
      }
    </div>`;
}
