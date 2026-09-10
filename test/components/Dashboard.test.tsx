import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../../src/components/Dashboard';
import { useTransactionStore } from '../../src/stores/transactionStore';
import { useProductStore } from '../../src/stores/productStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useSupplyStore } from '../../src/stores/supplyStore';
import type {
  Category,
  Product,
  PurchaseOrder,
  SaleTransaction,
  StoreSettings,
} from '../../src/types';

// The dashboard's arithmetic is covered in lib/dashboardMetrics and lib/poReport,
// but nothing exercised the screen that presents it — which numbers reach which
// card, what the range picker changes, or what is shown when a period is empty.
// These went in before the screen was split into components/dashboard/.

const SETTINGS: StoreSettings = {
  storeName: 'Test Store',
  storeAddress: '',
  storePhone: '',
  taxRate: 0,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};

const PRODUCT: Product = {
  id: 'p-1',
  name: 'Latte',
  price: 10,
  cost: 4,
  category: 'c-1',
  sku: 'LAT',
  stock: 10,
  minStock: 2,
  image: '',
};

// At or below minStock and still sellable: the one condition the stock KPI counts.
const LOW_STOCK: Product = { ...PRODUCT, id: 'p-2', name: 'Mug', stock: 1, minStock: 2 };

const CATEGORY: Category = { id: 'c-1', name: 'Drinks', color: 'emerald' };

const at = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
};

const sale = (over: Partial<SaleTransaction> = {}): SaleTransaction => ({
  id: 'TX-1',
  date: at(0),
  items: [{ productId: 'p-1', productName: 'Latte', price: 10, cost: 4, quantity: 2, total: 20 }],
  subtotal: 20,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 0,
  total: 20,
  paymentMethod: 'card',
  customerId: null,
  status: 'completed',
  operatorName: 'Dana',
  ...over,
});

const po = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: 'PO-1',
  supplierId: 's-1',
  supplierName: 'Bean Co',
  status: 'received',
  lines: [{ productId: 'p-1', productName: 'Latte', quantity: 10, unitCost: 4 }],
  createdAt: at(1),
  receivedAt: at(1),
  ...over,
});

beforeEach(() => {
  useTransactionStore.setState({ transactions: [sale()] });
  useProductStore.setState({ products: [PRODUCT, LOW_STOCK], categories: [CATEGORY] });
  useSettingsStore.setState({ settings: SETTINGS, darkMode: false });
  useSupplyStore.setState({ purchaseOrders: [po()] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const kpiRow = () => document.getElementById('kpi-row') as HTMLElement;

// The headline figure of each card, in card order.
const kpiFigures = () =>
  within(kpiRow())
    .getAllByRole('heading')
    .map((h) => h.textContent);

describe('Dashboard — KPI cards', () => {
  it("reports today's revenue, profit and order count in the store currency", () => {
    render(<Dashboard />);

    // Revenue, profit, orders, low stock — the four cards, in order.
    expect(kpiFigures()).toEqual(['$20.00', '$12.00', '1', '1']);
  });

  it('counts only stock at or below its minimum', async () => {
    render(<Dashboard />);
    expect(within(kpiRow()).getByText(/Action Needed/i)).toBeTruthy();

    useProductStore.setState({ products: [PRODUCT] });
    await waitFor(() => expect(within(kpiRow()).getByText(/All Good/i)).toBeTruthy());
  });

  it("flags today against the shop's daily average", async () => {
    // Yesterday took $100, so today's $20 is below the two-day average.
    useTransactionStore.setState({
      transactions: [sale(), sale({ id: 'TX-0', date: at(1), total: 100, subtotal: 100 })],
    });
    render(<Dashboard />);
    expect(within(kpiRow()).getByText(/Below Avg/i)).toBeTruthy();
  });
});

describe('Dashboard — range picker', () => {
  it('narrows the reported period and marks the active range', async () => {
    const user = userEvent.setup();
    // One sale today, one twelve days back: inside 30d, outside 7d.
    useTransactionStore.setState({
      transactions: [sale(), sale({ id: 'TX-OLD', date: at(12) })],
    });
    render(<Dashboard />);

    const today = screen.getByRole('button', { name: /^Today$/i });
    await user.click(today);
    expect(today.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^30 Days$/i }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('disables CSV export when the range holds no sales', async () => {
    const user = userEvent.setup();
    useTransactionStore.setState({ transactions: [sale({ date: at(12) })] });
    render(<Dashboard />);

    const exportBtn = document.getElementById('dashboard-export-btn') as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(true); // default range is 7d; the sale is older

    await user.click(screen.getByRole('button', { name: /^30 Days$/i }));
    await waitFor(() => expect(exportBtn.disabled).toBe(false));
  });
});

describe('Dashboard — breakdown panels', () => {
  it('shows each payment method with its share of the total', () => {
    render(<Dashboard />);
    // The whole $20 went through card, so card is 100% and cash is 0%.
    expect(screen.getByText('100.0% of total')).toBeTruthy();
    expect(screen.getAllByText('0.0% of total')).toHaveLength(3);
  });

  it('lists operators with what they took', () => {
    render(<Dashboard />);
    const operators = screen.getByText(/Sales by Operator/i).closest('div')
      ?.parentElement as HTMLElement;
    expect(within(operators).getByText('Dana')).toBeTruthy();
  });

  it('summarises purchase orders and their suppliers', () => {
    render(<Dashboard />);
    expect(screen.getByText('Bean Co')).toBeTruthy();
    // $40 of stock received: the KPI and the supplier row both carry it.
    expect(screen.getAllByText('$40.00').length).toBe(2);
  });

  it('says so when a period holds nothing to report', () => {
    useTransactionStore.setState({ transactions: [] });
    useSupplyStore.setState({ purchaseOrders: [] });
    render(<Dashboard />);

    expect(screen.getAllByText(/NO SALES TO PLOT/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/No purchase orders in this period/i)).toBeTruthy();
  });
});

describe('Dashboard — the day rolling over', () => {
  it("re-reads today's date on a tick, so a terminal left running past midnight moves on", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const realToDateString = Date.prototype.toDateString;
    render(<Dashboard />);

    expect(kpiFigures()[0]).toBe('$20.00');

    // The sale keeps its own date; only "today" moves forward a day.
    const shifted = new Date();
    shifted.setDate(shifted.getDate() + 1);
    vi.spyOn(Date.prototype, 'toDateString').mockImplementation(function (this: Date) {
      return realToDateString.call(this.getTime() === Date.now() ? shifted : this);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });

    // Yesterday's sale no longer counts toward today.
    await waitFor(() => expect(kpiFigures().slice(0, 3)).toEqual(['$0.00', '$0.00', '0']));
  });
});
