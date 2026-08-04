import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testCloudConnection } from '../../src/lib/sync';
import { getSupabaseClient, testSupabaseConnection, signInDevice } from '../../src/lib/supabase';
import { useSettingsStore } from '../../src/stores/settingsStore';

// Mock the dependencies
vi.mock('../../src/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
  testSupabaseConnection: vi.fn(),
  signInDevice: vi.fn(),
  pushProducts: vi.fn(),
  pushCategories: vi.fn(),
  pushCustomers: vi.fn(),
  pushTransactions: vi.fn(),
  pushUserAccounts: vi.fn(),
  pullProducts: vi.fn(),
  pullCategories: vi.fn(),
  pullCustomers: vi.fn(),
  pullTransactions: vi.fn(),
  pullUserAccounts: vi.fn(),
  deleteRowsSupabase: vi.fn(),
  verifyLoginCloud: vi.fn(),
}));

vi.mock('../../src/stores/settingsStore', () => ({
  useSettingsStore: {
    getState: vi.fn(),
  },
}));

describe('sync.ts - testCloudConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false if getSupabaseClient returns null', async () => {
    (getSupabaseClient as any).mockReturnValue(null);
    const result = await testCloudConnection('test-url', 'test-key');
    expect(result).toBe(false);
    expect(getSupabaseClient).toHaveBeenCalledWith('test-url', 'test-key');
    expect(signInDevice).not.toHaveBeenCalled();
    expect(testSupabaseConnection).not.toHaveBeenCalled();
  });

  it('should sign in device and return true if testSupabaseConnection succeeds', async () => {
    const mockClient = { auth: {} };
    (getSupabaseClient as any).mockReturnValue(mockClient);
    (testSupabaseConnection as any).mockResolvedValue(true);

    // Mock settings store
    (useSettingsStore.getState as any).mockReturnValue({
      supabaseConfig: {
        authEmail: 'test@example.com',
        authPassword: 'password123',
      },
    });

    const result = await testCloudConnection('test-url', 'test-key');

    expect(result).toBe(true);
    expect(getSupabaseClient).toHaveBeenCalledWith('test-url', 'test-key');
    expect(useSettingsStore.getState).toHaveBeenCalled();
    expect(signInDevice).toHaveBeenCalledWith(mockClient, 'test@example.com', 'password123');
    expect(testSupabaseConnection).toHaveBeenCalledWith('test-url', 'test-key');
  });

  it('should sign in device and return false if testSupabaseConnection fails', async () => {
    const mockClient = { auth: {} };
    (getSupabaseClient as any).mockReturnValue(mockClient);
    (testSupabaseConnection as any).mockResolvedValue(false);

    // Mock settings store with empty credentials (fallback to '')
    (useSettingsStore.getState as any).mockReturnValue({
      supabaseConfig: {},
    });

    const result = await testCloudConnection('test-url', 'test-key');

    expect(result).toBe(false);
    expect(getSupabaseClient).toHaveBeenCalledWith('test-url', 'test-key');
    expect(useSettingsStore.getState).toHaveBeenCalled();
    expect(signInDevice).toHaveBeenCalledWith(mockClient, '', '');
    expect(testSupabaseConnection).toHaveBeenCalledWith('test-url', 'test-key');
  });
});
