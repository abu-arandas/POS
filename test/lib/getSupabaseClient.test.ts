import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSupabaseClient } from '../../src/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// Mock the @supabase/supabase-js module
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('getSupabaseClient', () => {
  beforeEach(() => {
    // Reset the internal state of getSupabaseClient by passing empty strings
    getSupabaseClient('', '');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null if url is empty', () => {
    const client = getSupabaseClient('', 'anon-key');
    expect(client).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('returns null if anonKey is empty', () => {
    const client = getSupabaseClient('https://example.com', '');
    expect(client).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('creates and returns a new Supabase client when url and anonKey are provided', () => {
    const mockClientInstance = { auth: {} };
    vi.mocked(createClient).mockReturnValue(mockClientInstance as any);

    const client = getSupabaseClient('https://example.com', 'anon-key');

    expect(client).toBe(mockClientInstance);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith('https://example.com', 'anon-key', {
      auth: { persistSession: false },
    });
  });

  it('returns the cached client instance for subsequent calls with the same parameters', () => {
    const mockClientInstance = { auth: {} };
    vi.mocked(createClient).mockReturnValue(mockClientInstance as any);

    const client1 = getSupabaseClient('https://example.com', 'anon-key');
    const client2 = getSupabaseClient('https://example.com', 'anon-key');

    expect(client1).toBe(mockClientInstance);
    expect(client2).toBe(mockClientInstance);
    expect(createClient).toHaveBeenCalledTimes(1); // Should only be called once
  });

  it('creates a new client if url changes', () => {
    const mockClientInstance1 = { id: 1 };
    const mockClientInstance2 = { id: 2 };

    vi.mocked(createClient)
      .mockReturnValueOnce(mockClientInstance1 as any)
      .mockReturnValueOnce(mockClientInstance2 as any);

    const client1 = getSupabaseClient('https://example.com', 'anon-key');
    const client2 = getSupabaseClient('https://example.org', 'anon-key');

    expect(client1).toBe(mockClientInstance1);
    expect(client2).toBe(mockClientInstance2);
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it('creates a new client if anonKey changes', () => {
    const mockClientInstance1 = { id: 1 };
    const mockClientInstance2 = { id: 2 };

    vi.mocked(createClient)
      .mockReturnValueOnce(mockClientInstance1 as any)
      .mockReturnValueOnce(mockClientInstance2 as any);

    const client1 = getSupabaseClient('https://example.com', 'anon-key-1');
    const client2 = getSupabaseClient('https://example.com', 'anon-key-2');

    expect(client1).toBe(mockClientInstance1);
    expect(client2).toBe(mockClientInstance2);
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it('returns null and logs an error if createClient throws an exception', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockError = new Error('Failed to create client');
    vi.mocked(createClient).mockImplementationOnce(() => {
      throw mockError;
    });

    const client = getSupabaseClient('https://bad-url.com', 'bad-key');

    expect(client).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Failed to initialize Supabase client:', mockError);
  });
});
