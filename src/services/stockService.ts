import { Product, PurchaseOrder, StockAdjustment } from '../types';
import { useProductStore } from '../stores/productStore';
import { useSupplyStore } from '../stores/supplyStore';
import { syncToCloudIfEnabled } from '../lib/sync';

/**
 * One manual stock movement: receiving a delivery, writing off waste, or
 * correcting a miscount. `delta` is signed — inventory corrections legitimately
 * go negative, which is why the sale-line positive-integer rule does not apply
 * here.
 */
export interface StockAdjustmentRequest {
  productId: string;
  delta: number;
  reason: StockAdjustment['reason'];
  note?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  operatorName?: string | null;
}

/**
 * Why a stock adjustment was refused, so the caller can say which.
 */
export type StockAdjustmentError = 'unknown-product' | 'zero-delta' | 'negative-stock';

export type StockAdjustmentResult =
  { success: true; product: Product } | { success: false; error: StockAdjustmentError };

/**
 * Applies one stock movement, writes its audit-log entry, and syncs.
 *
 * Refuses to drive stock below zero rather than clamping: a count that would go
 * negative means the operator mistyped or the catalogue is already wrong, and
 * silently clamping to zero destroys the evidence of which.
 */
export function adjustStock(request: StockAdjustmentRequest): StockAdjustmentResult {
  const delta = Math.trunc(request.delta);
  if (!Number.isFinite(delta) || delta === 0) return { success: false, error: 'zero-delta' };

  const productStore = useProductStore.getState();
  const product = productStore.products.find((candidate) => candidate.id === request.productId);
  if (!product) return { success: false, error: 'unknown-product' };

  const newStock = product.stock + delta;
  if (newStock < 0) return { success: false, error: 'negative-stock' };

  const updated = { ...product, stock: newStock };
  productStore.handleUpdateProduct(updated);

  useSupplyStore.getState().logAdjustment({
    productId: updated.id,
    productName: updated.name,
    delta,
    newStock: updated.stock,
    reason: request.reason,
    note: request.note ?? null,
    supplierId: request.supplierId ?? null,
    supplierName: request.supplierName ?? null,
    operatorName: request.operatorName ?? null,
  });

  void syncToCloudIfEnabled([updated]);
  return { success: true, product: updated };
}

/**
 * Receives a purchase order: moves it to `received`, applies every line to
 * stock, writes one audit entry per line, and syncs the changed products.
 *
 * Returns null when the status move is illegal — an order already received or
 * cancelled is terminal.
 *
 * Order matters, and the transition is claimed FIRST. setPurchaseOrderStatus is
 * the authoritative guard (it refuses anything PO_TRANSITIONS disallows) and the
 * stock movement is not idempotent. Crediting stock first and asking afterwards
 * meant a second call — a double-click, or a button rendered from a stale
 * snapshot — added the same shipment to inventory twice while the refused status
 * change was silently discarded. Claiming the transition up front makes the
 * second call a no-op.
 *
 * Lines are read from the returned record rather than the caller's snapshot, for
 * the same reason: the record is what the store actually committed.
 */
export function receivePurchaseOrder(
  purchaseOrderId: string,
  operatorName?: string | null,
): PurchaseOrder | null {
  const supplyStore = useSupplyStore.getState();
  const received = supplyStore.setPurchaseOrderStatus(purchaseOrderId, 'received');
  if (!received) return null;

  const productStore = useProductStore.getState();
  const liveById = new Map(productStore.products.map((product) => [product.id, product]));
  const updatedProducts: Product[] = [];

  for (const line of received.lines) {
    const live = liveById.get(line.productId);
    if (!live) continue; // product deleted since ordering; skip its line
    const updated = { ...live, stock: live.stock + line.quantity };
    productStore.handleUpdateProduct(updated);
    updatedProducts.push(updated);
    useSupplyStore.getState().logAdjustment({
      productId: updated.id,
      productName: updated.name,
      delta: line.quantity,
      newStock: updated.stock,
      reason: 'received',
      note: `PO ${received.id}`,
      supplierId: received.supplierId,
      supplierName: received.supplierName,
      operatorName: operatorName ?? null,
    });
  }

  if (updatedProducts.length > 0) void syncToCloudIfEnabled(updatedProducts);
  return received;
}
