import i18n from '../../../i18n';
import { escapeHtml as esc } from '../../../utils/formatting';
import { itemLabel, itemModifierNames } from '../../lineItem';
import { formatDateTime, resolveKitchenLayout } from '../../receiptFormat';
import { ReceiptLayout, SaleTransaction, StoreSettings } from '../../../../types';

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
  const kitchenStr = i18n.t('receiptCfg.kitchenTitle').toUpperCase();
  const title = stationName
    ? `*** ${esc(stationName.toUpperCase())} ***`
    : `*** ${esc(kitchenStr)} ***`;
  const d = new Date(tx.date);
  const L = resolveKitchenLayout(layout);
  const S = L.show;
  const pair = (label: string, value: string, bold = false) => {
    // Same rule as the customer receipt: a value too long to sit beside its
    // label drops below it rather than crushing the label to a sliver. The
    // order id is the one that triggers it, and on a kitchen ticket the order
    // id is the single most important thing on the paper.
    const stack = value.length > 22 ? ' stack' : '';
    return `<div class="flex-row${stack}${bold ? ' bold' : ''}"><span>${esc(label)}</span><span class="num ltr">${esc(value)}</span></div>`;
  };

  return `
    <div class="receipt">
      <div class="center kitchen-title">${title}</div>
      ${L.header ? `<div class="center bold">${esc(L.header)}</div>` : ''}
      ${S.storeName ? `<div class="center store-meta">${esc(settings.storeName)}</div>` : ''}
      <div class="divider"></div>

      ${S.receiptNumber ? pair(`${i18n.t('receiptCfg.tg_receiptNumber').toUpperCase()}:`, tx.id, true) : ''}
      ${S.date ? pair(i18n.t('history.date'), formatDateTime(d, L.dateFormat)) : ''}
      ${S.time ? pair(`${i18n.t('receiptCfg.tg_time').toUpperCase()}:`, formatDateTime(d, L.timeFormat)) : ''}
      ${S.operator && tx.operatorName ? pair(i18n.t('history.operator'), tx.operatorName) : ''}
      ${S.customer && tx.customerName ? pair(i18n.t('history.customer'), tx.customerName) : ''}

      <div class="divider"></div>

      ${tx.items
        .map((item) => {
          // The variant and the modifiers ARE the ticket. A kitchen ticket
          // reading "1x Latte" against an order for a large oat latte with an
          // extra shot is not a short ticket, it is the wrong drink — and this
          // is the path every kitchen ticket takes, on every printer type.
          const line = `<div class="kitchen-item">${item.quantity}x ${esc(itemLabel(item))}</div>`;
          const mods = itemModifierNames(item)
            .map((modifier) => `<div class="kitchen-mod">• ${esc(modifier)}</div>`)
            .join('');
          return line + mods;
        })
        .join('')}

      <div class="divider"></div>
      <div class="center kitchen-count">${unitCount} ${esc(i18n.t('history.itemsUpper').replace(':', ''))}</div>
      ${L.footer ? `<div class="center footer-msg">${esc(L.footer)}</div>` : ''}
    </div>`;
}
