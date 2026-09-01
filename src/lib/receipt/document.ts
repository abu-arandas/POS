import i18n from '../i18n';
import { escapeHtml as esc } from '../utils/formatting';
import { safeFontFamily } from '../receiptFormat';

/**
 * A standalone receipt document (styles + body). Shared by the print window and
 * the settings live-preview iframe. The per-block sizes are em-relative so the
 * whole receipt scales with the layout's base font size.
 */
export function receiptDocHtml(
  bodyHtml: string,
  rollWidth: string,
  fontFamily = 'monospace',
  fontSizePx = 12,
  autoPrint = false,
): string {
  // Both values land inside a <style> block, so neither may carry arbitrary
  // text: the font is whitelisted and the size is coerced to a bounded number.
  const font = safeFontFamily(fontFamily);
  const size = Math.max(8, Math.min(40, Number(fontSizePx) || 12));

  // The receipt renders in its own document — a print window, an Electron
  // data: URL, or the settings preview iframe — so it inherits nothing from the
  // app: not the <html dir>, not the bundled Cairo face. Both have to be
  // restated here or an Arabic receipt comes out unshaped and left-aligned.
  const rtl = i18n.language === 'ar';
  const lang = rtl ? 'ar' : 'en';
  // Arabic needs a face that actually has the script. The app's own Cairo is
  // not reachable from this document (separate origin for the data: URL, and
  // @font-face does not cascade into an iframe), so fall back to the system
  // faces that ship with Windows and macOS and do have full Arabic coverage.
  // For RTL the whitelisted font only leads if it actually carries Arabic.
  // 'monospace' and 'Courier New' resolve to faces whose Arabic is barely
  // legible at receipt size, so they yield to the system UI faces instead.
  const ARABIC_CAPABLE = ['Arial', 'Tahoma'];
  const stack = rtl
    ? `${ARABIC_CAPABLE.includes(font) ? `"${font}", ` : ''}'Segoe UI', Tahoma, Arial, sans-serif`
    : `"${font}", 'Courier New', Courier, monospace`;

  return `<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}">
      <head>
        <meta charset="utf-8" />
        <title>${esc(i18n.t('receiptCfg.docTitle', 'POS Receipts'))}</title>
        <style>
          body {
            font-family: ${stack};
            width: ${rollWidth};
            padding: 8px;
            margin: 0;
            font-size: ${size}px;
            color: #000;
            line-height: ${rtl ? '1.55' : '1.3'};
            /* Arabic ascenders/descenders need more room than Latin, and the
               numerals must stay LTR inside an RTL line. */
            font-variant-numeric: tabular-nums;
          }
          /* Each cell is its own bidi context. Without this an amount like
             "8.80 د.أ" next to an Arabic label reorders across the whole line
             and the figures land in the wrong column. */
          .flex-row > span { unicode-bidi: isolate; }
          /* Amounts, dates, ids and counts are Latin/numeric even on an Arabic
             receipt, so they get their own LTR base direction. Isolation alone
             leaves "8:15 PM" rendering as "PM 8:15". */
          .ltr { direction: ltr; unicode-bidi: isolate; }
          .receipt { margin-bottom: 20px; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .uppercase { text-transform: uppercase; }
          .muted { color: #555; }
          .text-lg { font-size: 1.25em; font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          /* Collapse dividers around a section hidden by receipt-layout toggles,
             so an empty block never leaves a double rule or a stray edge line. */
          .divider + .divider { display: none; }
          .receipt > .divider:first-child, .receipt > .divider:last-child { display: none; }
          .logo { text-align: center; margin-bottom: 8px; }
          .logo svg { width: 32px; height: 32px; }
          .flex-row { display: flex; justify-content: space-between; }
          .mt-1 { margin-top: 4px; }
          .receipt-header { font-size: 1.3em; margin-bottom: 4px; }
          .store-name { font-size: 1.35em; letter-spacing: 1px; text-transform: uppercase; }
          .item-unit { font-size: 0.85em; margin-bottom: 2px; }
          .total-row { border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; }
          .savings { margin-top: 6px; border: 1px dashed #000; padding: 3px 0; }
          .status-line { font-size: 1.05em; letter-spacing: 2px; margin: 2px 0; }
          .status-refunded, .status-partial { }
          .footer-msg { margin: 4px 0; }
          .barcode { margin-top: 10px; }
          .barcode svg { max-width: 90%; height: auto; }
          .barcode-label {
            font-family: 'Courier New', monospace;
            font-size: 0.82em;
            letter-spacing: 3px;
            margin-top: 2px;
          }
          .kitchen-title { font-size: 1.4em; }
          .kitchen-item { font-size: 1.35em; font-weight: bold; margin: 4px 0; }
          @media print {
            .page-break { page-break-after: always; }
          }
        </style>
      </head>
      <body${autoPrint ? ' onload="window.print(); window.close();"' : ''}>
        ${bodyHtml}
      </body>
    </html>`;
}
