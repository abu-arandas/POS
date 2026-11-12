import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { HeldOrderItem, Tab, TabRound } from '../types';
import { idbStorage } from '../lib/idbStorage';
import { shortId } from '../lib/utils/ids';

interface TabState {
  tabs: Tab[];
  openTab: (input: {
    label: string;
    tableId?: string | null;
    customerId?: string | null;
    customerName?: string | null;
    openedBy?: string | null;
  }) => Tab;
  /** Appends a round. Returns the updated tab, or null when it is not open. */
  addRound: (tabId: string, items: HeldOrderItem[], addedBy?: string | null) => Tab | null;
  /** Removes a round that was rung up in error. Returns the updated tab. */
  removeRound: (tabId: string, roundId: string) => Tab | null;
  /** Links or unlinks a customer on an open tab. */
  setTabCustomer: (tabId: string, customerId: string | null, customerName?: string | null) => void;
  /** Marks a tab settled against the sale it became. */
  settleTab: (tabId: string, saleId: string) => void;
  /** Drops a tab outright — only sensible for one with nothing on it. */
  discardTab: (tabId: string) => void;
}

/**
 * Open accounts on this terminal.
 *
 * Terminal-local and deliberately NOT cloud-synced, exactly like held orders
 * and shifts. A tab is uncommitted state — nothing has been sold, no stock has
 * moved and no money has changed hands — so replicating it would put an
 * in-progress bar tab on every till in the fleet, and a realtime pull could
 * replace a round that this terminal took thirty seconds ago. The committed
 * record is the SALE the tab settles into, and that syncs like any other.
 *
 * The consequence is worth stating plainly rather than discovering: a tab lives
 * on the terminal it was opened on. A shop that wants to open a tab at the bar
 * and settle it at the till needs the tab to be a synced entity, which is a
 * different design with a conflict story attached — two terminals adding a
 * round to one tab at once is a merge, not a last-write-wins upsert.
 */
export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tabs: [],

      openTab: ({ label, tableId, customerId, customerName, openedBy }) => {
        const tab: Tab = {
          id: `tab-${shortId()}`,
          label,
          tableId: tableId ?? null,
          customerId: customerId ?? null,
          customerName: customerName ?? null,
          openedAt: new Date().toISOString(),
          openedBy: openedBy ?? null,
          rounds: [],
          status: 'open',
        };
        set({ tabs: [tab, ...get().tabs] });
        return tab;
      },

      addRound: (tabId, items, addedBy) => {
        // An empty round is not a round. Recording one would put a timestamped
        // "nothing was ordered" entry on the bill and fire an empty kitchen
        // ticket behind it.
        if (items.length === 0) return null;
        const tab = get().tabs.find((candidate) => candidate.id === tabId);
        // A settled tab is terminal. Appending to one would add items to a bill
        // that has already been paid, and the sale it became would never know.
        if (!tab || tab.status !== 'open') return null;

        const round: TabRound = {
          id: `round-${shortId()}`,
          createdAt: new Date().toISOString(),
          addedBy: addedBy ?? null,
          items,
        };
        const updated: Tab = { ...tab, rounds: [...tab.rounds, round] };
        set({ tabs: get().tabs.map((t) => (t.id === tabId ? updated : t)) });
        return updated;
      },

      removeRound: (tabId, roundId) => {
        const tab = get().tabs.find((candidate) => candidate.id === tabId);
        if (!tab || tab.status !== 'open') return null;
        const updated: Tab = {
          ...tab,
          rounds: tab.rounds.filter((round) => round.id !== roundId),
        };
        set({ tabs: get().tabs.map((t) => (t.id === tabId ? updated : t)) });
        return updated;
      },

      setTabCustomer: (tabId, customerId, customerName) => {
        set({
          tabs: get().tabs.map((tab) =>
            tab.id === tabId && tab.status === 'open'
              ? { ...tab, customerId, customerName: customerName ?? null }
              : tab,
          ),
        });
      },

      settleTab: (tabId, saleId) => {
        set({
          tabs: get().tabs.map((tab) =>
            tab.id === tabId
              ? {
                  ...tab,
                  status: 'settled',
                  settledAt: new Date().toISOString(),
                  settledSaleId: saleId,
                }
              : tab,
          ),
        });
      },

      discardTab: (tabId) => {
        set({ tabs: get().tabs.filter((tab) => tab.id !== tabId) });
      },
    }),
    {
      name: 'pos-tab-storage',
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
