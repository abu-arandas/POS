import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Supplier, StockAdjustment, PurchaseOrder, PurchaseOrderStatus } from '../types';
import { canTransition } from '../lib/purchaseOrders';
import { idbStorage } from '../lib/idbStorage';
import { shortId } from '../lib/ids';

interface SupplyState {
  suppliers: Supplier[];
  adjustments: StockAdjustment[];
  purchaseOrders: PurchaseOrder[];
  addSupplier: (data: Omit<Supplier, 'id' | 'createdAt'>) => Supplier;
  removeSupplier: (id: string) => void;
  logAdjustment: (data: Omit<StockAdjustment, 'id' | 'createdAt'>) => void;
  createPurchaseOrder: (
    data: Omit<PurchaseOrder, 'id' | 'status' | 'createdAt' | 'orderedAt' | 'receivedAt'>,
  ) => PurchaseOrder;
  // Applies a legal status move (see PO_TRANSITIONS) and stamps the matching
  // timestamp. Illegal moves are ignored and return null.
  setPurchaseOrderStatus: (id: string, status: PurchaseOrderStatus) => PurchaseOrder | null;
  // Drafts and cancelled orders can be discarded; ordered/received are history.
  deletePurchaseOrder: (id: string) => void;
}

// Suppliers and the stock-adjustment audit log. Terminal-local operational
// records (persisted, not cloud-synced) — the product catalog itself syncs.
export const useSupplyStore = create<SupplyState>()(
  persist(
    (set, get) => ({
      suppliers: [],
      adjustments: [],
      purchaseOrders: [],

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

      createPurchaseOrder: (data) => {
        const po: PurchaseOrder = {
          ...data,
          id: `po-${shortId()}`,
          status: 'draft',
          createdAt: new Date().toISOString(),
          orderedAt: null,
          receivedAt: null,
        };
        set({ purchaseOrders: [po, ...get().purchaseOrders] });
        return po;
      },

      setPurchaseOrderStatus: (id, status) => {
        const current = get().purchaseOrders.find((po) => po.id === id);
        if (!current || !canTransition(current.status, status)) return null;
        const now = new Date().toISOString();
        const updated: PurchaseOrder = {
          ...current,
          status,
          orderedAt: status === 'ordered' ? now : current.orderedAt,
          receivedAt: status === 'received' ? now : current.receivedAt,
        };
        set({
          purchaseOrders: get().purchaseOrders.map((po) => (po.id === id ? updated : po)),
        });
        return updated;
      },

      deletePurchaseOrder: (id) => {
        set({
          purchaseOrders: get().purchaseOrders.filter(
            (po) => po.id !== id || (po.status !== 'draft' && po.status !== 'cancelled'),
          ),
        });
      },
    }),
    {
      name: 'pos-supply-storage',
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
