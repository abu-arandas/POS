import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CfdPayload } from '../../src/lib/cfdChannel';

// The customer display is a second browser window fed over a BroadcastChannel.
// Two things have to hold: the message has to arrive intact, and a runtime
// without BroadcastChannel has to be a no-op rather than an exception — this
// runs inside the register's render path, and a throw there takes the till down
// mid-sale to spare a screen the customer is only reading.

const payload = (over: Partial<Omit<CfdPayload, 'type'>> = {}): Omit<CfdPayload, 'type'> => ({
  status: 'scanning',
  storeName: 'Test Store',
  currency: '$',
  items: [],
  subtotal: 0,
  discount: 0,
  tax: 0,
  total: 0,
  ...over,
});

/** A minimal same-process BroadcastChannel: every instance sees every post. */
function installFakeChannel() {
  const listeners = new Set<(e: MessageEvent) => void>();
  const posted: unknown[] = [];
  class FakeChannel {
    constructor(public name: string) {}
    postMessage(data: unknown) {
      posted.push(data);
      for (const l of listeners) l({ data } as MessageEvent);
    }
    addEventListener(_type: string, l: (e: MessageEvent) => void) {
      listeners.add(l);
    }
    removeEventListener(_type: string, l: (e: MessageEvent) => void) {
      listeners.delete(l);
    }
    close() {
      listeners.clear();
    }
  }
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  return { posted, listenerCount: () => listeners.size };
}

/** Fresh module instance, because the channel is cached at module scope. */
async function loadChannel() {
  vi.resetModules();
  return import('../../src/lib/cfdChannel');
}

describe('cfdChannel with a working BroadcastChannel', () => {
  let fake: ReturnType<typeof installFakeChannel>;

  beforeEach(() => {
    fake = installFakeChannel();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('delivers the payload to a subscriber, tagged with its type', async () => {
    const { broadcastCfdUpdate, subscribeToCfd } = await loadChannel();
    const seen: CfdPayload[] = [];
    subscribeToCfd((p) => seen.push(p));

    broadcastCfdUpdate(payload({ total: 12.5, status: 'paying' }));

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: 'CFD_UPDATE', total: 12.5, status: 'paying' });
  });

  it('carries the cart lines through unchanged', async () => {
    const { broadcastCfdUpdate, subscribeToCfd } = await loadChannel();
    const seen: CfdPayload[] = [];
    subscribeToCfd((p) => seen.push(p));

    const items = [
      { id: 'p-1', name: 'Burger', quantity: 2, unitPrice: 5, totalPrice: 10 },
      { id: 'p-2', name: 'Tee', variantName: 'Large', quantity: 1, unitPrice: 20, totalPrice: 20 },
    ];
    broadcastCfdUpdate(payload({ items, subtotal: 30, total: 30 }));

    expect(seen[0].items).toEqual(items);
  });

  it('ignores a message that is not a CFD update', async () => {
    // The channel name is ours, but a stray or future message shape must not
    // reach a callback that will read .items off it.
    const { subscribeToCfd } = await loadChannel();
    const seen: CfdPayload[] = [];
    subscribeToCfd((p) => seen.push(p));

    new BroadcastChannel('ea-pos-cfd-channel').postMessage({ type: 'SOMETHING_ELSE' });
    new BroadcastChannel('ea-pos-cfd-channel').postMessage(null);

    expect(seen).toHaveLength(0);
  });

  it('stops delivering once unsubscribed', async () => {
    const { broadcastCfdUpdate, subscribeToCfd } = await loadChannel();
    const seen: CfdPayload[] = [];
    const unsubscribe = subscribeToCfd((p) => seen.push(p));

    broadcastCfdUpdate(payload());
    unsubscribe();
    broadcastCfdUpdate(payload({ total: 99 }));

    expect(seen).toHaveLength(1);
    expect(fake.listenerCount()).toBe(0);
  });

  it('reuses one channel across calls rather than opening one per update', async () => {
    const { broadcastCfdUpdate } = await loadChannel();
    broadcastCfdUpdate(payload());
    broadcastCfdUpdate(payload());
    expect(fake.posted).toHaveLength(2);
  });
});

describe('cfdChannel without BroadcastChannel', () => {
  // jsdom does not implement it, which is the case this guards: the register
  // must not care whether a customer display is even possible here.
  beforeEach(() => vi.stubGlobal('BroadcastChannel', undefined));
  afterEach(() => vi.unstubAllGlobals());

  it('broadcasts without throwing', async () => {
    const { broadcastCfdUpdate } = await loadChannel();
    expect(() => broadcastCfdUpdate(payload())).not.toThrow();
  });

  it('returns an unsubscribe that is safe to call', async () => {
    const { subscribeToCfd } = await loadChannel();
    const unsubscribe = subscribeToCfd(() => {
      throw new Error('must never be called');
    });
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });
});
