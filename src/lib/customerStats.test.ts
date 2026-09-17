import { describe, expect, it } from 'vitest';
import { customerStats, filterAndSortCustomers } from './customerStats';
import type { Customer, SaleTransaction } from '../types';

let counter = 0;
function sale(overrides: Partial<SaleTransaction> = {}): SaleTransaction {
  counter += 1;
  return {
    id: `TX-${counter}`,
    date: '2026-01-01T12:00:00.000Z',
    items: [],
    subtotal: 0,
    discount: 0,
    discountType: 'none',
    discountValue: 0,
    tax: 0,
    total: 0,
    paymentMethod: 'cash',
    customerId: 'c1',
    status: 'completed',
    ...overrides,
  };
}

const customer = (overrides: Partial<Customer> = {}): Customer => ({
  id: 'c1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '07700900123',
  points: 0,
  createdAt: '2026-01-01',
  ...overrides,
});

describe('customerStats', () => {
  it('sums lifetime spend and counts visits', () => {
    const stats = customerStats([sale({ total: 30 }), sale({ total: 70 })]);
    expect(stats.totalSpent).toBe(100);
    expect(stats.totalVisits).toBe(2);
    expect(stats.averageSpent).toBe(50);
  });

  it('nets a partial refund out of the spend but keeps the visit', () => {
    const stats = customerStats([sale({ total: 40, refundedAmount: 15, status: 'partial' })]);
    expect(stats.totalSpent).toBe(25);
    expect(stats.totalVisits).toBe(1);
  });

  // A customer who bought once and handed it back has not visited twice.
  // Counting the sale as a zero-value visit would halve their average basket
  // and quietly understate it for everyone reading the panel afterwards.
  it('excludes a fully refunded sale outright rather than counting it as zero', () => {
    const stats = customerStats([
      sale({ total: 50 }),
      sale({ total: 50, refundedAmount: 50, status: 'refunded' }),
    ]);
    expect(stats.totalSpent).toBe(50);
    expect(stats.totalVisits).toBe(1);
    expect(stats.averageSpent).toBe(50);
  });

  it('is all zeroes for a customer with no history, not NaN', () => {
    expect(customerStats([])).toEqual({ totalSpent: 0, averageSpent: 0, totalVisits: 0 });
  });

  it('rounds to the cent', () => {
    const stats = customerStats([sale({ total: 10 }), sale({ total: 10 }), sale({ total: 10.01 })]);
    expect(stats.averageSpent).toBe(10);
    expect(stats.totalSpent).toBe(30.01);
  });
});

describe('filterAndSortCustomers', () => {
  const book = [
    customer({
      id: 'c1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      points: 50,
      createdAt: '2026-01-03',
    }),
    customer({
      id: 'c2',
      name: 'Grace Hopper',
      email: 'grace@navy.mil',
      phone: '02079460000',
      points: 10,
      createdAt: '2026-01-01',
    }),
    customer({
      id: 'c3',
      name: 'Alan Turing',
      email: 'alan@bletchley.uk',
      phone: '01908640404',
      points: 90,
      createdAt: '2026-01-02',
    }),
  ];

  it('returns the whole book for an empty query', () => {
    expect(filterAndSortCustomers(book, '', 'name')).toHaveLength(3);
    expect(filterAndSortCustomers(book, '   ', 'name')).toHaveLength(3);
  });

  it('matches a name case-insensitively', () => {
    expect(filterAndSortCustomers(book, 'GRACE', 'name').map((c) => c.id)).toEqual(['c2']);
  });

  it('matches on email', () => {
    expect(filterAndSortCustomers(book, 'bletchley', 'name').map((c) => c.id)).toEqual(['c3']);
  });

  it('matches on a phone number', () => {
    expect(filterAndSortCustomers(book, '0207946', 'name').map((c) => c.id)).toEqual(['c2']);
  });

  it('is empty when nothing matches', () => {
    expect(filterAndSortCustomers(book, 'nobody', 'name')).toEqual([]);
  });

  it('sorts by name', () => {
    expect(filterAndSortCustomers(book, '', 'name').map((c) => c.name)).toEqual([
      'Ada Lovelace',
      'Alan Turing',
      'Grace Hopper',
    ]);
  });

  it('sorts by points, most first', () => {
    expect(filterAndSortCustomers(book, '', 'points').map((c) => c.points)).toEqual([90, 50, 10]);
  });

  it('sorts by join date, newest first', () => {
    expect(filterAndSortCustomers(book, '', 'date').map((c) => c.id)).toEqual(['c1', 'c3', 'c2']);
  });

  it('does not mutate the book it was given', () => {
    const order = book.map((c) => c.id);
    filterAndSortCustomers(book, '', 'points');
    expect(book.map((c) => c.id)).toEqual(order);
  });
});
