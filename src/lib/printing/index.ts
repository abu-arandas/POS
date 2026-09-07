// Everything that turns a sale into something physical.
//
// This used to be three places: ten files loose at the top of lib/, plus
// lib/print/ and lib/receipt/. One concern with three homes meant the shared
// pieces — the Code 128 geometry, the roll widths, the DocRow model both
// renderers read — sat beside unrelated modules, and which folder a new
// printing file belonged in was a coin toss.
//
// The sub-folders keep their own names because they are genuinely different
// layers: receipt/ builds HTML documents, print/ drives the browser print
// window. The files here are the parts both of them use.

// Dispatch: pick a transport and send.
export {
  printReceipt,
  printKitchenTicket,
  printKitchenTickets,
  openCashDrawer,
  type HardwarePrintOutcome,
} from './hardwarePrint';

// Renderer-independent description of a receipt, and the layout that shapes it.
export { buildReceiptDoc, buildKitchenDoc, docStrings, type DocRow } from './receiptDoc';
export {
  ROLL_MM,
  RECEIPT_MARGIN_MM,
  printableWidthMm,
  formatDateTime,
  safeFontFamily,
  allTogglesOn,
  defaultReceiptLayout,
  defaultKitchenLayout,
  resolveCustomerLayout,
  resolveKitchenLayout,
  DATE_FORMATS,
  TIME_FORMATS,
  RECEIPT_FONTS,
} from './receiptFormat';

// HTML documents (system printer, silent Electron print, settings preview).
export { receiptsPrintDoc, kitchenPrintDoc, receiptPreviewDoc } from './receipt';

// Thermal: ESC/POS bytes, and the bitmap path for scripts the codepage cannot express.
export { encodeReceipt, encodeKitchenTicket } from './escpos';
export { RASTER_WIDTH, needsRaster } from './escposRaster';

// Hardware discovery, label sheets, and per-station routing.
export { detectPrinters, serialSupported, networkScanSupported } from './printerDiscovery';
export { printProductLabels, buildLabelSheetHtml } from './productLabels';
export { routeKitchenTickets } from './kitchenRouting';
