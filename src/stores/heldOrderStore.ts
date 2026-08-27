import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { HeldOrder } from '../types';
import { idbStorage } from '../lib/idbStorage';
import { shortId } from '../lib/ids';

interface HeldOrderState {
  heldOrders: HeldOrder[];
  holdOrder: (order: Omit<HeldOrder, 'id' | 'createdAt'>) => HeldOrder;
  removeHeldOrder: (id: string) => void;
}

// Parked carts persist locally so a resume survives a reload/crash. They are
// intentionally NOT cloud-synced — an in-progress cart is terminal-local state,
// not a committed record.
export const useHeldOrderStore = create<HeldOrderState>()(
  persist(
    (set, get) => ({
      heldOrders: [],

      holdOrder: (order) => {
        const held: HeldOrder = {
          ...order,
          id: `hold-${shortId()}`,
          createdAt: new Date().toISOString(),
        };
        set({ heldOrders: [held, ...get().heldOrders] });
        return held;
      },

      removeHeldOrder: (id) => {
        set({ heldOrders: get().heldOrders.filter((o) => o.id !== id) });
      },
    }),
    {
      name: 'pos-held-order-storage',
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
