import { describe, expect, it } from 'vitest';
import {
  canTransition,
  normalizePoLines,
  poTotal,
  poUnitCount,
  PO_TRANSITIONS,
} from './purchaseOrders';
import type { PurchaseOrderLine, PurchaseOrderStatus } from '../types';

const poLine = (overrides: Partial<PurchaseOrderLine> = {}): PurchaseOrderLine => ({
  productId: 'p1',
  productName: 'Widget',
  quantity: 1,
  unitCost: 10,
  ...overrides,
});

const STATUSES: PurchaseOrderStatus[] = ['draft', 'ordered', 'received', 'cancelled'];

describe('canTransition', () => {
  it('walks a draft through to received', () => {
    expect(canTransition('draft', 'ordered')).toBe(true);
    expect(canTransition('ordered', 'received')).toBe(true);
  });

  it('lets a draft or an order be cancelled', () => {
    expect(canTransition('draft', 'cancelled')).toBe(true);
    expect(canTransition('ordered', 'cancelled')).toBe(true);
  });

  // A received PO already moved stock. "Un-receiving" it would leave the counts
  // holding a shipment the order says never arrived.
  it.each(STATUSES)('refuses every move out of received (-> %s)', (to) => {
    expect(canTransition('received', to)).toBe(false);
  });

  it.each(STATUSES)('refuses every move out of cancelled (-> %s)', (to) => {
    expect(canTransition('cancelled', to)).toBe(false);
  });

  it('refuses skipping the ordered step', () => {
    expect(canTransition('draft', 'received')).toBe(false);
  });

  it('refuses a self-transition', () => {
    for (const status of STATUSES) expect(canTransition(status, status)).toBe(false);
  });

  it('declares a target list for every status, so a new one cannot be forgotten', () => {
    expect(Object.keys(PO_TRANSITIONS).sort()).toEqual([...STATUSES].sort());
  });
});

describe('poTotal / poUnitCount', () => {
  it('sums quantity times unit cost across the lines', () => {
    const po = {
      lines: [poLine({ quantity: 3, unitCost: 2.5 }), poLine({ quantity: 1, unitCost: 4 })],
    };
    expect(poTotal(po)).toBe(11.5);
    expect(poUnitCount(po)).toBe(4);
  });

  it('is zero for an empty order', () => {
    expect(poTotal({ lines: [] })).toBe(0);
    expect(poUnitCount({ lines: [] })).toBe(0);
  });

  it('treats hostile numbers as zero rather than propagating them', () => {
    const po = {
      lines: [
        poLine({ quantity: -5, unitCost: 10 }),
        poLine({ quantity: Number.POSITIVE_INFINITY, unitCost: 1 }),
        poLine({ quantity: 2, unitCost: 3 }),
      ],
    };
    expect(poTotal(po)).toBe(6);
    expect(poUnitCount(po)).toBe(2);
  });

  // The two questions are independent, and deliberately so: a line with a
  // countable quantity and an unusable cost is still that many units on the
  // shelf. It contributes nothing to the money and everything to the count.
  it('counts units on a line whose cost is unusable', () => {
    const po = { lines: [poLine({ quantity: 2, unitCost: Number.NaN })] };
    expect(poUnitCount(po)).toBe(2);
    expect(poTotal(po)).toBe(0);
  });

  it('rounds the total to the cent', () => {
    expect(poTotal({ lines: [poLine({ quantity: 3, unitCost: 0.1 })] })).toBe(0.3);
  });
});

describe('normalizePoLines', () => {
  it('drops a line with no product or no units', () => {
    const lines = normalizePoLines([
      poLine({ productId: '' }),
      poLine({ quantity: 0 }),
      poLine({ quantity: -3 }),
      poLine({ productId: 'keep' }),
    ]);
    expect(lines.map((l) => l.productId)).toEqual(['keep']);
  });

  it('floors a fractional quantity to whole units', () => {
    expect(normalizePoLines([poLine({ quantity: 3.9 })])[0].quantity).toBe(3);
  });

  it('merges duplicate lines so one order cannot receive the same thing twice', () => {
    const lines = normalizePoLines([poLine({ quantity: 2 }), poLine({ quantity: 3 })]);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(5);
  });

  // Merging must not silently discard all but the last unit cost, or the order
  // is received at a price the supplier never quoted.
  it('keeps the merged line worth what the originals were worth', () => {
    const lines = normalizePoLines([
      poLine({ quantity: 2, unitCost: 10 }),
      poLine({ quantity: 2, unitCost: 20 }),
    ]);
    expect(lines[0].quantity).toBe(4);
    expect(lines[0].unitCost).toBe(15);
    expect(poTotal({ lines })).toBe(60);
  });

  // Two sizes of one shirt are two orders against two counts. Merging them
  // would receive both quantities into whichever size came first.
  it('keeps two variants of one product apart', () => {
    const lines = normalizePoLines([
      poLine({ variantId: 'v-s', quantity: 2 }),
      poLine({ variantId: 'v-l', quantity: 3 }),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.quantity)).toEqual([2, 3]);
  });

  it('keeps a plain line apart from a variant line of the same product', () => {
    expect(
      normalizePoLines([poLine({ quantity: 1 }), poLine({ variantId: 'v', quantity: 1 })]),
    ).toHaveLength(2);
  });

  it('clamps a negative unit cost to zero', () => {
    expect(normalizePoLines([poLine({ unitCost: -5 })])[0].unitCost).toBe(0);
  });

  it('does not mutate the lines it was given', () => {
    const original = poLine({ quantity: 2, unitCost: 10 });
    normalizePoLines([original, poLine({ quantity: 2, unitCost: 20 })]);
    expect(original.quantity).toBe(2);
    expect(original.unitCost).toBe(10);
  });

  it('is empty for an empty order', () => {
    expect(normalizePoLines([])).toEqual([]);
  });
});
