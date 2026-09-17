import { describe, expect, it } from 'vitest';
import {
  clearFailures,
  formatRemaining,
  FREE_ATTEMPTS,
  LOCKOUT_LADDER_MS,
  lockoutStatus,
  recordFailure,
  STREAK_RESET_MS,
  type AttemptState,
} from './pinThrottle';

const NOW = 1_700_000_000_000;

/** Applies `count` consecutive failures at `now`. */
function fail(state: AttemptState, count: number, now = NOW): AttemptState {
  let next = state;
  for (let i = 0; i < count; i += 1) next = recordFailure(next, 'u1', now);
  return next;
}

describe('lockoutStatus', () => {
  it('is unlocked with a full allowance on an unseen account', () => {
    expect(lockoutStatus({}, 'u1', NOW)).toEqual({
      locked: false,
      remainingMs: 0,
      attemptsLeft: FREE_ATTEMPTS,
    });
  });

  it('counts the allowance down without locking', () => {
    const state = fail({}, FREE_ATTEMPTS - 1);
    expect(lockoutStatus(state, 'u1', NOW)).toMatchObject({
      locked: false,
      attemptsLeft: 1,
    });
  });

  it('locks on the failure that spends the last free attempt', () => {
    const state = fail({}, FREE_ATTEMPTS);
    const status = lockoutStatus(state, 'u1', NOW);
    expect(status.locked).toBe(true);
    expect(status.attemptsLeft).toBe(0);
    expect(status.remainingMs).toBe(LOCKOUT_LADDER_MS[0]);
  });

  it('unlocks once the cool-off has elapsed', () => {
    const state = fail({}, FREE_ATTEMPTS);
    expect(lockoutStatus(state, 'u1', NOW + LOCKOUT_LADDER_MS[0] + 1).locked).toBe(false);
  });

  it('keys accounts separately', () => {
    const state = fail({}, FREE_ATTEMPTS);
    expect(lockoutStatus(state, 'u2', NOW).locked).toBe(false);
  });
});

describe('recordFailure', () => {
  it('escalates one rung per failure past the allowance', () => {
    let state: AttemptState = {};
    for (let step = 0; step < LOCKOUT_LADDER_MS.length; step += 1) {
      state = fail(state, step === 0 ? FREE_ATTEMPTS : 1);
      expect(lockoutStatus(state, 'u1', NOW).remainingMs).toBe(LOCKOUT_LADDER_MS[step]);
    }
  });

  it('stays on the longest rung rather than wrapping round', () => {
    const state = fail({}, FREE_ATTEMPTS + LOCKOUT_LADDER_MS.length + 5);
    expect(lockoutStatus(state, 'u1', NOW).remainingMs).toBe(
      LOCKOUT_LADDER_MS[LOCKOUT_LADDER_MS.length - 1],
    );
  });

  it('forgets a streak that has gone quiet', () => {
    const stale = fail({}, FREE_ATTEMPTS - 1);
    const later = NOW + STREAK_RESET_MS + 1;
    expect(lockoutStatus(stale, 'u1', later).attemptsLeft).toBe(FREE_ATTEMPTS);
    // …and the next failure starts the count again rather than locking.
    expect(lockoutStatus(recordFailure(stale, 'u1', later), 'u1', later).locked).toBe(false);
  });

  // The property the ladder depends on: sitting out the longest lockout must
  // NOT also expire the streak, or the escalation resets to its cheapest rung
  // forever and never actually bites.
  it('keeps the streak alive across the longest cool-off', () => {
    expect(STREAK_RESET_MS).toBeGreaterThan(LOCKOUT_LADDER_MS[LOCKOUT_LADDER_MS.length - 1]);
    const locked = fail({}, FREE_ATTEMPTS);
    const afterCoolOff = NOW + LOCKOUT_LADDER_MS[0] + 1;
    const status = lockoutStatus(locked, 'u1', afterCoolOff);
    expect(status.locked).toBe(false);
    expect(status.attemptsLeft).toBe(0); // still on the ladder, not forgiven
    const again = recordFailure(locked, 'u1', afterCoolOff);
    expect(lockoutStatus(again, 'u1', afterCoolOff).remainingMs).toBe(LOCKOUT_LADDER_MS[1]);
  });

  it('never forgives a streak while its lockout is still running', () => {
    const locked = fail({}, FREE_ATTEMPTS);
    // Even far past the reset window, a live lockout stands.
    const state: AttemptState = {
      u1: { ...locked.u1, lockedUntil: NOW + STREAK_RESET_MS * 3, lastFailureAt: 0 },
    };
    expect(lockoutStatus(state, 'u1', NOW + STREAK_RESET_MS + 1).locked).toBe(true);
  });
});

describe('clearFailures', () => {
  it('drops the account after a correct PIN', () => {
    const state = fail({}, FREE_ATTEMPTS);
    expect(lockoutStatus(clearFailures(state, 'u1'), 'u1', NOW).attemptsLeft).toBe(FREE_ATTEMPTS);
  });

  it('returns the same object when there is nothing to clear', () => {
    const state: AttemptState = {};
    expect(clearFailures(state, 'u1')).toBe(state);
  });

  it('leaves other accounts alone', () => {
    let state = fail({}, FREE_ATTEMPTS);
    state = recordFailure(state, 'u2', NOW);
    expect(clearFailures(state, 'u1').u2).toBeDefined();
  });
});

describe('formatRemaining', () => {
  it.each([
    [30_000, '30s'],
    [150_000, '2m 30s'],
    [120_000, '2m'],
    [900_000, '15m'],
    [1, '1s'],
  ])('renders %ims as %s', (ms, expected) => {
    expect(formatRemaining(ms)).toBe(expected);
  });
});
