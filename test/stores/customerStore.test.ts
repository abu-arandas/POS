import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Customer } from '../../src/types';

const deleteCustomersCloudIfEnabled = vi.fn();
vi.mock('../../src/lib/sync', () => ({
  deleteCustomersCloudIfEnabled: (...args: unknown[]) => deleteCustomersCloudIfEnabled(...args),
}));

import { useCustomerStore } from '../../src/stores/customerStore';

// The customer book holds loyalty balances, and a balance is money: commitSale
// adds to it, commitRefund takes back from it, and a discount spends it. Both
// services call updateCustomerPoints and neither can see what it does with a
// delta that would go negative.

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1',
  name: 'Grace Hopper',
  email: 'grace@example.com',
  phone: '+1 555 0100',
  points: 100,
  createdAt: '2026-01-01',
  ...over,
});

describe('the customer book', () => {
  beforeEach(() => {
    deleteCustomersCloudIfEnabled.mockClear();
    useCustomerStore.setState({ customers: [] });
  });

  it('creates a customer with a zero balance and a dated record', () => {
    const created = useCustomerStore.getState().handleAddCustomer('Ada', '555', 'ada@example.com');

    expect(created.points).toBe(0);
    expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(created.id).toMatch(/^cust-/);
    expect(useCustomerStore.getState().customers).toEqual([created]);
  });

  it('gives each customer a distinct id', () => {
    const first = useCustomerStore.getState().handleAddCustomer('Ada', '', '');
    const second = useCustomerStore.getState().handleAddCustomer('Ada', '', '');

    expect(first.id).not.toBe(second.id);
    expect(useCustomerStore.getState().customers).toHaveLength(2);
  });

  it('replaces only the customer being edited', () => {
    useCustomerStore.setState({ customers: [customer(), customer({ id: 'c2', name: 'Ada' })] });

    useCustomerStore.getState().handleUpdateCustomer(customer({ name: 'Grace B. Hopper' }));

    const [edited, untouched] = useCustomerStore.getState().customers;
    expect(edited.name).toBe('Grace B. Hopper');
    expect(untouched.name).toBe('Ada');
  });

  it('deletes locally and propagates the delete to the cloud', () => {
    useCustomerStore.setState({ customers: [customer(), customer({ id: 'c2' })] });

    useCustomerStore.getState().handleDeleteCustomer('c1');

    expect(useCustomerStore.getState().customers.map((c) => c.id)).toEqual(['c2']);
    // Without this the row comes back on the next Pull From Cloud.
    expect(deleteCustomersCloudIfEnabled).toHaveBeenCalledWith(['c1']);
  });

  it('replaces the book wholesale on a cloud pull', () => {
    useCustomerStore.setState({ customers: [customer()] });
    useCustomerStore.getState().setCustomers([customer({ id: 'c9', name: 'Pulled' })]);

    expect(useCustomerStore.getState().customers.map((c) => c.id)).toEqual(['c9']);
  });
});

describe('loyalty balances', () => {
  beforeEach(() => {
    useCustomerStore.setState({ customers: [customer()] });
  });

  it('adds points earned on a sale', () => {
    useCustomerStore.getState().updateCustomerPoints('c1', 22);
    expect(useCustomerStore.getState().customers[0].points).toBe(122);
  });

  it('subtracts points redeemed as a discount', () => {
    useCustomerStore.getState().updateCustomerPoints('c1', -40);
    expect(useCustomerStore.getState().customers[0].points).toBe(60);
  });

  it('floors a balance at zero rather than going negative', () => {
    // A refund reverses the points a sale awarded. If the customer has already
    // spent them, the reversal is larger than the balance — and a negative
    // balance would silently swallow the next sale's earnings.
    useCustomerStore.getState().updateCustomerPoints('c1', -500);
    expect(useCustomerStore.getState().customers[0].points).toBe(0);
  });

  it('leaves other customers alone', () => {
    useCustomerStore.setState({ customers: [customer(), customer({ id: 'c2', points: 7 })] });

    useCustomerStore.getState().updateCustomerPoints('c1', 10);

    expect(useCustomerStore.getState().customers[1].points).toBe(7);
  });

  it('is a no-op for a customer who is not in the book', () => {
    useCustomerStore.getState().updateCustomerPoints('missing', 50);
    expect(useCustomerStore.getState().customers[0].points).toBe(100);
  });
});
