import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { CashMovement, CashMovementType, Shift } from '../types';
import { idbStorage } from '../lib/idbStorage';
import { shortId } from '../lib/utils/ids';

interface ShiftState {
  shifts: Shift[];
  currentShiftId: string | null;
  cashMovements: CashMovement[];
  openShift: (openedBy: string, openingFloat: number) => Shift;
  closeShift: (id: string, countedCash: number, note: string, closedBy: string) => void;
  addCashMovement: (params: {
    type: CashMovementType;
    amount: number;
    reason: string;
    performedBy: string;
  }) => CashMovement;
}

/**
 * Register shifts and petty cash movements are terminal-local (one physical drawer),
 * so they persist to IndexedDB and maintain continuous drawer integrity.
 */
export const useShiftStore = create<ShiftState>()(
  persist(
    (set, get) => ({
      shifts: [],
      currentShiftId: null,
      cashMovements: [],

      openShift: (openedBy, openingFloat) => {
        const active = get().shifts.find(
          (shift) => shift.id === get().currentShiftId && !shift.closedAt,
        );
        if (active) return active;
        const shift: Shift = {
          id: `shift-${shortId()}`,
          openedAt: new Date().toISOString(),
          openedBy,
          openingFloat,
        };
        set({ shifts: [shift, ...get().shifts], currentShiftId: shift.id });
        return shift;
      },

      closeShift: (id, countedCash, note, closedBy) => {
        set({
          shifts: get().shifts.map((s) => {
            if (s.id !== id) return s;
            return {
              ...s,
              closedAt: new Date().toISOString(),
              closedBy,
              countedCash,
              note: note || null,
            };
          }),
          currentShiftId: get().currentShiftId === id ? null : get().currentShiftId,
        });
      },

      addCashMovement: ({ type, amount, reason, performedBy }) => {
        const currentShiftId = get().currentShiftId || 'general';
        const movement: CashMovement = {
          id: `cm-${shortId()}`,
          shiftId: currentShiftId,
          type,
          amount: Math.abs(amount),
          reason: reason.trim() || (type === 'pay_in' ? 'Drawer Deposit' : 'Petty Cash Expense'),
          performedBy,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          cashMovements: [movement, ...state.cashMovements],
        }));

        return movement;
      },
    }),
    {
      name: 'pos-shift-storage',
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
