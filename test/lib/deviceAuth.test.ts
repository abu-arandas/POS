import { describe, it, expect } from 'vitest';
import { resolveDeviceAuthConfigured } from '../../src/lib/supabase/deviceAuth';

describe('resolveDeviceAuthConfigured', () => {
  it('records that credentials are required when a round trip used them', () => {
    expect(
      resolveDeviceAuthConfigured(undefined, {
        authEmail: 'device@store.example',
        authPassword: 'hunter2',
      }),
    ).toBe(true);
  });

  it('records credential-free only when a round trip succeeded without them', () => {
    expect(resolveDeviceAuthConfigured(undefined, { authEmail: '', authPassword: '' })).toBe(false);
  });

  it('treats a half-filled pair as credential-free, matching signInDevice', () => {
    // signInDevice() runs anonymously unless it has BOTH, so an email with no
    // password is not a device session and must not be recorded as one.
    expect(
      resolveDeviceAuthConfigured(undefined, {
        authEmail: 'device@store.example',
        authPassword: '',
      }),
    ).toBe(false);
    expect(resolveDeviceAuthConfigured(undefined, { authEmail: '   ', authPassword: 'pw' })).toBe(
      false,
    );
  });

  it('carries the stored answer forward when nothing was observed', () => {
    // Regression: a plain Save after a restart sees blank credential inputs
    // because they are never persisted. Reading that as "no device account"
    // marked a credentialed terminal credential-free, which is the one state
    // that keeps its "connected" badge across the next restart — reopening the
    // silent-dead-sync bug this all exists to close.
    expect(resolveDeviceAuthConfigured(true)).toBe(true);
    expect(resolveDeviceAuthConfigured(false)).toBe(false);
    expect(resolveDeviceAuthConfigured(undefined)).toBeUndefined();
  });

  it('lets an observed round trip overwrite a stale stored answer', () => {
    // Turning device auth off is still possible: connect once without
    // credentials and the observation wins.
    expect(resolveDeviceAuthConfigured(true, { authEmail: '', authPassword: '' })).toBe(false);
    expect(resolveDeviceAuthConfigured(false, { authEmail: 'a@b.c', authPassword: 'pw' })).toBe(
      true,
    );
  });
});
