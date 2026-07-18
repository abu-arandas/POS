export {};

import type { SystemPrinter } from './types';
export type { SystemPrinter };

// Public (customer-safe) shape pushed to the LAN-exposed QR-menu server.
// Deliberately excludes cost, stock counts, and non-menu settings.
export interface PublicMenuProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  image: string;
  inStock: boolean;
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  color: string;
}

export interface PublicMenuSettings {
  storeName: string;
  storeLogo?: string;
  currency: string;
}

declare global {
  interface Window {
    // Injected by electron/preload.cjs when running inside Electron.
    // Undefined in a plain browser.
    electronAPI?: {
      // LAN address + actual port of the embedded QR-menu server.
      getMenuInfo: () => Promise<{ ip: string; port: number }>;
      updateMenuData: (data: {
        products: PublicMenuProduct[];
        categories: PublicMenuCategory[];
        settings: PublicMenuSettings;
      }) => void;
      // Streams raw ESC/POS bytes to a network printer over TCP; resolves true on success.
      printEscpos?: (payload: { ip: string; port: number; data: number[] }) => Promise<boolean>;
      // Enumerates the OS-installed printers for the printer picker.
      listPrinters?: () => Promise<SystemPrinter[]>;
      // Silently prints an HTML document to a named OS printer (or the default).
      printHtml?: (payload: { html: string; deviceName?: string }) => Promise<boolean>;
    };
  }
}
