import { PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus } from '../types';
import { nonNegative } from './money';

/**
 * The only legal status moves. Received and cancelled are terminal — a
 * received PO already changed stock, so "un-receiving" would corrupt counts.
 */
export const PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ['ordered', 'cancelled'],
  ordered: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

/**
 * Whether a purchase order may move directly between two statuses, per the
 * PO_TRANSITIONS state machine.
 */
export function canTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  return PO_TRANSITIONS[from].includes(to);
}

/**
 * Total buy value of the order (sum of qty × unit cost), rounded to cents.
 */
export function poTotal(po: Pick<PurchaseOrder, 'lines'>): number {
  return Number(
    po.lines
      .reduce((sum, l) => sum + nonNegative(l.quantity) * nonNegative(l.unitCost), 0)
      .toFixed(2),
  );
}

/**
 * Total units across all lines.
 */
export function poUnitCount(po: Pick<PurchaseOrder, 'lines'>): number {
  return po.lines.reduce((sum, l) => sum + Math.floor(nonNegative(l.quantity)), 0);
}

/**
 * Drops empty/invalid lines and merges duplicates of the same product so a
 * PO can never receive the same product twice from one order. Quantities are
 * whole units; costs can't go negative.
 */
export function normalizePoLines(lines: PurchaseOrderLine[]): PurchaseOrderLine[] {
  const merged = new Map<string, PurchaseOrderLine>();
  for (const line of lines) {
    const quantity = Math.floor(nonNegative(line.quantity));
    if (!line.productId || quantity <= 0) continue;
    const unitCost = nonNegative(line.unitCost);
    const existing = merged.get(line.productId);
    if (existing) {
      const previousCost = existing.unitCost * existing.quantity;
      existing.quantity += quantity;
      // Keep the merged line's total value equal to the sum of the original
      // lines instead of silently discarding all but the last unit cost.
      existing.unitCost = Number(
        ((previousCost + unitCost * quantity) / existing.quantity).toFixed(2),
      );
    } else {
      merged.set(line.productId, { ...line, quantity, unitCost });
    }
  }
  return Array.from(merged.values());
}
