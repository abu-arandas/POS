import {
  SaleTransaction,
  StoreSettings,
  PrinterConfig,
  KitchenStation,
  ReceiptLayout,
} from '../types';
import { encodeReceipt, encodeKitchenTicket } from './escpos';
import { printTransactions, printKitchenTicketSystem } from './print';
import { receiptsPrintDoc, kitchenPrintDoc } from './receipt';
import { routeKitchenTickets } from './kitchenRouting';
import i18n from './i18n';
import { buildReceiptDoc, buildKitchenDoc, docStrings } from './receiptDoc';
import { renderReceiptRaster, ensureReceiptFont, loadReceiptLogo } from './receiptCanvas';
import { needsRaster } from './escposRaster';

// Chooses between the two ESC/POS encodings.
//
// The text path is compact and fast, but EscPosBuilder.text() can only emit
// bytes below 0x80 — everything else becomes '?'. So the moment a receipt
// carries Arabic (or an accented name, or a £), it has to go out as a bitmap
// instead. Pure-ASCII receipts are unaffected and keep the text path.
//
// A store logo forces the same choice for the same underlying reason. The text
// path has no image command at all, so a receipt carrying a logo the operator
// switched on can only honor it as a bitmap. Only an actual uploaded image
// counts: with no src there is nothing to draw, and rastering a receipt to add
// nothing would cost every English till the larger, slower path for free.
//
// Returns null when the text path is fine, or when the raster cannot be
// produced (no DOM/canvas), so callers fall back cleanly.
async function rasterBytesIfNeeded(
  rows: ReturnType<typeof buildReceiptDoc>,
  paperSize: PrinterConfig['paperSize'],
  openDrawer: boolean,
): Promise<Uint8Array | null> {
  const logoRow = rows.find((row) => row.kind === 'logo');
  const hasLogoImage = Boolean(logoRow?.src);
  if (!hasLogoImage && !needsRaster(docStrings(rows))) return null;
  if (typeof document === 'undefined') return null;
  await ensureReceiptFont();
  // The logo travels on the row, so nothing extra has to be threaded through
  // from settings. Decoding resolves null on failure and the row then occupies
  // no space, so a broken logo costs a picture rather than the receipt.
  const logo = logoRow ? await loadReceiptLogo(logoRow.src) : null;
  const raster = renderReceiptRaster(rows, paperSize, { rtl: i18n.language === 'ar', logo });
  if (!raster) return null;
  // ESC @ reset, the bitmap, then the same feed/cut/drawer tail the text path
  // emits — the drawer pulse still rides along on a cash sale.
  const bytes = [0x1b, 0x40, ...raster.data, 0x1b, 0x64, 0x03, 0x1d, 0x56, 0x00];
  if (openDrawer) bytes.push(0x1b, 0x70, 0x00, 0x19, 0xfa);
  return Uint8Array.from(bytes);
}

/**
 * Why a hardware print attempt ended the way it did, so the caller can tell an
 * absent device from a blocked popup and message the operator accordingly.
 */
export type HardwarePrintOutcome =
  'printed' | 'popup-blocked' | 'unsupported' | 'no-device' | 'error';

interface WebSerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array>;
}
interface WebSerial {
  requestPort(): Promise<WebSerialPort>;
}

// Web Serial API (Chromium/Electron). Prompts the operator to pick the port on
// first use; writes the raw ESC/POS stream.
async function printSerial(bytes: Uint8Array, baudRate = 9600): Promise<HardwarePrintOutcome> {
  const serial = (navigator as unknown as { serial?: WebSerial }).serial;
  if (!serial) return 'unsupported';

  let port: WebSerialPort | undefined;
  let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  let opened = false;
  let outcome: HardwarePrintOutcome = 'error';
  try {
    port = await serial.requestPort();
    await port.open({ baudRate });
    opened = true;
    writer = port.writable.getWriter();
    await writer.write(bytes);
    outcome = 'printed';
  } catch (e) {
    console.error('Serial print failed:', e);
  } finally {
    try {
      writer?.releaseLock();
    } catch (e) {
      console.warn('Serial writer cleanup failed:', e);
      outcome = 'error';
    }
    if (opened && port) {
      try {
        await port.close();
      } catch (e) {
        console.warn('Serial port cleanup failed:', e);
        outcome = 'error';
      }
    }
  }
  return outcome;
}

// Network printer via the Electron main process (raw TCP to port 9100). No-op
// in a plain browser, which cannot open arbitrary sockets.
async function printNetwork(bytes: Uint8Array, ip: string): Promise<HardwarePrintOutcome> {
  const api = window.electronAPI;
  if (!api?.printEscpos) return 'unsupported';
  try {
    const ok = await api.printEscpos({ ip, port: 9100, data: Array.from(bytes) });
    return ok ? 'printed' : 'error';
  } catch (e) {
    console.error('Network print failed:', e);
    return 'error';
  }
}

// Named local/USB Windows printer via the spooler (RAW ESC/POS). Silent, and it
// carries the cash-drawer pulse. No-op outside Electron/Windows.
async function printRawWindows(
  bytes: Uint8Array,
  printerName: string,
): Promise<HardwarePrintOutcome> {
  const api = window.electronAPI;
  if (!api?.printRaw) return 'unsupported';
  try {
    const ok = await api.printRaw({ printerName, data: Array.from(bytes) });
    return ok ? 'printed' : 'error';
  } catch (e) {
    console.error('Windows raw print failed:', e);
    return 'error';
  }
}

// Silent OS print of a receipt HTML document (no dialog) via Electron. Returns
// null when not available so the caller can fall back to the print window.
async function printHtmlSilent(
  html: string,
  deviceName?: string,
): Promise<HardwarePrintOutcome | null> {
  const api = window.electronAPI;
  if (!api?.printHtml) return null;
  try {
    const ok = await api.printHtml({ html, deviceName });
    return ok ? 'printed' : 'error';
  } catch (e) {
    console.error('Silent HTML print failed:', e);
    return 'error';
  }
}

/**
 * Dispatches a receipt to the configured transport. 'system' uses the browser
 * print window (synchronous under the hood); the hardware transports encode
 * ESC/POS and stream the bytes.
 *
 * `openDrawer` controls whether the cash drawer kick pulse is appended to the
 * ESC/POS stream. Pass true for new cash sales at checkout; false for reprints.
 */
export async function printReceipt(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  openDrawer = false,
  layout?: ReceiptLayout,
): Promise<HardwarePrintOutcome> {
  // Named local/USB Windows printer: raw ESC/POS through the spooler. Silent,
  // and the drawer pulse rides along in the byte stream when openDrawer is set.
  if (printerConfig.type === 'windows') {
    if (!printerConfig.printerName) return 'no-device';
    const raster = await rasterBytesIfNeeded(
      buildReceiptDoc(tx, settings, printerConfig, layout),
      printerConfig.paperSize,
      openDrawer,
    );
    const bytes = raster ?? encodeReceipt(tx, settings, printerConfig, openDrawer, layout);
    return printRawWindows(bytes, printerConfig.printerName);
  }

  if (printerConfig.type === 'system') {
    // In Electron, print silently to the chosen (or default) printer — no
    // dialog. In a plain browser, fall back to the print-window path.
    const silent = await printHtmlSilent(
      receiptsPrintDoc([tx], settings, printerConfig, layout),
      printerConfig.printerName,
    );
    if (silent) return silent;
    const outcome = printTransactions([tx], settings, printerConfig, layout);
    return outcome === 'popup-blocked' ? 'popup-blocked' : 'printed';
  }

  const raster = await rasterBytesIfNeeded(
    buildReceiptDoc(tx, settings, printerConfig, layout),
    printerConfig.paperSize,
    openDrawer,
  );
  const bytes = raster ?? encodeReceipt(tx, settings, printerConfig, openDrawer, layout);
  if (printerConfig.type === 'serial') return printSerial(bytes, printerConfig.baudRate);
  if (printerConfig.type === 'network') {
    if (!printerConfig.ipAddress) return 'no-device';
    return printNetwork(bytes, printerConfig.ipAddress);
  }
  // Bluetooth ESC/POS pairing is device-specific and not implemented here.
  return 'unsupported';
}

/**
 * Dispatches a kitchen ticket (big-type items, no prices) to the configured
 * transport. Same routing as printReceipt but never kicks the drawer. An
 * optional stationName titles the ticket and an ipOverride sends it to a
 * station's dedicated network printer instead of the configured transport.
 */
export async function printKitchenTicket(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  stationName?: string,
  ipOverride?: string,
  layout?: ReceiptLayout,
  printerOverride?: string,
): Promise<HardwarePrintOutcome> {
  // A station pinned to a named OS printer goes through the RAW spooler,
  // whatever the terminal's own transport is. Checked before ipOverride only
  // when no IP is set, so an existing network station keeps its behaviour.
  if (!ipOverride && printerOverride) {
    const raster = await rasterBytesIfNeeded(
      buildKitchenDoc(tx, settings, stationName, layout),
      printerConfig.paperSize,
      false,
    );
    const bytes = raster ?? encodeKitchenTicket(tx, settings, printerConfig, stationName, layout);
    return printRawWindows(bytes, printerOverride);
  }
  // A station with its own network printer always goes over the network,
  // regardless of the terminal's default transport.
  if (ipOverride) {
    const raster = await rasterBytesIfNeeded(
      buildKitchenDoc(tx, settings, stationName, layout),
      printerConfig.paperSize,
      false, // a kitchen ticket never kicks the drawer
    );
    const bytes = raster ?? encodeKitchenTicket(tx, settings, printerConfig, stationName, layout);
    return printNetwork(bytes, ipOverride);
  }

  if (printerConfig.type === 'windows') {
    if (!printerConfig.printerName) return 'no-device';
    const raster = await rasterBytesIfNeeded(
      buildKitchenDoc(tx, settings, stationName, layout),
      printerConfig.paperSize,
      false,
    );
    const bytes = raster ?? encodeKitchenTicket(tx, settings, printerConfig, stationName, layout);
    return printRawWindows(bytes, printerConfig.printerName);
  }

  if (printerConfig.type === 'system') {
    const silent = await printHtmlSilent(
      kitchenPrintDoc(tx, settings, printerConfig, stationName, layout),
      printerConfig.printerName,
    );
    if (silent) return silent;
    const outcome = printKitchenTicketSystem(tx, settings, printerConfig, stationName, layout);
    return outcome === 'popup-blocked' ? 'popup-blocked' : 'printed';
  }

  const raster = await rasterBytesIfNeeded(
    buildKitchenDoc(tx, settings, stationName, layout),
    printerConfig.paperSize,
    false,
  );
  const bytes = raster ?? encodeKitchenTicket(tx, settings, printerConfig, stationName, layout);
  if (printerConfig.type === 'serial') return printSerial(bytes, printerConfig.baudRate);
  if (printerConfig.type === 'network') {
    if (!printerConfig.ipAddress) return 'no-device';
    return printNetwork(bytes, printerConfig.ipAddress);
  }
  return 'unsupported';
}

/**
 * Routes a sale's items to their kitchen stations and prints one ticket per
 * station that has items. `categoryOf` maps a productId to its category id
 * (built from the live catalog). With no stations configured, prints a single
 * combined kitchen ticket. Returns the worst outcome seen so the caller can
 * surface a problem.
 */
export async function printKitchenTickets(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  stations: KitchenStation[],
  categoryOf: (productId: string) => string | undefined,
  layout?: ReceiptLayout,
): Promise<HardwarePrintOutcome> {
  if (stations.length === 0) {
    return printKitchenTicket(tx, settings, printerConfig, undefined, undefined, layout);
  }

  const tickets = routeKitchenTickets(tx, stations, categoryOf);
  let worst: HardwarePrintOutcome = 'printed';
  for (const ticket of tickets) {
    const stationTx: SaleTransaction = { ...tx, items: ticket.items };
    const outcome = await printKitchenTicket(
      stationTx,
      settings,
      printerConfig,
      ticket.station.name,
      ticket.station.ipAddress,
      layout,
      ticket.station.printerName,
    );
    if (outcome !== 'printed') worst = outcome;
  }
  return worst;
}

/**
 * Sends only the drawer kick command to the configured hardware printer.
 */
export async function openCashDrawer(printerConfig: PrinterConfig): Promise<void> {
  const bytes = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]); // ESC p 0 25 250
  if (printerConfig.type === 'windows') {
    if (printerConfig.printerName) await printRawWindows(bytes, printerConfig.printerName);
    return;
  }
  if (printerConfig.type === 'system') return; // OS HTML print path can't kick a drawer
  if (printerConfig.type === 'serial') await printSerial(bytes, printerConfig.baudRate);
  if (printerConfig.type === 'network' && printerConfig.ipAddress) {
    await printNetwork(bytes, printerConfig.ipAddress);
  }
}
