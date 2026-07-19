import { SaleTransaction, StoreSettings, PrinterConfig } from '../types';
import { encodeReceipt } from './escpos';
import { printTransactions } from './receiptPrinter';

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
): Promise<HardwarePrintOutcome> {
  if (printerConfig.type === 'system') {
    const outcome = printTransactions([tx], settings, printerConfig);
    return outcome === 'popup-blocked' ? 'popup-blocked' : 'printed';
  }

  const bytes = encodeReceipt(tx, settings, printerConfig, openDrawer);
  if (printerConfig.type === 'serial') return printSerial(bytes, printerConfig.baudRate);
  if (printerConfig.type === 'network') {
    if (!printerConfig.ipAddress) return 'no-device';
    return printNetwork(bytes, printerConfig.ipAddress);
  }
  // Bluetooth ESC/POS pairing is device-specific and not implemented here.
  return 'unsupported';
}

// Sends only the drawer kick command to the configured hardware printer.
export async function openCashDrawer(printerConfig: PrinterConfig): Promise<void> {
  if (printerConfig.type === 'system') return; // Cannot kick drawer via OS print spooler
  const bytes = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]); // ESC p 0 25 250
  if (printerConfig.type === 'serial') await printSerial(bytes, printerConfig.baudRate);
  if (printerConfig.type === 'network' && printerConfig.ipAddress) {
    await printNetwork(bytes, printerConfig.ipAddress);
  }
}
