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

export type CfdStatus = 'idle' | 'scanning' | 'paying' | 'completed';

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
