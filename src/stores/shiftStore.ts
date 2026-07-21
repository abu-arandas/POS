import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Shift } from '../types';
import { idbStorage } from '../lib/idbStorage';
import { shortId } from '../lib/ids';

interface ShiftState {
  shifts: Shift[];
  currentShiftId: string | null;
  openShift: (openedBy: string, openingFloat: number) => Shift;
  closeShift: (id: string, countedCash: number, note: string, closedBy: string) => void;
}

// Register shifts are terminal-local (one physical drawer), so they persist to
// IndexedDB and are not cloud-synced.
export const useShiftStore = create<ShiftState>()(
  persist(
    (set, get) => ({
      shifts: [],
      currentShiftId: null,

      openShift: (openedBy, openingFloat) => {
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
          shifts: get().shifts.map((s) =>
            s.id === id
              ? { ...s, closedAt: new Date().toISOString(), closedBy, countedCash, note: note || null }
              : s,
          ),
          currentShiftId: get().currentShiftId === id ? null : get().currentShiftId,
        });
      },
    }),
    {
      name: 'pos-shift-storage',
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
