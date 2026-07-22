import { PurchaseOrder, PurchaseOrderStatus } from '../types';
import { poTotal } from './purchaseOrders';

export interface SupplierSpend {
  supplierId: string | null;
  supplierName: string;
  received: number; // value of received orders
  outstanding: number; // value of draft + ordered (committed, not yet received)
  orders: number; // count of orders (any status except cancelled)
}

export interface PoReport {
  receivedValue: number; // total spend on received orders
  outstandingValue: number; // committed value still open (draft + ordered)
  countByStatus: Record<PurchaseOrderStatus, number>;
  suppliers: SupplierSpend[]; // sorted by received desc
}

// Optionally restrict to orders created within the last `days` days.
function withinWindow(po: PurchaseOrder, days?: number): boolean {
  if (!days) return true;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return new Date(po.createdAt) >= start;
}

// Summarizes purchase orders for the Dashboard: total received spend,
// outstanding committed value, counts per status, and per-supplier spend.
// Cancelled orders are excluded from money totals but still counted.
export function buildPoReport(orders: PurchaseOrder[], days?: number): PoReport {
  const countByStatus: Record<PurchaseOrderStatus, number> = {
    draft: 0,
    ordered: 0,
    received: 0,
    cancelled: 0,
  };
  const supplierMap = new Map<string, SupplierSpend>();
  let receivedValue = 0;
  let outstandingValue = 0;

  for (const po of orders) {
    if (!withinWindow(po, days)) continue;
    countByStatus[po.status] += 1;
    if (po.status === 'cancelled') continue;

    const value = poTotal(po);
    const key = po.supplierId ?? '__none__';
    const entry =
      supplierMap.get(key) ??
      {
        supplierId: po.supplierId,
        supplierName: po.supplierName ?? '—',
        received: 0,
        outstanding: 0,
        orders: 0,
      };
    entry.orders += 1;
    if (po.status === 'received') {
      receivedValue += value;
      entry.received += value;
    } else {
      outstandingValue += value; // draft or ordered
      entry.outstanding += value;
    }
    supplierMap.set(key, entry);
  }

  const suppliers = Array.from(supplierMap.values())
    .map((s) => ({
      ...s,
      received: Number(s.received.toFixed(2)),
      outstanding: Number(s.outstanding.toFixed(2)),
    }))
    .sort((a, b) => b.received - a.received || b.outstanding - a.outstanding);

  return {
    receivedValue: Number(receivedValue.toFixed(2)),
    outstandingValue: Number(outstandingValue.toFixed(2)),
    countByStatus,
    suppliers,
  };
}
