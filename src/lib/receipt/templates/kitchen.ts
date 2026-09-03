import i18n from '../../i18n';
import { escapeHtml as esc } from '../../utils/formatting';
import { formatDateTime, resolveKitchenLayout } from '../../receiptFormat';
import { ReceiptLayout, SaleTransaction, StoreSettings } from '../../../types';

/**
 * Kitchen ticket HTML: order id, time, who rang it, and large-type
 * quantities/items — no prices or payment details. An optional stationName
 * titles the ticket for per-station routing. Exported for unit testing.
 */
export function buildKitchenTicketHtml(
  tx: SaleTransaction,
  settings: StoreSettings,
  stationName?: string,
  layout?: ReceiptLayout,
): string {
  const unitCount = tx.items.reduce((s, i) => s + i.quantity, 0);
  const kitchenStr = i18n.t('receiptCfg.kitchenTitle', 'KITCHEN').toUpperCase();
  const title = stationName
    ? `*** ${esc(stationName.toUpperCase())} ***`
    : `*** ${esc(kitchenStr)} ***`;
  const d = new Date(tx.date);
  const L = resolveKitchenLayout(layout);
  const S = L.show;
  return `
    <div class="receipt">
      <div class="center bold kitchen-title">${title}</div>
      ${L.header ? `<div class="center bold">${esc(L.header)}</div>` : ''}
      ${S.storeName ? `<div class="center">${esc(settings.storeName)}</div>` : ''}
      <div class="divider"></div>

      ${S.receiptNumber ? `<div class="flex-row"><span>${esc(i18n.t('receiptCfg.tg_receiptNumber', 'ORDER').toUpperCase())}:</span><span class="bold ltr">${esc(tx.id)}</span></div>` : ''}
      ${S.date ? `<div class="flex-row"><span>${esc(i18n.t('history.date', 'DATE:'))}</span><span class="ltr">${esc(formatDateTime(d, L.dateFormat))}</span></div>` : ''}
      ${S.time ? `<div class="flex-row"><span>${esc(i18n.t('receiptCfg.tg_time', 'Time').toUpperCase())}:</span><span class="ltr">${esc(formatDateTime(d, L.timeFormat))}</span></div>` : ''}
      ${
        S.operator && tx.operatorName
          ? `<div class="flex-row"><span>${esc(i18n.t('history.operator', 'OPERATOR:'))}</span><span>${esc(tx.operatorName)}</span></div>`
          : ''
      }
      ${
        S.customer && tx.customerName
          ? `<div class="flex-row"><span>${esc(i18n.t('history.customer', 'CUSTOMER:'))}</span><span>${esc(tx.customerName)}</span></div>`
          : ''
      }

      <div class="divider"></div>

      ${tx.items
        .map((item) => `<div class="kitchen-item">${item.quantity}x ${esc(item.productName)}</div>`)
        .join('')}

      <div class="divider"></div>
      <div class="center bold">${unitCount} ${esc(i18n.t('history.itemsUpper', 'ITEMS').replace(':', ''))}</div>
      ${L.footer ? `<div class="center footer-msg">${esc(L.footer)}</div>` : ''}
    </div>`;
}
