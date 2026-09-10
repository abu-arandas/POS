import { Product, StoreSettings } from '../../types';
import { escapeHtml as esc } from '../utils/formatting';
import { openDetachedPrintWindow } from '../utils/dom';
import { code128SvgMm } from './barcode';

// Printable product labels / shelf price tags. Each label shows the product
// name, price, SKU, and a real scannable Code128 barcode of the SKU. Pure and
// DOM-free (returns HTML strings) so it's unit-testable; the print path opens a
// window with the sheet.

/**
 * Sheet layout and which fields each label carries.
 */
export interface LabelOptions {
  columns?: number; // labels per row on the sheet
  showPrice?: boolean;
  showBarcode?: boolean;
}

// A4 is what a label sheet is printed on, and the grid below divides it. The
// barcode has to be sized against the cell it actually lands in, so the two
// share these numbers rather than each guessing.
const SHEET_WIDTH_MM = 210;
const SHEET_PAD_MM = 2.6; // body padding: 10px
const CELL_GAP_MM = 2.1; // grid gap: 8px
const CELL_PAD_MM = 1.6; // .label padding: 6px

/**
 * Columns actually rendered, bounded the same way the sheet bounds them.
 */
function clampColumns(columns: number | undefined): number {
  return Math.max(1, Math.min(6, columns ?? 3));
}

/**
 * Width available to a barcode inside one label cell, in millimetres.
 */
export function labelBarcodeWidthMm(columns: number): number {
  const cols = clampColumns(columns);
  const usable = SHEET_WIDTH_MM - SHEET_PAD_MM * 2 - CELL_GAP_MM * (cols - 1);
  return Math.max(0, usable / cols - CELL_PAD_MM * 2);
}

/**
 * One label cell.
 */
export function buildLabelHtml(
  product: Product,
  settings: StoreSettings,
  opts: LabelOptions = {},
): string {
  const showPrice = opts.showPrice ?? true;
  const showBarcode = opts.showBarcode ?? true;
  const columns = clampColumns(opts.columns);
  return `
    <div class="label">
      <div class="label-store">${esc(settings.storeName)}</div>
      <div class="label-name">${esc(product.name)}</div>
      ${
        showPrice
          ? `<div class="label-price">${esc(settings.currency)}${product.price.toFixed(2)}</div>`
          : ''
      }
      ${
        showBarcode
          ? (() => {
              // Sized to the cell in millimetres instead of a fixed module width
              // that CSS then shrank to fit. A long SKU used to scale down until
              // the bars merged; now it either prints at a readable module or
              // the label carries the SKU text alone (which it prints anyway).
              const fitted = code128SvgMm(product.sku, labelBarcodeWidthMm(columns), {
                heightMm: 9,
                maxModuleMm: 0.4,
              });
              return fitted ? `<div class="label-barcode">${fitted.svg}</div>` : '';
            })()
          : ''
      }
      <div class="label-sku">${esc(product.sku)}</div>
    </div>`;
}

/**
 * Full printable sheet for a set of products.
 */
export function buildLabelSheetHtml(
  products: Product[],
  settings: StoreSettings,
  opts: LabelOptions = {},
): string {
  const columns = clampColumns(opts.columns);
  const labels = products.map((p) => buildLabelHtml(p, settings, opts)).join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${esc(settings.storeName)} — Labels</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 10px; font-family: 'Helvetica Neue', Arial, sans-serif; color: #000; }
      .sheet {
        display: grid;
        grid-template-columns: repeat(${columns}, 1fr);
        gap: 8px;
      }
      .label {
        border: 1px solid #d1d5db;
        border-radius: 6px;
        padding: 8px 6px;
        text-align: center;
        page-break-inside: avoid;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .label-store { font-size: 8px; letter-spacing: 1px; text-transform: uppercase; color: #6b7280; }
      .label-name { font-size: 12px; font-weight: 700; line-height: 1.15; min-height: 2.3em; width: 100%; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; word-break: break-word; }
      .label-price { font-size: 18px; font-weight: 800; margin: 2px 0; }
      .label-barcode { margin-top: 2px; }
      /* Sized in mm by code128SvgMm and already carrying its quiet zone —
         scaling it here would put the module back under one printed dot. */
      .label-barcode svg { display: block; }
      .label-sku { font-family: 'Courier New', monospace; font-size: 9px; letter-spacing: 1px; color: #374151; }
      @media print { body { padding: 0; } .label { border-color: #e5e7eb; } }
    </style>
  </head>
  <body>
    <div class="sheet">${labels}</div>
    <script>window.onload = function () { window.print(); };</script>
  </body>
</html>`;
}

/**
 * Whether the label sheet reached a print window, and if not, why.
 */
export type LabelPrintOutcome = 'printed' | 'popup-blocked' | 'empty';

/**
 * Opens a print window with the label sheet. Returns an outcome the caller can
 * surface. DOM-touching, so it's excluded from the pure unit tests above.
 */
export function printProductLabels(
  products: Product[],
  settings: StoreSettings,
  opts: LabelOptions = {},
): LabelPrintOutcome {
  if (products.length === 0) return 'empty';
  const win = openDetachedPrintWindow();
  if (!win) return 'popup-blocked';
  win.document.write(buildLabelSheetHtml(products, settings, opts));
  win.document.close();
  return 'printed';
}
