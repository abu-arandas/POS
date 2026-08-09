import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startRealtimeSync, stopRealtimeSync } from '../../src/lib/realtimeSync';
import { useSettingsStore } from '../../src/stores/settingsStore';
import * as supabaseLib from '../../src/lib/supabase';

// Mock the settings store
vi.mock('../../src/stores/settingsStore', () => ({
  useSettingsStore: {
    getState: vi.fn(),
  },
}));

// Mock the supabase library
vi.mock('../../src/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
  signInDevice: vi.fn(),
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
      vi.mocked(supabaseLib.signInDevice).mockResolvedValue();

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
});
