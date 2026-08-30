import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Register from '../../src/components/Register';
import { useProductStore } from '../../src/stores/productStore';
import { useCustomerStore } from '../../src/stores/customerStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useTransactionStore } from '../../src/stores/transactionStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useHeldOrderStore } from '../../src/stores/heldOrderStore';
import { useShiftStore } from '../../src/stores/shiftStore';
import { Product, Customer, StoreSettings, PrinterConfig } from '../../src/types';
import { askText } from '../../src/lib/utils/ui';

vi.mock('../../src/lib/utils/ui', () => ({
  askText: vi.fn(),
  askConfirmation: vi.fn(),
}));

// Checkout is the highest-consequence flow in the app and had no component
// coverage: the pure helpers (pricing, checkout, payments) are well tested, but
// nothing exercised the wiring that decrements stock, awards points and writes
// the transaction.

const product = (over: Partial<Product> & { id: string }): Product => ({
  name: 'Latte',
  price: 4.0,
  cost: 1.0,
  category: 'cat-1',
  sku: `SKU-${over.id}`,
  stock: 10,
  minStock: 2,
  image: '',
  ...over,
});

const SETTINGS: StoreSettings = {
  storeName: 'Test Store',
  storeAddress: '',
  storePhone: '',
  taxRate: 10,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};

// autoPrint off keeps the print path out of these tests — jsdom has no
// window.open, and printing is covered by its own unit tests.
const PRINTER: PrinterConfig = {
  type: 'system',
  paperSize: '80mm',
  showBarcode: false,
  footerMessage: '',
  autoPrintOnCheckout: false,
  kitchenTicketOnCheckout: false,
};

const CUSTOMER: Customer = {
  id: 'c-1',
  name: 'Sarah',
  email: 's@x.com',
  phone: '',
  points: 100,
  createdAt: '2026-01-01',
};

beforeEach(() => {
  useProductStore.setState({
    products: [
      product({ id: 'p-1' }),
      product({ id: 'p-2', name: 'Muffin', price: 2.0, stock: 1 }),
    ],
    categories: [{ id: 'cat-1', name: 'Drinks', color: '' }],
  });
  useCustomerStore.setState({ customers: [CUSTOMER] });
  useSettingsStore.setState({ settings: SETTINGS, printerConfig: PRINTER });
  useTransactionStore.setState({ transactions: [] });
  useAuthStore.setState({
    currentUser: { id: 'u-1', name: 'Ann', role: 'admin', pin: '', active: true, createdAt: '' },
  });
  useHeldOrderStore.setState({ heldOrders: [] });
  useShiftStore.setState({ shifts: [], currentShiftId: 'shift-1' });
  vi.mocked(askText).mockResolvedValue('Table 4');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Scoped to the catalog: once an item is in the cart its qty buttons carry the
// product name too, so an unscoped query matches several elements.
const addToCart = async (name: string) => {
  const grid = document.querySelector('#products-grid') as HTMLElement;
  await userEvent.setup().click(within(grid).getByRole('button', { name: new RegExp(name) }));
};

const cart = () => document.querySelector('#cart-section') as HTMLElement;

const checkout = async () => {
  const user = userEvent.setup();
  await user.click(within(cart()).getByRole('button', { name: /Checkout/i }));
  await waitFor(() => expect(document.querySelector('#payment-modal')).toBeTruthy());
};

const complete = async () => {
  await userEvent.setup().click(screen.getByRole('button', { name: /Complete Order/i }));
};

describe('Register — building the cart', () => {
  it('adds a product and shows the taxed total', async () => {
    render(<Register />);
    await addToCart('Latte');
    // 4.00 + 10% tax = 4.40
    await waitFor(() => expect(within(cart()).getByText('$4.40')).toBeInTheDocument());
  });

  it('will not add more units than there is stock', async () => {
    render(<Register />);
    await addToCart('Muffin'); // stock: 1
    await addToCart('Muffin');
    await addToCart('Muffin');
    // Quantity is pinned at the stock level rather than climbing past it.
    await waitFor(() => expect(within(cart()).getByText('$2.20')).toBeInTheDocument());
  });

  it('leaves an out-of-stock product unaddable', async () => {
    useProductStore.setState({
      products: [product({ id: 'p-3', name: 'Gone', stock: 0 })],
      categories: [{ id: 'cat-1', name: 'Drinks', color: '' }],
    });
    render(<Register />);
    await addToCart('Gone');
    expect(within(cart()).getByText(/cart is empty/i)).toBeInTheDocument();
  });
});

describe('Register — completing a sale', () => {
  it('writes the transaction and decrements live stock', async () => {
    render(<Register />);
    await addToCart('Latte');
    await checkout();
    await complete();

    await waitFor(() => expect(useTransactionStore.getState().transactions).toHaveLength(1));
    const tx = useTransactionStore.getState().transactions[0];
    expect(tx.total).toBe(4.4);
    expect(tx.items[0].productName).toBe('Latte');
    expect(tx.operatorName).toBe('Ann');
    expect(tx.shiftId).toBe('shift-1');
    // Stock came off the live catalog, not the cart's snapshot.
    expect(useProductStore.getState().products.find((p) => p.id === 'p-1')!.stock).toBe(9);
  });

  it('clears the cart afterwards so the next sale starts clean', async () => {
    render(<Register />);
    await addToCart('Latte');
    await checkout();
    await complete();
    await waitFor(() => expect(within(cart()).getByText(/cart is empty/i)).toBeInTheDocument());
  });

  it('blocks a cash sale that is not covered by the tendered amount', async () => {
    const user = userEvent.setup();
    render(<Register />);
    await addToCart('Latte');
    await checkout();
    await user.click(document.querySelector('#pay-method-cash') as HTMLElement);

    const tendered = document.querySelector<HTMLInputElement>(
      '#payment-modal input[type="number"]',
    );
    await user.type(tendered!, '2');

    // The button is disabled rather than accepting an underpayment.
    expect(screen.getByRole('button', { name: /Complete Order/i })).toBeDisabled();
    expect(useTransactionStore.getState().transactions).toHaveLength(0);
  });

  it('records change due on a cash sale', async () => {
    const user = userEvent.setup();
    render(<Register />);
    await addToCart('Latte');
    await checkout();
    await user.click(document.querySelector('#pay-method-cash') as HTMLElement);
    const tendered = document.querySelector<HTMLInputElement>(
      '#payment-modal input[type="number"]',
    );
    await user.type(tendered!, '10');
    await complete();

    await waitFor(() => expect(useTransactionStore.getState().transactions).toHaveLength(1));
    const tx = useTransactionStore.getState().transactions[0];
    expect(tx.cashPaid).toBe(10);
    expect(tx.cashChange).toBe(5.6); // 10 - 4.40
  });
});

describe('Register — loyalty', () => {
  it('awards points to a linked customer and records the operator', async () => {
    const user = userEvent.setup();
    render(<Register />);
    await addToCart('Latte');
    await user.selectOptions(within(cart()).getByRole('combobox'), 'c-1');
    await checkout();
    await complete();

    await waitFor(() => expect(useTransactionStore.getState().transactions).toHaveLength(1));
    const tx = useTransactionStore.getState().transactions[0];
    // floor(4.40 total * 1 point per unit) = 4
    expect(tx.pointsEarned).toBe(4);
    expect(tx.customerName).toBe('Sarah');
    expect(useCustomerStore.getState().customers[0].points).toBe(104);
  });

  it('awards nothing on a walk-in sale', async () => {
    render(<Register />);
    await addToCart('Latte');
    await checkout();
    await complete();

    await waitFor(() => expect(useTransactionStore.getState().transactions).toHaveLength(1));
    const tx = useTransactionStore.getState().transactions[0];
    expect(tx.pointsEarned).toBeUndefined();
    expect(tx.customerId).toBeNull();
  });
});

describe('Register — held orders', () => {
  it('parks the cart and restores it on resume', async () => {
    const user = userEvent.setup();
    render(<Register />);

    await addToCart('Latte');
    await user.click(document.querySelector('#hold-order-btn') as HTMLElement);

    await waitFor(() => expect(useHeldOrderStore.getState().heldOrders).toHaveLength(1));
    expect(useHeldOrderStore.getState().heldOrders[0].label).toBe('Table 4');
    expect(within(cart()).getByText(/cart is empty/i)).toBeInTheDocument();

    await user.click(document.querySelector('#open-held-orders-btn') as HTMLElement);
    // Scoped to the modal — the cart footer has its own "resume held" button.
    const modal = await waitFor(() => {
      const element = document.querySelector('#held-orders-modal');
      expect(element).toBeInTheDocument();
      return element as HTMLElement;
    });
    await user.click(within(modal).getByRole('button', { name: /Resume/i }));

    // Back in the cart, and off the held list.
    await waitFor(() => expect(within(cart()).getByText('$4.40')).toBeInTheDocument());
    expect(useHeldOrderStore.getState().heldOrders).toHaveLength(0);
  });
});
