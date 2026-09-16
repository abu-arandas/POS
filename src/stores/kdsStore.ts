import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { KitchenTicket, KitchenTicketItem, KitchenTicketStatus, OrderType } from '../types';
import { shortId } from '../lib/utils/ids';
import { playKitchenBell } from '../lib/audioFeedback';

interface KdsStore {
  tickets: KitchenTicket[];
  recentlyBumped: KitchenTicket[];
  activeStationFilter: string;
  autoSound: boolean;

  addTicket: (params: {
    orderNumber?: string;
    saleId?: string;
    orderType: OrderType;
    tableNumber?: string;
    customerName?: string;
    serverName?: string;
    items: Array<{
      productId: string;
      productName: string;
      variantName?: string;
      modifiers?: import('../types').SelectedModifier[];
      quantity: number;
      stationId?: string;
      stationName?: string;
      notes?: string;
    }>;
    notes?: string;
  }) => KitchenTicket;

  bumpTicket: (id: string) => void;
  recallTicket: () => KitchenTicket | null;
  updateTicketStatus: (id: string, status: KitchenTicketStatus) => void;
  toggleItemComplete: (ticketId: string, itemId: string) => void;
  setActiveStationFilter: (station: string) => void;
  toggleAutoSound: () => void;
  clearCompletedTickets: () => void;
}

export const useKdsStore = create<KdsStore>()(
  persist(
    (set, get) => ({
      tickets: [],
      recentlyBumped: [],
      activeStationFilter: 'all',
      autoSound: true,

      addTicket: ({
        orderNumber,
        saleId,
        orderType,
        tableNumber,
        customerName,
        serverName,
        items,
        notes,
      }) => {
        const ticketItems: KitchenTicketItem[] = items.map((i) => ({
          ...i,
          id: shortId(),
          completed: false,
        }));

        const existingCount = get().tickets.length + 1;
        const generatedOrderNumber =
          orderNumber || `#${String(existingCount).padStart(3, '0')}`;

        const newTicket: KitchenTicket = {
          id: `KDS-${shortId().toUpperCase()}`,
          orderNumber: generatedOrderNumber,
          saleId,
          orderType,
          tableNumber,
          customerName,
          serverName,
          createdAt: new Date().toISOString(),
          status: 'pending',
          items: ticketItems,
          notes,
        };

        set((state) => ({
          tickets: [newTicket, ...state.tickets],
        }));

        if (get().autoSound) {
          playKitchenBell();
        }

        return newTicket;
      },

      bumpTicket: (id) => {
        const ticket = get().tickets.find((t) => t.id === id);
        if (!ticket) return;

        let nextStatus: KitchenTicketStatus = 'preparing';
        if (ticket.status === 'pending') {
          nextStatus = 'preparing';
        } else if (ticket.status === 'preparing') {
          nextStatus = 'ready';
        } else if (ticket.status === 'ready') {
          nextStatus = 'completed';
        }

        if (nextStatus === 'completed') {
          const completedTicket: KitchenTicket = {
            ...ticket,
            status: 'completed',
            completedAt: new Date().toISOString(),
          };
          set((state) => ({
            tickets: state.tickets.filter((t) => t.id !== id),
            recentlyBumped: [completedTicket, ...state.recentlyBumped].slice(0, 15),
          }));
        } else {
          set((state) => ({
            tickets: state.tickets.map((t) =>
              t.id === id ? { ...t, status: nextStatus, updatedAt: new Date().toISOString() } : t,
            ),
          }));
        }
      },

      recallTicket: () => {
        const recent = get().recentlyBumped;
        if (recent.length === 0) return null;

        const [lastBumped, ...remaining] = recent;
        const restored: KitchenTicket = {
          ...lastBumped,
          status: 'ready',
          completedAt: undefined,
        };

        set((state) => ({
          tickets: [restored, ...state.tickets],
          recentlyBumped: remaining,
        }));

        return restored;
      },

      updateTicketStatus: (id, status) => {
        set((state) => ({
          tickets: state.tickets.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status,
                  completedAt: status === 'completed' ? new Date().toISOString() : t.completedAt,
                  updatedAt: new Date().toISOString(),
                }
              : t,
          ),
        }));
      },

      toggleItemComplete: (ticketId, itemId) => {
        set((state) => ({
          tickets: state.tickets.map((ticket) => {
            if (ticket.id !== ticketId) return ticket;
            return {
              ...ticket,
              items: ticket.items.map((item) =>
                item.id === itemId ? { ...item, completed: !item.completed } : item,
              ),
            };
          }),
        }));
      },

      setActiveStationFilter: (activeStationFilter) => set({ activeStationFilter }),

      toggleAutoSound: () => set((state) => ({ autoSound: !state.autoSound })),

      clearCompletedTickets: () =>
        set((state) => ({
          tickets: state.tickets.filter((t) => t.status !== 'completed'),
          recentlyBumped: [],
        })),
    }),
    {
      name: 'pos_kds_store',
    },
  ),
);
