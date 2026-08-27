import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cloudLogin, deleteTransactionsCloudIfEnabled } from '../../src/lib/sync';
import { useSettingsStore } from '../../src/stores/settingsStore';
import * as supabaseLib from '../../src/lib/supabase';
import { notify } from '../../src/lib/notifications';

vi.mock('../../src/stores/settingsStore', () => ({
  useSettingsStore: {
    getState: vi.fn(),
  },
}));

vi.mock('../../src/lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
  signInDevice: vi.fn(),
  verifyLoginCloud: vi.fn(),
  deleteRowsSupabase: vi.fn(),
}));

vi.mock('../../src/lib/notifications', () => ({
  notify: vi.fn(),
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

  it('returns null and skips credential verification when device auth fails', async () => {
    (useSettingsStore.getState as any).mockReturnValue({
      supabaseConfig: {
        enabled: true,
        url: 'https://example.com',
        anonKey: 'key',
        authEmail: 'test@example.com',
        authPassword: 'wrong-password',
      },
    });
    const mockClient = { auth: {} } as any;
    vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue(mockClient);
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(false);

    const result = await cloudLogin('user', 'hash');

    expect(result).toBeNull();
    expect(supabaseLib.verifyLoginCloud).not.toHaveBeenCalled();
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
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(true);

    const result = await cloudLogin('user', 'hash');

    expect(supabaseLib.getSupabaseClient).toHaveBeenCalledWith('https://example.com', 'key');
    expect(supabaseLib.signInDevice).toHaveBeenCalledWith(
      mockClient,
      'test@example.com',
      'password123',
    );
    expect(supabaseLib.verifyLoginCloud).toHaveBeenCalledWith(mockClient, 'user', 'hash');
    expect(result).toEqual(mockUserAccount);
  });
});

describe('deleteTransactionsCloudIfEnabled', () => {
  const enabled = {
    supabaseConfig: {
      enabled: true,
      url: 'https://example.com',
      anonKey: 'key',
      authEmail: 'device@example.com',
      authPassword: 'pw',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabaseLib.getSupabaseClient).mockReturnValue({ auth: {} } as any);
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(true);
  });

  it('is a no-op that reports success when live sync is off', async () => {
    (useSettingsStore.getState as any).mockReturnValue({
      supabaseConfig: { enabled: false, url: 'https://example.com', anonKey: 'key' },
    });

    await expect(deleteTransactionsCloudIfEnabled(['t1'])).resolves.toBe(true);
    expect(supabaseLib.deleteRowsSupabase).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('forwards the ids and stays quiet when the cloud delete succeeds', async () => {
    (useSettingsStore.getState as any).mockReturnValue(enabled);
    vi.mocked(supabaseLib.deleteRowsSupabase).mockResolvedValue(true);

    await expect(deleteTransactionsCloudIfEnabled(['t1', 't2'])).resolves.toBe(true);
    expect(supabaseLib.deleteRowsSupabase).toHaveBeenCalledWith(expect.anything(), 'transactions', [
      't1',
      't2',
    ]);
    expect(notify).not.toHaveBeenCalled();
  });

  it('tells the user when the cloud rejected the delete, instead of swallowing it', async () => {
    (useSettingsStore.getState as any).mockReturnValue(enabled);
    vi.mocked(supabaseLib.deleteRowsSupabase).mockResolvedValue(false);

    await expect(deleteTransactionsCloudIfEnabled(['t1'])).resolves.toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notify).mock.calls[0][1]).toBe('error');
  });

  it('treats an unreachable cloud as ordinary offline behaviour, without a toast', async () => {
    (useSettingsStore.getState as any).mockReturnValue(enabled);
    vi.mocked(supabaseLib.signInDevice).mockResolvedValue(false);

    await expect(deleteTransactionsCloudIfEnabled(['t1'])).resolves.toBe(false);
    expect(supabaseLib.deleteRowsSupabase).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
