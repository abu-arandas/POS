import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserAccount } from '../../src/types';

// Each await inside the PIN handler is a window in which realtime sync can
// rewrite the account row. These hooks fire *inside* those windows so a test can
// land a revocation exactly where a real sync would, which is the only way to
// exercise them — the awaits are otherwise far too fast to interleave with.
let duringLegacyHash: (() => void) | null = null;
let duringCloudLogin: (() => void) | null = null;

vi.mock('../../src/lib/hash', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/hash')>();
  return {
    ...actual,
    hashPinSaltedLegacy: async (userId: string, pin: string) => {
      const digest = await actual.hashPinSaltedLegacy(userId, pin);
      duringLegacyHash?.();
      return digest;
    },
  };
});

vi.mock('../../src/lib/sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/sync')>();
  return {
    ...actual,
    cloudLogin: async (): Promise<UserAccount | null> => {
      duringCloudLogin?.();
      return cloudReply;
    },
  };
});

let cloudReply: UserAccount | null = null;

import Lockscreen from '../../src/components/Lockscreen';
import { useAuthStore } from '../../src/stores/authStore';
import { usePinAttemptStore } from '../../src/stores/pinAttemptStore';
import { hashPinSaltedLegacySync } from '../../src/lib/hash';

const alice: UserAccount = {
  id: 'u-1',
  name: 'Active Alice',
  role: 'admin',
  pin: hashPinSaltedLegacySync('u-1', '1234'),
  active: true,
  createdAt: '2026-01-01',
};

const typePin = async (pin: string) => {
  const user = userEvent.setup();
  await waitFor(() => expect(document.querySelector('#pin-key-1')).toBeTruthy());
  for (const digit of pin) {
    await user.click(document.querySelector<HTMLButtonElement>(`#pin-key-${digit}`)!);
  }
};

beforeEach(() => {
  duringLegacyHash = null;
  duringCloudLogin = null;
  cloudReply = null;
  useAuthStore.setState({ currentUser: null, users: [alice] });
  usePinAttemptStore.setState({ attempts: {} });
});

describe('Lockscreen revocation landing mid-await', () => {
  it('refuses a PIN revoked while the legacy hash is being derived', async () => {
    render(<Lockscreen />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Active Alice/ }));

    // Alice holds a legacy hash, so the v2 comparison misses and the legacy
    // derivation runs. Deactivate her inside it: reading the account before the
    // await and judging it after would accept a PIN that is already revoked.
    duringLegacyHash = () => useAuthStore.setState({ users: [{ ...alice, active: false }] });

    await typePin('1234');

    await waitFor(() => expect(screen.getByText(/incorrect/i)).toBeInTheDocument());
    expect(useAuthStore.getState().currentUser).toBeNull();
  });

  it('refuses a PIN revoked while the cloud round trip is out', async () => {
    // Neither local hash matches, so the handler falls through to the cloud —
    // the widest window of the three, seconds rather than microseconds.
    useAuthStore.setState({ users: [{ ...alice, pin: 'not-a-matching-hash' }] });
    cloudReply = { ...alice, pin: 'irrelevant' };

    render(<Lockscreen />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Active Alice/ }));

    // verify_login answers yes from a cloud row that has not caught up with the
    // revocation yet. The local revocation still has to win.
    duringCloudLogin = () =>
      useAuthStore.setState({ users: [{ ...alice, pin: 'not-a-matching-hash', active: false }] });

    await typePin('1234');

    await waitFor(() => expect(screen.getByText(/incorrect/i)).toBeInTheDocument());
    expect(useAuthStore.getState().currentUser).toBeNull();
  });

  it('still signs in over the cloud when nothing revokes the account', async () => {
    // The guard must not swallow the ordinary cloud-fallback path.
    useAuthStore.setState({ users: [{ ...alice, pin: 'not-a-matching-hash' }] });
    cloudReply = { ...alice, pin: 'irrelevant' };

    render(<Lockscreen />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Active Alice/ }));
    await typePin('1234');

    await waitFor(() => expect(useAuthStore.getState().currentUser?.id).toBe('u-1'));
  });
});
