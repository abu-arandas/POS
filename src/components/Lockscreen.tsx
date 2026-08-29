import { useState, useEffect, useRef, useCallback } from 'react';
import { UserAccount } from '../types';
import { Delete, ArrowLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { hashPinSalted, hashPinSaltedLegacy } from '../lib/hash';
import { cloudLogin } from '../lib/sync';
import Logo from './Logo';
import { useAuthStore } from '../stores/authStore';
import { shortId } from '../lib/ids';
import { usePinAttemptStore } from '../stores/pinAttemptStore';
import { lockoutStatus, formatRemaining, FREE_ATTEMPTS } from '../lib/pinThrottle';
import { useTranslation } from 'react-i18next';

const ROLE_CONFIG = {
  admin: {
    gradient: 'from-indigo-500 to-violet-600',
    glow: 'rgba(99, 102, 241, 0.4)',
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    dot: 'bg-indigo-400',
  },
  manager: {
    gradient: 'from-amber-500 to-orange-500',
    glow: 'rgba(245, 158, 11, 0.4)',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  cashier: {
    gradient: 'from-emerald-500 to-teal-500',
    glow: 'rgba(16, 185, 129, 0.4)',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
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

  const handleFirstRunSetup = async () => {
    const name = setupName.trim();
    if (!name) {
      setSetupError(t('lockscreen.setupNameRequired', 'Enter an administrator name.'));
      return;
    }
    if (!/^\d{4}$/.test(setupPin)) {
      setSetupError(t('lockscreen.setupPinRequired', 'Choose a four-digit PIN.'));
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

  const handleKeyPress = useCallback(
    async (num: string) => {
      if (error || checking || lockout.locked) return;
      if (pin.length < 4) {
        const nextPin = pin + num;
        setPin(nextPin);
        if (nextPin.length === 4 && selectedUser) {
          // Re-check `active` against the live list rather than trusting the
          // captured selection: cloud sync can deactivate an account while this
          // screen sits open on it. (The cloud path is already covered — the
          // verify_login RPC filters on active.)
          const live = users.find((u) => u.id === selectedUser.id);
          if (!live?.active) {
            failPin(selectedUser.id);
            return;
          }

          const saltedHash = await hashPinSalted(selectedUser.id, nextPin);
          if (selectedUser.pin === saltedHash) {
            acceptPin(selectedUser);
            return;
          }
          const legacyHash = await hashPinSaltedLegacy(selectedUser.id, nextPin);
          if (selectedUser.pin === legacyHash) {
            handleUpdateUser({ ...selectedUser, pin: saltedHash });
            acceptPin(selectedUser);
            return;
          }
          setChecking(true);
          const cloudUser = await cloudLogin(selectedUser.name, saltedHash);
          const cloudUser2 = cloudUser ?? (await cloudLogin(selectedUser.name, legacyHash));
          setChecking(false);
          if (cloudUser2) {
            // Keep the LOCAL id. The cloud row may carry a different one (the same
            // person created on another terminal), and taking it silently broke
            // two things: users.map matched nothing so the PIN upgrade was never
            // persisted, and the salted hash we just computed is salted with the
            // local id — storing it against a different id would make it
            // unverifiable next login. The throttle is keyed to the local id too,
            // so clearing the streak has to use the same one.
            const upgraded = {
              ...selectedUser,
              ...cloudUser2,
              id: selectedUser.id,
              pin: saltedHash,
            };
            setUsers(users.map((u) => (u.id === upgraded.id ? upgraded : u)));
            acceptPin(upgraded);
          } else {
            failPin(selectedUser.id);
          }
        }
      }
    },
    [
      acceptPin,
      checking,
      error,
      failPin,
      handleUpdateUser,
      lockout.locked,
      pin,
      selectedUser,
      setUsers,
      users,
    ],
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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 overflow-hidden bg-slate-950"
    >
      {/* Animated background orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="animate-orb-1 absolute top-[-15%] left-[-10%] w-125 h-125 rounded-full opacity-20 bg-linear-to-br from-emerald-500/40 to-transparent blur-3xl" />
        <div className="animate-orb-2 absolute bottom-[-20%] right-[-10%] w-150 h-150 rounded-full opacity-15 bg-linear-to-br from-blue-500/40 to-transparent blur-3xl" />
        <div className="animate-orb-3 absolute top-[40%] left-[50%] w-87.5 h-87.5 rounded-full opacity-10 bg-linear-to-br from-purple-500/40 to-transparent blur-3xl" />
        {/* Dot grid */}
        <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(#94a3b8_1px,transparent_1px)] bg-size-[24px_24px]" />
      </div>

      {/* Brand */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-8 z-10"
      >
        <div className="inline-flex items-center gap-3 mb-3">
          <div className="w-11 h-11 flex items-center justify-center">
            <Logo size={44} title="Arandas IT Solutions" />
          </div>
          <span className="font-mono text-2xl font-extrabold tracking-tight text-white">
            EA POS
          </span>
        </div>
        <p className="text-xs text-slate-500 font-medium">{t('lockscreen.subtitle')}</p>
      </motion.div>

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="w-full max-w-sm rounded-3xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-2xl shadow-2xl overflow-hidden z-10"
      >
        {users.length === 0 ? (
          <div className="p-6">
            <h2 className="text-sm font-bold text-slate-200 mb-1 text-center">
              {t('lockscreen.setupTitle', 'Set up your administrator account')}
            </h2>
            <p className="text-xs text-slate-500 text-center mb-5">
              {t('lockscreen.setupSubtitle', 'This terminal has no staff accounts yet.')}
            </p>
            <label
              className="block text-xs font-semibold text-slate-400 mb-1"
              htmlFor="first-run-name"
            >
              {t('lockscreen.setupName', 'Administrator name')}
            </label>
            <input
              id="first-run-name"
              value={setupName}
              onChange={(e) => setSetupName(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
              autoComplete="name"
            />
            <label
              className="block text-xs font-semibold text-slate-400 mt-4 mb-1"
              htmlFor="first-run-pin"
            >
              {t('lockscreen.setupPin', 'Four-digit PIN')}
            </label>
            <input
              id="first-run-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              value={setupPin}
              onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm font-mono tracking-[0.4em] text-white outline-none focus:border-emerald-500"
              autoComplete="new-password"
            />
            {setupError && (
              <p className="mt-3 text-xs font-semibold text-rose-400" role="alert">
                {setupError}
              </p>
            )}
            <button
              type="button"
              onClick={handleFirstRunSetup}
              className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-emerald-400"
            >
              {t('lockscreen.setupButton', 'Create administrator')}
            </button>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {!selectedUser ? (
              /* ── SCREEN 1: USER SELECTION ── */
              <motion.div
                key="user-select"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25 }}
                className="p-6"
              >
                <h2 className="text-sm font-bold text-slate-200 mb-1 text-center">
                  {t('lockscreen.selectUser')}
                </h2>
                <p className="text-xs text-slate-500 text-center mb-5">
                  {t('lockscreen.selectUserSub')}
                </p>

                <div className="space-y-2.5">
                  {activeUsers.map((user, i) => {
                    const cfg = ROLE_CONFIG[user.role];
                    return (
                      <motion.button
                        key={user.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        onClick={() => setSelectedUser(user)}
                        className="w-full flex items-center justify-between p-4 rounded-2xl border border-slate-800/80 bg-slate-800/30 hover:bg-slate-800/60 hover:border-slate-700/80 transition-all group text-start"
                      >
                        <div className="flex items-center gap-3.5">
                          {/* Avatar */}
                          <div
                            className={`w-10 h-10 rounded-xl bg-linear-to-br ${cfg.gradient} flex items-center justify-center text-slate-900 dark:text-white font-bold text-sm shrink-0 shadow-md shadow-emerald-500/20`}
                          >
                            {getInitials(user.name)}
                          </div>
                          <div>
                            <p className="text-slate-900 dark:text-white text-sm font-semibold leading-tight">
                              {user.name}
                            </p>
                            <span
                              className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.badge} mt-1 inline-block`}
                            >
                              {user.role}
                            </span>
                          </div>
                        </div>
                        <ChevronRight
                          size={16}
                          className="text-slate-600 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-300 transition-colors rtl:rotate-180"
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
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25 }}
                className="p-6"
              >
                {/* Back + user info */}
                <div className="flex items-center justify-between mb-6">
                  <button
                    onClick={handleBackToUsers}
                    className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs font-semibold transition-colors p-1.5 rounded-xl hover:bg-white/8"
                    aria-label={t('lockscreen.back')}
                  >
                    <ArrowLeft size={14} className="rtl:rotate-180" />
                    <span>{t('lockscreen.back')}</span>
                  </button>
                  <div className="flex items-center gap-2.5">
                    <div className="text-end">
                      <p className="text-slate-900 dark:text-white text-xs font-bold">
                        {selectedUser.name}
                      </p>
                      <span
                        className={`text-[9px] font-mono uppercase tracking-wider ${roleCfg.badge} px-1.5 py-0.5 rounded-full border inline-block mt-0.5`}
                      >
                        {selectedUser.role}
                      </span>
                    </div>
                    <div
                      className={`w-8 h-8 rounded-xl bg-linear-to-br ${roleCfg.gradient} flex items-center justify-center text-slate-900 dark:text-white font-bold text-xs shrink-0 shadow-md shadow-emerald-500/20`}
                    >
                      {getInitials(selectedUser.name)}
                    </div>
                  </div>
                </div>

                {/* PIN dots */}
                <div className="flex flex-col items-center mb-7">
                  <span className="sr-only" role="status">
                    {t('lockscreen.pinProgress', { count: pin.length })}
                  </span>
                  <motion.div
                    aria-hidden="true"
                    animate={error ? { x: [-10, 10, -8, 8, -4, 4, 0] } : {}}
                    transition={{ duration: 0.45 }}
                    className="flex justify-center gap-4 mb-3"
                  >
                    {[0, 1, 2, 3].map((idx) => (
                      <motion.div
                        key={idx}
                        animate={{
                          scale: pin.length > idx ? 1 : 0.85,
                        }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        className={`w-4 h-4 rounded-full border-2 transition-all ${
                          error
                            ? 'bg-rose-500 border-rose-500 shadow-lg shadow-rose-500/50'
                            : pin.length > idx
                              ? 'bg-emerald-500 border-emerald-500 shadow-lg shadow-emerald-500/50'
                              : 'border-slate-700'
                        }`}
                      />
                    ))}
                  </motion.div>

                  {lockout.locked ? (
                    <motion.span
                      id="pin-lockout-message"
                      role="alert"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-rose-400 text-xs font-semibold text-center"
                    >
                      {t('lockscreen.lockedOut', {
                        time: formatRemaining(lockout.remainingMs),
                      })}
                    </motion.span>
                  ) : (
                    <>
                      {error && (
                        <motion.span
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-rose-400 text-xs font-semibold"
                        >
                          {t('lockscreen.incorrectPin')}
                        </motion.span>
                      )}
                      {/* Only warn near the threshold — no need to advertise the
                        counter to someone who simply mistyped once. */}
                      {!error && lockout.attemptsLeft <= 2 && lockout.attemptsLeft > 0 && (
                        <span className="text-amber-400 text-xs font-semibold">
                          {t('lockscreen.attemptsLeft', { count: lockout.attemptsLeft })}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Keypad — disabled outright while a lockout is running. */}
                <div className="grid grid-cols-3 gap-2.5">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                    <motion.button
                      key={num}
                      id={`pin-key-${num}`}
                      onClick={() => handleKeyPress(num)}
                      disabled={lockout.locked}
                      whileTap={{ scale: 0.88 }}
                      className="h-13 rounded-2xl bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/50 text-slate-900 dark:text-white font-mono text-lg font-bold transition-all disabled:opacity-30 disabled:hover:bg-slate-800/40"
                    >
                      {num}
                    </motion.button>
                  ))}

                  <motion.button
                    onClick={handleClear}
                    disabled={lockout.locked}
                    whileTap={{ scale: 0.9 }}
                    className="h-13 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 font-semibold text-[11px] uppercase tracking-wider transition-all disabled:opacity-30"
                  >
                    {t('lockscreen.clear')}
                  </motion.button>

                  <motion.button
                    id="pin-key-0"
                    disabled={lockout.locked}
                    onClick={() => handleKeyPress('0')}
                    whileTap={{ scale: 0.88 }}
                    className="h-13 rounded-2xl bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/50 text-slate-900 dark:text-white font-mono text-lg font-bold transition-all disabled:opacity-30 disabled:hover:bg-slate-800/40"
                  >
                    0
                  </motion.button>

                  <motion.button
                    onClick={handleBackspace}
                    disabled={lockout.locked}
                    whileTap={{ scale: 0.9 }}
                    aria-label={t('lockscreen.backspace')}
                    className="h-13 rounded-2xl bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/50 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-all disabled:opacity-30"
                  >
                    <Delete size={18} />
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
          transition={{ delay: 0.8 }}
          className="mt-5 z-10 bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-center"
        >
          <p className="text-slate-500 font-mono text-[10px]">{t('lockscreen.defaultPins')}</p>
          <div className="flex gap-4 justify-center mt-1">
            {[
              ['Admin', '1234', 'text-indigo-400'],
              ['Manager', '5555', 'text-amber-400'],
              ['Cashier', '0000', 'text-emerald-400'],
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
