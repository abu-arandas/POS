import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Customer } from '../types';
import { INITIAL_CUSTOMERS } from '../data/seedData';
import { idbStorage } from '../lib/idbStorage';
import { deleteCustomersCloudIfEnabled } from '../lib/sync';

interface CustomerState {
  customers: Customer[];
  setCustomers: (customers: Customer[]) => void;
  handleAddCustomer: (name: string, phone: string, email: string) => Customer;
  handleUpdateCustomer: (updated: Customer) => void;
  handleDeleteCustomer: (id: string) => void;
  updateCustomerPoints: (id: string, delta: number) => void;
}

export const useCustomerStore = create<CustomerState>()(
  persist(
    (set, get) => ({
      customers: INITIAL_CUSTOMERS,

      setCustomers: (customers) => set({ customers }),

      handleAddCustomer: (name, phone, email) => {
        const newCustomer: Customer = {
          id: `cust-${crypto.randomUUID().split('-')[0]}`,
          name,
          phone,
          email,
          points: 0,
          createdAt: new Date().toISOString().split('T')[0],
        };
        set({ customers: [...get().customers, newCustomer] });
        return newCustomer;
      },

      handleUpdateCustomer: (updated) => {
        set({
          customers: get().customers.map((c) => (c.id === updated.id ? updated : c)),
        });
      },

      handleDeleteCustomer: (id) => {
        set({
          customers: get().customers.filter((c) => c.id !== id),
        });
        deleteCustomersCloudIfEnabled([id]);
      },

      updateCustomerPoints: (id, delta) => {
        set({
          customers: get().customers.map((c) => {
            if (c.id === id) {
              return { ...c, points: Math.max(0, c.points + delta) };
            }
            return c;
          }),
        });
      },
    }),
    {
      name: 'pos-customer-storage',
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
