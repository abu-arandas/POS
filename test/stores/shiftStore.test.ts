import { describe, it, expect, beforeEach } from 'vitest';
import { useShiftStore } from '../../src/stores/shiftStore';

describe('useShiftStore', () => {
  beforeEach(() => {
    useShiftStore.setState({ shifts: [], currentShiftId: null });
  });

  it('opens a shift, stamping it and marking it current', () => {
    const shift = useShiftStore.getState().openShift('Alice', 100);
    expect(shift.id).toMatch(/^shift-/);
    expect(shift.openedBy).toBe('Alice');
    expect(shift.openingFloat).toBe(100);
    expect(shift.openedAt).toBeTruthy();
    expect(useShiftStore.getState().currentShiftId).toBe(shift.id);
    expect(useShiftStore.getState().shifts).toHaveLength(1);
  });

  it('returns the existing active shift instead of opening an overlapping session', () => {
    const first = useShiftStore.getState().openShift('Alice', 100);
    const second = useShiftStore.getState().openShift('Bob', 50);
    expect(second.id).toBe(first.id);
    expect(useShiftStore.getState().shifts.map((s) => s.id)).toEqual([first.id]);
    expect(useShiftStore.getState().currentShiftId).toBe(first.id);
  });

  it('closes a shift, recording the count and clearing current', () => {
    const shift = useShiftStore.getState().openShift('Alice', 100);
    useShiftStore.getState().closeShift(shift.id, 250, 'all good', 'Manager');
    const closed = useShiftStore.getState().shifts.find((s) => s.id === shift.id)!;
    expect(closed.countedCash).toBe(250);
    expect(closed.note).toBe('all good');
    expect(closed.closedBy).toBe('Manager');
    expect(closed.closedAt).toBeTruthy();
    expect(useShiftStore.getState().currentShiftId).toBeNull();
  });

  it('stores an empty close note as null', () => {
    const shift = useShiftStore.getState().openShift('Alice', 100);
    useShiftStore.getState().closeShift(shift.id, 100, '', 'Manager');
    expect(useShiftStore.getState().shifts.find((s) => s.id === shift.id)!.note).toBeNull();
  });

  it('clears the current shift when the active shift is closed', () => {
    const shift = useShiftStore.getState().openShift('Alice', 100);
    useShiftStore.getState().closeShift(shift.id, 100, '', 'Manager');
    expect(useShiftStore.getState().currentShiftId).toBeNull();
  });
});
