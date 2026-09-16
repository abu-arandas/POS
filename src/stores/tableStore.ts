import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DiningTable, TableStatus } from '../types';
import { shortId } from '../lib/utils/ids';

interface TableStore {
  tables: DiningTable[];
  selectedTableId: string | null;

  setSelectedTableId: (id: string | null) => void;
  occupyTable: (tableId: string, orderId?: string, guests?: number, totalAmount?: number) => void;
  releaseTable: (tableId: string) => void;
  requestBill: (tableId: string) => void;
  reserveTable: (tableId: string) => void;
  addTable: (table: Omit<DiningTable, 'id' | 'status'>) => DiningTable;
  updateTable: (id: string, patch: Partial<DiningTable>) => void;
  deleteTable: (id: string) => void;
}

const DEFAULT_TABLES: DiningTable[] = [
  { id: 'tbl-1', name: 'Table 1', seats: 2, status: 'available', section: 'Main Hall' },
  { id: 'tbl-2', name: 'Table 2', seats: 4, status: 'occupied', activeSince: new Date(Date.now() - 24 * 60000).toISOString(), totalAmount: 48.5, section: 'Main Hall' },
  { id: 'tbl-3', name: 'Table 3', seats: 4, status: 'available', section: 'Main Hall' },
  { id: 'tbl-4', name: 'Table 4', seats: 6, status: 'bill_requested', activeSince: new Date(Date.now() - 52 * 60000).toISOString(), totalAmount: 112.0, section: 'Main Hall' },
  { id: 'tbl-5', name: 'Patio 1', seats: 2, status: 'available', section: 'Patio' },
  { id: 'tbl-6', name: 'Patio 2', seats: 4, status: 'available', section: 'Patio' },
  { id: 'tbl-7', name: 'VIP Lounge', seats: 8, status: 'reserved', section: 'VIP Lounge' },
  { id: 'tbl-8', name: 'Bar High 1', seats: 2, status: 'available', section: 'Bar' },
];

export const useTableStore = create<TableStore>()(
  persist(
    (set, get) => ({
      tables: DEFAULT_TABLES,
      selectedTableId: null,

      setSelectedTableId: (id) => set({ selectedTableId: id }),

      occupyTable: (tableId, orderId, guests = 2, totalAmount = 0) => {
        set((state) => ({
          tables: state.tables.map((t) =>
            t.id === tableId
              ? {
                  ...t,
                  status: 'occupied',
                  currentOrderId: orderId,
                  currentGuests: guests,
                  totalAmount,
                  activeSince: t.activeSince || new Date().toISOString(),
                }
              : t,
          ),
        }));
      },

      releaseTable: (tableId) => {
        set((state) => ({
          tables: state.tables.map((t) =>
            t.id === tableId
              ? {
                  ...t,
                  status: 'available',
                  currentOrderId: undefined,
                  currentGuests: undefined,
                  activeSince: undefined,
                  totalAmount: undefined,
                }
              : t,
          ),
        }));
      },

      requestBill: (tableId) => {
        set((state) => ({
          tables: state.tables.map((t) =>
            t.id === tableId ? { ...t, status: 'bill_requested' } : t,
          ),
        }));
      },

      reserveTable: (tableId) => {
        set((state) => ({
          tables: state.tables.map((t) =>
            t.id === tableId ? { ...t, status: 'reserved' } : t,
          ),
        }));
      },

      addTable: ({ name, seats, section }) => {
        const newTable: DiningTable = {
          id: `tbl-${shortId()}`,
          name,
          seats,
          section: section || 'Main Hall',
          status: 'available',
        };
        set((state) => ({ tables: [...state.tables, newTable] }));
        return newTable;
      },

      updateTable: (id, patch) => {
        set((state) => ({
          tables: state.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }));
      },

      deleteTable: (id) => {
        set((state) => ({
          tables: state.tables.filter((t) => t.id !== id),
        }));
      },
    }),
    {
      name: 'pos_tables_store',
    },
  ),
);
