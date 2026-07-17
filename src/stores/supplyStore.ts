import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Supplier, StockAdjustment } from '../types';
import { idbStorage } from '../lib/idbStorage';
import { shortId } from '../lib/ids';

interface SupplyState {
  suppliers: Supplier[];
  adjustments: StockAdjustment[];
  addSupplier: (data: Omit<Supplier, 'id' | 'createdAt'>) => Supplier;
  removeSupplier: (id: string) => void;
  logAdjustment: (data: Omit<StockAdjustment, 'id' | 'createdAt'>) => void;
}

// Suppliers and the stock-adjustment audit log. Terminal-local operational
// records (persisted, not cloud-synced) — the product catalog itself syncs.
export const useSupplyStore = create<SupplyState>()(
  persist(
    (set, get) => ({
      suppliers: [],
      adjustments: [],

      addSupplier: (data) => {
        const supplier: Supplier = {
          ...data,
          id: `sup-${shortId()}`,
          createdAt: new Date().toISOString(),
        };
        set({ suppliers: [supplier, ...get().suppliers] });
        return supplier;
      },

      removeSupplier: (id) => set({ suppliers: get().suppliers.filter((s) => s.id !== id) }),

      logAdjustment: (data) => {
        const entry: StockAdjustment = {
          ...data,
          id: `adj-${shortId()}`,
          createdAt: new Date().toISOString(),
        };
        // Keep the log bounded so it can't grow without limit on a busy terminal.
        set({ adjustments: [entry, ...get().adjustments].slice(0, 500) });
      },
    }),
    {
      name: 'pos-supply-storage',
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
