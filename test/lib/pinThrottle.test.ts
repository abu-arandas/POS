import { describe, it, expect } from 'vitest';
import {
  recordFailure,
  clearFailures,
  lockoutStatus,
  formatRemaining,
  AttemptState,
  FREE_ATTEMPTS,
  LOCKOUT_LADDER_MS,
  STREAK_RESET_MS,
} from '../../src/lib/pinThrottle';

const T0 = 1_700_000_000_000;

// Applies n consecutive wrong PINs at T0.
const failTimes = (n: number, key = 'u-1', start = T0): AttemptState => {
  let state: AttemptState = {};
  for (let i = 0; i < n; i++) state = recordFailure(state, key, start);
  return state;
};

describe('lockoutStatus', () => {
  it('is unlocked with a full allowance when nothing is recorded', () => {
    expect(lockoutStatus({}, 'u-1', T0)).toEqual({
      locked: false,
      remainingMs: 0,
      attemptsLeft: FREE_ATTEMPTS,
    });
  });

  it('counts down the free attempts without locking', () => {
    const state = failTimes(FREE_ATTEMPTS - 1);
    const status = lockoutStatus(state, 'u-1', T0);
    expect(status.locked).toBe(false);
    expect(status.attemptsLeft).toBe(1);
  });

  it('locks once the free attempts are spent', () => {
    const state = failTimes(FREE_ATTEMPTS);
    const status = lockoutStatus(state, 'u-1', T0);
    expect(status.locked).toBe(true);
    expect(status.remainingMs).toBe(LOCKOUT_LADDER_MS[0]);
    expect(status.attemptsLeft).toBe(0);
  });

  it('unlocks once the cool-off elapses', () => {
    const state = failTimes(FREE_ATTEMPTS);
    expect(lockoutStatus(state, 'u-1', T0 + LOCKOUT_LADDER_MS[0] - 1).locked).toBe(true);
    expect(lockoutStatus(state, 'u-1', T0 + LOCKOUT_LADDER_MS[0]).locked).toBe(false);
  });

  it('throttles each account independently', () => {
    const state = failTimes(FREE_ATTEMPTS, 'u-1');
    expect(lockoutStatus(state, 'u-1', T0).locked).toBe(true);
    expect(lockoutStatus(state, 'u-2', T0).locked).toBe(false);
  });
});

describe('recordFailure escalation', () => {
  it('lengthens the cool-off with each failure past the threshold', () => {
    let state = failTimes(FREE_ATTEMPTS);
    expect(lockoutStatus(state, 'u-1', T0).remainingMs).toBe(LOCKOUT_LADDER_MS[0]);

    state = recordFailure(state, 'u-1', T0);
    expect(lockoutStatus(state, 'u-1', T0).remainingMs).toBe(LOCKOUT_LADDER_MS[1]);

    state = recordFailure(state, 'u-1', T0);
    expect(lockoutStatus(state, 'u-1', T0).remainingMs).toBe(LOCKOUT_LADDER_MS[2]);
  });

  it('caps at the longest cool-off rather than growing forever', () => {
    let state = failTimes(FREE_ATTEMPTS + LOCKOUT_LADDER_MS.length + 20);
    state = recordFailure(state, 'u-1', T0);
    const last = LOCKOUT_LADDER_MS[LOCKOUT_LADDER_MS.length - 1];
    expect(lockoutStatus(state, 'u-1', T0).remainingMs).toBe(last);
  });

  // The whole point: exhausting a 4-digit PIN must not be possible in an
  // evening. Simulate an attacker hammering the keypad and check the sustained
  // rate makes walking all 10,000 combinations take months, not hours.
  it('makes exhaustive guessing infeasible', () => {
    const WINDOW_MS = 6 * 60 * 60 * 1000; // six hours of relentless attempts
    const STEP_MS = 5_000;
    let state: AttemptState = {};
    let guesses = 0;
    for (let now = T0; now < T0 + WINDOW_MS; now += STEP_MS) {
      if (!lockoutStatus(state, 'u-1', now).locked) {
        state = recordFailure(state, 'u-1', now);
        guesses += 1;
      }
    }
    const guessesPerHour = guesses / (WINDOW_MS / 3_600_000);
    const daysToExhaust = 10_000 / guessesPerHour / 24;
    expect(daysToExhaust).toBeGreaterThan(30);
  });

  // Regression: STREAK_RESET_MS used to equal the longest lockout, so waiting
  // out a 15-minute lockout also forgot the streak. The attacker got five fresh
  // attempts and never climbed past the cheapest rung.
  it('keeps the escalation after the longest lockout expires', () => {
    let state = failTimes(FREE_ATTEMPTS + LOCKOUT_LADDER_MS.length);
    const longest = LOCKOUT_LADDER_MS[LOCKOUT_LADDER_MS.length - 1];
    const justAfter = T0 + longest + 1;

    // The lockout has lapsed, so one more guess is allowed…
    expect(lockoutStatus(state, 'u-1', justAfter).locked).toBe(false);
    // …but it must re-lock immediately at the top rung, not reset to 5 free tries.
    expect(lockoutStatus(state, 'u-1', justAfter).attemptsLeft).toBe(0);
    state = recordFailure(state, 'u-1', justAfter);
    expect(lockoutStatus(state, 'u-1', justAfter).remainingMs).toBe(longest);
  });
});

describe('streak expiry and reset', () => {
  it('forgets a stale streak so honest typos do not accumulate', () => {
    const state = failTimes(FREE_ATTEMPTS - 1);
    const later = T0 + STREAK_RESET_MS + 1;
    expect(lockoutStatus(state, 'u-1', later).attemptsLeft).toBe(FREE_ATTEMPTS);
  });

  it('keeps the streak window longer than the longest lockout', () => {
    // Otherwise sitting out the top-rung lockout silently resets the counter.
    expect(STREAK_RESET_MS).toBeGreaterThan(LOCKOUT_LADDER_MS[LOCKOUT_LADDER_MS.length - 1]);
  });

  it('clears the streak on a correct PIN', () => {
    const state = failTimes(FREE_ATTEMPTS);
    const cleared = clearFailures(state, 'u-1');
    expect(lockoutStatus(cleared, 'u-1', T0)).toEqual({
      locked: false,
      remainingMs: 0,
      attemptsLeft: FREE_ATTEMPTS,
    });
  });

  it('leaves other accounts alone when clearing', () => {
    let state = failTimes(FREE_ATTEMPTS, 'u-1');
    state = recordFailure(state, 'u-2', T0);
    const cleared = clearFailures(state, 'u-1');
    expect(cleared['u-2']).toBeDefined();
  });

  it('does not mutate the state it is given', () => {
    const state = failTimes(2);
    const snapshot = JSON.parse(JSON.stringify(state));
    recordFailure(state, 'u-1', T0);
    clearFailures(state, 'u-1');
    expect(state).toEqual(snapshot);
  });
});

describe('formatRemaining', () => {
  it('renders seconds, minutes, and both', () => {
    expect(formatRemaining(30_000)).toBe('30s');
    expect(formatRemaining(120_000)).toBe('2m');
    expect(formatRemaining(150_000)).toBe('2m 30s');
  });

  it('rounds partial seconds up so the countdown never shows 0s while locked', () => {
    expect(formatRemaining(1)).toBe('1s');
  });
});
