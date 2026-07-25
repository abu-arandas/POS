export {};

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

// Subset of electron-updater's UpdateInfo that the renderer actually reads.
export interface UpdateInfo {
  version?: string;
  releaseName?: string | null;
  releaseDate?: string;
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
      // Silently prints a receipt HTML document to a named OS printer (no dialog).
      printHtml?: (payload: { html: string; deviceName?: string }) => Promise<boolean>;
      // Streams raw ESC/POS bytes to a named local/USB Windows printer via the
      // spooler (RAW datatype) — silent receipt + cash-drawer pulse.
      printRaw?: (payload: { printerName: string; data: number[] }) => Promise<boolean>;
      // Lists the OS printers visible to the app window (undefined pre-upgrade builds).
      listPrinters?: () => Promise<
        Array<{
          name: string;
          displayName: string;
          description: string;
          status: number;
          isDefault: boolean;
        }>
      >;
      // Scans the local /24 subnet for open TCP 9100 hosts; resolves responding IPs.
      scanNetworkPrinters?: (opts?: {
        port?: number;
        timeoutMs?: number;
      }) => Promise<string[]>;
      // The first argument is Electron's IpcRendererEvent. Typing it as unknown
      // keeps the renderer free of an electron import; callers ignore it.
      onMenuServerError?: (callback: (event: unknown, message: string) => void) => void;
      checkForUpdates?: () => Promise<{
        status: string;
        version?: string;
        error?: string;
        // Why the updater is behaving as it is — see electron/updatePolicy.cjs.
        policy?: string;
        // False when the build is unsigned: a downloaded update waits for an
        // operator to apply it via installUpdate().
        installSilently?: boolean;
      }>;
      installUpdate?: () => Promise<boolean>;
      onUpdateAvailable?: (callback: (event: unknown, info: UpdateInfo) => void) => void;
      onUpdateDownloaded?: (callback: (event: unknown, info: UpdateInfo) => void) => void;
    };
  }
}
