import { useState, useEffect, useRef, useCallback } from 'react';
import { UserAccount } from '../types';
import { Delete, ArrowLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { hashPinSalted, hashPinSaltedLegacy, verifyPinHash } from '../lib/hash';
import { cloudLogin } from '../lib/sync';
import Logo from './Logo';
import { useAuthStore } from '../stores/authStore';
import { shortId } from '../lib/utils/ids';
import { usePinAttemptStore } from '../stores/pinAttemptStore';
import { lockoutStatus, formatRemaining, FREE_ATTEMPTS } from '../lib/pinThrottle';
import { useTranslation } from 'react-i18next';
import { playErrorSound, playKeySound } from '../lib/audioFeedback';

const ROLE_CONFIG = {
  admin: {
    gradient: 'from-zinc-800 to-zinc-900',
    glow: 'rgba(255, 255, 255, 0.05)',
    badge: 'bg-zinc-800 text-zinc-200 border-zinc-700',
    dot: 'bg-white',
  },
  manager: {
    gradient: 'from-zinc-800 to-zinc-900',
    glow: 'rgba(255, 255, 255, 0.05)',
    badge: 'bg-zinc-800/80 text-zinc-300 border-zinc-700/80',
    dot: 'bg-zinc-200',
  },
  cashier: {
    gradient: 'from-zinc-800 to-zinc-900',
    glow: 'rgba(255, 255, 255, 0.05)',
    badge: 'bg-zinc-800/60 text-zinc-400 border-zinc-700/60',
    dot: 'bg-zinc-300',
  },
} as const;

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * PIN entry gate for the terminal. Enforces the lockout throttle, so repeated
 * wrong guesses back off instead of allowing unlimited attempts.
 */
export default function Lockscreen() {
  const { users, setUsers, setCurrentUser, handleUpdateUser } = useAuthStore();
  const attempts = usePinAttemptStore((s) => s.attempts);
  const registerFailure = usePinAttemptStore((s) => s.registerFailure);
  const registerSuccess = usePinAttemptStore((s) => s.registerSuccess);
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  // Ticks once a second while a lockout runs so the countdown stays live.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [setupName, setSetupName] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [setupError, setSetupError] = useState('');
  const { t } = useTranslation();

  const activeUsers = users.filter((u) => u.active);

  const lockout = selectedUser
    ? lockoutStatus(attempts, selectedUser.id, nowTick)
    : { locked: false, remainingMs: 0, attemptsLeft: FREE_ATTEMPTS };

  useEffect(() => {
    if (!lockout.locked) return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lockout.locked]);

  const rejectPin = useCallback(() => {
    playErrorSound();
    setError(true);
    setPin('');
    setTimeout(() => setError(false), 900);
  }, []);

  // A wrong PIN both shakes the dots and advances the brute-force counter.
  const failPin = useCallback(
    (userId: string) => {
      registerFailure(userId);
      rejectPin();
    },
    [registerFailure, rejectPin],
  );

  const acceptPin = useCallback(
    (user: UserAccount) => {
      registerSuccess(user.id);
      setCurrentUser(user);
    },
    [registerSuccess, setCurrentUser],
  );

  /**
   * Creates the first administrator on a terminal that has no accounts yet,
   * and signs them in. Without this the lock screen would have nobody to
   * authenticate and no way to add anyone.
   */
  const handleFirstRunSetup = async () => {
    const name = setupName.trim();
    if (!name) {
      setSetupError(t('lockscreen.setupNameRequired'));
      return;
    }
    if (!/^\d{4}$/.test(setupPin)) {
      setSetupError(t('lockscreen.setupPinRequired'));
      return;
    }
    const id = `user-${shortId()}`;
    const user: UserAccount = {
      id,
      name,
      role: 'admin',
      pin: await hashPinSalted(id, setupPin),
      active: true,
      createdAt: new Date().toISOString(),
    };
    setUsers([user]);
    setSetupPin('');
    setCurrentUser(user);
  };

  /**
   * Verifies a completed PIN against `user` and signs in, upgrades a legacy
   * hash, or records a failure.
   *
   * Everything below judges the LIVE account record, never the `user` the
   * operator tapped. That value was copied when they tapped their name, which
   * may have been hours ago, and cloud sync rewrites these rows underneath an
   * open lock screen — deactivating an account, rotating its PIN, or changing
   * its role. Only `active` used to be re-checked, so a PIN revoked on another
   * terminal went on being accepted here for as long as the screen sat on that
   * name, which is exactly when revoking one matters.
   *
   * Re-read at EVERY step rather than once. Each await below is a window in
   * which a realtime-sync write can land, and reading the row before an await
   * and judging it after is the same stale-copy bug in a narrower form:
   * deriving a hash yields to the event loop, and the cloud round-trip can take
   * seconds.
   */
  const attemptSignIn = useCallback(
    async (user: UserAccount, enteredPin: string) => {
      const readLive = () => useAuthStore.getState().users.find((u) => u.id === user.id) ?? null;

      // Verify before judging `active`, as this has always done: a deactivated
      // account must cost the same as a wrong PIN, or the delay before the
      // refusal says which of the two it was.
      //
      // Checked against the hash this account actually carries, at the version
      // and work factor recorded in it. An account still on a v1 digest, or on
      // a v2 one derived before the work factor was last raised, signs in and
      // is re-hashed below instead of being locked out.
      const storedAtStart = readLive()?.pin ?? '';
      const check = await verifyPinHash(user.id, enteredPin, storedAtStart);
      let live = readLive();
      if (!live?.active) {
        failPin(user.id);
        return;
      }
      // `check` answers a question about the hash as it stood BEFORE the
      // derivation. If sync replaced it meanwhile — a PIN rotated on another
      // terminal — that answer is about a hash the account no longer has, and
      // honouring it would accept the old PIN after it was replaced. This
      // comparison used to be inline against the freshly re-read row, so
      // moving it inside verifyPinHash is what put the window here. Fail
      // closed; the operator types again against the row as it now stands.
      if (live.pin !== storedAtStart) {
        failPin(user.id);
        return;
      }

      if (check.ok && !check.needsUpgrade) {
        acceptPin(live);
        return;
      }

      if (check.ok) {
        const freshHash = await hashPinSalted(user.id, enteredPin);
        live = readLive();
        if (!live?.active) {
          failPin(user.id);
          return;
        }
        // Same window again, and worse: writing here would put a hash derived
        // from the OLD PIN over the one sync just rotated in, undoing the
        // rotation.
        if (live.pin !== storedAtStart) {
          failPin(user.id);
          return;
        }
        // Sign in with the upgraded record, not the one just replaced.
        // handleUpdateUser rewrites `users`, so signing in with `live` would
        // leave currentUser holding the superseded hash. Nothing reads it
        // today and it is not persisted, but a stale credential copy in state
        // is precisely what the rest of this function exists to avoid.
        const upgradedUser = { ...live, pin: freshHash };
        handleUpdateUser(upgradedUser);
        acceptPin(upgradedUser);
        return;
      }

      setChecking(true);
      // Only the cloud path needs these: verify_login takes a derived hash
      // rather than the PIN, so both versions are offered in case the cloud
      // row has not been upgraded either.
      const saltedHash = await hashPinSalted(user.id, enteredPin);
      const legacyHash = await hashPinSaltedLegacy(user.id, enteredPin);
      const cloudUser = await cloudLogin(live.name, saltedHash);
      const cloudUser2 = cloudUser ?? (await cloudLogin(live.name, legacyHash));
      setChecking(false);
      // The widest window of the three. A revocation that lands while the
      // network call is out must still win, even though verify_login has
      // just answered yes — the cloud row it answered from can be the copy
      // that has not caught up yet.
      live = readLive();
      if (!live?.active) {
        failPin(user.id);
        return;
      }
      if (!cloudUser2) {
        failPin(user.id);
        return;
      }
      // Keep the LOCAL id. The cloud row may carry a different one (the same
      // person created on another terminal), and taking it silently broke
      // two things: users.map matched nothing so the PIN upgrade was never
      // persisted, and the salted hash we just computed is salted with the
      // local id — storing it against a different id would make it
      // unverifiable next login. The throttle is keyed to the local id too,
      // so clearing the streak has to use the same one.
      const upgraded = {
        ...live,
        ...cloudUser2,
        id: live.id,
        pin: saltedHash,
      };
      setUsers(useAuthStore.getState().users.map((u) => (u.id === upgraded.id ? upgraded : u)));
      acceptPin(upgraded);
    },
    [acceptPin, failPin, handleUpdateUser, setUsers],
  );

  const handleKeyPress = useCallback(
    async (num: string) => {
      if (error || checking || lockout.locked) return;
      if (pin.length >= 4) return;
      playKeySound();
      const nextPin = pin + num;
      setPin(nextPin);
      if (nextPin.length === 4 && selectedUser) await attemptSignIn(selectedUser, nextPin);
    },
    [attemptSignIn, checking, error, lockout.locked, pin, selectedUser],
  );

  const handleBackspace = useCallback(() => {
    if (pin.length > 0) setPin(pin.slice(0, -1));
  }, [pin]);
  const handleClear = () => setPin('');
  const handleBackToUsers = useCallback(() => {
    setSelectedUser(null);
    setPin('');
    setError(false);
  }, []);

  const keyboardHandlers = useRef({ handleKeyPress, handleBackspace, handleBackToUsers });
  useEffect(() => {
    keyboardHandlers.current = { handleKeyPress, handleBackspace, handleBackToUsers };
  }, [handleBackspace, handleBackToUsers, handleKeyPress]);

  // Hardware keyboard PIN entry: digits type, Backspace deletes, Escape goes
  // back to staff selection. The ref keeps the handler fresh without attaching
  // a new window listener for every PIN digit.
  useEffect(() => {
    if (!selectedUser) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) keyboardHandlers.current.handleKeyPress(e.key);
      else if (e.key === 'Backspace') keyboardHandlers.current.handleBackspace();
      else if (e.key === 'Escape') keyboardHandlers.current.handleBackToUsers();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedUser]);

  const role = selectedUser?.role ?? 'cashier';
  const roleCfg = ROLE_CONFIG[role];

  return (
    <div
      id="lockscreen-root"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 overflow-hidden bg-background text-foreground"
    >
      {/* Subtle precision dot grid */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.04] dark:opacity-[0.07]">
        <div className="absolute inset-0 bg-[radial-gradient(currentColor_1px,transparent_1px)] bg-size-[24px_24px]" />
      </div>

      {/* Brand */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="text-center mb-6 z-10"
      >
        <div className="inline-flex items-center gap-2.5 mb-2">
          <div className="size-9 flex items-center justify-center">
            <Logo size={36} title="Arandas IT Solutions" />
          </div>
          <span className="font-mono text-xl font-bold tracking-tight text-foreground">EA POS</span>
        </div>
        <p className="text-xs text-muted-foreground font-medium">{t('lockscreen.subtitle')}</p>
      </motion.div>

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-xl overflow-hidden z-10"
      >
        {users.length === 0 ? (
          <div className="p-6">
            <h2 className="text-sm font-semibold text-foreground mb-1 text-center">
              {t('lockscreen.setupTitle')}
            </h2>
            <p className="text-xs text-muted-foreground text-center mb-5">
              {t('lockscreen.setupSubtitle')}
            </p>
            <label
              className="block text-xs font-medium text-muted-foreground mb-1.5"
              htmlFor="first-run-name"
            >
              {t('lockscreen.setupName')}
            </label>
            <input
              id="first-run-name"
              value={setupName}
              onChange={(e) => setSetupName(e.target.value)}
              className="input-shell w-full px-3 py-2 rounded-xl text-xs mb-3"
              autoComplete="name"
            />
            <label
              className="block text-xs font-medium text-muted-foreground mb-1.5"
              htmlFor="first-run-pin"
            >
              {t('lockscreen.setupPin')}
            </label>
            <input
              id="first-run-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              value={setupPin}
              onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="input-shell w-full px-3 py-2 rounded-xl text-xs font-mono tracking-[0.4em]"
              autoComplete="new-password"
            />
            {setupError && (
              <p className="mt-3 text-xs font-medium text-destructive" role="alert">
                {setupError}
              </p>
            )}
            <button
              type="button"
              onClick={handleFirstRunSetup}
              className="btn-primary mt-5 w-full py-2.5 rounded-xl text-xs font-medium"
            >
              {t('lockscreen.setupButton')}
            </button>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {!selectedUser ? (
              /* ── SCREEN 1: USER SELECTION ── */
              <motion.div
                key="user-select"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                className="p-6"
              >
                <h2 className="text-sm font-semibold text-foreground mb-1 text-center">
                  {t('lockscreen.selectUser')}
                </h2>
                <p className="text-xs text-muted-foreground text-center mb-5">
                  {t('lockscreen.selectUserSub')}
                </p>

                <div className="space-y-2">
                  {activeUsers.map((user, i) => {
                    const cfg = ROLE_CONFIG[user.role];
                    return (
                      <motion.button
                        key={user.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => setSelectedUser(user)}
                        className="w-full flex items-center justify-between p-3 rounded-xl border border-border bg-muted/30 hover:bg-muted/80 hover:border-foreground/20 transition-all group text-start"
                      >
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div className="size-9 rounded-lg bg-foreground text-background flex items-center justify-center font-bold text-xs tracking-tight shrink-0">
                            {getInitials(user.name)}
                          </div>
                          <div>
                            <p className="text-foreground text-xs font-semibold leading-tight">
                              {user.name}
                            </p>
                            <span
                              className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.2 rounded border ${cfg.badge} mt-1 inline-block`}
                            >
                              {user.role}
                            </span>
                          </div>
                        </div>
                        <ChevronRight
                          size={15}
                          className="text-muted-foreground group-hover:text-foreground transition-colors rtl:rotate-180"
                        />
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            ) : (
              /* ── SCREEN 2: PIN ENTRY ── */
              <motion.div
                key="pin-entry"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                className="p-6"
              >
                {/* Back + user info */}
                <div className="flex items-center justify-between mb-6">
                  <button
                    onClick={handleBackToUsers}
                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs font-medium transition-colors p-1.5 rounded-lg hover:bg-muted"
                    aria-label={t('lockscreen.back')}
                  >
                    <ArrowLeft size={13} className="rtl:rotate-180" />
                    <span>{t('lockscreen.back')}</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="text-end">
                      <p className="text-foreground text-xs font-semibold">{selectedUser.name}</p>
                      <span
                        className={`text-[9px] font-mono uppercase tracking-wider ${roleCfg.badge} px-1.5 py-0.2 rounded border inline-block mt-0.5`}
                      >
                        {selectedUser.role}
                      </span>
                    </div>
                    <div className="size-7 rounded-md bg-foreground text-background flex items-center justify-center font-bold text-[11px] shrink-0">
                      {getInitials(selectedUser.name)}
                    </div>
                  </div>
                </div>

                {/* PIN dots */}
                <div className="flex flex-col items-center mb-6">
                  <span className="sr-only" role="status">
                    {t('lockscreen.pinProgress', { count: pin.length })}
                  </span>
                  <motion.div
                    aria-hidden="true"
                    animate={error ? { x: [-8, 8, -6, 6, -3, 3, 0] } : {}}
                    transition={{ duration: 0.4 }}
                    className="flex justify-center gap-3.5 mb-2"
                  >
                    {[0, 1, 2, 3].map((idx) => (
                      <motion.div
                        key={idx}
                        animate={{
                          scale: pin.length > idx ? 1.05 : 0.9,
                        }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        className={`size-3.5 rounded-full border transition-all duration-150 ${
                          error
                            ? 'bg-destructive border-destructive shadow-xs'
                            : pin.length > idx
                              ? 'bg-foreground border-foreground shadow-xs'
                              : 'border-muted-foreground/40 bg-transparent'
                        }`}
                      />
                    ))}
                  </motion.div>

                  {lockout.locked ? (
                    <motion.span
                      id="pin-lockout-message"
                      role="alert"
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-destructive text-xs font-medium font-mono num text-center"
                    >
                      {t('lockscreen.lockedOut', {
                        time: formatRemaining(lockout.remainingMs),
                      })}
                    </motion.span>
                  ) : (
                    <>
                      {error && (
                        <motion.span
                          initial={{ opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-destructive text-xs font-medium"
                        >
                          {t('lockscreen.incorrectPin')}
                        </motion.span>
                      )}
                      {!error && lockout.attemptsLeft <= 2 && lockout.attemptsLeft > 0 && (
                        <span className="text-amber-500 dark:text-amber-400 text-xs font-medium">
                          {t('lockscreen.attemptsLeft', { count: lockout.attemptsLeft })}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Keypad — Apple/Linear circular minimalist keys */}
                <div className="grid grid-cols-3 gap-3 justify-items-center">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                    <motion.button
                      key={num}
                      id={`pin-key-${num}`}
                      onClick={() => handleKeyPress(num)}
                      disabled={lockout.locked}
                      whileTap={{ scale: 0.92 }}
                      className="size-16 rounded-full bg-muted/40 hover:bg-muted active:bg-foreground/10 border border-border text-foreground font-mono text-2xl font-medium transition-colors disabled:opacity-30 flex items-center justify-center select-none shadow-2xs"
                    >
                      {num}
                    </motion.button>
                  ))}

                  <motion.button
                    onClick={handleClear}
                    disabled={lockout.locked}
                    whileTap={{ scale: 0.92 }}
                    className="size-16 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-[11px] font-medium uppercase tracking-wider transition-colors disabled:opacity-30 flex items-center justify-center"
                  >
                    {t('lockscreen.clear')}
                  </motion.button>

                  <motion.button
                    id="pin-key-0"
                    disabled={lockout.locked}
                    onClick={() => handleKeyPress('0')}
                    whileTap={{ scale: 0.92 }}
                    className="size-16 rounded-full bg-muted/40 hover:bg-muted active:bg-foreground/10 border border-border text-foreground font-mono text-2xl font-medium transition-colors disabled:opacity-30 flex items-center justify-center select-none shadow-2xs"
                  >
                    0
                  </motion.button>

                  <motion.button
                    onClick={handleBackspace}
                    disabled={lockout.locked}
                    whileTap={{ scale: 0.92 }}
                    aria-label={t('lockscreen.backspace')}
                    className="size-16 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted text-xs transition-colors disabled:opacity-30 flex items-center justify-center"
                  >
                    <Delete size={17} />
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </motion.div>

      {/* Dev hint */}
      {import.meta.env.DEV && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 z-10 bg-card/80 border border-border rounded-xl px-4 py-2 text-center"
        >
          <p className="text-muted-foreground font-mono text-[10px]">
            {t('lockscreen.defaultPins')}
          </p>
          <div className="flex gap-3 justify-center mt-1">
            {[
              ['Admin', '1234', 'text-foreground'],
              ['Manager', '5555', 'text-foreground'],
              ['Cashier', '0000', 'text-foreground'],
            ].map(([role, pin, color]) => (
              <span key={role} className={`font-mono text-[10px] ${color}`}>
                {role}: <strong>{pin}</strong>
              </span>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
