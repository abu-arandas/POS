import { describe, it, expect, beforeEach } from 'vitest';
import { set as idbSet } from 'idb-keyval';
import { useSettingsStore, DEFAULT_SUPABASE } from '../../src/stores/settingsStore';
import type { SupabaseConfig } from '../../src/types';

const STORAGE_KEY = 'pos-settings-storage';

// Writes a blob in the shape zustand's persist middleware reads back, then
// drives the real rehydrate path so `merge` runs exactly as it does at startup.
const rehydrateWith = async (supabaseConfig: Partial<SupabaseConfig>) => {
  await idbSet(STORAGE_KEY, JSON.stringify({ state: { supabaseConfig }, version: 0 }));
  await useSettingsStore.persist.rehydrate();
  return useSettingsStore.getState().supabaseConfig;
};

const configured: Partial<SupabaseConfig> = {
  url: 'https://project.supabase.co',
  anonKey: 'anon-key',
  enabled: true,
};

describe('useSettingsStore cloud-sync rehydration', () => {
  beforeEach(() => {
    useSettingsStore.setState({ supabaseConfig: DEFAULT_SUPABASE });
  });

  it('does not persist the device credentials', () => {
    useSettingsStore.getState().setSupabaseConfig({
      ...configured,
      authEmail: 'device@store.example',
      authPassword: 'hunter2',
      deviceAuthConfigured: true,
      status: 'connected',
    } as SupabaseConfig);

    // partialize decides what reaches IndexedDB. The password must never be in it.
    const persisted = JSON.stringify(
      useSettingsStore.persist.getOptions().partialize?.(useSettingsStore.getState()),
    );
    expect(persisted).not.toContain('hunter2');
    expect(persisted).not.toContain('device@store.example');
  });

  it('downgrades a restored "connected" when a device account is required', async () => {
    // Regression: `status` persisted but the credentials did not, so the terminal
    // came back badged Connected while signInDevice() silently ran anonymous and
    // RLS refused every row — sync did nothing and said nothing.
    const restored = await rehydrateWith({
      ...configured,
      deviceAuthConfigured: true,
      status: 'connected',
    });

    expect(restored.status).toBe('disconnected');
    // The rest of the config still survives, so the operator only re-enters the
    // password rather than the whole project setup.
    expect(restored.url).toBe('https://project.supabase.co');
    expect(restored.enabled).toBe(true);
  });

  it('downgrades a restored "connected" saved before the flag existed', async () => {
    const restored = await rehydrateWith({ ...configured, status: 'connected' });

    expect(restored.status).toBe('disconnected');
  });

  it('keeps "connected" for an install that recorded it needs no credentials', async () => {
    // Anonymous/demo mode (schema.sql section 8b, RLS off) genuinely does keep
    // working across a restart, so its badge must not be downgraded.
    const restored = await rehydrateWith({
      ...configured,
      deviceAuthConfigured: false,
      status: 'connected',
    });

    expect(restored.status).toBe('connected');
  });

  it('leaves a non-connected status alone', async () => {
    expect((await rehydrateWith({ ...configured, status: 'error' })).status).toBe('error');
    expect((await rehydrateWith({ ...configured, status: 'disconnected' })).status).toBe(
      'disconnected',
    );
  });
});
