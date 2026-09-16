/**
 * Cross-tab Customer-Facing Display (CFD) Synchronization using BroadcastChannel.
 * Zero-latency, 100% offline, connects the cashier register to a secondary monitor or tablet.
 */

export interface CfdCartItem {
  id: string;
  name: string;
  variantName?: string;
  modifiers?: string[];
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

/** Where the register is in the sale, so the display can match it. */
export type CfdStatus = 'idle' | 'scanning' | 'paying' | 'completed';

/**
 * One complete snapshot of the register, not a delta.
 *
 * Carrying the whole cart every time is what keeps a display from drifting: it
 * has no history it needs to have seen, so whichever message it does receive
 * resyncs it completely.
 *
 * That is not the same as recovering a sale already in progress. A
 * BroadcastChannel delivers only to listeners already attached and replays
 * nothing, so a display opened or reloaded after the last broadcast holds its
 * idle screen until the register sends again — which it does on the next cart,
 * modal or settings change, not on a timer.
 */
export interface CfdPayload {
  type: 'CFD_UPDATE';
  status: CfdStatus;
  storeName: string;
  currency: string;
  items: CfdCartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount?: number;
  changeDue?: number;
  paymentMethod?: string;
  orderNumber?: string;
}

const CHANNEL_NAME = 'ea-pos-cfd-channel';

let channelInstance: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channelInstance) {
    channelInstance = new BroadcastChannel(CHANNEL_NAME);
  }
  return channelInstance;
}

/**
 * Pushes the current sale to any listening customer display.
 *
 * Failures are swallowed: a missing BroadcastChannel (older webview, or a
 * packaging target without it) or a structured-clone error must not take the
 * till down with it — the secondary display going dark is recoverable, a
 * checkout that throws mid-sale is not.
 */
export function broadcastCfdUpdate(payload: Omit<CfdPayload, 'type'>): void {
  try {
    const ch = getChannel();
    if (ch) {
      ch.postMessage({ type: 'CFD_UPDATE', ...payload });
    }
  } catch (err) {
    console.error('Failed to broadcast CFD update:', err);
  }
}

/**
 * Subscribes to register updates. Returns an unsubscribe function, which is a
 * no-op where BroadcastChannel is unavailable, so callers can always treat it
 * as a React effect cleanup without a null check.
 */
export function subscribeToCfd(callback: (payload: CfdPayload) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};

  const listener = (event: MessageEvent) => {
    if (event.data && event.data.type === 'CFD_UPDATE') {
      callback(event.data as CfdPayload);
    }
  };

  ch.addEventListener('message', listener);
  return () => {
    ch.removeEventListener('message', listener);
  };
}
