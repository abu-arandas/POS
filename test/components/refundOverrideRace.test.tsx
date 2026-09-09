import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SaleTransaction, StoreSettings, UserAccount } from '../../src/types';

// authorizeOverride is deliberately pure: it judges the list of accounts it was
// handed. Deriving a PIN against every manager takes hundreds of milliseconds,
// and realtime sync can revoke one inside that window — so the caller has to
// confirm the winner against the live store before any money moves. This hook
// lands a revocation exactly there.
let duringAuthorize: (() => void) | null = null;

vi.mock('../../src/lib/managerOverride', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/managerOverride')>();
  return {
    ...actual,
    authorizeOverride: async (users: UserAccount[], pin: string) => {
      const authorized = await actual.authorizeOverride(users, pin);
      duringAuthorize?.();
      return authorized;
    },
  };
});

import { RefundModal } from '../../src/components/history/RefundModal';
import { useAuthStore } from '../../src/stores/authStore';
import { usePinAttemptStore } from '../../src/stores/pinAttemptStore';
import { hashPinSaltedLegacySync } from '../../src/lib/hash';

const manager: UserAccount = {
  id: 'm-1',
  name: 'Grace',
  role: 'manager',
  pin: hashPinSaltedLegacySync('m-1', '1234'),
  active: true,
  createdAt: '2026-01-01',
};

const cashier: UserAccount = {
  id: 'c-1',
  name: 'Sam',
  role: 'cashier',
  pin: hashPinSaltedLegacySync('c-1', '0000'),
  active: true,
  createdAt: '2026-01-01',
};

const transaction: SaleTransaction = {
  id: 'TX-1',
  date: '2026-03-12T09:00:00.000Z',
  items: [{ productId: 'p1', productName: 'Latte', price: 4.5, cost: 1, quantity: 2, total: 9 }],
  subtotal: 9,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 0,
  total: 9,
  paymentMethod: 'cash',
  status: 'completed',
  customerId: null,
  customerName: null,
  operatorId: 'c-1',
  operatorName: 'Sam',
};

const settings = { currency: '$', taxRate: 0 } as StoreSettings;

const typeOverridePin = async (pin: string) => {
  const user = userEvent.setup();
  // Step 1 picks the lines; step 2 is where the manager PIN is asked for.
  await user.click(screen.getByRole('button', { name: /next/i }));
  const field = await screen.findByPlaceholderText(/manager/i);
  await user.type(field, pin);
  await user.click(screen.getByRole('button', { name: /confirm refund/i }));
};

beforeEach(() => {
  duringAuthorize = null;
  useAuthStore.setState({ currentUser: cashier, users: [manager, cashier] });
  usePinAttemptStore.setState({ attempts: {} });
});

describe('refund override with a revocation landing mid-derive', () => {
  it('commits when nothing revokes the manager', async () => {
    const onCommit = vi.fn();
    render(
      <RefundModal
        transaction={transaction}
        settings={settings}
        currentUser={cashier}
        users={[manager, cashier]}
        onClose={() => {}}
        onCommit={onCommit}
      />,
    );

    await typeOverridePin('1234');
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit.mock.calls[0][1]).toBe('Grace (manager)');
  });

  it('refuses once the manager is deactivated inside the derivation', async () => {
    const onCommit = vi.fn();
    // The props still carry the manager as active — that array was read before
    // the PIN was typed. Only the live store knows they have been revoked.
    duringAuthorize = () =>
      useAuthStore.setState({ users: [{ ...manager, active: false }, cashier] });

    render(
      <RefundModal
        transaction={transaction}
        settings={settings}
        currentUser={cashier}
        users={[manager, cashier]}
        onClose={() => {}}
        onCommit={onCommit}
      />,
    );

    await typeOverridePin('1234');

    await waitFor(() => expect(screen.getByText(/passcode|invalid/i)).toBeInTheDocument());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('refuses once the manager is demoted to cashier inside the derivation', async () => {
    const onCommit = vi.fn();
    duringAuthorize = () =>
      useAuthStore.setState({ users: [{ ...manager, role: 'cashier' }, cashier] });

    render(
      <RefundModal
        transaction={transaction}
        settings={settings}
        currentUser={cashier}
        users={[manager, cashier]}
        onClose={() => {}}
        onCommit={onCommit}
      />,
    );

    await typeOverridePin('1234');

    await waitFor(() => expect(screen.getByText(/passcode|invalid/i)).toBeInTheDocument());
    expect(onCommit).not.toHaveBeenCalled();
  });
});
