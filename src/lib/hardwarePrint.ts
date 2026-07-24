import { SaleTransaction, StoreSettings, PrinterConfig, KitchenStation, ReceiptLayout } from '../types';
import { encodeReceipt, encodeKitchenTicket } from './escpos';
import {
  printTransactions,
  printKitchenTicketSystem,
  receiptsPrintDoc,
  kitchenPrintDoc,
} from './receiptPrinter';
import { routeKitchenTickets } from './kitchenRouting';

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
  try {
    const port = await serial.requestPort();
    await port.open({ baudRate });
    const writer = port.writable.getWriter();
    await writer.write(bytes);
    writer.releaseLock();
    await port.close();
    return 'printed';
  } catch (e) {
    console.error('Serial print failed:', e);
    return 'error';
  }
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
async function printHtmlSilent(html: string, deviceName?: string): Promise<HardwarePrintOutcome | null> {
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

// Dispatches a receipt to the configured transport. 'system' uses the browser
// print window (synchronous under the hood); the hardware transports encode
// ESC/POS and stream the bytes.
//
// `openDrawer` controls whether the cash drawer kick pulse is appended to the
// ESC/POS stream. Pass true for new cash sales at checkout; false for reprints.
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
    const bytes = encodeReceipt(tx, settings, printerConfig, openDrawer, layout);
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

  const bytes = encodeReceipt(tx, settings, printerConfig, openDrawer, layout);
  if (printerConfig.type === 'serial') return printSerial(bytes, printerConfig.baudRate);
  if (printerConfig.type === 'network') {
    if (!printerConfig.ipAddress) return 'no-device';
    return printNetwork(bytes, printerConfig.ipAddress);
  }
  // Bluetooth ESC/POS pairing is device-specific and not implemented here.
  return 'unsupported';
}

// Dispatches a kitchen ticket (big-type items, no prices) to the configured
// transport. Same routing as printReceipt but never kicks the drawer. An
// optional stationName titles the ticket and an ipOverride sends it to a
// station's dedicated network printer instead of the configured transport.
export async function printKitchenTicket(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  stationName?: string,
  ipOverride?: string,
  layout?: ReceiptLayout,
): Promise<HardwarePrintOutcome> {
  // A station with its own network printer always goes over the network,
  // regardless of the terminal's default transport.
  if (ipOverride) {
    const bytes = encodeKitchenTicket(tx, settings, printerConfig, stationName, layout);
    return printNetwork(bytes, ipOverride);
  }

  if (printerConfig.type === 'windows') {
    if (!printerConfig.printerName) return 'no-device';
    const bytes = encodeKitchenTicket(tx, settings, printerConfig, stationName, layout);
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

  const bytes = encodeKitchenTicket(tx, settings, printerConfig, stationName, layout);
  if (printerConfig.type === 'serial') return printSerial(bytes, printerConfig.baudRate);
  if (printerConfig.type === 'network') {
    if (!printerConfig.ipAddress) return 'no-device';
    return printNetwork(bytes, printerConfig.ipAddress);
  }
  return 'unsupported';
}

// Routes a sale's items to their kitchen stations and prints one ticket per
// station that has items. `categoryOf` maps a productId to its category id
// (built from the live catalog). With no stations configured, prints a single
// combined kitchen ticket. Returns the worst outcome seen so the caller can
// surface a problem.
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
    );
    if (outcome !== 'printed') worst = outcome;
  }
  return worst;
}

// Sends only the drawer kick command to the configured hardware printer.
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
