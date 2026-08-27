import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import History from '../../src/components/History';
import { useProductStore } from '../../src/stores/productStore';
import { useCustomerStore } from '../../src/stores/customerStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useTransactionStore } from '../../src/stores/transactionStore';
import { useAuthStore } from '../../src/stores/authStore';
import { usePinAttemptStore } from '../../src/stores/pinAttemptStore';
import { hashPinSaltedLegacySync } from '../../src/lib/hash';
import { recordFailure, FREE_ATTEMPTS } from '../../src/lib/pinThrottle';
import {
  SaleTransaction,
  StoreSettings,
  PrinterConfig,
  Product,
  UserAccount,
} from '../../src/types';

// Refunds move money and stock and need a manager's authority. The pure
// computation (lib/refunds) is well covered, but nothing exercised the screen
// that applies it — the stock restore, the points reversal, or the override
// gate that lets a cashier refund at all.

const SETTINGS: StoreSettings = {
  storeName: 'Test Store',
  storeAddress: '',
  storePhone: '',
  taxRate: 0,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};

const PRINTER: PrinterConfig = {
  type: 'system',
  paperSize: '80mm',
  showBarcode: false,
  footerMessage: '',
  autoPrintOnCheckout: false,
};

const PRODUCT: Product = {
  id: 'p-1',
  name: 'Latte',
  price: 5,
  cost: 1,
  category: 'c',
  sku: 'S1',
  stock: 10,
  minStock: 1,
  image: '',
};

// Two units at $5, no tax: a $10 sale that can be refunded whole or by the unit.
const SALE: SaleTransaction = {
  id: 'TX-1',
  date: new Date().toISOString(),
  items: [{ productId: 'p-1', productName: 'Latte', price: 5, cost: 1, quantity: 2, total: 10 }],
  subtotal: 10,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 0,
  total: 10,
  paymentMethod: 'cash',
  customerId: 'c-1',
  customerName: 'Sarah',
  pointsEarned: 10,
  status: 'completed',
};

const staff = (over: Partial<UserAccount> & { id: string }): UserAccount => ({
  name: 'Mgr',
  role: 'manager',
  pin: hashPinSaltedLegacySync(over.id, '9999'),
  active: true,
  createdAt: '2026-01-01',
  ...over,
});

const MANAGER = staff({ id: 'u-mgr' });
const CASHIER = staff({ id: 'u-cash', name: 'Cash', role: 'cashier' });

beforeEach(() => {
  useProductStore.setState({ products: [PRODUCT], categories: [] });
  useCustomerStore.setState({
    customers: [
      { id: 'c-1', name: 'Sarah', email: '', phone: '', points: 50, createdAt: '2026-01-01' },
    ],
  });
  useSettingsStore.setState({ settings: SETTINGS, printerConfig: PRINTER });
  useTransactionStore.setState({ transactions: [SALE] });
  useAuthStore.setState({ users: [MANAGER, CASHIER], currentUser: MANAGER });
  usePinAttemptStore.setState({ attempts: {} });
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Opens a sale, then the refund modal, and returns it.
const openRefund = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByText(/^TX-1/));
  await user.click(await screen.findByRole('button', { name: /Refund/i }));
  return waitFor(() => {
    const el = document.querySelector('[aria-labelledby="refund-modal-title"]');
    if (!el) throw new Error('refund modal not open');
    return el as HTMLElement;
  });
};

const advance = async (modal: HTMLElement) => {
  await userEvent.setup().click(within(modal).getByRole('button', { name: /Next/i }));
};

const confirm = async (modal: HTMLElement) => {
  await userEvent.setup().click(within(modal).getByRole('button', { name: /Confirm Refund/i }));
};

describe('History — refunding as a manager', () => {
  it('refunds the whole sale, restores stock and reverses the points', async () => {
    render(<History />);
    const modal = await openRefund();
    await advance(modal);
    await confirm(modal);

    await waitFor(() => {
      expect(useTransactionStore.getState().transactions[0].status).toBe('refunded');
    });
    const tx = useTransactionStore.getState().transactions[0];
    expect(tx.refundedAmount).toBe(10);
    expect(tx.refundAuthorizedBy).toContain('Mgr');
    // Both units go back on the shelf.
    expect(useProductStore.getState().products[0].stock).toBe(12);
    // The 10 points the sale earned are taken back off the member.
    expect(useCustomerStore.getState().customers[0].points).toBe(40);
  });

  it('records who authorised it, for the audit trail', async () => {
    render(<History />);
    const modal = await openRefund();
    await advance(modal);
    await confirm(modal);

    await waitFor(() => {
      expect(useTransactionStore.getState().transactions[0].refundAuthorizedBy).toBe(
        'Mgr (manager)',
      );
    });
    expect(useTransactionStore.getState().transactions[0].refundDate).toBeTruthy();
  });

  it('refuses a second refund of an already-refunded sale', async () => {
    useTransactionStore.setState({
      transactions: [
        {
          ...SALE,
          status: 'refunded',
          refundedAmount: 10,
          refundedItems: [{ productId: 'p-1', quantity: 2 }],
        },
      ],
    });
    render(<History />);
    await userEvent.setup().click(screen.getByText(/^TX-1/));
    // The Refund action is not offered at all once the sale is fully returned.
    expect(screen.queryByRole('button', { name: /^Refund$/i })).not.toBeInTheDocument();
  });
});

describe('History — a cashier needs a manager override', () => {
  beforeEach(() => {
    useAuthStore.setState({ users: [MANAGER, CASHIER], currentUser: CASHIER });
  });

  it('will not refund on a wrong passcode', async () => {
    const user = userEvent.setup();
    render(<History />);
    const modal = await openRefund();
    await advance(modal);

    await user.type(within(modal).getByLabelText(/Manager PIN/i), '0000');
    await confirm(modal);

    await waitFor(() => expect(within(modal).getByText(/Invalid|incorrect/i)).toBeInTheDocument());
    expect(useTransactionStore.getState().transactions[0].status).toBe('completed');
    expect(useProductStore.getState().products[0].stock).toBe(10); // nothing restored
  });

  it("refunds on a manager's passcode and credits it to that manager", async () => {
    const user = userEvent.setup();
    render(<History />);
    const modal = await openRefund();
    await advance(modal);

    await user.type(within(modal).getByLabelText(/Manager PIN/i), '9999');
    await confirm(modal);

    await waitFor(() => {
      expect(useTransactionStore.getState().transactions[0].status).toBe('refunded');
    });
    // Credited to whoever's PIN authorised it, not to the cashier at the till.
    expect(useTransactionStore.getState().transactions[0].refundAuthorizedBy).toBe('Mgr (manager)');
  });

  // The override accepts ANY manager/admin PIN, so it is the widest PIN surface
  // in the app and is throttled like the lock screen.
  it('is locked out after repeated wrong passcodes', async () => {
    const user = userEvent.setup();
    let attempts = {};
    for (let i = 0; i < FREE_ATTEMPTS; i++) {
      attempts = recordFailure(attempts, '__manager_override__', Date.now());
    }
    usePinAttemptStore.setState({ attempts });

    render(<History />);
    const modal = await openRefund();
    await advance(modal);
    await user.type(within(modal).getByLabelText(/Manager PIN/i), '9999'); // correct
    await confirm(modal);

    // Even the right PIN is refused while the cool-off runs.
    await waitFor(() => expect(within(modal).getByText(/try again/i)).toBeInTheDocument());
    expect(useTransactionStore.getState().transactions[0].status).toBe('completed');
  });
});
