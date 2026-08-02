import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Lockscreen from '../../src/components/Lockscreen';
import { useAuthStore } from '../../src/stores/authStore';
import { usePinAttemptStore } from '../../src/stores/pinAttemptStore';
import { hashPinSaltedSync } from '../../src/lib/hash';
import { FREE_ATTEMPTS, recordFailure } from '../../src/lib/pinThrottle';
import { UserAccount } from '../../src/types';

const makeUser = (overrides: Partial<UserAccount> & { id: string }): UserAccount => ({
  name: 'Staff',
  role: 'cashier',
  pin: hashPinSaltedSync(overrides.id, '1234'),
  active: true,
  createdAt: '2026-01-01',
  ...overrides,
});

// Target the keypad by id: the dev-only default-PIN hint renders the same
// digits, so matching buttons by accessible name is ambiguous under vitest
// (import.meta.env.DEV is true).
const typePin = async (pin: string) => {
  const user = userEvent.setup();
  // AnimatePresence swaps the staff list out for the keypad, so wait for the
  // transition to land before pressing keys.
  await waitFor(() => expect(document.querySelector('#pin-key-1')).toBeTruthy());
  for (const digit of pin) {
    const key = document.querySelector<HTMLButtonElement>(`#pin-key-${digit}`);
    if (!key) throw new Error(`keypad button ${digit} not rendered`);
    await user.click(key);
  }
};

beforeEach(() => {
  useAuthStore.setState({ currentUser: null });
  usePinAttemptStore.setState({ attempts: {} });
});

describe('Lockscreen staff selection', () => {
  it('lists only active staff', () => {
    useAuthStore.setState({
      users: [
        makeUser({ id: 'u-1', name: 'Active Alice' }),
        makeUser({ id: 'u-2', name: 'Retired Rob', active: false }),
      ],
    });
    render(<Lockscreen />);

    expect(screen.getByText('Active Alice')).toBeInTheDocument();
    // Regression: a deactivated account used to remain selectable and could
    // still sign in with its old PIN — deactivating a user did nothing.
    expect(screen.queryByText('Retired Rob')).not.toBeInTheDocument();
  });

  it('signs in an active user with the correct PIN', async () => {
    useAuthStore.setState({ users: [makeUser({ id: 'u-1', name: 'Active Alice' })] });
    render(<Lockscreen />);

    await userEvent.setup().click(screen.getByRole('button', { name: /Active Alice/ }));
    await typePin('1234');

    await waitFor(() => expect(useAuthStore.getState().currentUser?.id).toBe('u-1'));
  });

  it('counts a wrong PIN against the account', async () => {
    useAuthStore.setState({ users: [makeUser({ id: 'u-1', name: 'Active Alice' })] });
    render(<Lockscreen />);

    await userEvent.setup().click(screen.getByRole('button', { name: /Active Alice/ }));
    await typePin('9999');

    await waitFor(() => expect(usePinAttemptStore.getState().attempts['u-1']?.failures).toBe(1));
    expect(useAuthStore.getState().currentUser).toBeNull();
  });

  it('refuses further guesses once the account is locked out', async () => {
    const alice = makeUser({ id: 'u-1', name: 'Active Alice' });
    useAuthStore.setState({ users: [alice] });
    // Arrive at the screen already locked out (as a returning attacker would).
    let attempts = {};
    for (let i = 0; i < FREE_ATTEMPTS; i++) attempts = recordFailure(attempts, 'u-1', Date.now());
    usePinAttemptStore.setState({ attempts });

    render(<Lockscreen />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Active Alice/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert').textContent).toMatch(/try again in/i);

    // The keypad is inert — even the CORRECT PIN must not get through.
    const key = document.querySelector<HTMLButtonElement>('#pin-key-1');
    expect(key?.disabled).toBe(true);
    await typePin('1234');
    expect(useAuthStore.getState().currentUser).toBeNull();
  });

  it('clears the failure streak after a successful sign-in', async () => {
    useAuthStore.setState({ users: [makeUser({ id: 'u-1', name: 'Active Alice' })] });
    usePinAttemptStore.setState({ attempts: recordFailure({}, 'u-1', Date.now()) });

    render(<Lockscreen />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Active Alice/ }));
    await typePin('1234');

    await waitFor(() => expect(useAuthStore.getState().currentUser?.id).toBe('u-1'));
    expect(usePinAttemptStore.getState().attempts['u-1']).toBeUndefined();
  });

  it('rejects the PIN if the account is deactivated after selection', async () => {
    const alice = makeUser({ id: 'u-1', name: 'Active Alice' });
    useAuthStore.setState({ users: [alice] });
    render(<Lockscreen />);

    await userEvent.setup().click(screen.getByRole('button', { name: /Active Alice/ }));
    // A second terminal deactivates the account while this PIN screen is open
    // (realtime sync replaces the users list).
    useAuthStore.setState({ users: [{ ...alice, active: false }] });

    await typePin('1234');

    await waitFor(() => expect(screen.getByText(/incorrect/i)).toBeInTheDocument());
    expect(useAuthStore.getState().currentUser).toBeNull();
  });
});
