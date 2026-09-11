import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RefundPatch } from '../../src/stores/transactionStore';
import type { SaleTransaction } from '../../src/types';

const deleteTransactionsCloudIfEnabled = vi.fn();
vi.mock('../../src/lib/sync', () => ({
  deleteTransactionsCloudIfEnabled: (...args: unknown[]) =>
    deleteTransactionsCloudIfEnabled(...args),
}));

import { useTransactionStore } from '../../src/stores/transactionStore';

// This store is the sale ledger: the Z-report, the dashboard and every refund
// read from it, and a refund writes back onto the row it refunded. It had the
// thinnest coverage of any store, which is an odd place for the money to live.

const sale = (over: Partial<SaleTransaction> = {}): SaleTransaction => ({
  id: 'TX-1',
  date: '2026-01-01T10:00:00.000Z',
  items: [{ productId: 'p1', productName: 'Latte', price: 10, cost: 4, quantity: 2, total: 20 }],
  subtotal: 20,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 2,
  total: 22,
  paymentMethod: 'cash',
  customerId: null,
  customerName: null,
  operatorId: 'u1',
  operatorName: 'Ada',
  status: 'completed',
  shiftId: 'shift-1',
  ...over,
});

const patch = (over: Partial<RefundPatch> = {}): RefundPatch => ({
  refundedItems: [{ productId: 'p1', quantity: 1 }],
  refundedAmount: 11,
  status: 'partial',
  refundDate: '2026-01-02T09:00:00.000Z',
  authorizedBy: 'Grace',
  ...over,
});

describe('the transaction ledger', () => {
  beforeEach(() => {
    deleteTransactionsCloudIfEnabled.mockClear();
    useTransactionStore.setState({ transactions: [] });
  });

  it('puts the newest sale first, which is the order History renders', () => {
    useTransactionStore.getState().addTransaction(sale({ id: 'TX-1' }));
    useTransactionStore.getState().addTransaction(sale({ id: 'TX-2' }));

    expect(useTransactionStore.getState().transactions.map((t) => t.id)).toEqual(['TX-2', 'TX-1']);
  });

  it('replaces the ledger wholesale on a cloud pull', () => {
    useTransactionStore.getState().addTransaction(sale({ id: 'TX-local' }));
    useTransactionStore.getState().setTransactions([sale({ id: 'TX-cloud' })]);

    expect(useTransactionStore.getState().transactions.map((t) => t.id)).toEqual(['TX-cloud']);
  });

  it('writes the refund onto the sale it refunds', () => {
    useTransactionStore.setState({ transactions: [sale()] });

    useTransactionStore.getState().applyRefund('TX-1', patch());

    const [updated] = useTransactionStore.getState().transactions;
    expect(updated).toMatchObject({
      status: 'partial',
      refundedAmount: 11,
      refundDate: '2026-01-02T09:00:00.000Z',
      refundAuthorizedBy: 'Grace',
      refundedItems: [{ productId: 'p1', quantity: 1 }],
    });
    // Everything the sale already recorded survives the patch.
    expect(updated.total).toBe(22);
    expect(updated.items).toHaveLength(1);
  });

  it('touches only the sale named, leaving its neighbours alone', () => {
    useTransactionStore.setState({ transactions: [sale({ id: 'TX-2' }), sale({ id: 'TX-1' })] });

    useTransactionStore.getState().applyRefund('TX-1', patch());

    const [untouched, refunded] = useTransactionStore.getState().transactions;
    expect(untouched.status).toBe('completed');
    expect(untouched.refundedAmount).toBeUndefined();
    expect(refunded.status).toBe('partial');
  });

  it('is a no-op for a sale that is not there', () => {
    useTransactionStore.setState({ transactions: [sale()] });

    useTransactionStore.getState().applyRefund('TX-missing', patch());

    expect(useTransactionStore.getState().transactions[0].status).toBe('completed');
  });

  it('overwrites an earlier refund rather than accumulating onto it', () => {
    // computeRefund works out the CUMULATIVE state and the store persists that
    // result, so a second refund replaces the first patch. Adding to it here as
    // well would double-count every partial return.
    useTransactionStore.setState({ transactions: [sale()] });

    useTransactionStore.getState().applyRefund('TX-1', patch());
    useTransactionStore
      .getState()
      .applyRefund('TX-1', patch({ refundedAmount: 22, status: 'refunded' }));

    const [updated] = useTransactionStore.getState().transactions;
    expect(updated.refundedAmount).toBe(22);
    expect(updated.status).toBe('refunded');
  });

  it('records who authorized a refund, including when nobody did', () => {
    useTransactionStore.setState({ transactions: [sale()] });
    useTransactionStore.getState().applyRefund('TX-1', patch({ authorizedBy: null }));

    expect(useTransactionStore.getState().transactions[0].refundAuthorizedBy).toBeNull();
  });

  it('deletes the named sales and propagates the delete to the cloud', () => {
    useTransactionStore.setState({
      transactions: [sale({ id: 'TX-1' }), sale({ id: 'TX-2' }), sale({ id: 'TX-3' })],
    });

    useTransactionStore.getState().deleteTransactions(['TX-1', 'TX-3']);

    expect(useTransactionStore.getState().transactions.map((t) => t.id)).toEqual(['TX-2']);
    // Without this the rows come back on the next Pull From Cloud, and nobody
    // can work out why deleted history keeps reappearing.
    expect(deleteTransactionsCloudIfEnabled).toHaveBeenCalledWith(['TX-1', 'TX-3']);
  });

  it('ignores ids it does not hold instead of clearing the ledger', () => {
    useTransactionStore.setState({ transactions: [sale({ id: 'TX-1' })] });

    useTransactionStore.getState().deleteTransactions(['TX-99']);

    expect(useTransactionStore.getState().transactions).toHaveLength(1);
  });

  it('still tells the cloud about an empty delete, rather than silently diverging', () => {
    useTransactionStore.getState().deleteTransactions([]);
    expect(deleteTransactionsCloudIfEnabled).toHaveBeenCalledWith([]);
  });
});
