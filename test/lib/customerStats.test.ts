import { describe, it, expect } from 'vitest';
import { customerStats, filterAndSortCustomers } from '../../src/lib/customerStats';
import type { Customer, SaleTransaction } from '../../src/types';

const sale = (over: Partial<SaleTransaction> = {}): SaleTransaction => ({
  id: 'TX-1',
  date: '2026-03-10T12:00:00.000Z',
  items: [{ productId: 'p1', productName: 'Latte', price: 10, cost: 4, quantity: 2, total: 20 }],
  subtotal: 20,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 2,
  total: 22,
  paymentMethod: 'card',
  customerId: 'c1',
  status: 'completed',
  ...over,
});

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1',
  name: 'Grace Hopper',
  email: 'grace@example.com',
  phone: '555-0100',
  points: 10,
  createdAt: '2026-01-01',
  ...over,
});

describe('customerStats', () => {
  it('is all zeroes for a customer who has never bought anything', () => {
    expect(customerStats([])).toEqual({ totalSpent: 0, averageSpent: 0, totalVisits: 0 });
  });

  it('sums spend and averages it over visits', () => {
    const stats = customerStats([sale(), sale({ id: 'TX-2', total: 8 })]);
    expect(stats).toEqual({ totalSpent: 30, averageSpent: 15, totalVisits: 2 });
  });

  it('subtracts a partial refund from spend but still counts the visit', () => {
    const stats = customerStats([sale({ refundedAmount: 10, status: 'partial' })]);
    expect(stats).toEqual({ totalSpent: 12, averageSpent: 12, totalVisits: 1 });
  });

  it('drops a fully refunded sale rather than counting a zero visit', () => {
    // Counting it would say the customer visited twice and halve their average
    // basket — a customer who bought once and returned it has not visited twice.
    const stats = customerStats([sale(), sale({ id: 'TX-2', status: 'refunded' })]);
    expect(stats).toEqual({ totalSpent: 22, averageSpent: 22, totalVisits: 1 });
  });

  it('reports zero rather than NaN when every sale was refunded', () => {
    expect(customerStats([sale({ status: 'refunded' })])).toEqual({
      totalSpent: 0,
      averageSpent: 0,
      totalVisits: 0,
    });
  });
});

describe('filterAndSortCustomers', () => {
  const book = [
    customer({ id: 'a', name: 'Zoe', email: 'zoe@x.com', phone: '555-0001', points: 5 }),
    customer({
      id: 'b',
      name: 'Ada',
      email: 'ada@y.com',
      phone: '555-0002',
      points: 99,
      createdAt: '2026-06-01',
    }),
  ];

  it('sorts by name by default', () => {
    expect(filterAndSortCustomers(book, '', 'name').map((c) => c.name)).toEqual(['Ada', 'Zoe']);
  });

  it('sorts by points descending', () => {
    expect(filterAndSortCustomers(book, '', 'points').map((c) => c.name)).toEqual(['Ada', 'Zoe']);
  });

  it('sorts by newest first when sorting by date', () => {
    expect(filterAndSortCustomers(book, '', 'date').map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('matches name and email case-insensitively', () => {
    expect(filterAndSortCustomers(book, 'ZOE', 'name').map((c) => c.id)).toEqual(['a']);
    expect(filterAndSortCustomers(book, 'ADA@Y', 'name').map((c) => c.id)).toEqual(['b']);
  });

  it('matches a phone number as typed', () => {
    expect(filterAndSortCustomers(book, '555-0002', 'name').map((c) => c.id)).toEqual(['b']);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(filterAndSortCustomers(book, '  ada  ', 'name').map((c) => c.id)).toEqual(['b']);
  });

  it('returns everyone for an empty query', () => {
    expect(filterAndSortCustomers(book, '   ', 'name')).toHaveLength(2);
  });

  it('does not reorder the array it was given', () => {
    // The list belongs to the store, so sorting in place would mutate persisted
    // state from what is meant to be a read.
    const original = [...book];
    filterAndSortCustomers(book, '', 'points');
    expect(book).toEqual(original);
  });
});
