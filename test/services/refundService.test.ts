import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Customer, Product, SaleTransaction } from '../../src/types';

const syncToCloudIfEnabled = vi.fn();
vi.mock('../../src/lib/sync', () => ({
  syncToCloudIfEnabled: (...args: unknown[]) => syncToCloudIfEnabled(...args),
  deleteProductsCloudIfEnabled: vi.fn(),
  deleteCategoriesCloudIfEnabled: vi.fn(),
  deleteCustomersCloudIfEnabled: vi.fn(),
  deleteTransactionsCloudIfEnabled: vi.fn(),
}));

import { commitRefund } from '../../src/services';
import { useProductStore } from '../../src/stores/productStore';
import { useCustomerStore } from '../../src/stores/customerStore';
import { useTransactionStore } from '../../src/stores/transactionStore';

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Latte',
  price: 10,
  cost: 3,
  category: 'c1',
  sku: 'LAT-1',
  stock: 3,
  minStock: 1,
  image: '',
  ...over,
});

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1',
  name: 'Grace',
  email: '',
  phone: '',
  points: 22,
  createdAt: '2026-01-01',
  ...over,
});

const sale = (over: Partial<SaleTransaction> = {}): SaleTransaction => ({
  id: 'TX-1',
  date: '2026-01-01T10:00:00.000Z',
  items: [{ productId: 'p1', productName: 'Latte', price: 10, cost: 3, quantity: 2, total: 20 }],
  subtotal: 20,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 2,
  total: 22,
  paymentMethod: 'card',
  customerId: null,
  status: 'completed',
  ...over,
});

describe('commitRefund', () => {
  beforeEach(() => {
    syncToCloudIfEnabled.mockClear();
    useProductStore.setState({ products: [product()], categories: [] });
    useCustomerStore.setState({ customers: [] });
    useTransactionStore.setState({ transactions: [sale()] });
  });

  it('restocks the returned units and marks a full return refunded', () => {
    const result = commitRefund('TX-1', { p1: 2 }, 'Ada (manager)', 1, 0.05);

    expect(result).not.toBeNull();
    expect(result?.computation.refundAmount).toBe(22);
    expect(useProductStore.getState().products[0].stock).toBe(5);
    expect(useTransactionStore.getState().transactions[0].status).toBe('refunded');
    expect(useTransactionStore.getState().transactions[0].refundAuthorizedBy).toBe('Ada (manager)');
  });

  it('marks a part return partial and refunds the prorated share', () => {
    const result = commitRefund('TX-1', { p1: 1 }, 'Ada (manager)', 1, 0.05);

    expect(result?.computation.refundAmount).toBe(11);
    expect(useProductStore.getState().products[0].stock).toBe(4);
    expect(useTransactionStore.getState().transactions[0].status).toBe('partial');
  });

  it('returns null and writes nothing when the selection refunds nothing', () => {
    const result = commitRefund('TX-1', { p1: 0 }, 'Ada (manager)', 1, 0.05);

    expect(result).toBeNull();
    expect(useProductStore.getState().products[0].stock).toBe(3);
    expect(useTransactionStore.getState().transactions[0].status).toBe('completed');
    expect(syncToCloudIfEnabled).not.toHaveBeenCalled();
  });

  it('returns null for an unknown transaction', () => {
    expect(commitRefund('TX-nope', { p1: 1 }, 'Ada', 1, 0.05)).toBeNull();
    expect(syncToCloudIfEnabled).not.toHaveBeenCalled();
  });

  it('computes against the STORE copy, not a stale caller snapshot', () => {
    // The screen still holds the pre-refund sale, but another terminal has
    // already returned one unit. Refunding "2" must clamp to the 1 that is
    // actually left rather than paying out twice.
    useTransactionStore.setState({
      transactions: [
        sale({
          status: 'partial',
          refundedItems: [{ productId: 'p1', quantity: 1 }],
          refundedAmount: 11,
        }),
      ],
    });

    const result = commitRefund('TX-1', { p1: 2 }, 'Ada (manager)', 1, 0.05);

    expect(result?.computation.appliedItems).toEqual({ p1: 1 });
    expect(result?.computation.refundAmount).toBe(11);
    expect(useTransactionStore.getState().transactions[0].status).toBe('refunded');
  });

  it('reverses loyalty points proportionally and pushes the customer', () => {
    useCustomerStore.setState({ customers: [customer()] });
    useTransactionStore.setState({
      transactions: [sale({ customerId: 'c1', customerName: 'Grace', pointsEarned: 22 })],
    });

    const result = commitRefund('TX-1', { p1: 1 }, 'Ada (manager)', 1, 0.05);

    expect(result?.computation.pointsReversal).toBe(-11);
    expect(useCustomerStore.getState().customers[0].points).toBe(11);
    expect(result?.updatedCustomer?.points).toBe(11);
  });

  it('moves no points on a walk-in sale with no linked customer', () => {
    const result = commitRefund('TX-1', { p1: 2 }, 'Ada (manager)', 1, 0.05);

    expect(result?.computation.pointsReversal).toBe(0);
    expect(result?.updatedCustomer).toBeNull();
  });

  it('still records the refund when the product was deleted since the sale', () => {
    useProductStore.setState({ products: [] });

    const result = commitRefund('TX-1', { p1: 2 }, 'Ada (manager)', 1, 0.05);

    expect(result).not.toBeNull();
    expect(result?.updatedProducts).toEqual([]);
    expect(useTransactionStore.getState().transactions[0].status).toBe('refunded');
  });

  it('pushes the refunded transaction carrying its new status', () => {
    commitRefund('TX-1', { p1: 2 }, 'Ada (manager)', 1, 0.05);

    expect(syncToCloudIfEnabled).toHaveBeenCalledTimes(1);
    const [products, , , transactions] = syncToCloudIfEnabled.mock.calls[0];
    expect(products).toEqual([expect.objectContaining({ id: 'p1', stock: 5 })]);
    expect(transactions[0]).toEqual(
      expect.objectContaining({
        id: 'TX-1',
        status: 'refunded',
        refundAuthorizedBy: 'Ada (manager)',
      }),
    );
  });
});
