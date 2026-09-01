import { useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import type { SaleTransaction } from '../../types';

export type HistoryDateFilter = 'all' | 'today' | 'yesterday' | '7days';
export type HistoryStatusFilter = 'all' | 'completed' | 'refunded';

export interface HistoryFiltersResult {
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  dateFilter: HistoryDateFilter;
  setDateFilter: React.Dispatch<React.SetStateAction<HistoryDateFilter>>;
  statusFilter: HistoryStatusFilter;
  setStatusFilter: React.Dispatch<React.SetStateAction<HistoryStatusFilter>>;
  paymentFilter: string[];
  setPaymentFilter: React.Dispatch<React.SetStateAction<string[]>>;
  selectedTxId: string | null;
  setSelectedTxId: React.Dispatch<React.SetStateAction<string | null>>;
  activeTransaction: SaleTransaction | null;
  filteredTransactions: SaleTransaction[];
  groupedTransactions: Record<string, SaleTransaction[]>;
}

export function useHistoryFilters(
  transactions: SaleTransaction[],
  t: TFunction,
): HistoryFiltersResult {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<HistoryDateFilter>('all');
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>('all');
  const [paymentFilter, setPaymentFilter] = useState<string[]>([]);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  const activeTransaction = useMemo(
    () => transactions.find((transaction) => transaction.id === selectedTxId) || null,
    [transactions, selectedTxId],
  );

  const filteredTransactions = useMemo(() => {
    const normalizedQuery = searchQuery.toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return transactions
      .filter((transaction) => {
        const matchesSearch =
          transaction.id.toLowerCase().includes(normalizedQuery) ||
          (transaction.customerName &&
            transaction.customerName.toLowerCase().includes(normalizedQuery)) ||
          transaction.paymentMethod.toLowerCase().includes(normalizedQuery);
        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'refunded'
            ? transaction.status !== 'completed'
            : transaction.status === 'completed');
        const matchesPayment =
          paymentFilter.length === 0 || paymentFilter.includes(transaction.paymentMethod);

        const transactionDate = new Date(transaction.date);
        let matchesDate = true;
        if (dateFilter === 'today') {
          matchesDate = transactionDate >= today;
        } else if (dateFilter === 'yesterday') {
          const yesterday = new Date(today);
          yesterday.setDate(today.getDate() - 1);
          matchesDate = transactionDate >= yesterday && transactionDate < today;
        } else if (dateFilter === '7days') {
          const sevenDaysAgo = new Date(today);
          sevenDaysAgo.setDate(today.getDate() - 7);
          matchesDate = transactionDate >= sevenDaysAgo;
        }

        return matchesSearch && matchesStatus && matchesDate && matchesPayment;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, searchQuery, dateFilter, statusFilter, paymentFilter]);

  const groupedTransactions = useMemo(() => {
    const groups: Record<string, SaleTransaction[]> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    for (const transaction of filteredTransactions) {
      const date = new Date(transaction.date);
      date.setHours(0, 0, 0, 0);
      let label = date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      if (date.getTime() === today.getTime()) label = t('history.today', 'Today');
      else if (date.getTime() === yesterday.getTime()) label = t('history.yesterday', 'Yesterday');
      (groups[label] ??= []).push(transaction);
    }
    return groups;
  }, [filteredTransactions, t]);

  return {
    searchQuery,
    setSearchQuery,
    dateFilter,
    setDateFilter,
    statusFilter,
    setStatusFilter,
    paymentFilter,
    setPaymentFilter,
    selectedTxId,
    setSelectedTxId,
    activeTransaction,
    filteredTransactions,
    groupedTransactions,
  };
}
