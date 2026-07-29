import { Product, StoreSettings } from '../types';
import { escapeHtml as esc } from './escapeHtml';
import { code128Svg } from './barcode';

// Printable product labels / shelf price tags. Each label shows the product
// name, price, SKU, and a real scannable Code128 barcode of the SKU. Pure and
// DOM-free (returns HTML strings) so it's unit-testable; the print path opens a
// window with the sheet.

export interface LabelOptions {
  columns?: number; // labels per row on the sheet
  showPrice?: boolean;
  showBarcode?: boolean;
}

// One label cell.
export function buildLabelHtml(
  product: Product,
  settings: StoreSettings,
  opts: LabelOptions = {},
): string {
  const showPrice = opts.showPrice ?? true;
  const showBarcode = opts.showBarcode ?? true;
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
          ? `<div class="label-barcode">${code128Svg(product.sku, { height: 34, moduleWidth: 1.3 })}</div>`
          : ''
      }
      <div class="label-sku">${esc(product.sku)}</div>
    </div>`;
}

// Full printable sheet for a set of products.
export function buildLabelSheetHtml(
  products: Product[],
  settings: StoreSettings,
  opts: LabelOptions = {},
): string {
  const columns = Math.max(1, Math.min(6, opts.columns ?? 3));
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
      .label-name { font-size: 12px; font-weight: 700; line-height: 1.15; min-height: 2.3em; display: flex; align-items: center; }
      .label-price { font-size: 18px; font-weight: 800; margin: 2px 0; }
      .label-barcode { margin-top: 2px; }
      .label-barcode svg { max-width: 100%; height: auto; }
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

export type LabelPrintOutcome = 'printed' | 'popup-blocked' | 'empty';

// Opens a print window with the label sheet. Returns an outcome the caller can
// surface. DOM-touching, so it's excluded from the pure unit tests above.
export function printProductLabels(
  products: Product[],
  settings: StoreSettings,
  opts: LabelOptions = {},
): LabelPrintOutcome {
  if (products.length === 0) return 'empty';
  const win = window.open('', '_blank');
  if (!win) return 'popup-blocked';
  win.document.write(buildLabelSheetHtml(products, settings, opts));
  win.document.close();
  return 'printed';
}
