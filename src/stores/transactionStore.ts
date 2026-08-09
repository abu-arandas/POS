import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SaleTransaction, RefundedItem } from '../types';
import { generatePastTransactions } from '../data/seedData';
import { idbStorage } from '../lib/idbStorage';
import { deleteTransactionsCloudIfEnabled } from '../lib/sync';

export interface RefundPatch {
  refundedItems: RefundedItem[];
  refundedAmount: number;
  status: 'partial' | 'refunded';
  refundDate: string;
  authorizedBy: string | null;
}

interface TransactionState {
  transactions: SaleTransaction[];
  // True once demo data has been seeded (or the install already had data).
  // Guards against re-seeding: "list is empty" alone would resurrect fake
  // sales after a user deliberately deletes all history — and live sync would
  // then push those fakes to the cloud.
  demoSeeded: boolean;
  setTransactions: (transactions: SaleTransaction[]) => void;
  addTransaction: (transaction: SaleTransaction) => void;
  applyRefund: (id: string, patch: RefundPatch) => void;
  deleteTransactions: (ids: string[]) => void;
}

export const useTransactionStore = create<TransactionState>()(
  persist(
    (set, get) => ({
      transactions: [],
      demoSeeded: false,

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
      onRehydrateStorage: () => (state) => {
        // Populate demo data exactly once per install (see demoSeeded above).
        if (state && !state.demoSeeded) {
          if (state.transactions.length === 0) {
            state.setTransactions(generatePastTransactions());
          }
          useTransactionStore.setState({ demoSeeded: true });
        }
      },
    },
  ),
);
