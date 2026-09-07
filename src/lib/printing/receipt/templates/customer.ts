import i18n from '../../../i18n';
import { code128SvgMm } from '../../barcode';
import { escapeHtml as esc } from '../../../utils/formatting';
import { formatDateTime, printableWidthMm, resolveCustomerLayout } from '../../receiptFormat';
import { safeImageUrl } from '../../../imageUrl';
import { PrinterConfig, ReceiptLayout, SaleTransaction, StoreSettings } from '../../../../types';

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
 * A label/value line.
 *
 * `stack` drops the value onto its own line when the two cannot sit side by
 * side. The flex row alone would squeeze the label into a sliver and wrap it a
 * character at a time — which is exactly what the thermal renderer used to do
 * with the 39-character receipt id (see layoutPair in receiptCanvas.ts). The
 * threshold is deliberately generous: a value longer than about half the line
 * has already left too little for a readable label.
 */
function pairRow(
  label: string,
  value: string,
  opts: { bold?: boolean; muted?: boolean; ltr?: boolean; cls?: string } = {},
): string {
  const stack = value.length > 22;
  const cls = [
    'flex-row',
    stack ? 'stack' : '',
    opts.bold ? 'bold' : '',
    opts.muted ? 'muted' : '',
    opts.cls ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const valueCls = ['num', opts.ltr ? 'ltr' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}"><span>${esc(label)}</span><span class="${valueCls}">${esc(value)}</span></div>`;
}

/**
 * The Code 128 block, or just the readable id when the symbol cannot be printed
 * legibly on this roll.
 *
 * The bars used to be emitted at a fixed 1.5px module and left to CSS
 * `max-width` to shrink. That is not a fit — it scaled a 39-character id down
 * to 0.83 of a printer dot per module on 58mm, so the bars merged into a smear
 * that no scanner could read, while the ESC/POS and raster paths refused the
 * very same symbol on the very same roll. All three now ask the same question
 * and give the same answer; the readable id prints either way, so a refused
 * barcode still leaves a receipt you can look up.
 */
function barcodeBlock(value: string, paperSize: PrinterConfig['paperSize']): string {
  const fitted = code128SvgMm(value, printableWidthMm(paperSize), { heightMm: 13 });
  const readable = `<div class="center barcode-label ltr">${esc(value)}</div>`;
  return fitted ? `<div class="center barcode">${fitted.svg}</div>${readable}` : readable;
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
  const cur = settings.currency;
  const d = new Date(tx.date);
  const itemCount = tx.items.reduce((s, i) => s + i.quantity, 0);
  const isCash =
    tx.paymentMethod === 'cash' || (tx.payments ?? []).some((p) => p.method === 'cash');
  const taxStr = i18n.t('history.tax', 'TAX:').replace(':', '');
  const taxLabel = settings.taxRate > 0 ? `${taxStr} (${settings.taxRate}%)` : taxStr;
  const L = resolveCustomerLayout(layout, printerConfig);
  const S = L.show;
  const money = (n: number) => `${cur}${n.toFixed(2)}`;
  // The store logo is operator-supplied and lands in an <img src> inside a
  // same-origin print window, so it goes through the same allowlist as every
  // other image in the app rather than being trusted because it was escaped.
  const logo = safeImageUrl(settings.storeLogo);

  const meta = [
    S.date
      ? pairRow(i18n.t('history.date', 'DATE:'), formatDateTime(d, L.dateFormat), { ltr: true })
      : '',
    S.time
      ? pairRow(
          `${i18n.t('receiptCfg.tg_time', 'Time').toUpperCase()}:`,
          formatDateTime(d, L.timeFormat),
          { ltr: true },
        )
      : '',
    S.receiptNumber
      ? pairRow(i18n.t('history.receipt', 'RECEIPT:'), tx.id, { bold: true, ltr: true })
      : '',
    S.operator && tx.operatorName
      ? pairRow(i18n.t('history.operator', 'OPERATOR:'), tx.operatorName)
      : '',
    S.customer && tx.customerName
      ? pairRow(i18n.t('history.member', 'MEMBER:'), tx.customerName, { bold: true })
      : '',
  ].join('');

  const items = tx.items
    .map((item) => {
      const name = `${item.quantity}x ${esc(item.productName)}`;
      const line = S.priceColumn
        ? `<div class="flex-row item"><span>${name}</span><span class="num ltr">${esc(money(item.total))}</span></div>`
        : `<div class="item">${name}</div>`;
      const unit =
        S.priceColumn && S.itemUnitPrice && item.quantity > 1
          ? `<div class="item-unit ltr">@ ${esc(money(item.price))} ${esc(i18n.t('register.each', 'ea'))}</div>`
          : '';
      return line + unit;
    })
    .join('');

  const totals = S.totals
    ? `<div class="totals">
      ${pairRow(i18n.t('history.itemsUpper', 'ITEMS:'), String(itemCount), { muted: true, ltr: true })}
      ${pairRow(i18n.t('history.subtotal', 'SUBTOTAL:'), money(tx.subtotal), { ltr: true })}
      ${tx.discount > 0 ? pairRow(i18n.t('history.discount', 'DISCOUNT:'), `-${money(tx.discount)}`, { ltr: true }) : ''}
      ${pairRow(`${taxLabel}:`, money(tx.tax), { ltr: true })}
      <div class="flex-row total-row"><span>${esc(i18n.t('history.totalPaid', 'TOTAL PAID:'))}</span><span class="num ltr">${esc(money(tx.total))}</span></div>
      ${tx.discount > 0 ? `<div class="center savings">${esc(i18n.t('history.savings', 'YOU SAVED'))} <span class="num ltr">${esc(money(tx.discount))}</span></div>` : ''}
    </div>`
    : '';

  const payment = S.paymentDetails
    ? pairRow(i18n.t('history.payMethod', 'METHOD:'), payMethodLabel(tx.paymentMethod), {
        bold: true,
      }) +
      (tx.payments && tx.payments.length > 1
        ? tx.payments
            .map((p) =>
              // Indented via a class, not leading spaces: HTML collapses runs of
              // whitespace, so a literal indent silently disappears (the markup
              // used two &nbsp; for exactly this reason). A logical padding also
              // mirrors correctly on an Arabic receipt, which &nbsp; would not.
              pairRow(payMethodLabel(p.method), money(p.amount), { ltr: true, cls: 'tender' }),
            )
            .join('')
        : '')
    : '';

  const change =
    S.changeDue && isCash
      ? pairRow(i18n.t('history.cashPaid', 'CASH PAID:'), money(tx.cashPaid ?? 0), { ltr: true }) +
        pairRow(i18n.t('history.cashChange', 'CHANGE:'), money(tx.cashChange ?? 0), {
          bold: true,
          ltr: true,
        })
      : '';

  const loyalty =
    S.loyalty && tx.customerName && (tx.pointsEarned ?? 0) > 0
      ? pairRow(i18n.t('history.pointsEarned', 'POINTS EARNED:'), String(tx.pointsEarned), {
          bold: true,
          ltr: true,
        })
      : '';

  return `
    <div class="receipt">
      ${L.header ? `<div class="center receipt-header">${esc(L.header)}</div>` : ''}
      ${
        S.logo
          ? `<div class="logo">${
              logo ? `<img src="${esc(logo)}" alt="" />` : FALLBACK_LOGO_SVG
            }</div>`
          : ''
      }
      ${S.storeName ? `<div class="center store-name">${esc(settings.storeName)}</div>` : ''}
      <div class="center store-meta">
        ${S.branchName && settings.branchName ? `<div>${esc(settings.branchName)}</div>` : ''}
        ${S.address && settings.storeAddress ? `<div>${esc(settings.storeAddress)}</div>` : ''}
        ${S.phone && settings.storePhone ? `<div class="ltr">${esc(i18n.t('receipt.phone', 'Phone'))}: ${esc(settings.storePhone)}</div>` : ''}
        ${S.taxNumber && settings.taxNumber ? `<div class="ltr">${esc(i18n.t('receipt.vat', 'VAT'))}: ${esc(settings.taxNumber)}</div>` : ''}
      </div>

      <div class="divider"></div>
      <div class="meta-row">${meta}</div>
      <div class="divider"></div>

      ${items}

      <div class="divider"></div>
      ${totals}
      ${payment}${change}${loyalty}

      <div class="divider"></div>

      <div class="center uppercase status-line status-${esc(tx.status)}">${esc(i18n.t(`receipt.status_${tx.status}`, tx.status))}</div>
      ${
        tx.refundDate
          ? `<div class="center muted">${esc(i18n.t('history.refund', 'REFUND:'))} <span class="ltr">${esc(formatDateTime(new Date(tx.refundDate), L.dateFormat))}</span></div>`
          : ''
      }
      ${
        tx.refundAuthorizedBy
          ? `<div class="center muted">${esc(i18n.t('history.refundAuthBy', 'REFUND AUTH:'))} ${esc(tx.refundAuthorizedBy)}</div>`
          : ''
      }

      ${L.footer ? `<div class="center footer-msg">${esc(L.footer)}</div>` : ''}
      ${S.barcode ? barcodeBlock(tx.id, printerConfig.paperSize) : ''}
    </div>`;
}
