import i18n from '../../i18n';
import { escapeHtml as esc } from '../../utils/formatting';
import { RECEIPT_MARGIN_MM, safeFontFamily } from '../receiptFormat';

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
  const rtlLead = ARABIC_CAPABLE.includes(font) ? `"${font}", ` : '';
  const stack = rtl
    ? `${rtlLead}'Segoe UI', Tahoma, Arial, sans-serif`
    : `"${font}", 'Courier New', Courier, monospace`;

  return `<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}">
      <head>
        <meta charset="utf-8" />
        <title>${esc(i18n.t('receiptCfg.docTitle', 'POS Receipts'))}</title>
        <style>
          /* The roll is a hard edge. Without border-box the padding below was
             ADDED to the roll width, so the document came out 2x${RECEIPT_MARGIN_MM}mm wider
             than the paper and the head clipped the overhang — taking the right
             edge off every amount, so a total of $27.04 printed as "$27.0". */
          *, *::before, *::after { box-sizing: border-box; }

          body {
            font-family: ${stack};
            width: ${rollWidth};
            padding: 4mm ${RECEIPT_MARGIN_MM}mm 6mm;
            margin: 0;
            font-size: ${size}px;
            /* Thermal paper is one bit deep: a dot is burned or it is not.
               Greys do not survive that — they either threshold to solid black
               (so the distinction is lost) or drop out entirely. Hierarchy here
               is carried by size, weight and spacing, never by colour. */
            color: #000;
            line-height: ${rtl ? '1.5' : '1.35'};
            -webkit-font-smoothing: none;
          }

          /* Each cell is its own bidi context. Without this an amount like
             "8.80 د.أ" next to an Arabic label reorders across the whole line
             and the figures land in the wrong column. */
          .flex-row > span { unicode-bidi: isolate; }
          /* Amounts, dates, ids and counts are Latin/numeric even on an Arabic
             receipt, so they get their own LTR base direction. Isolation alone
             leaves "8:15 PM" rendering as "PM 8:15". */
          .ltr { direction: ltr; unicode-bidi: isolate; }
          /* Figures line up in their column only if every digit is one width. */
          .num { font-variant-numeric: tabular-nums; white-space: nowrap; }

          .receipt { margin-bottom: 8mm; }
          .center { text-align: center; }
          .bold { font-weight: 700; }
          .uppercase { text-transform: uppercase; }
          /* Retained for compatibility with saved layouts; rendered as a size
             step rather than a grey, for the reason on the body rule above. */
          .muted { font-size: 0.85em; }
          .text-lg { font-size: 1.25em; font-weight: 700; }

          .divider { border-top: 1px dashed #000; margin: 2mm 0; }
          /* Collapse dividers around a section hidden by receipt-layout toggles,
             so an empty block never leaves a double rule or a stray edge line. */
          .divider + .divider { display: none; }
          .receipt > .divider:first-child, .receipt > .divider:last-child { display: none; }

          .logo { text-align: center; margin-bottom: 2mm; }
          /* Explicit height rather than max-height: the built-in mark carries
             width="32" height="32", so a max-only rule left it printing at 32
             device pixels — a stamp at the top of an 80mm receipt. */
          .logo img, .logo svg { height: 12mm; width: auto; max-width: 60%; }

          /* A pair. The value never shrinks or wraps; a long label wraps under
             it. min-width:0 is what lets the label actually wrap instead of
             forcing the flex line wider than the roll. */
          .flex-row { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; }
          .flex-row > span:first-child { min-width: 0; overflow-wrap: anywhere; }
          .flex-row > span:last-child { flex: none; }
          /* A value too wide to sit beside its label drops to its own line,
             rather than crushing the label into a vertical stack of letters.
             It still has to WRAP once there: a receipt id is one unbroken token
             and would otherwise run straight off the edge of the roll — the same
             clipping the box-sizing rule above exists to stop. */
          .stack { display: block; }
          .stack > span:last-child {
            display: block;
            text-align: ${rtl ? 'left' : 'right'};
            overflow-wrap: anywhere;
            white-space: normal;
          }
          /* .num sets nowrap for column alignment; a stacked value is its own
             line and needs the opposite. */
          .stack > span.num { white-space: normal; }

          .receipt-header { font-size: 1.15em; font-weight: 700; margin-bottom: 1mm; }
          .store-name {
            font-size: 1.7em; font-weight: 700; line-height: 1.15;
            letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 1mm;
          }
          .store-meta { font-size: 0.85em; line-height: 1.3; }
          .meta-row { font-size: 0.9em; }

          .item { margin: 1.2mm 0; }
          .item-unit { font-size: 0.8em; padding-inline-start: 3mm; }

          /* A tender line under its own PAY METHOD heading. */
          .tender > span:first-child { padding-inline-start: 3mm; }
          .totals { margin-top: 1mm; }
          .totals .flex-row { margin: 0.8mm 0; }
          /* The one figure the customer looks for, and the one that has to
             survive faded paper — so it gets a rule and a box, not just weight. */
          .total-row {
            font-size: 1.3em; font-weight: 700;
            border: 2px solid #000; padding: 1.5mm 2mm; margin: 2mm 0 1.5mm;
          }
          .savings { font-weight: 700; border: 1px dashed #000; padding: 1mm 0; margin-bottom: 1.5mm; }
          .status-line { font-size: 1.05em; font-weight: 700; letter-spacing: 2px; margin: 1.5mm 0; }
          /* Operator free text, so its language is not the receipt's to assume.
             plaintext takes the direction from the first strong character of the
             content itself: an English footer on an Arabic receipt kept its
             trailing "!" dragged to the front ("!Thank you for shopping with
             us") because it inherited the paragraph's RTL base direction. */
          .footer-msg, .receipt-header { unicode-bidi: plaintext; }
          .footer-msg { margin: 2mm 0 0; font-size: 0.9em; }

          /* Sized in millimetres by code128SvgMm and already carrying its quiet
             zone, so it must NOT be scaled: shrinking it here would put the
             module back below one printer dot, which is the whole bug. */
          .barcode { margin-top: 3mm; }
          .barcode svg { display: inline-block; }
          .barcode-label {
            font-family: 'Courier New', monospace;
            font-size: 0.8em; letter-spacing: 1px; margin-top: 1mm;
            overflow-wrap: anywhere;
          }

          /* balance keeps "*** KITCHEN TICKET ***" from breaking after the
             first word and leaving the asterisks stranded on their own line. */
          .kitchen-title {
            font-size: 1.6em; font-weight: 700; letter-spacing: 1px;
            margin-bottom: 1mm; text-wrap: balance;
          }
          .kitchen-item {
            font-size: 1.3em; font-weight: 700; line-height: 1.25;
            margin: 2mm 0; overflow-wrap: anywhere;
          }
          .kitchen-count { font-size: 1.05em; font-weight: 700; letter-spacing: 1px; }

          @media print {
            .page-break { page-break-after: always; }
            body { padding-bottom: 0; }
          }
        </style>
      </head>
      <body${autoPrint ? ' onload="window.print(); window.close();"' : ''}>
        ${bodyHtml}
      </body>
    </html>`;
}
