import { SaleTransaction, StoreSettings, PrinterConfig, KitchenPrinterConfig } from '../types';
import { encodeReceipt, encodeKitchenTicket, EncodeReceiptOptions } from './escpos';
import {
  printTransactions,
  printKitchenTicketSystem,
  buildReceiptsDocument,
  buildKitchenDocument,
} from './receiptPrinter';

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
// ESC/POS and stream the bytes. `options.openDrawer` pops the drawer on
// hardware transports (checkout print of a cash sale only — reprints must not).
export async function printReceipt(
  tx: SaleTransaction,
  settings: StoreSettings,
  printerConfig: PrinterConfig,
  options: EncodeReceiptOptions = {},
): Promise<HardwarePrintOutcome> {
  if (printerConfig.type === 'system') {
    // In the desktop app, print silently to the operator-selected OS printer
    // (no dialog, no popup) so the front and kitchen printers stay separate.
    const api = window.electronAPI;
    if (api?.printHtml) {
      const html = buildReceiptsDocument([tx], settings, printerConfig);
      const ok = await api.printHtml({ html, deviceName: printerConfig.deviceName });
      return ok ? 'printed' : 'error';
    }
    // Plain browser: fall back to the print-window dialog.
    const outcome = printTransactions([tx], settings, printerConfig);
    return outcome === 'popup-blocked' ? 'popup-blocked' : 'printed';
  }

  const bytes = encodeReceipt(tx, settings, printerConfig, options);
  if (printerConfig.type === 'serial') return printSerial(bytes, printerConfig.baudRate);
  if (printerConfig.type === 'network') {
    if (!printerConfig.ipAddress) return 'no-device';
    return printNetwork(bytes, printerConfig.ipAddress);
  }
  // Bluetooth ESC/POS pairing is device-specific and not implemented here.
  return 'unsupported';
}

// A small sample sale used by the Settings "test print" buttons so operators
// can confirm a receipt actually lands on the printer they selected.
export function makeTestTransaction(): SaleTransaction {
  return {
    id: 'TX-TEST',
    orderNumber: 0,
    date: new Date().toISOString(),
    items: [
      { productId: 't1', productName: 'TEST ITEM', price: 1, cost: 0, quantity: 1, total: 1 },
    ],
    subtotal: 1,
    discount: 0,
    discountType: 'none',
    discountValue: 0,
    tax: 0,
    total: 1,
    paymentMethod: 'cash',
    cashPaid: 1,
    cashChange: 0,
    customerId: null,
    operatorName: 'TEST PRINT',
    status: 'completed',
  };
}

// Sends the kitchen prep ticket to the configured kitchen printer. No-op (and
// no outcome surfaced) when the kitchen printer is disabled. The 'system'
// transport opens a browser print window; hardware transports stream ESC/POS.
export async function printKitchenTicket(
  tx: SaleTransaction,
  settings: StoreSettings,
  kitchenConfig: KitchenPrinterConfig,
): Promise<HardwarePrintOutcome> {
  if (!kitchenConfig.enabled) return 'printed';
  if (kitchenConfig.type === 'system') {
    const api = window.electronAPI;
    if (api?.printHtml) {
      const html = buildKitchenDocument(tx, kitchenConfig);
      const ok = await api.printHtml({ html, deviceName: kitchenConfig.deviceName });
      return ok ? 'printed' : 'error';
    }
    const outcome = printKitchenTicketSystem(tx, settings, kitchenConfig);
    return outcome === 'popup-blocked' ? 'popup-blocked' : 'printed';
  }

  const bytes = encodeKitchenTicket(tx, kitchenConfig);
  if (kitchenConfig.type === 'serial') return printSerial(bytes, kitchenConfig.baudRate);
  if (kitchenConfig.type === 'network') {
    if (!kitchenConfig.ipAddress) return 'no-device';
    return printNetwork(bytes, kitchenConfig.ipAddress);
  }
  return 'unsupported';
}
