import { Product, PurchaseOrder, StockAdjustment } from '../types';
import { applyStockDelta, availableStock, hasVariants, variantLabelById } from '../lib/variants';
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
  /** Required on a product that sells through variants — units live per variant. */
  variantId?: string | null;
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
export type StockAdjustmentError =
  'unknown-product' | 'unknown-variant' | 'variant-required' | 'zero-delta' | 'negative-stock';

export type StockAdjustmentResult =
  { success: true; product: Product } | { success: false; error: StockAdjustmentError };

/**
 * Applies one stock movement, writes its audit-log entry, and syncs.
 *
 * Refuses to drive stock below zero rather than clamping: a count that would go
 * negative means the operator mistyped or the catalogue is already wrong, and
 * silently clamping to zero destroys the evidence of which.
 *
 * On a varianted product the movement names a variant, and both the zero floor
 * and the logged level are that variant's, not the product's total.
 */
export function adjustStock(request: StockAdjustmentRequest): StockAdjustmentResult {
  const delta = Math.trunc(request.delta);
  if (!Number.isFinite(delta) || delta === 0) return { success: false, error: 'zero-delta' };

  const productStore = useProductStore.getState();
  const product = productStore.products.find((candidate) => candidate.id === request.productId);
  if (!product) return { success: false, error: 'unknown-product' };

  // On a varianted product there is no product-level count to move: `stock` is
  // the sum of the variants. Writing to it directly would leave the total
  // disagreeing with the rows it is supposed to be the sum of, and the next
  // variant edit would silently wipe the correction out again.
  const variantId = request.variantId ?? null;
  if (hasVariants(product) && !variantId) return { success: false, error: 'variant-required' };

  const newStock = availableStock(product, variantId) + delta;
  if (newStock < 0) return { success: false, error: 'negative-stock' };

  const updated = applyStockDelta(product, variantId, delta);
  if (!updated) return { success: false, error: 'unknown-variant' };
  productStore.handleUpdateProduct(updated);

  useSupplyStore.getState().logAdjustment({
    productId: updated.id,
    productName: updated.name,
    variantId: variantId ?? undefined,
    variantName: variantLabelById(updated, variantId) || undefined,
    delta,
    // The moved line's new level, not the product total — an audit row saying
    // "waste −2, now 57" when only three larges remain is worse than no row.
    newStock,
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

  // Keyed by product so several lines of one product — different variants of it,
  // typically — accumulate rather than each overwriting the last.
  const workingByProduct = new Map<string, Product>();
  for (const line of received.lines) {
    const base = workingByProduct.get(line.productId) ?? liveById.get(line.productId);
    if (!base) continue; // product deleted since ordering; skip its line
    // A line with no variant against a now-varianted product, or naming a
    // variant that has since gone, has no count to credit. Crediting the
    // product total instead would break the sum-of-variants invariant.
    if (hasVariants(base) && !line.variantId) continue;
    const updated = applyStockDelta(base, line.variantId, line.quantity);
    if (!updated) continue;
    workingByProduct.set(line.productId, updated);
    productStore.handleUpdateProduct(updated);
    useSupplyStore.getState().logAdjustment({
      productId: updated.id,
      productName: updated.name,
      variantId: line.variantId,
      variantName: variantLabelById(updated, line.variantId) || line.variantName || undefined,
      delta: line.quantity,
      newStock: availableStock(updated, line.variantId),
      reason: 'received',
      note: `PO ${received.id}`,
      supplierId: received.supplierId,
      supplierName: received.supplierName,
      operatorName: operatorName ?? null,
    });
  }

  // The accumulated record per product, pushed once. Collecting inside the loop
  // would push the state after the FIRST line and leave the cloud row short by
  // every later line of the same product.
  const updatedProducts = Array.from(workingByProduct.values());
  if (updatedProducts.length > 0) void syncToCloudIfEnabled(updatedProducts);
  return received;
}
