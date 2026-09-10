import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Product } from '../../src/types';

const syncToCloudIfEnabled = vi.fn();
vi.mock('../../src/lib/sync', () => ({
  syncToCloudIfEnabled: (...args: unknown[]) => syncToCloudIfEnabled(...args),
  deleteProductsCloudIfEnabled: vi.fn(),
  deleteCategoriesCloudIfEnabled: vi.fn(),
}));

import { adjustStock, receivePurchaseOrder } from '../../src/services';
import { useProductStore } from '../../src/stores/productStore';
import { useSupplyStore } from '../../src/stores/supplyStore';

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Latte',
  price: 10,
  cost: 3,
  category: 'c1',
  sku: 'LAT-1',
  stock: 5,
  minStock: 1,
  image: '',
  ...over,
});

describe('adjustStock', () => {
  beforeEach(() => {
    syncToCloudIfEnabled.mockClear();
    useProductStore.setState({ products: [product()], categories: [] });
    useSupplyStore.setState({ suppliers: [], adjustments: [], purchaseOrders: [] });
  });

  it('applies a positive delta and writes one audit entry', () => {
    const result = adjustStock({
      productId: 'p1',
      delta: 3,
      reason: 'received',
      operatorName: 'Ada',
    });

    expect(result).toEqual({ success: true, product: expect.objectContaining({ stock: 8 }) });
    expect(useProductStore.getState().products[0].stock).toBe(8);

    const log = useSupplyStore.getState().adjustments;
    expect(log).toHaveLength(1);
    expect(log[0]).toEqual(
      expect.objectContaining({ productId: 'p1', delta: 3, newStock: 8, reason: 'received' }),
    );
  });

  it('accepts a negative delta, because waste and corrections are legitimate', () => {
    const result = adjustStock({ productId: 'p1', delta: -2, reason: 'waste' });

    expect(result.success).toBe(true);
    expect(useProductStore.getState().products[0].stock).toBe(3);
    expect(useSupplyStore.getState().adjustments[0].delta).toBe(-2);
  });

  it('refuses a delta that would drive stock negative, and writes nothing', () => {
    const result = adjustStock({ productId: 'p1', delta: -9, reason: 'waste' });

    expect(result).toEqual({ success: false, error: 'negative-stock' });
    expect(useProductStore.getState().products[0].stock).toBe(5);
    expect(useSupplyStore.getState().adjustments).toEqual([]);
    expect(syncToCloudIfEnabled).not.toHaveBeenCalled();
  });

  it('refuses an unknown product', () => {
    expect(adjustStock({ productId: 'nope', delta: 1, reason: 'received' })).toEqual({
      success: false,
      error: 'unknown-product',
    });
    expect(useSupplyStore.getState().adjustments).toEqual([]);
  });

  it.each([0, Number.NaN, 0.4])('refuses a delta of %s as a no-op', (delta) => {
    expect(adjustStock({ productId: 'p1', delta, reason: 'correction' })).toEqual({
      success: false,
      error: 'zero-delta',
    });
    expect(useProductStore.getState().products[0].stock).toBe(5);
  });

  it('pushes the changed product', () => {
    adjustStock({ productId: 'p1', delta: 1, reason: 'received' });

    expect(syncToCloudIfEnabled).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'p1', stock: 6 }),
    ]);
  });
});

describe('receivePurchaseOrder', () => {
  beforeEach(() => {
    syncToCloudIfEnabled.mockClear();
    useProductStore.setState({ products: [product({ stock: 2 })], categories: [] });
    useSupplyStore.setState({ suppliers: [], adjustments: [], purchaseOrders: [] });
  });

  const orderedPo = () => {
    const po = useSupplyStore.getState().createPurchaseOrder({
      supplierId: 's1',
      supplierName: 'Acme',
      lines: [{ productId: 'p1', productName: 'Latte', quantity: 5, unitCost: 1 }],
      note: null,
      createdBy: 'Ada',
    });
    useSupplyStore.getState().setPurchaseOrderStatus(po.id, 'ordered');
    return po;
  };

  it('receives the order, credits every line, and logs each one', () => {
    const po = orderedPo();

    const received = receivePurchaseOrder(po.id, 'Ada');

    expect(received?.status).toBe('received');
    expect(useProductStore.getState().products[0].stock).toBe(7);
    expect(useSupplyStore.getState().adjustments).toHaveLength(1);
    expect(useSupplyStore.getState().adjustments[0]).toEqual(
      expect.objectContaining({ delta: 5, reason: 'received', note: `PO ${po.id}` }),
    );
  });

  it('is a no-op on a second call, so a double-click cannot credit stock twice', () => {
    const po = orderedPo();

    expect(receivePurchaseOrder(po.id, 'Ada')).not.toBeNull();
    expect(useProductStore.getState().products[0].stock).toBe(7);

    // The transition is claimed before any stock moves, so the repeat is refused
    // before it can add the same shipment again.
    expect(receivePurchaseOrder(po.id, 'Ada')).toBeNull();
    expect(useProductStore.getState().products[0].stock).toBe(7);
    expect(useSupplyStore.getState().adjustments).toHaveLength(1);
  });

  it('refuses an illegal transition from draft', () => {
    const po = useSupplyStore.getState().createPurchaseOrder({
      supplierId: null,
      supplierName: null,
      lines: [{ productId: 'p1', productName: 'Latte', quantity: 5, unitCost: 1 }],
      note: null,
      createdBy: 'Ada',
    });

    // draft -> received is not in PO_TRANSITIONS; it must go through 'ordered'.
    expect(receivePurchaseOrder(po.id, 'Ada')).toBeNull();
    expect(useProductStore.getState().products[0].stock).toBe(2);
  });

  it('skips a line whose product was deleted since ordering', () => {
    const po = orderedPo();
    useProductStore.setState({ products: [] });

    const received = receivePurchaseOrder(po.id, 'Ada');

    expect(received?.status).toBe('received');
    expect(useSupplyStore.getState().adjustments).toEqual([]);
    expect(syncToCloudIfEnabled).not.toHaveBeenCalled();
  });
});
