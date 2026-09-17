import { useEffect, useState } from 'react';
import { pendingCloudWrites } from './sync';
import { subscribeToOutbox } from './outbox';
import { useSettingsStore } from '../stores/settingsStore';

/**
 * What this terminal owes the cloud, and whether it can currently deliver it.
 *
 * The register is offline-first by design: a sale commits locally and is pushed
 * afterwards, and the outbox retries until the server takes it. That is the
 * right behaviour and it is invisible, which is the problem — the only place
 * the queue depth appeared was a Settings panel a cashier never opens. A till
 * that has been quietly unable to reach the cloud since this morning looks
 * exactly like one that is perfectly in sync.
 */
export type SyncState =
  /** Cloud sync is not configured. Nothing is owed and nothing is wrong. */
  | 'off'
  /** Everything this terminal has written has been accepted. */
  | 'synced'
  /** Writes are queued and the terminal can currently reach the network. */
  | 'syncing'
  /** Writes are queued and the browser reports no connectivity. */
  | 'offline'
  /** The server is reachable but refused the last attempt. */
  | 'error';

export interface SyncStatus {
  state: SyncState;
  /** Operations the server has not accepted yet. */
  pending: number;
  /** navigator.onLine — a hint about the link, not about the server. */
  online: boolean;
}

/**
 * Live sync status for the whole terminal.
 *
 * The count comes from the outbox itself rather than being inferred from the
 * connection status: an entry leaves the queue only once the server has taken
 * it, so the queue is the fact. `subscribeToOutbox` fires on every mutation,
 * and the initial read covers the depth already on disk at mount — a terminal
 * restarted mid-outage starts with a backlog and no mutation to announce it.
 */
export function useSyncStatus(): SyncStatus {
  const { enabled, status } = useSettingsStore((s) => ({
    enabled: s.supabaseConfig.enabled,
    status: s.supabaseConfig.status,
  }));
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    let active = true;
    // The depth already on disk. Without this, a terminal that restarts holding
    // a backlog reads zero until the next sale happens to mutate the queue.
    void pendingCloudWrites().then((count) => {
      if (active) setPending(count);
    });
    const unsubscribe = subscribeToOutbox((count) => {
      if (active) setPending(count);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return { state: resolveSyncState({ enabled, status, pending, online }), pending, online };
}

/**
 * Turns the four observable facts into the one state the badge renders.
 *
 * Pure and exported so the precedence is testable without a DOM. The order
 * matters and is not arbitrary:
 *
 *   * A queue that is not empty outranks a "connected" status, because the
 *     status records the last handshake while the queue records what is
 *     actually owed — and reporting "Online" over a backlog is the exact lie
 *     this is here to stop.
 *   * `navigator.onLine` only downgrades an existing backlog. On its own it is
 *     a weak signal (it reports true behind a captive portal and on a LAN with
 *     no route out), so it is never allowed to invent a problem — only to
 *     explain one the queue has already established.
 *   * A stored `error` with an empty queue still shows, because a refused pull
 *     or a failed connection test leaves nothing queued and is still worth
 *     saying.
 */
export function resolveSyncState({
  enabled,
  status,
  pending,
  online,
}: {
  enabled: boolean;
  status: string;
  pending: number;
  online: boolean;
}): SyncState {
  if (!enabled) return 'off';
  if (pending > 0) return online ? 'syncing' : 'offline';
  if (status === 'error') return 'error';
  if (status === 'connected') return 'synced';
  return 'offline';
}
