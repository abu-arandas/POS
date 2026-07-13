import type { Product, Category, StoreSettings } from './types';

export {};

declare global {
  interface Window {
    // Injected by electron/preload.cjs when running inside Electron.
    // Undefined in a plain browser.
    electronAPI?: {
      getLocalIp: () => Promise<string>;
      updateMenuData: (data: {
        products: Product[];
        categories: Category[];
        settings: StoreSettings;
      }) => void;
    };
  }
}
