import { describe, expect, it } from 'vitest';
import { resolveSyncState } from './useSyncStatus';

const at = (overrides: Partial<Parameters<typeof resolveSyncState>[0]> = {}) =>
  resolveSyncState({ enabled: true, status: 'connected', pending: 0, online: true, ...overrides });

describe('resolveSyncState', () => {
  it('says nothing at all when cloud sync is not configured', () => {
    expect(at({ enabled: false })).toBe('off');
    // …even with a backlog: an outbox that predates turning sync off is not
    // something to badge a terminal about.
    expect(at({ enabled: false, pending: 9, online: false })).toBe('off');
  });

  it('is synced only when the queue is empty and the last handshake worked', () => {
    expect(at()).toBe('synced');
  });

  // The lie this exists to stop. `status` records the last handshake; the queue
  // records what is actually owed. A terminal that connected this morning and
  // has been failing to push since still reported "Online".
  it('reports a backlog even when the stored status says connected', () => {
    expect(at({ pending: 12 })).toBe('syncing');
  });

  it('distinguishes a backlog that can move from one that cannot', () => {
    expect(at({ pending: 3, online: true })).toBe('syncing');
    expect(at({ pending: 3, online: false })).toBe('offline');
  });

  // navigator.onLine is true behind a captive portal and on a LAN with no route
  // out, so it may explain a backlog but must never invent a problem.
  it('does not let a dropped link alone downgrade a clean terminal', () => {
    expect(at({ pending: 0, online: false })).toBe('synced');
  });

  it('surfaces a stored error when nothing is queued', () => {
    // A refused pull or a failed connection test queues nothing and is still
    // worth saying out loud.
    expect(at({ status: 'error' })).toBe('error');
  });

  it('prefers the backlog to the error, because the backlog is the actionable fact', () => {
    expect(at({ status: 'error', pending: 4 })).toBe('syncing');
  });

  it('treats an unproven connection as offline', () => {
    expect(at({ status: 'disconnected' })).toBe('offline');
  });
});
