import { act, renderHook } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { useHistoryFilters } from '../../src/components/history/useHistoryFilters';
import type { SaleTransaction } from '../../src/types';

const t = ((key: string, fallback?: string) => fallback ?? key) as TFunction;
const transactions: SaleTransaction[] = [
  {
    id: 'TX-OLDER',
    date: '2025-01-01T10:00:00.000Z',
    items: [],
    subtotal: 5,
    discount: 0,
    discountType: 'none',
    discountValue: 0,
    tax: 0,
    total: 5,
    paymentMethod: 'cash',
    customerId: null,
    status: 'completed',
  },
  {
    id: 'TX-CARD',
    date: '2025-01-02T10:00:00.000Z',
    items: [],
    subtotal: 12,
    discount: 0,
    discountType: 'none',
    discountValue: 0,
    tax: 0,
    total: 12,
    paymentMethod: 'card',
    customerId: 'customer-1',
    customerName: 'Ada Lovelace',
    status: 'completed',
  },
  {
    id: 'TX-REFUNDED',
    date: '2025-01-03T10:00:00.000Z',
    items: [],
    subtotal: 20,
    discount: 0,
    discountType: 'none',
    discountValue: 0,
    tax: 0,
    total: 20,
    paymentMethod: 'mobile',
    customerId: null,
    status: 'refunded',
  },
];

describe('useHistoryFilters', () => {
  it('sorts transactions newest first and derives the active transaction', () => {
    const { result } = renderHook(() => useHistoryFilters(transactions, t));

    expect(result.current.filteredTransactions.map((tx) => tx.id)).toEqual([
      'TX-REFUNDED',
      'TX-CARD',
      'TX-OLDER',
    ]);
    act(() => result.current.setSelectedTxId('TX-CARD'));
    expect(result.current.activeTransaction?.customerName).toBe('Ada Lovelace');
  });

  it('combines search, status, and payment filters', () => {
    const { result } = renderHook(() => useHistoryFilters(transactions, t));

    act(() => {
      result.current.setSearchQuery('ada');
      result.current.setStatusFilter('completed');
      result.current.setPaymentFilter(['card']);
    });
    expect(result.current.filteredTransactions.map((tx) => tx.id)).toEqual(['TX-CARD']);

    act(() => result.current.setSearchQuery(''));
    act(() => result.current.setStatusFilter('refunded'));
    expect(result.current.filteredTransactions.map((tx) => tx.id)).toEqual([]);
    act(() => result.current.setPaymentFilter(['mobile']));
    expect(result.current.filteredTransactions.map((tx) => tx.id)).toEqual(['TX-REFUNDED']);
  });

  it('groups filtered transactions under stable localized date labels', () => {
    const { result } = renderHook(() => useHistoryFilters(transactions, t));
    const labels = Object.keys(result.current.groupedTransactions);

    expect(labels).toHaveLength(3);
    expect(Object.values(result.current.groupedTransactions).flat()).toHaveLength(3);
  });
});
