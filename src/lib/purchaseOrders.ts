import { PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus } from '../types';

// The only legal status moves. Received and cancelled are terminal — a
// received PO already changed stock, so "un-receiving" would corrupt counts.
export const PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ['ordered', 'cancelled'],
  ordered: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

export function canTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  return PO_TRANSITIONS[from].includes(to);
}

// Total buy value of the order (sum of qty × unit cost), rounded to cents.
export function poTotal(po: Pick<PurchaseOrder, 'lines'>): number {
  return Number(po.lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0).toFixed(2));
}

// Total units across all lines.
export function poUnitCount(po: Pick<PurchaseOrder, 'lines'>): number {
  return po.lines.reduce((sum, l) => sum + l.quantity, 0);
}

// Drops empty/invalid lines and merges duplicates of the same product so a
// PO can never receive the same product twice from one order. Quantities are
// whole units; costs can't go negative.
export function normalizePoLines(lines: PurchaseOrderLine[]): PurchaseOrderLine[] {
  const merged = new Map<string, PurchaseOrderLine>();
  for (const line of lines) {
    const quantity = Math.floor(line.quantity);
    if (!line.productId || quantity <= 0) continue;
    const unitCost = Math.max(0, line.unitCost || 0);
    const existing = merged.get(line.productId);
    if (existing) {
      existing.quantity += quantity;
      existing.unitCost = unitCost; // last entry wins for cost
    } else {
      merged.set(line.productId, { ...line, quantity, unitCost });
    }
  }
  return Array.from(merged.values());
}
