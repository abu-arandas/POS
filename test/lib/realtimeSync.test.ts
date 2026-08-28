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

    async function start() {
      handlers = {};
      unsubscribe = vi.fn();
      const channel = {
        on: vi.fn((_event: unknown, filter: { table: string }, cb: () => void) => {
          handlers[filter.table] = cb;
          return channel;
        }),
        subscribe: vi.fn(),
        unsubscribe,
      };
      vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue({
        channel: vi.fn().mockReturnValue(channel),
      } as never);
      vi.mocked(supabaseLib.signInDevice).mockResolvedValue(true);
      return startRealtimeSync();
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
  });
});
