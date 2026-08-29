import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SaleTransaction, RefundedItem } from '../types';
import { idbStorage } from '../lib/idbStorage';
import { deleteTransactionsCloudIfEnabled } from '../lib/sync';

/**
 * The fields a refund writes back onto the original transaction. Computed by
 * computeRefund so the store only persists the result.
 */
export interface RefundPatch {
  refundedItems: RefundedItem[];
  refundedAmount: number;
  status: 'partial' | 'refunded';
  refundDate: string;
  authorizedBy: string | null;
}

interface TransactionState {
  transactions: SaleTransaction[];
  setTransactions: (transactions: SaleTransaction[]) => void;
  addTransaction: (transaction: SaleTransaction) => void;
  applyRefund: (id: string, patch: RefundPatch) => void;
  deleteTransactions: (ids: string[]) => void;
}

/**
 * Sale history for this terminal, and the refunds applied to it. Persisted to
 * IndexedDB; this is the record a Z-report and the dashboard read from.
 */
export const useTransactionStore = create<TransactionState>()(
  persist(
    (set, get) => ({
      transactions: [],

      setTransactions: (transactions) => set({ transactions }),

      addTransaction: (transaction) => {
        set({ transactions: [transaction, ...get().transactions] });
      },

      applyRefund: (id, patch) => {
        set({
          transactions: get().transactions.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: patch.status,
                  refundedItems: patch.refundedItems,
                  refundedAmount: patch.refundedAmount,
                  refundDate: patch.refundDate,
                  refundAuthorizedBy: patch.authorizedBy,
                }
              : t,
          ),
        });
      },

      deleteTransactions: (ids) => {
        set((state) => ({
          transactions: state.transactions.filter((t) => !ids.includes(t.id)),
        }));
        deleteTransactionsCloudIfEnabled(ids);
      },
    }),
    {
      name: 'pos-transaction-storage',
      storage: createJSONStorage(() => idbStorage),
      // The vestigial demoSeeded flag was dropped. persist's default merge is a
      // shallow spread of the stored blob over the initial state, so an install
      // that saved the key still carries it as an inert extra property — no
      // migration needed, and nothing reads it.
    },
  ),
);
