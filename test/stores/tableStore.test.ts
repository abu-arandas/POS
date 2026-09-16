import { describe, it, expect, beforeEach } from 'vitest';
import { useTableStore } from '../../src/stores/tableStore';
import type { DiningTable } from '../../src/types';

// Table management arrived with no coverage at all. What it tracks is not
// cosmetic: `activeSince` is how long a party has been sitting, and
// `totalAmount` is what they currently owe — both shown to staff deciding who
// to serve and what to charge.

const table = (over: Partial<DiningTable> = {}): DiningTable => ({
  id: 'tbl-1',
  name: 'Table 1',
  seats: 4,
  status: 'available',
  section: 'Main Hall',
  ...over,
});

const reset = (tables: DiningTable[] = [table()]) =>
  useTableStore.setState({ tables, selectedTableId: null });

const live = (id = 'tbl-1') => useTableStore.getState().tables.find((t) => t.id === id);

describe('tableStore seating', () => {
  beforeEach(() => reset());

  it('seats a party and starts its clock', () => {
    useTableStore.getState().occupyTable('tbl-1', 'order-9', 3, 42.5);
    expect(live()).toMatchObject({
      status: 'occupied',
      currentOrderId: 'order-9',
      currentGuests: 3,
      totalAmount: 42.5,
    });
    expect(live()?.activeSince).toBeTruthy();
  });

  it('defaults the party size and the running total', () => {
    useTableStore.getState().occupyTable('tbl-1');
    expect(live()).toMatchObject({ currentGuests: 2, totalAmount: 0 });
  });

  it('does not restart the clock when the same party orders again', () => {
    // occupyTable is called on every "add to this table", so resetting
    // activeSince would make a party that keeps ordering look permanently
    // newly seated — exactly backwards for deciding who has waited longest.
    const seatedAt = '2026-07-16T10:00:00.000Z';
    reset([table({ status: 'occupied', activeSince: seatedAt, totalAmount: 10 })]);
    useTableStore.getState().occupyTable('tbl-1', 'order-2', 4, 25);
    expect(live()?.activeSince).toBe(seatedAt);
    expect(live()?.totalAmount).toBe(25);
  });

  it('clears the party entirely on release', () => {
    useTableStore.getState().occupyTable('tbl-1', 'order-9', 3, 42.5);
    useTableStore.getState().releaseTable('tbl-1');
    expect(live()).toMatchObject({ status: 'available' });
    // Left set, these would follow the next party onto the same table.
    expect(live()?.currentOrderId).toBeUndefined();
    expect(live()?.currentGuests).toBeUndefined();
    expect(live()?.activeSince).toBeUndefined();
    expect(live()?.totalAmount).toBeUndefined();
  });

  it('marks the bill requested without losing the party', () => {
    useTableStore.getState().occupyTable('tbl-1', 'order-9', 3, 42.5);
    useTableStore.getState().requestBill('tbl-1');
    expect(live()).toMatchObject({ status: 'bill_requested', totalAmount: 42.5 });
    expect(live()?.activeSince).toBeTruthy();
  });

  it('reserves an empty table', () => {
    useTableStore.getState().reserveTable('tbl-1');
    expect(live()?.status).toBe('reserved');
  });

  it('leaves other tables untouched', () => {
    reset([table(), table({ id: 'tbl-2', name: 'Table 2' })]);
    useTableStore.getState().occupyTable('tbl-1');
    expect(live('tbl-2')?.status).toBe('available');
  });

  it('ignores an id that is not on the floor plan', () => {
    useTableStore.getState().occupyTable('nope');
    expect(useTableStore.getState().tables).toHaveLength(1);
    expect(live()?.status).toBe('available');
  });
});

describe('tableStore floor plan editing', () => {
  beforeEach(() => reset());

  it('adds a table available and in a section', () => {
    const added = useTableStore
      .getState()
      .addTable({ name: 'Patio 1', seats: 2, section: 'Patio' });
    expect(added).toMatchObject({
      name: 'Patio 1',
      seats: 2,
      section: 'Patio',
      status: 'available',
    });
    expect(useTableStore.getState().tables).toHaveLength(2);
  });

  it('falls back to a default section rather than leaving it blank', () => {
    const added = useTableStore.getState().addTable({ name: 'Bar 1', seats: 2, section: '' });
    expect(added.section).toBe('Main Hall');
  });

  it('gives each added table its own id', () => {
    const a = useTableStore.getState().addTable({ name: 'A', seats: 2, section: 'Patio' });
    const b = useTableStore.getState().addTable({ name: 'B', seats: 2, section: 'Patio' });
    expect(a.id).not.toBe(b.id);
  });

  it('patches only the fields given', () => {
    useTableStore.getState().updateTable('tbl-1', { seats: 6 });
    expect(live()).toMatchObject({ seats: 6, name: 'Table 1', status: 'available' });
  });

  it('deletes by id', () => {
    reset([table(), table({ id: 'tbl-2', name: 'Table 2' })]);
    useTableStore.getState().deleteTable('tbl-1');
    expect(useTableStore.getState().tables.map((t) => t.id)).toEqual(['tbl-2']);
  });

  it('remembers which table the register is working on', () => {
    // This is what carries a table across to the register screen; App reads it
    // when TableManagement hands one over.
    useTableStore.getState().setSelectedTableId('tbl-1');
    expect(useTableStore.getState().selectedTableId).toBe('tbl-1');
    useTableStore.getState().setSelectedTableId(null);
    expect(useTableStore.getState().selectedTableId).toBeNull();
  });
});
