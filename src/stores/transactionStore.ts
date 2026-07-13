import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SaleTransaction } from '../types';
import { generatePastTransactions } from '../data/seedData';
import { idbStorage } from '../lib/idbStorage';
import { deleteTransactionsCloudIfEnabled } from '../lib/sync';

interface TransactionState {
  transactions: SaleTransaction[];
  setTransactions: (transactions: SaleTransaction[]) => void;
  addTransaction: (transaction: SaleTransaction) => void;
  refundTransaction: (id: string, refundDate: string) => void;
  deleteTransactions: (ids: string[]) => void;
}

export const useTransactionStore = create<TransactionState>()(
  persist(
    (set, get) => ({
      transactions: [],

      setTransactions: (transactions) => set({ transactions }),

      addTransaction: (transaction) => {
        set({ transactions: [transaction, ...get().transactions] });
      },

      refundTransaction: (id, refundDate) => {
        set({
          transactions: get().transactions.map((t) =>
            t.id === id ? { ...t, status: 'refunded', refundDate } : t,
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
        // If state is empty on initial load, populate with demo data
        if (state && state.transactions.length === 0) {
          state.setTransactions(generatePastTransactions());
        }
      },
    },
  ),
);
