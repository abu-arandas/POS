// Detects printers the terminal can reach so the Printer settings screen can
// show what's actually connected:
//  - OS printers via the Electron main process (desktop app only)
//  - Web Serial ports the operator has already granted (Chromium/Electron)
// Network ESC/POS printers are address-configured, not discoverable, so they
// are not listed here.

export interface DetectedPrinter {
  id: string;
  name: string;
  kind: 'system' | 'serial';
  detail?: string;
  isDefault?: boolean;
}

interface SerialPortInfoLike {
  usbVendorId?: number;
  usbProductId?: number;
}
interface SerialPortLike {
  getInfo(): SerialPortInfoLike;
}
interface WebSerialLike {
  getPorts(): Promise<SerialPortLike[]>;
  requestPort(): Promise<SerialPortLike>;
}

function webSerial(): WebSerialLike | undefined {
  return (navigator as unknown as { serial?: WebSerialLike }).serial;
}

export function serialSupported(): boolean {
  return !!webSerial();
}

const hex = (n?: number) =>
  n === undefined ? '????' : n.toString(16).toUpperCase().padStart(4, '0');

// OS printers, desktop app only. Resolves [] in a plain browser.
export async function listSystemPrinters(): Promise<DetectedPrinter[]> {
  const api = window.electronAPI;
  if (!api?.listPrinters) return [];
  try {
    const printers = await api.listPrinters();
    return printers.map((p) => ({
      id: `sys-${p.name}`,
      name: p.displayName || p.name,
      kind: 'system' as const,
      detail: p.description || undefined,
      isDefault: p.isDefault,
    }));
  } catch (e) {
    console.error('Listing system printers failed:', e);
    return [];
  }
}

// Serial ports the operator has already granted to this origin. New devices
// are added with requestSerialPort() (needs a user gesture).
export async function listGrantedSerialPorts(): Promise<DetectedPrinter[]> {
  const serial = webSerial();
  if (!serial) return [];
  try {
    const ports = await serial.getPorts();
    return ports.map((port, i) => {
      const info = port.getInfo();
      const hasUsbIds = info.usbVendorId !== undefined || info.usbProductId !== undefined;
      return {
        id: `serial-${i}-${hex(info.usbVendorId)}-${hex(info.usbProductId)}`,
        name: hasUsbIds
          ? `USB Serial ${hex(info.usbVendorId)}:${hex(info.usbProductId)}`
          : `Serial port ${i + 1}`,
        kind: 'serial' as const,
      };
    });
  } catch (e) {
    console.error('Listing serial ports failed:', e);
    return [];
  }
}

export async function detectPrinters(): Promise<DetectedPrinter[]> {
  const [system, serial] = await Promise.all([listSystemPrinters(), listGrantedSerialPorts()]);
  return [...system, ...serial];
}

// Prompts the operator to grant a new serial device (must run in a user
// gesture). Returns true when a port was granted; false on cancel/unsupported.
export async function requestSerialPort(): Promise<boolean> {
  const serial = webSerial();
  if (!serial) return false;
  try {
    await serial.requestPort();
    return true;
  } catch {
    return false; // operator dismissed the chooser
  }
}
