import { beforeEach, describe, expect, it } from 'vitest';
import { settleTab } from './tabService';
import { useTabStore } from '../stores/tabStore';
import { useProductStore } from '../stores/productStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useCustomerStore } from '../stores/customerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useTableStore } from '../stores/tableStore';
import { tabTotal } from '../lib/tabs';
import type { Customer, HeldOrderItem, Product, StoreSettings } from '../types';

/**
 * Settlement drives the real stores, deliberately. The point of routing a tab
 * through commitSale is that stock, loyalty, the transaction record and the
 * cloud push behave exactly as they do for a walk-in sale — and a test that
 * mocked commitSale would assert that the wiring compiles rather than that the
 * behaviour holds.
 */

const SETTINGS: StoreSettings = {
  storeName: 'Test',
  storeAddress: '',
  storePhone: '',
  taxRate: 0,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Coffee',
  price: 3,
  cost: 1,
  category: 'c1',
  sku: 'COF',
  stock: 100,
  minStock: 0,
  image: '',
  ...overrides,
});

const item = (overrides: Partial<HeldOrderItem> = {}): HeldOrderItem => ({
  productId: 'p1',
  productName: 'Coffee',
  price: 3,
  cost: 1,
  quantity: 1,
  ...overrides,
});

const customer = (overrides: Partial<Customer> = {}): Customer => ({
  id: 'c1',
  name: 'Ada',
  email: '',
  phone: '',
  points: 0,
  createdAt: '2026-01-01',
  ...overrides,
});

function request(tabId: string, overrides = {}) {
  return {
    tabId,
    discountType: 'none' as const,
    discountValue: 0,
    paymentMethod: 'cash' as const,
    splitMode: false,
    splitPayments: [],
    cashPaidText: '1000',
    currentUser: null,
    currentShiftId: 'shift-1',
    settings: SETTINGS,
    ...overrides,
  };
}

beforeEach(() => {
  useTabStore.setState({ tabs: [] });
  useProductStore.setState({ products: [product()], categories: [] });
  useTransactionStore.setState({ transactions: [] });
  useCustomerStore.setState({ customers: [customer()] });
  useTableStore.setState({ tables: [], selectedTableId: null });
  useSettingsStore.setState({
    settings: SETTINGS,
    supabaseConfig: { ...useSettingsStore.getState().supabaseConfig, enabled: false },
  });
});

/** Opens a tab with the given rounds already on it. */
function tabWith(rounds: HeldOrderItem[][], overrides = {}) {
  const store = useTabStore.getState();
  const tab = store.openTab({ label: 'Table 4', openedBy: 'Ada', ...overrides });
  for (const items of rounds) useTabStore.getState().addRound(tab.id, items, 'Ada');
  return useTabStore.getState().tabs.find((t) => t.id === tab.id)!;
}

describe('the tab store', () => {
  it('opens an empty tab', () => {
    const tab = useTabStore.getState().openTab({ label: 'Bar 1' });
    expect(tab.status).toBe('open');
    expect(tab.rounds).toEqual([]);
  });

  it('appends rounds in order', () => {
    const tab = tabWith([[item({ quantity: 1 })], [item({ quantity: 2 })]]);
    expect(tab.rounds).toHaveLength(2);
    expect(tab.rounds[0].items[0].quantity).toBe(1);
  });

  // An empty round would put a timestamped "nothing was ordered" entry on the
  // bill and fire an empty kitchen ticket behind it.
  it('refuses an empty round', () => {
    const tab = useTabStore.getState().openTab({ label: 'Bar 1' });
    expect(useTabStore.getState().addRound(tab.id, [])).toBeNull();
  });

  it('refuses a round against a tab that does not exist', () => {
    expect(useTabStore.getState().addRound('nope', [item()])).toBeNull();
  });

  // A settled tab is terminal: appending would add items to a bill that has
  // already been paid, and the sale it became would never know.
  it('refuses a round against a settled tab', () => {
    const tab = tabWith([[item()]]);
    useTabStore.getState().settleTab(tab.id, 'TX-1');
    expect(useTabStore.getState().addRound(tab.id, [item()])).toBeNull();
  });

  it('removes a round rung up in error', () => {
    const tab = tabWith([[item()], [item({ productId: 'p2' })]]);
    const updated = useTabStore.getState().removeRound(tab.id, tab.rounds[0].id);
    expect(updated?.rounds).toHaveLength(1);
    expect(updated?.rounds[0].items[0].productId).toBe('p2');
  });

  it('links a customer to an open tab', () => {
    const tab = tabWith([[item()]]);
    useTabStore.getState().setTabCustomer(tab.id, 'c1', 'Ada');
    expect(useTabStore.getState().tabs[0].customerId).toBe('c1');
  });
});

describe('settleTab', () => {
  it('turns the rounds into one sale', () => {
    const tab = tabWith([[item({ quantity: 2 })], [item({ quantity: 1 })]]);
    const result = settleTab(request(tab.id));
    expect(result.success).toBe(true);
    if (!result.success) return;

    const transactions = useTransactionStore.getState().transactions;
    expect(transactions).toHaveLength(1);
    // Three coffees across two rounds settle as one line of three.
    expect(transactions[0].items).toHaveLength(1);
    expect(transactions[0].items[0].quantity).toBe(3);
    expect(transactions[0].total).toBe(9);
  });

  it('settles at the total the tab was quoting', () => {
    const tab = tabWith([[item({ quantity: 2 })]]);
    const quoted = tabTotal(tab, SETTINGS);
    const result = settleTab(request(tab.id));
    expect(result.success && result.sale.transaction.total).toBe(quoted);
  });

  // Stock moves through commitSale, not a parallel path, so a tab cannot become
  // a second and subtly different way of selling things.
  it('takes stock at settlement, not as rounds are added', () => {
    const tab = tabWith([[item({ quantity: 4 })]]);
    expect(useProductStore.getState().products[0].stock).toBe(100);
    settleTab(request(tab.id));
    expect(useProductStore.getState().products[0].stock).toBe(96);
  });

  it('refuses when the catalogue can no longer cover the tab', () => {
    const tab = tabWith([[item({ quantity: 5 })]]);
    useProductStore.setState({ products: [product({ stock: 2 })], categories: [] });
    const result = settleTab(request(tab.id));
    expect(result).toMatchObject({ success: false, error: 'insufficient-stock' });
  });

  // Marking first would leave a refused sale against a tab nobody can reopen,
  // with the bill gone and no money taken.
  it('leaves the tab open when the sale is refused', () => {
    const tab = tabWith([[item({ quantity: 5 })]]);
    useProductStore.setState({ products: [product({ stock: 2 })], categories: [] });
    settleTab(request(tab.id));
    expect(useTabStore.getState().tabs[0].status).toBe('open');
    expect(useTransactionStore.getState().transactions).toHaveLength(0);
  });

  it('leaves the tab open when the tender is refused', () => {
    const tab = tabWith([[item({ quantity: 1 })]]);
    settleTab(request(tab.id, { cashPaidText: '0.01' }));
    expect(useTabStore.getState().tabs[0].status).toBe('open');
  });

  it('marks the tab settled against the sale it became', () => {
    const tab = tabWith([[item()]]);
    const result = settleTab(request(tab.id));
    expect(result.success).toBe(true);
    if (!result.success) return;
    const settled = useTabStore.getState().tabs[0];
    expect(settled.status).toBe('settled');
    expect(settled.settledSaleId).toBe(result.sale.transaction.id);
    expect(settled.settledAt).toBeTruthy();
  });

  it('refuses a tab that is already settled', () => {
    const tab = tabWith([[item()]]);
    settleTab(request(tab.id));
    expect(settleTab(request(tab.id))).toEqual({ success: false, error: 'already-settled' });
  });

  it('refuses a tab that does not exist', () => {
    expect(settleTab(request('nope'))).toEqual({ success: false, error: 'unknown-tab' });
  });

  // Settling one would write a zero-value sale into the day's history and the
  // Z-report.
  it('refuses a tab nobody ordered against', () => {
    const tab = useTabStore.getState().openTab({ label: 'Bar 1' });
    expect(settleTab(request(tab.id))).toEqual({ success: false, error: 'empty-tab' });
  });

  it('awards loyalty points to the tab’s linked customer', () => {
    const tab = tabWith([[item({ quantity: 10 })]], { customerId: 'c1', customerName: 'Ada' });
    const result = settleTab(request(tab.id));
    expect(result.success).toBe(true);
    // 30 spent at 1 point per unit of currency.
    expect(useCustomerStore.getState().customers[0].points).toBe(30);
    expect(useTransactionStore.getState().transactions[0].customerId).toBe('c1');
  });

  it('applies a discount agreed at settlement', () => {
    const tab = tabWith([[item({ quantity: 10 })]]);
    const result = settleTab(request(tab.id, { discountType: 'percentage', discountValue: 10 }));
    expect(result.success && result.sale.transaction.total).toBe(27);
  });

  // A table still showing "occupied" after its bill was settled is the kind of
  // thing nobody notices until the next party is turned away from an empty one.
  it('releases the table the tab belonged to', () => {
    useTableStore.setState({
      tables: [{ id: 'tbl-4', name: 'Table 4', seats: 4, status: 'occupied' }],
      selectedTableId: null,
    });
    const tab = tabWith([[item()]], { tableId: 'tbl-4' });
    settleTab(request(tab.id));
    expect(useTableStore.getState().tables[0].status).toBe('available');
  });

  it('does not touch tables when the tab was not a table’s', () => {
    useTableStore.setState({
      tables: [{ id: 'tbl-4', name: 'Table 4', seats: 4, status: 'occupied' }],
      selectedTableId: null,
    });
    const tab = tabWith([[item()]]);
    settleTab(request(tab.id));
    expect(useTableStore.getState().tables[0].status).toBe('occupied');
  });

  it('prices the sale from the tab’s snapshots, not today’s catalogue', () => {
    const tab = tabWith([[item({ price: 3, quantity: 2 })]]);
    // The shop raises the price mid-service; the customer was quoted 3.
    useProductStore.setState({ products: [product({ price: 99 })], categories: [] });
    const result = settleTab(request(tab.id));
    expect(result.success && result.sale.transaction.total).toBe(6);
  });
});
