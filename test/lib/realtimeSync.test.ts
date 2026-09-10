import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startRealtimeSync, stopRealtimeSync } from '../../src/lib/realtimeSync';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useProductStore } from '../../src/stores/productStore';
import * as supabaseLib from '../../src/lib/supabase';

// Mock the settings store
vi.mock('../../src/stores/settingsStore', () => ({
  useSettingsStore: {
    getState: vi.fn(),
  },
}));

// Mock the product store: the teardown tests below assert on whether a pull
// ever reaches it.
vi.mock('../../src/stores/productStore', () => ({
  useProductStore: {
    getState: vi.fn(),
  },
}));

// Mock the supabase library
vi.mock('../../src/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
  signInDevice: vi.fn(),
  pullProducts: vi.fn(),
  pullCategories: vi.fn(),
  pullCustomers: vi.fn(),
  pullTransactions: vi.fn(),
  pullUserAccounts: vi.fn(),
}));

describe('realtimeSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the internal state of realtimeSync by stopping it before each test
    stopRealtimeSync();
  });

  describe('stopRealtimeSync', () => {
    it('safely does nothing when there is no active channel', () => {
      // Should not throw
      expect(() => stopRealtimeSync()).not.toThrow();
    });

    it('unsubscribes and clears the channel when one is active', async () => {
      const mockUnsubscribe = vi.fn();
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(),
        unsubscribe: mockUnsubscribe,
      };

      const mockClient = {
        channel: vi.fn().mockReturnValue(mockChannel),
      };

      vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue(mockClient as any);
      vi.mocked(supabaseLib.signInDevice).mockResolvedValue(true);

      vi.mocked(useSettingsStore.getState).mockReturnValue({
        supabaseConfig: {
          enabled: true,
          url: 'https://test.supabase.co',
          anonKey: 'test-key',
        },
      } as any);

      // Start the sync to populate the internal channel variable
      const started = await startRealtimeSync();
      expect(started).toBe(true);

      // Verify the channel was created
      expect(mockClient.channel).toHaveBeenCalledWith('pos-realtime');

      // Stop the sync
      stopRealtimeSync();

      // Verify it unsubscribed
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);

      // Calling it again should not error and should not call unsubscribe again,
      // as the channel reference should have been cleared.
      stopRealtimeSync();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  // A change event debounces a pull by 400ms, and the pull itself is async.
  // Stopping has to close both windows: the timer that has not fired, and the
  // pull that is already awaiting a response.
  describe('teardown of in-flight pulls', () => {
    let setProducts: ReturnType<typeof vi.fn>;
    // The per-table change handlers realtimeSync registers on the channel.
    let handlers: Record<string, () => void>;
    let unsubscribe: ReturnType<typeof vi.fn>;

    /** Resolves the next pullProducts call on demand, so a pull can be left in flight. */
    function deferPull() {
      let release!: (rows: unknown) => void;
      const pending = new Promise((resolve) => {
        release = resolve;
      });
      vi.mocked(supabaseLib.pullProducts).mockReturnValue(pending as never);
      return release;
    }

    let subscribe: ReturnType<typeof vi.fn>;

    function stubClient() {
      handlers = {};
      unsubscribe = vi.fn();
      subscribe = vi.fn();
      const channel = {
        on: vi.fn((_event: unknown, filter: { table: string }, cb: () => void) => {
          handlers[filter.table] = cb;
          return channel;
        }),
        subscribe,
        unsubscribe,
      };
      vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue({
        channel: vi.fn().mockReturnValue(channel),
      } as never);
    }

    async function start() {
      stubClient();
      vi.mocked(supabaseLib.signInDevice).mockResolvedValue(true);
      return startRealtimeSync();
    }

    /** Starts with sign-in left pending, so a stop can land mid-authentication. */
    function startPendingAuth() {
      stubClient();
      let finishAuth!: (ok: boolean) => void;
      vi.mocked(supabaseLib.signInDevice).mockReturnValue(
        new Promise<boolean>((resolve) => {
          finishAuth = resolve;
        }),
      );
      const started = startRealtimeSync();
      return { started, finishAuth, subscribed: () => subscribe };
    }

    beforeEach(() => {
      vi.useFakeTimers();
      setProducts = vi.fn();
      vi.mocked(useProductStore.getState).mockReturnValue({ setProducts } as never);
      vi.mocked(useSettingsStore.getState).mockReturnValue({
        supabaseConfig: { enabled: true, url: 'https://test.supabase.co', anonKey: 'k' },
        storeId: 'store-1',
      } as never);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('cancels a debounced pull that has not fired yet', async () => {
      await start();

      handlers.products(); // a change arrives, scheduling the pull
      stopRealtimeSync(); // ...and sync stops before the 400ms elapses
      await vi.advanceTimersByTimeAsync(500);

      expect(supabaseLib.pullProducts).not.toHaveBeenCalled();
      expect(setProducts).not.toHaveBeenCalled();
    });

    it('discards a pull that was already in flight when sync stopped', async () => {
      await start();
      const release = deferPull();

      handlers.products();
      await vi.advanceTimersByTimeAsync(400); // the pull is now awaiting its response
      expect(supabaseLib.pullProducts).toHaveBeenCalledTimes(1);

      stopRealtimeSync();
      release([{ id: 'p-1' }]); // the response lands after teardown
      await vi.advanceTimersByTimeAsync(0);

      expect(setProducts).not.toHaveBeenCalled();
    });

    it('does not let a restarted sync be overwritten by the previous pull', async () => {
      await start();
      const releaseOld = deferPull();

      handlers.products();
      await vi.advanceTimersByTimeAsync(400);

      // Restart: startRealtimeSync stops first, which invalidates the pull above.
      await start();

      releaseOld([{ id: 'stale' }]);
      await vi.advanceTimersByTimeAsync(0);

      expect(setProducts).not.toHaveBeenCalled();
    });

    it('still applies a pull that completes while sync is running', async () => {
      await start();
      const release = deferPull();

      handlers.products();
      await vi.advanceTimersByTimeAsync(400);
      release([{ id: 'p-1' }]);
      await vi.advanceTimersByTimeAsync(0);

      expect(setProducts).toHaveBeenCalledWith([{ id: 'p-1' }]);
    });
    it('does not subscribe when sync is stopped while authenticating', async () => {
      const { started, finishAuth, subscribed } = startPendingAuth();
      await vi.advanceTimersByTimeAsync(0);

      stopRealtimeSync(); // the operator disconnects mid-sign-in
      finishAuth(true);

      await expect(started).resolves.toBe(false);
      expect(subscribed()).not.toHaveBeenCalled();
    });

    it('lets the newer of two overlapping starts win', async () => {
      const first = startPendingAuth();
      await vi.advanceTimersByTimeAsync(0);

      // A second start supersedes the first while its sign-in is still pending.
      const second = startPendingAuth();
      await vi.advanceTimersByTimeAsync(0);

      first.finishAuth(true);
      second.finishAuth(true);

      await expect(first.started).resolves.toBe(false);
      await expect(second.started).resolves.toBe(true);
      expect(second.subscribed()).toHaveBeenCalledTimes(1);
    });

    it('discards a pull whose store scope changed while it was in flight', async () => {
      await start();
      const release = deferPull();

      handlers.products();
      await vi.advanceTimersByTimeAsync(400);

      // The terminal is re-scoped to another store. App does not restart sync
      // for this, so the generation is unchanged — only the scope check catches it.
      vi.mocked(useSettingsStore.getState).mockReturnValue({
        supabaseConfig: { enabled: true, url: 'https://test.supabase.co', anonKey: 'k' },
        storeId: 'store-2',
      } as never);

      release([{ id: 'from-store-1' }]);
      await vi.advanceTimersByTimeAsync(0);

      expect(setProducts).not.toHaveBeenCalled();
    });

    it("ignores a stale subscription's change events", async () => {
      await start();
      const staleHandlers = handlers;

      await start(); // restart; staleHandlers now belong to the old subscription
      staleHandlers.products();
      await vi.advanceTimersByTimeAsync(500);

      // The old handler must not schedule a pull, nor cancel the live one's.
      expect(supabaseLib.pullProducts).not.toHaveBeenCalled();
    });
  });
});
