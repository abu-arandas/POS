import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearOutbox,
  enqueueOperation,
  isEmptyOperation,
  pendingPushIds,
  queuedDeleteIds,
  reconcileOutboxMirrors,
} from './outbox';
import type { SaleTransaction } from '../types';

const tx = (id: string): SaleTransaction => ({
  id,
  date: '2026-01-01T12:00:00.000Z',
  items: [],
  subtotal: 0,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 0,
  total: 0,
  paymentMethod: 'cash',
  customerId: null,
  status: 'completed',
});

beforeEach(async () => {
  await clearOutbox();
  await reconcileOutboxMirrors();
});

describe('isEmptyOperation', () => {
  it('recognises a push with nothing in it', () => {
    expect(isEmptyOperation({ type: 'push' })).toBe(true);
    expect(isEmptyOperation({ type: 'push', transactions: [] })).toBe(true);
    expect(isEmptyOperation({ type: 'push', transactions: [tx('a')] })).toBe(false);
  });

  it('recognises a delete with no ids', () => {
    expect(isEmptyOperation({ type: 'delete', table: 'products', ids: [] })).toBe(true);
    expect(isEmptyOperation({ type: 'delete', table: 'products', ids: ['p'] })).toBe(false);
  });
});

describe('pendingPushIds', () => {
  // The race this exists to close. commitSale writes the sale to the store
  // synchronously and enqueues its push asynchronously, so a realtime pull
  // landing in between would see the sale in the store and nothing on disk to
  // say it was owed — and drop it. The id has to be visible the instant enqueue
  // is CALLED, not when its IndexedDB write lands.
  it('knows about a row before the enqueue has been awaited', () => {
    const queued = enqueueOperation({ type: 'push', transactions: [tx('TX-RACE')] });
    // Deliberately not awaited yet.
    expect(pendingPushIds('transactions').has('TX-RACE')).toBe(true);
    return queued;
  });

  it('is empty for a table nothing is queued against', async () => {
    await enqueueOperation({ type: 'push', transactions: [tx('TX-1')] });
    expect(pendingPushIds('products').size).toBe(0);
  });

  it('keys each table separately', async () => {
    await enqueueOperation({
      type: 'push',
      transactions: [tx('TX-1')],
      products: [
        {
          id: 'p1',
          name: 'P',
          price: 1,
          cost: 0,
          category: 'c',
          sku: 's',
          stock: 1,
          minStock: 0,
          image: '',
        },
      ],
    });
    expect(pendingPushIds('transactions')).toEqual(new Set(['TX-1']));
    expect(pendingPushIds('products')).toEqual(new Set(['p1']));
  });

  it('accumulates across several queued operations', async () => {
    await enqueueOperation({ type: 'push', transactions: [tx('TX-1')] });
    await enqueueOperation({ type: 'push', transactions: [tx('TX-2')] });
    expect(pendingPushIds('transactions')).toEqual(new Set(['TX-1', 'TX-2']));
  });

  it('forgets everything once the queue is cleared', async () => {
    await enqueueOperation({ type: 'push', transactions: [tx('TX-1')] });
    await clearOutbox();
    await reconcileOutboxMirrors();
    expect(pendingPushIds('transactions').size).toBe(0);
  });

  // A row on its way OUT must not be reported as local-wins, or the merge keeps
  // resurrecting it from the pulled snapshot until the delete drains.
  it('excludes a row that also has a queued delete', async () => {
    await enqueueOperation({ type: 'push', transactions: [tx('TX-GONE')] });
    expect(pendingPushIds('transactions').has('TX-GONE')).toBe(true);
    await enqueueOperation({ type: 'delete', table: 'transactions', ids: ['TX-GONE'] });
    expect(pendingPushIds('transactions').has('TX-GONE')).toBe(false);
  });
});

describe('queuedDeleteIds', () => {
  it('reports a delete before it has been awaited', () => {
    const queued = enqueueOperation({ type: 'delete', table: 'products', ids: ['p-gone'] });
    expect(queuedDeleteIds('products').has('p-gone')).toBe(true);
    return queued;
  });

  it('keys each table separately', async () => {
    await enqueueOperation({ type: 'delete', table: 'products', ids: ['p1'] });
    expect(queuedDeleteIds('products')).toEqual(new Set(['p1']));
    expect(queuedDeleteIds('customers').size).toBe(0);
  });

  it('is empty once the queue drains', async () => {
    await enqueueOperation({ type: 'delete', table: 'products', ids: ['p1'] });
    await clearOutbox();
    await reconcileOutboxMirrors();
    expect(queuedDeleteIds('products').size).toBe(0);
  });
});
