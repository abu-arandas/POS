// Pure folding for the customer book.
//
// Lived inside Customers.tsx's useMemo bodies, so what a customer is told they
// have spent could only be checked by rendering the screen. DOM-free and
// deterministic, like dashboardMetrics next to it.

import { Customer, SaleTransaction } from '../types';

/**
 * How a customer's history reads on their detail panel.
 */
export interface CustomerStats {
  totalSpent: number;
  averageSpent: number;
  totalVisits: number;
}

/**
 * Lifetime value for one customer, net of refunds.
 *
 * A fully refunded sale is excluded outright rather than contributing zero, so
 * it does not inflate the visit count — a customer who bought once and returned
 * it has not visited twice, and dividing by a phantom visit understates the
 * average basket for everyone who looks at it afterwards.
 */
export function customerStats(transactions: SaleTransaction[]): CustomerStats {
  const counted = transactions.filter((tx) => tx.status === 'completed' || tx.status === 'partial');
  const totalSpent = counted.reduce((sum, tx) => sum + tx.total - (tx.refundedAmount ?? 0), 0);
  const totalVisits = counted.length;

  return {
    totalSpent: Number(totalSpent.toFixed(2)),
    averageSpent: Number((totalVisits > 0 ? totalSpent / totalVisits : 0).toFixed(2)),
    totalVisits,
  };
}

/**
 * How the customer list is ordered.
 */
export type CustomerSort = 'name' | 'points' | 'date';

/**
 * Filters the book by a free-text query and orders it.
 *
 * The query matches name, email or phone. Name and email are matched
 * case-insensitively; the phone number is matched literally, because a phone
 * number has no case and lowercasing it only invites the reader to think it
 * might.
 */
export function filterAndSortCustomers(
  customers: Customer[],
  query: string,
  sortBy: CustomerSort,
): Customer[] {
  const needle = query.trim().toLowerCase();
  const matched = needle
    ? customers.filter(
        (customer) =>
          customer.name.toLowerCase().includes(needle) ||
          customer.email.toLowerCase().includes(needle) ||
          customer.phone.includes(query.trim()),
      )
    : [...customers];

  // Sorted on a copy: the array handed in belongs to the store, and sorting in
  // place would mutate persisted state from what is meant to be a read.
  return matched.sort((a, b) => {
    if (sortBy === 'points') return b.points - a.points;
    if (sortBy === 'date') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return a.name.localeCompare(b.name);
  });
}
