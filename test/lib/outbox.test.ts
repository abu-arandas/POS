import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'idb-keyval';
import {
  clearOutbox,
  enqueueOperation,
  flushOutbox,
  peekOutbox,
  pendingOperationCount,
  subscribeToOutbox,
  type OutboxEntry,
  type OutboxOperation,
} from '../../src/lib/outbox';
import type { Product, SaleTransaction } from '../../src/types';

const product = (id: string, stock = 3): Product => ({
  id,
  name: `Product ${id}`,
  price: 10,
  cost: 4,
  category: 'c1',
  sku: `SKU-${id}`,
  stock,
  minStock: 1,
  image: '',
});

const transaction = (id: string): SaleTransaction => ({
  id,
  date: '2026-01-01T10:00:00.000Z',
  items: [
    { productId: 'p1', productName: 'Product p1', price: 10, cost: 4, quantity: 1, total: 10 },
  ],
  subtotal: 10,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 1,
  total: 11,
  paymentMethod: 'cash',
  customerId: null,
  customerName: null,
  operatorId: 'u1',
  operatorName: 'Ada',
  status: 'completed',
  shiftId: 'shift-1',
});

const accepting = vi.fn(async () => true);
const refusing = vi.fn(async () => false);

describe('the cloud outbox', () => {
  beforeEach(async () => {
    await clearOutbox();
    accepting.mockClear();
    refusing.mockClear();
  });

  it('queues an operation and reports it as owed', async () => {
    await enqueueOperation({ type: 'push', transactions: [transaction('TX-1')] });

    expect(await pendingOperationCount()).toBe(1);
  });

  it('does not queue an operation with nothing in it', async () => {
    expect(await enqueueOperation({ type: 'push' })).toBeNull();
    expect(await enqueueOperation({ type: 'push', products: [] })).toBeNull();
    expect(await enqueueOperation({ type: 'delete', table: 'products', ids: [] })).toBeNull();

    expect(await pendingOperationCount()).toBe(0);
  });

  it('removes an entry only once the server has accepted it', async () => {
    await enqueueOperation({ type: 'push', products: [product('p1')] });

    const summary = await flushOutbox(accepting);

    expect(summary).toEqual({ sent: 1, pending: 0, blocked: false });
    expect(await pendingOperationCount()).toBe(0);
  });

  it('keeps a refused entry queued instead of dropping it', async () => {
    await enqueueOperation({ type: 'push', transactions: [transaction('TX-1')] });

    const summary = await flushOutbox(refusing);

    expect(summary).toEqual({ sent: 0, pending: 1, blocked: true });
    const [entry] = await peekOutbox();
    expect(entry.attempts).toBe(1);
    expect(entry.lastError).toBeDefined();
  });

  it('keeps an entry queued when the send throws', async () => {
    await enqueueOperation({ type: 'push', transactions: [transaction('TX-1')] });

    await flushOutbox(async () => {
      throw new Error('network down');
    });

    const [entry] = await peekOutbox();
    expect(entry.attempts).toBe(1);
    expect(entry.lastError).toBe('network down');
  });

  // The point of the queue: a sale rung up during an outage survives the app
  // being closed and reopened, and goes out when the network comes back.
  it('survives a restart and replays what it still owes', async () => {
    await enqueueOperation({ type: 'push', transactions: [transaction('TX-1')] });
    await flushOutbox(refusing);

    // A "restart" is just a later read of the same IndexedDB key — nothing is
    // held in memory that a reload would lose.
    const stored = await get<OutboxEntry[]>('pos-cloud-outbox');
    expect(stored).toHaveLength(1);
    expect(stored?.[0].operation).toMatchObject({ type: 'push' });

    // Past the backoff, the network is back.
    const later = Date.now() + 60_000;
    const summary = await flushOutbox(accepting, later);

    expect(summary.sent).toBe(1);
    expect(await pendingOperationCount()).toBe(0);
  });

  it('waits out the backoff rather than hammering a dead endpoint', async () => {
    await enqueueOperation({ type: 'push', products: [product('p1')] });
    const now = Date.now();
    await flushOutbox(refusing, now);

    const summary = await flushOutbox(accepting, now + 1_000);

    expect(accepting).not.toHaveBeenCalled();
    expect(summary).toEqual({ sent: 0, pending: 1, blocked: true });
  });

  it('lengthens the backoff with each failed attempt', async () => {
    await enqueueOperation({ type: 'push', products: [product('p1')] });
    const start = Date.now();

    await flushOutbox(refusing, start);
    const [first] = await peekOutbox();
    const firstDelay = first.nextAttemptAt - start;

    await flushOutbox(refusing, first.nextAttemptAt);
    const [second] = await peekOutbox();
    const secondDelay = second.nextAttemptAt - first.nextAttemptAt;

    expect(second.attempts).toBe(2);
    expect(secondDelay).toBeGreaterThan(firstDelay);
  });

  // Order is not cosmetic here. A refund pushed ahead of the sale it refunds,
  // or a delete ahead of the upsert that recreated the row, is a cloud state
  // the terminal never had.
  it('replays in submission order', async () => {
    await enqueueOperation({ type: 'push', transactions: [transaction('TX-1')] });
    await enqueueOperation({ type: 'push', transactions: [transaction('TX-2')] });
    await enqueueOperation({ type: 'delete', table: 'transactions', ids: ['TX-0'] });

    const seen: OutboxOperation[] = [];
    await flushOutbox(async (entry) => {
      seen.push(entry.operation);
      return true;
    });

    expect(seen).toHaveLength(3);
    expect((seen[0] as { transactions: SaleTransaction[] }).transactions[0].id).toBe('TX-1');
    expect((seen[1] as { transactions: SaleTransaction[] }).transactions[0].id).toBe('TX-2');
    expect(seen[2]).toMatchObject({ type: 'delete', ids: ['TX-0'] });
  });

  it('stops at the first failure so later writes cannot overtake it', async () => {
    await enqueueOperation({ type: 'push', transactions: [transaction('TX-1')] });
    await enqueueOperation({ type: 'push', transactions: [transaction('TX-2')] });

    const summary = await flushOutbox(refusing);

    expect(refusing).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({ sent: 0, pending: 2, blocked: true });
  });

  it('sends the same operation again after a failure, unchanged', async () => {
    const operation: OutboxOperation = { type: 'push', products: [product('p1', 7)] };
    await enqueueOperation(operation);

    await flushOutbox(refusing);
    const sent: OutboxOperation[] = [];
    await flushOutbox(async (entry) => {
      sent.push(entry.operation);
      return true;
    }, Date.now() + 60_000);

    // Replay is a repeat of the same upsert — which is why running it twice is
    // harmless and no idempotency token is needed.
    expect(sent).toEqual([operation]);
  });

  // Two sales a second apart both read the queue, both append, and the slower
  // write lands last: without serialization the first sale's push is gone.
  it('loses nothing when operations are queued concurrently', async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        enqueueOperation({ type: 'push', transactions: [transaction(`TX-${i}`)] }),
      ),
    );

    expect(await pendingOperationCount()).toBe(12);
  });

  it('drops queued pushes but keeps queued deletes when a full push supersedes them', async () => {
    await enqueueOperation({ type: 'push', products: [product('p1')] });
    await enqueueOperation({ type: 'delete', table: 'products', ids: ['p9'] });

    await clearOutbox('push');

    const remaining = await peekOutbox();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].operation).toMatchObject({ type: 'delete' });
  });

  // The promise of this file is "written down before it is attempted". A drain
  // that held the queue lock across its network call would break it: a sale
  // rung up mid-drain would wait on that network before its own push reached
  // disk, and a crash in that window loses it.
  it('lets a sale queue while a send is in flight', async () => {
    await enqueueOperation({ type: 'push', transactions: [transaction('TX-slow')] });

    const order: string[] = [];
    let releaseSend: () => void = () => {};
    const inFlight = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    let sendStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      sendStarted = resolve;
    });

    const drain = flushOutbox(async (entry) => {
      const id = (entry.operation as { transactions: SaleTransaction[] }).transactions[0].id;
      order.push(`sent ${id}`);
      if (id === 'TX-slow') {
        sendStarted();
        await inFlight;
      }
      return true;
    });

    await started;
    // The first network call has not returned, and this still completes.
    await enqueueOperation({ type: 'push', transactions: [transaction('TX-during')] });
    order.push('queued TX-during');

    releaseSend();
    await drain;

    // Queued mid-send, and then picked up by the same drain in order — so the
    // append was neither blocked by the send nor clobbered by its write-back.
    expect(order).toEqual(['sent TX-slow', 'queued TX-during', 'sent TX-during']);
    expect(await pendingOperationCount()).toBe(0);
  });

  it('runs a drain requested while another is in flight, rather than dropping it', async () => {
    // The reconnect drain is exactly the one that arrives while a doomed
    // attempt from a moment ago is still timing out. Dropping it would leave
    // the queue waiting for the next timer tick.
    await enqueueOperation({ type: 'push', products: [product('p1')] });

    let releaseFirst: () => void = () => {};
    const firstSend = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = flushOutbox(async () => {
      await firstSend;
      return false; // still offline
    });

    const second = flushOutbox(accepting, Date.now() + 60_000);
    releaseFirst();

    await first;
    const summary = await second;

    expect(accepting).toHaveBeenCalledTimes(1);
    expect(summary.sent).toBe(1);
    expect(await pendingOperationCount()).toBe(0);
  });

  it('notifies subscribers of the pending count', async () => {
    const seen: number[] = [];
    const unsubscribe = subscribeToOutbox((pending) => seen.push(pending));

    await enqueueOperation({ type: 'push', products: [product('p1')] });
    await flushOutbox(accepting);
    unsubscribe();
    await enqueueOperation({ type: 'push', products: [product('p2')] });

    expect(seen).toEqual([1, 0]);
  });
});
