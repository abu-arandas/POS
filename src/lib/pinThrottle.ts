// Brute-force protection for PIN entry.
//
// A 4-digit PIN is only 10,000 combinations, and the lock screen accepts an
// unlimited number of guesses as fast as they can be typed — a scripted attacker
// (or anyone left alone with the terminal) walks the whole space in minutes.
// Failures are counted per account and, past a threshold, entry is refused for
// an escalating cool-off.
//
// Pure and DOM-free so it unit-tests like the rest of lib/*; the caller owns
// storage (see stores/pinAttemptStore) and supplies `now` so tests are
// deterministic.

export interface AttemptRecord {
  failures: number;
  // When the current lockout expires (epoch ms). 0 = not locked.
  lockedUntil: number;
  // Timestamp of the most recent failure, used to expire a stale streak.
  lastFailureAt: number;
}

export type AttemptState = Record<string, AttemptRecord>;

// Free guesses before the first lockout kicks in.
export const FREE_ATTEMPTS = 5;

// Cool-off per lockout step, in ms. Each further failure moves one step down
// the ladder and then stays at the longest delay.
export const LOCKOUT_LADDER_MS = [30_000, 60_000, 120_000, 300_000, 900_000];

// A failure streak older than this is forgotten, so an honest operator who
// fat-fingers a PIN today doesn't start tomorrow one mistake from a lockout.
//
// Must stay comfortably LONGER than the last rung of the ladder. If it were
// equal, sitting out the longest lockout would also expire the streak, handing
// the attacker a fresh set of free attempts and pinning them to the cheapest
// rung forever — the escalation would never actually bite.
export const STREAK_RESET_MS = 30 * 60 * 1000;

const EMPTY: AttemptRecord = { failures: 0, lockedUntil: 0, lastFailureAt: 0 };

function recordFor(state: AttemptState, key: string, now: number): AttemptRecord {
  const rec = state[key];
  if (!rec) return EMPTY;
  // Drop a stale streak, but never while a lockout is still running.
  if (rec.lockedUntil <= now && now - rec.lastFailureAt > STREAK_RESET_MS) return EMPTY;
  return rec;
}

export interface LockoutStatus {
  locked: boolean;
  remainingMs: number; // time left on the current lockout (0 when unlocked)
  attemptsLeft: number; // failures remaining before the next lockout
}

export function lockoutStatus(state: AttemptState, key: string, now: number): LockoutStatus {
  const rec = recordFor(state, key, now);
  const locked = rec.lockedUntil > now;
  return {
    locked,
    remainingMs: locked ? rec.lockedUntil - now : 0,
    attemptsLeft: Math.max(0, FREE_ATTEMPTS - rec.failures),
  };
}

// Registers a wrong PIN. Returns the next state; the caller persists it.
export function recordFailure(state: AttemptState, key: string, now: number): AttemptState {
  const rec = recordFor(state, key, now);
  const failures = rec.failures + 1;

  let lockedUntil = 0;
  if (failures >= FREE_ATTEMPTS) {
    const step = Math.min(failures - FREE_ATTEMPTS, LOCKOUT_LADDER_MS.length - 1);
    lockedUntil = now + LOCKOUT_LADDER_MS[step];
  }

  return { ...state, [key]: { failures, lockedUntil, lastFailureAt: now } };
}

// Clears an account's streak after a correct PIN.
export function clearFailures(state: AttemptState, key: string): AttemptState {
  if (!state[key]) return state;
  const next = { ...state };
  delete next[key];
  return next;
}

// "30s" / "2m 30s" — for the "try again in …" message.
export function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}
