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

const tee = (): Product =>
  product({
    id: 'p2',
    name: 'Tee',
    sku: 'TEE',
    stock: 7,
    variantTypes: [
      {
        id: 'vt-size',
        name: 'Size',
        options: [
          { id: 'o-s', name: 'Small' },
          { id: 'o-l', name: 'Large' },
        ],
      },
    ],
    variants: [
      { id: 'v-s', options: { 'vt-size': 'o-s' }, sku: 'TEE-S', stock: 4 },
      { id: 'v-l', options: { 'vt-size': 'o-l' }, sku: 'TEE-L', stock: 3 },
    ],
  });

const liveTee = () => useProductStore.getState().products.find((p) => p.id === 'p2')!;
const stockOf = (variantId: string) => liveTee().variants!.find((v) => v.id === variantId)!.stock;

describe('adjustStock on a varianted product', () => {
  beforeEach(() => {
    syncToCloudIfEnabled.mockClear();
    useProductStore.setState({ products: [tee()], categories: [] });
    useSupplyStore.setState({ suppliers: [], adjustments: [], purchaseOrders: [] });
  });

  it('moves the named variant and re-derives the product total', () => {
    const result = adjustStock({ productId: 'p2', variantId: 'v-l', delta: 5, reason: 'received' });

    expect(result.success).toBe(true);
    expect(stockOf('v-l')).toBe(8);
    expect(stockOf('v-s')).toBe(4);
    expect(liveTee().stock).toBe(12);
  });

  it('names the variant in the audit entry, and logs the variant’s new level', () => {
    adjustStock({ productId: 'p2', variantId: 'v-s', delta: -1, reason: 'waste' });

    const [entry] = useSupplyStore.getState().adjustments;
    expect(entry).toMatchObject({
      productId: 'p2',
      variantId: 'v-s',
      variantName: 'Small',
      delta: -1,
      // 3 smalls left, not the product's 6: a row reading "waste −1, now 6"
      // when three smalls remain is worse than no row at all.
      newStock: 3,
    });
  });

  it('refuses a movement that names no variant', () => {
    // There is no product-level pool to add to — `stock` is the sum of the
    // rows — so a write to it would leave the total contradicting them.
    expect(adjustStock({ productId: 'p2', delta: 3, reason: 'received' })).toEqual({
      success: false,
      error: 'variant-required',
    });
    expect(liveTee().stock).toBe(7);
    expect(useSupplyStore.getState().adjustments).toEqual([]);
  });

  it('refuses a movement against a variant that does not exist', () => {
    expect(
      adjustStock({ productId: 'p2', variantId: 'v-gone', delta: 1, reason: 'correction' }),
    ).toEqual({ success: false, error: 'unknown-variant' });
  });

  it('floors at zero on the variant, not on the product total', () => {
    // The product holds 7 units, so a product-level floor would allow −4 on a
    // variant that only has 3.
    expect(adjustStock({ productId: 'p2', variantId: 'v-l', delta: -4, reason: 'waste' })).toEqual({
      success: false,
      error: 'negative-stock',
    });
    expect(stockOf('v-l')).toBe(3);
  });
});

describe('receivePurchaseOrder with variants', () => {
  beforeEach(() => {
    syncToCloudIfEnabled.mockClear();
    useProductStore.setState({ products: [tee()], categories: [] });
    useSupplyStore.setState({ suppliers: [], adjustments: [], purchaseOrders: [] });
  });

  const orderOf = (lines: Array<Record<string, unknown>>) => {
    const created = useSupplyStore.getState().createPurchaseOrder({
      supplierId: null,
      supplierName: null,
      lines: lines as never,
      note: null,
      createdBy: null,
    });
    useSupplyStore.getState().setPurchaseOrderStatus(created.id, 'ordered');
    return created.id;
  };

  it('credits each line to its own variant', () => {
    const id = orderOf([
      { productId: 'p2', productName: 'Tee', variantId: 'v-s', quantity: 10, unitCost: 4 },
      { productId: 'p2', productName: 'Tee', variantId: 'v-l', quantity: 6, unitCost: 4 },
    ]);

    expect(receivePurchaseOrder(id, 'Ada')).not.toBeNull();
    expect(stockOf('v-s')).toBe(14);
    expect(stockOf('v-l')).toBe(9);
    expect(liveTee().stock).toBe(23);
  });

  it('pushes the accumulated product once, not the state after its first line', () => {
    const id = orderOf([
      { productId: 'p2', productName: 'Tee', variantId: 'v-s', quantity: 10, unitCost: 4 },
      { productId: 'p2', productName: 'Tee', variantId: 'v-l', quantity: 6, unitCost: 4 },
    ]);
    receivePurchaseOrder(id, 'Ada');

    const [pushed] = syncToCloudIfEnabled.mock.calls.at(-1)! as [Product[]];
    expect(pushed).toHaveLength(1);
    expect(pushed[0].stock).toBe(23);
  });

  it('skips a line that names no variant rather than crediting the total', () => {
    const id = orderOf([{ productId: 'p2', productName: 'Tee', quantity: 10, unitCost: 4 }]);
    receivePurchaseOrder(id, 'Ada');

    expect(liveTee().stock).toBe(7);
    expect(useSupplyStore.getState().adjustments).toEqual([]);
  });
});
