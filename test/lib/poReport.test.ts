import { describe, it, expect } from 'vitest';
import { buildPoReport } from '../../src/lib/poReport';
import { PurchaseOrder, PurchaseOrderStatus } from '../../src/types';

let seq = 0;
const po = (
  status: PurchaseOrderStatus,
  qty: number,
  unitCost: number,
  supplier: { id: string | null; name: string | null } = { id: 's1', name: 'Acme' },
  createdAt = new Date().toISOString(),
): PurchaseOrder => ({
  id: `po-${seq++}`,
  supplierId: supplier.id,
  supplierName: supplier.name,
  status,
  lines: [{ productId: 'p1', productName: 'Beans', quantity: qty, unitCost }],
  createdAt,
  orderedAt: null,
  receivedAt: null,
});

describe('buildPoReport', () => {
  it('separates received spend from outstanding committed value', () => {
    const r = buildPoReport([
      po('received', 10, 5), // 50 received
      po('ordered', 4, 5), // 20 outstanding
      po('draft', 2, 5), // 10 outstanding
    ]);
    expect(r.receivedValue).toBe(50);
    expect(r.outstandingValue).toBe(30);
  });

  it('counts every status but excludes cancelled orders from money totals', () => {
    const r = buildPoReport([po('received', 2, 10), po('cancelled', 100, 10)]);
    expect(r.countByStatus.received).toBe(1);
    expect(r.countByStatus.cancelled).toBe(1);
    expect(r.receivedValue).toBe(20); // cancelled 1000 not counted
    expect(r.outstandingValue).toBe(0);
  });

  it('aggregates per supplier and sorts by received spend desc', () => {
    const r = buildPoReport([
      po('received', 1, 10, { id: 's1', name: 'Acme' }),
      po('received', 1, 40, { id: 's2', name: 'Globex' }),
      po('ordered', 1, 5, { id: 's1', name: 'Acme' }),
    ]);
    expect(r.suppliers[0].supplierName).toBe('Globex'); // 40 > 10
    const acme = r.suppliers.find((s) => s.supplierId === 's1')!;
    expect(acme.received).toBe(10);
    expect(acme.outstanding).toBe(5);
    expect(acme.orders).toBe(2);
  });

  it('buckets supplier-less orders under a single group', () => {
    const r = buildPoReport([po('received', 1, 7, { id: null, name: null })]);
    expect(r.suppliers).toHaveLength(1);
    expect(r.suppliers[0].supplierId).toBeNull();
    expect(r.suppliers[0].received).toBe(7);
  });

  it('honors the day window filter', () => {
    const old = new Date();
    old.setDate(old.getDate() - 40);
    const r = buildPoReport(
      [po('received', 1, 10), po('received', 1, 99, { id: 's1', name: 'Acme' }, old.toISOString())],
      7,
    );
    expect(r.receivedValue).toBe(10); // the 40-day-old order is excluded
  });
});
