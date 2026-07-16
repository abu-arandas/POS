import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SaleTransaction } from '../types';
import { generatePastTransactions } from '../data/seedData';
import { idbStorage } from '../lib/idbStorage';
import { deleteTransactionsCloudIfEnabled } from '../lib/sync';

interface TransactionState {
  transactions: SaleTransaction[];
  // True once demo data has been seeded (or the install already had data).
  // Guards against re-seeding: "list is empty" alone would resurrect fake
  // sales after a user deliberately deletes all history — and live sync would
  // then push those fakes to the cloud.
  demoSeeded: boolean;
  setTransactions: (transactions: SaleTransaction[]) => void;
  addTransaction: (transaction: SaleTransaction) => void;
  refundTransaction: (id: string, refundDate: string, authorizedBy?: string | null) => void;
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

      refundTransaction: (id, refundDate, authorizedBy = null) => {
        set({
          transactions: get().transactions.map((t) =>
            t.id === id
              ? { ...t, status: 'refunded' as const, refundDate, refundAuthorizedBy: authorizedBy }
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
