import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CheckoutRequest } from '../../src/lib/checkout';
import type { Product, StoreSettings, UserAccount } from '../../src/types';

// The cloud push is best-effort and fire-and-forget; stub it so these stay
// local and synchronous. The spy doubles as the assertion that a sale pushes
// exactly the rows it changed.
const syncToCloudIfEnabled = vi.fn();
vi.mock('../../src/lib/sync', () => ({
  syncToCloudIfEnabled: (...args: unknown[]) => syncToCloudIfEnabled(...args),
  deleteProductsCloudIfEnabled: vi.fn(),
  deleteCategoriesCloudIfEnabled: vi.fn(),
  deleteCustomersCloudIfEnabled: vi.fn(),
  deleteTransactionsCloudIfEnabled: vi.fn(),
}));

import { commitSale } from '../../src/services';
import { useProductStore } from '../../src/stores/productStore';
import { useCustomerStore } from '../../src/stores/customerStore';
import { useTransactionStore } from '../../src/stores/transactionStore';

const settings: StoreSettings = {
  storeName: 'Test Store',
  storeAddress: '1 Test St',
  storePhone: '555',
  taxRate: 10,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};

const operator: UserAccount = {
  id: 'u-1',
  name: 'Ada',
  role: 'cashier',
  pin: 'x',
  active: true,
  createdAt: '2026-01-01',
};

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

function request(over: Partial<CheckoutRequest> = {}): CheckoutRequest {
  return {
    cartItems: [{ productId: 'p1', productName: 'Latte', price: 10, cost: 3, quantity: 2 }],
    subtotal: 20,
    discountType: 'none',
    discountValue: 0,
    discountAmount: 0,
    taxAmount: 2,
    totalAmount: 22,
    paymentMethod: 'card',
    splitMode: false,
    splitPayments: [],
    cashPaidText: '',
    cashChangeDue: 0,
    selectedCustomerId: null,
    activeCustomerName: null,
    currentUser: operator,
    currentShiftId: 'shift-1',
    settings,
    ...over,
  };
}

describe('commitSale', () => {
  beforeEach(() => {
    syncToCloudIfEnabled.mockClear();
    useProductStore.setState({ products: [product()], categories: [] });
    useCustomerStore.setState({ customers: [] });
    useTransactionStore.setState({ transactions: [] });
  });

  it('persists the transaction and decrements stock by the sold quantity', () => {
    const result = commitSale(request());

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(useTransactionStore.getState().transactions).toHaveLength(1);
    expect(useTransactionStore.getState().transactions[0].id).toBe(result.sale.transaction.id);
    expect(useProductStore.getState().products[0].stock).toBe(3);
    expect(result.sale.updatedProducts).toEqual([expect.objectContaining({ id: 'p1', stock: 3 })]);
  });

  it('writes nothing when the tender is refused', () => {
    const result = commitSale(request({ paymentMethod: 'cash', cashPaidText: '5' }));

    expect(result).toEqual({ success: false, error: 'insufficient-cash' });
    expect(useTransactionStore.getState().transactions).toEqual([]);
    expect(useProductStore.getState().products[0].stock).toBe(5);
    expect(syncToCloudIfEnabled).not.toHaveBeenCalled();
  });

  it('rejects a non-integer line quantity before touching stock', () => {
    const result = commitSale(
      request({
        cartItems: [{ productId: 'p1', productName: 'Latte', price: 10, cost: 3, quantity: 1.5 }],
      }),
    );

    expect(result).toEqual({ success: false, error: 'invalid-quantity' });
    expect(useProductStore.getState().products[0].stock).toBe(5);
  });

  it('decrements the LIVE product, not the cart snapshot', () => {
    // A price edit lands while the sale is open. The cart still holds the old
    // copy; the write-back must not resurrect it.
    useProductStore.setState({ products: [product({ price: 99, name: 'Latte (renamed)' })] });

    const result = commitSale(request());

    expect(result.success).toBe(true);
    const saved = useProductStore.getState().products[0];
    expect(saved.price).toBe(99);
    expect(saved.name).toBe('Latte (renamed)');
    expect(saved.stock).toBe(3);
  });

  it('never drives stock below zero when the catalogue is already short', () => {
    useProductStore.setState({ products: [product({ stock: 1 })] });

    commitSale(request());

    expect(useProductStore.getState().products[0].stock).toBe(0);
  });

  it('skips a line whose product was deleted mid-sale', () => {
    useProductStore.setState({ products: [] });

    const result = commitSale(request());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.sale.updatedProducts).toEqual([]);
    expect(useTransactionStore.getState().transactions).toHaveLength(1);
  });

  it('awards loyalty points and pushes the updated customer', () => {
    useCustomerStore.setState({
      customers: [
        { id: 'c1', name: 'Grace', email: '', phone: '', points: 10, createdAt: '2026-01-01' },
      ],
    });

    const result = commitSale(request({ selectedCustomerId: 'c1', activeCustomerName: 'Grace' }));

    expect(result.success).toBe(true);
    if (!result.success) return;
    // 22 total x rate 1 = 22 points earned on top of the existing 10.
    expect(useCustomerStore.getState().customers[0].points).toBe(32);
    expect(result.sale.updatedCustomer?.points).toBe(32);
  });

  it('pushes exactly the rows it changed', () => {
    commitSale(request());

    expect(syncToCloudIfEnabled).toHaveBeenCalledTimes(1);
    const [products, categories, customers, transactions] = syncToCloudIfEnabled.mock.calls[0];
    expect(products).toEqual([expect.objectContaining({ id: 'p1', stock: 3 })]);
    expect(categories).toBeUndefined();
    expect(customers).toBeUndefined();
    expect(transactions).toHaveLength(1);
  });

  it('reports a cash sale so the caller can kick the drawer', () => {
    const cash = commitSale(request({ paymentMethod: 'cash', cashPaidText: '25' }));
    expect(cash.success && cash.sale.isCashSale).toBe(true);

    useProductStore.setState({ products: [product()] });
    const card = commitSale(request());
    expect(card.success && card.sale.isCashSale).toBe(false);
  });

  it('treats a split sale containing cash as a cash sale', () => {
    const result = commitSale(
      request({
        splitMode: true,
        splitPayments: [
          { method: 'card', amount: 12 },
          { method: 'cash', amount: 10 },
        ],
      }),
    );

    expect(result.success && result.sale.isCashSale).toBe(true);
  });
});
