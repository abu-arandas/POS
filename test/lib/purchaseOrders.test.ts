import { describe, it, expect } from 'vitest';
import { canTransition, poTotal, poUnitCount, normalizePoLines } from '../../src/lib/purchaseOrders';
import { PurchaseOrderLine, PurchaseOrderStatus } from '../../src/types';

const line = (over: Partial<PurchaseOrderLine> = {}): PurchaseOrderLine => ({
  productId: 'p1',
  productName: 'Beans 1kg',
  quantity: 4,
  unitCost: 7.25,
  ...over,
});

describe('canTransition', () => {
  it('allows the documented forward moves', () => {
    expect(canTransition('draft', 'ordered')).toBe(true);
    expect(canTransition('draft', 'cancelled')).toBe(true);
    expect(canTransition('ordered', 'received')).toBe(true);
    expect(canTransition('ordered', 'cancelled')).toBe(true);
  });

  it('blocks skipping and reversing states', () => {
    expect(canTransition('draft', 'received')).toBe(false);
    expect(canTransition('ordered', 'draft')).toBe(false);
    expect(canTransition('received', 'ordered')).toBe(false);
    expect(canTransition('cancelled', 'ordered')).toBe(false);
  });

  it('treats received and cancelled as terminal', () => {
    const all: PurchaseOrderStatus[] = ['draft', 'ordered', 'received', 'cancelled'];
    for (const to of all) {
      expect(canTransition('received', to)).toBe(false);
      expect(canTransition('cancelled', to)).toBe(false);
    }
  });
});

describe('poTotal / poUnitCount', () => {
  it('sums qty × unit cost across lines, rounded to cents', () => {
    const po = { lines: [line(), line({ productId: 'p2', quantity: 3, unitCost: 0.1 })] };
    expect(poTotal(po)).toBe(29.3); // 4×7.25 + 3×0.10
    expect(poUnitCount(po)).toBe(7);
  });

  it('is zero for an empty order', () => {
    expect(poTotal({ lines: [] })).toBe(0);
    expect(poUnitCount({ lines: [] })).toBe(0);
  });
});

describe('normalizePoLines', () => {
  it('drops zero/negative quantities and lines without a product', () => {
    const out = normalizePoLines([
      line({ quantity: 0 }),
      line({ productId: '', quantity: 5 }),
      line({ productId: 'p2', quantity: -3 }),
      line({ productId: 'p3', quantity: 2 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].productId).toBe('p3');
  });

  it('merges duplicate products into one line', () => {
    const out = normalizePoLines([
      line({ quantity: 2, unitCost: 7 }),
      line({ quantity: 3, unitCost: 6.5 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(5);
    expect(out[0].unitCost).toBe(6.5);
  });

  it('floors fractional quantities and clamps negative costs to zero', () => {
    const out = normalizePoLines([line({ quantity: 2.9, unitCost: -1 })]);
    expect(out[0].quantity).toBe(2);
    expect(out[0].unitCost).toBe(0);
  });
});
