import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cloudLogin } from '../../src/lib/sync';
import { useSettingsStore } from '../../src/stores/settingsStore';
import * as supabaseLib from '../../src/lib/supabase';

vi.mock('../../src/stores/settingsStore', () => ({
  useSettingsStore: {
    getState: vi.fn(),
  },
}));

vi.mock('../../src/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
  signInDevice: vi.fn(),
  verifyLoginCloud: vi.fn(),
}));

describe('cloudLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null if Supabase sync is disabled', async () => {
    (useSettingsStore.getState as any).mockReturnValue({
      supabaseConfig: {
        enabled: false,
        url: 'https://example.com',
        anonKey: 'key',
      },
    });

    const result = await cloudLogin('user', 'hash');
    expect(result).toBeNull();
  });

  it('should return null if URL is missing', async () => {
    (useSettingsStore.getState as any).mockReturnValue({
      supabaseConfig: {
        enabled: true,
        url: '',
        anonKey: 'key',
      },
    });

    const result = await cloudLogin('user', 'hash');
    expect(result).toBeNull();
  });

  it('should return null if anonKey is missing', async () => {
    (useSettingsStore.getState as any).mockReturnValue({
      supabaseConfig: {
        enabled: true,
        url: 'https://example.com',
        anonKey: '',
      },
    });

    const result = await cloudLogin('user', 'hash');
    expect(result).toBeNull();
  });

  it('should return null if getSupabaseClient returns null', async () => {
    (useSettingsStore.getState as any).mockReturnValue({
      supabaseConfig: {
        enabled: true,
        url: 'https://example.com',
        anonKey: 'key',
      },
    });
    vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue(null as any);

    const result = await cloudLogin('user', 'hash');
    expect(result).toBeNull();
  });

  it('should call verifyLoginCloud and return its result on success', async () => {
    (useSettingsStore.getState as any).mockReturnValue({
      supabaseConfig: {
        enabled: true,
        url: 'https://example.com',
        anonKey: 'key',
        authEmail: 'test@example.com',
        authPassword: 'password123',
      },
    });

    const mockClient = { auth: {} } as any;
    vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue(mockClient);

    const mockUserAccount = { id: '123', name: 'user', pinHash: 'hash', role: 'admin' };
    vi.mocked(supabaseLib.verifyLoginCloud).mockResolvedValue(mockUserAccount as any);
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(undefined);

    const result = await cloudLogin('user', 'hash');

    expect(supabaseLib.getSupabaseClient).toHaveBeenCalledWith('https://example.com', 'key');
    expect(supabaseLib.signInDevice).toHaveBeenCalledWith(mockClient, 'test@example.com', 'password123');
    expect(supabaseLib.verifyLoginCloud).toHaveBeenCalledWith(mockClient, 'user', 'hash');
    expect(result).toEqual(mockUserAccount);
  });
});
