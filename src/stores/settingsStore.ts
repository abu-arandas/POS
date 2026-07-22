import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  StoreSettings,
  PrinterConfig,
  SupabaseConfig,
  ScannerConfig,
  ReceiptEmailTemplate,
  KitchenStation,
} from '../types';
import { INITIAL_SETTINGS } from '../data/seedData';
import { idbStorage } from '../lib/idbStorage';

interface SettingsState {
  settings: StoreSettings;
  printerConfig: PrinterConfig;
  supabaseConfig: SupabaseConfig;
  scannerConfig: ScannerConfig;
  emailTemplate: ReceiptEmailTemplate;
  kitchenStations: KitchenStation[];
  darkMode: boolean;
  language: 'en' | 'ar';

  setSettings: (settings: StoreSettings) => void;
  setPrinterConfig: (config: PrinterConfig) => void;
  setSupabaseConfig: (config: SupabaseConfig) => void;
  setScannerConfig: (config: ScannerConfig) => void;
  setEmailTemplate: (template: ReceiptEmailTemplate) => void;
  setKitchenStations: (stations: KitchenStation[]) => void;
  setDarkMode: (darkMode: boolean) => void;
  setLanguage: (lang: 'en' | 'ar') => void;
}

const DEFAULT_PRINTER: PrinterConfig = {
  type: 'system',
  paperSize: '80mm',
  showBarcode: true,
  footerMessage: 'Thank you for shopping with us!',
  autoPrintOnCheckout: true,
};

const DEFAULT_SUPABASE: SupabaseConfig = {
  url: '',
  anonKey: '',
  enabled: false,
  status: 'disconnected',
};

export const DEFAULT_SCANNER: ScannerConfig = {
  enabled: true,
  minLength: 3,
  maxInterKeyMs: 50,
};

export const DEFAULT_EMAIL_TEMPLATE: ReceiptEmailTemplate = {
  subject: 'Receipt {receiptId} — {storeName}',
  header: 'Hi {customerName},\n\nThank you for your purchase at {storeName}! Your receipt is below.',
  footer: 'We hope to see you again soon.\n— The {storeName} team',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: INITIAL_SETTINGS,
      printerConfig: DEFAULT_PRINTER,
      supabaseConfig: DEFAULT_SUPABASE,
      scannerConfig: DEFAULT_SCANNER,
      emailTemplate: DEFAULT_EMAIL_TEMPLATE,
      kitchenStations: [],
      darkMode: false,
      language: 'en',

      setSettings: (settings) => set({ settings }),
      setPrinterConfig: (printerConfig) => set({ printerConfig }),
      setSupabaseConfig: (supabaseConfig) => set({ supabaseConfig }),
      setScannerConfig: (scannerConfig) => set({ scannerConfig }),
      setEmailTemplate: (emailTemplate) => set({ emailTemplate }),
      setKitchenStations: (kitchenStations) => set({ kitchenStations }),
      setDarkMode: (darkMode) => {
        // Apply the theme class immediately; without this the `dark:` variants
        // only take effect after a reload (the class was set on rehydrate only).
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', darkMode);
        }
        set({ darkMode });
      },
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'pos-settings-storage',
      storage: createJSONStorage(() => idbStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (state.darkMode) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      },
    },
  ),
);
