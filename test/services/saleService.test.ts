import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CheckoutRequest } from '../../src/lib/checkout';
import type { Product, StoreSettings, UserAccount } from '../../src/types';

// The cloud push is queued and sent out of band; stub it so these stay local
// and synchronous. The spy doubles as the assertion that a sale pushes exactly
// the rows it changed — and, on a refusal, that it pushes nothing at all.
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

// 2 x $10 with 10% tax: subtotal 20, tax 2, total 22.
function request(over: Partial<CheckoutRequest> = {}): CheckoutRequest {
  return {
    cartItems: [{ productId: 'p1', productName: 'Latte', price: 10, cost: 3, quantity: 2 }],
    discountType: 'none',
    discountValue: 0,
    paymentMethod: 'card',
    splitMode: false,
    splitPayments: [],
    cashPaidText: '',
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

  it('refuses the sale when the catalogue is short, rather than clamping to zero', () => {
    useProductStore.setState({ products: [product({ stock: 1 })] });

    const result = commitSale(request());

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('insufficient-stock');
    expect(result.shortfalls).toEqual([
      { productId: 'p1', productName: 'Latte', requested: 2, available: 1 },
    ]);
    // Nothing moved: the sale did not happen.
    expect(useProductStore.getState().products[0].stock).toBe(1);
    expect(useTransactionStore.getState().transactions).toEqual([]);
    expect(syncToCloudIfEnabled).not.toHaveBeenCalled();
  });

  it('refuses a line whose product was deleted mid-sale', () => {
    useProductStore.setState({ products: [] });

    const result = commitSale(request());

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('product-unavailable');
    expect(result.shortfalls).toEqual([
      { productId: 'p1', productName: 'Latte', requested: 2, available: 0 },
    ]);
    expect(useTransactionStore.getState().transactions).toEqual([]);
    expect(syncToCloudIfEnabled).not.toHaveBeenCalled();
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
    useProductStore.setState({ products: [product({ stock: 4 })] });
    const cash = commitSale(request({ paymentMethod: 'cash', cashPaidText: '25' }));
    expect(cash.success && cash.sale.isCashSale).toBe(true);

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

// Stock is the one figure the cart cannot be trusted about. It caps each line
// against the number read when the item went in, and that number is a snapshot:
// a second till, a stock correction or a delete can land at any point while the
// sale sits open on this screen.
describe('commitSale — live stock is the authority', () => {
  beforeEach(() => {
    syncToCloudIfEnabled.mockClear();
    useProductStore.setState({ products: [product()], categories: [] });
    useCustomerStore.setState({ customers: [] });
    useTransactionStore.setState({ transactions: [] });
  });

  it('refuses a sale whose stock another terminal consumed after the cart was built', () => {
    // The operator added 2 while 5 were on hand; realtime sync then brings the
    // catalogue down to 1 before they take payment.
    useProductStore.setState({ products: [product({ stock: 1 })] });

    const result = commitSale(request());

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('insufficient-stock');
  });

  it('lets the second of two concurrent sales fail rather than overselling', () => {
    useProductStore.setState({ products: [product({ stock: 3 })] });

    const first = commitSale(request()); // takes 2 of 3
    const second = commitSale(request()); // wants 2, only 1 left

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    if (second.success) return;
    expect(second.error).toBe('insufficient-stock');
    expect(second.shortfalls?.[0]).toMatchObject({ requested: 2, available: 1 });
    // Exactly one sale was recorded and stock reflects only that one.
    expect(useTransactionStore.getState().transactions).toHaveLength(1);
    expect(useProductStore.getState().products[0].stock).toBe(1);
  });

  it('refuses a product that is already out of stock', () => {
    useProductStore.setState({ products: [product({ stock: 0 })] });

    const result = commitSale(
      request({
        cartItems: [{ productId: 'p1', productName: 'Latte', price: 10, cost: 3, quantity: 1 }],
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('insufficient-stock');
    expect(result.shortfalls).toEqual([
      { productId: 'p1', productName: 'Latte', requested: 1, available: 0 },
    ]);
  });

  it('sells exactly the last unit without refusing it', () => {
    useProductStore.setState({ products: [product({ stock: 2 })] });

    const result = commitSale(request());

    expect(result.success).toBe(true);
    expect(useProductStore.getState().products[0].stock).toBe(0);
  });

  it('writes nothing at all when a later line is the short one', () => {
    useProductStore.setState({
      products: [product({ id: 'p1', stock: 5 }), product({ id: 'p2', name: 'Bun', stock: 0 })],
    });

    const result = commitSale(
      request({
        cartItems: [
          { productId: 'p1', productName: 'Latte', price: 10, cost: 3, quantity: 2 },
          { productId: 'p2', productName: 'Bun', price: 4, cost: 1, quantity: 1 },
        ],
      }),
    );

    expect(result.success).toBe(false);
    // The first line must not have been decremented on the way to discovering
    // the second could not be filled.
    expect(useProductStore.getState().products[0].stock).toBe(5);
    expect(useTransactionStore.getState().transactions).toEqual([]);
  });

  it('reports every short line, not just the first', () => {
    useProductStore.setState({
      products: [product({ id: 'p1', stock: 1 }), product({ id: 'p2', name: 'Bun', stock: 0 })],
    });

    const result = commitSale(
      request({
        cartItems: [
          { productId: 'p1', productName: 'Latte', price: 10, cost: 3, quantity: 2 },
          { productId: 'p2', productName: 'Bun', price: 4, cost: 1, quantity: 3 },
        ],
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.shortfalls).toHaveLength(2);
  });

  it('reports a deleted product ahead of a merely short one', () => {
    // Two different fixes: a short line can be reduced, a vanished one has to
    // be removed. The operator is told about the one that blocks them.
    useProductStore.setState({ products: [product({ id: 'p1', stock: 1 })] });

    const result = commitSale(
      request({
        cartItems: [
          { productId: 'p1', productName: 'Latte', price: 10, cost: 3, quantity: 2 },
          { productId: 'gone', productName: 'Ghost', price: 4, cost: 1, quantity: 1 },
        ],
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('product-unavailable');
  });

  it('sums repeated lines for one product rather than checking each alone', () => {
    // Two lines of 3 against 4 in stock is one sale of 6, not two sales of 3.
    useProductStore.setState({ products: [product({ stock: 4 })] });

    const result = commitSale(
      request({
        cartItems: [
          { productId: 'p1', productName: 'Latte', price: 10, cost: 3, quantity: 3 },
          { productId: 'p1', productName: 'Latte', price: 10, cost: 3, quantity: 3 },
        ],
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.shortfalls).toEqual([
      { productId: 'p1', productName: 'Latte', requested: 6, available: 4 },
    ]);
  });

  it('decrements a repeated product once, by the total', () => {
    useProductStore.setState({ products: [product({ stock: 10 })] });

    const result = commitSale(
      request({
        cartItems: [
          { productId: 'p1', productName: 'Latte', price: 10, cost: 3, quantity: 3 },
          { productId: 'p1', productName: 'Latte', price: 10, cost: 3, quantity: 2 },
        ],
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(useProductStore.getState().products[0].stock).toBe(5);
    // One row pushed for the product, carrying the combined decrement — not two
    // rows where the second would overwrite the first in the cloud.
    expect(result.sale.updatedProducts).toEqual([expect.objectContaining({ id: 'p1', stock: 5 })]);
  });

  it('leaves loyalty points untouched when the sale is refused', () => {
    useCustomerStore.setState({
      customers: [
        { id: 'c1', name: 'Grace', email: '', phone: '', points: 10, createdAt: '2026-01-01' },
      ],
    });
    useProductStore.setState({ products: [product({ stock: 0 })] });

    const result = commitSale(request({ selectedCustomerId: 'c1', activeCustomerName: 'Grace' }));

    expect(result.success).toBe(false);
    expect(useCustomerStore.getState().customers[0].points).toBe(10);
  });
});
