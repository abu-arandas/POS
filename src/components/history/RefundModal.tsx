import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Lock, ChevronRight, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SaleTransaction, StoreSettings, UserAccount } from '../../types';
import { authorizeOverride, authorizerLabel, overrideCandidates } from '../../lib/managerOverride';
import { computeRefund, refundableQuantities } from '../../lib/refunds';
import { lockoutStatus, formatRemaining } from '../../lib/pinThrottle';
import { usePinAttemptStore } from '../../stores/pinAttemptStore';
import { useAuthStore } from '../../stores/authStore';
import { useModalA11y } from '../../lib/useModalA11y';

// Single throttle bucket for the manager-override PIN (it is not tied to one
// account — any manager/admin PIN authorizes, so the guesser names no user).
const OVERRIDE_THROTTLE_KEY = '__manager_override__';

export interface RefundModalProps {
  transaction: SaleTransaction;
  settings: StoreSettings;
  /** Who is at the till. A cashier — or nobody — must produce a manager PIN. */
  currentUser: UserAccount | null;
  /** Every account, so an override PIN can be matched against the managers. */
  users: UserAccount[];
  onClose: () => void;
  /** Called once the refund is authorized; the caller applies it. */
  onCommit: (selection: Record<string, number>, authorizedBy: string) => void;
}

/**
 * Two-step refund: choose quantities, then confirm — with a manager PIN in
 * between when the operator is not permitted to authorize their own.
 *
 * The step, the selection and the PIN attempt live here rather than on the
 * history screen: they exist only while the modal is open, and the modal is
 * mounted only while it is.
 */
export function RefundModal({
  transaction,
  settings,
  currentUser,
  users,
  onClose,
  onCommit,
}: RefundModalProps) {
  const { t } = useTranslation();
  const pinAttempts = usePinAttemptStore((s) => s.attempts);
  const registerPinFailure = usePinAttemptStore((s) => s.registerFailure);
  const registerPinSuccess = usePinAttemptStore((s) => s.registerSuccess);

  const [step, setStep] = useState<1 | 2>(1);
  const [selection, setSelection] = useState<Record<string, number>>(() => ({
    ...refundableQuantities(transaction),
  }));
  const [overridePin, setOverridePin] = useState('');
  const [overrideError, setOverrideError] = useState('');

  const cardRef = useModalA11y(true, onClose);
  const needsOverride = !currentUser || currentUser.role === 'cashier';

  /**
   * Checks a manager PIN against the refund the cashier is not allowed to
   * make on their own, and commits it when the PIN is accepted.
   */
  const handleAuthorizeOverride = async () => {
    setOverrideError('');
    // The override accepts ANY manager/admin PIN, so it is the widest PIN
    // surface in the app — throttle it like the lock screen. Keyed to the
    // override rather than an account, since the guesser hasn't named one.
    const gate = lockoutStatus(pinAttempts, OVERRIDE_THROTTLE_KEY, Date.now());
    if (gate.locked) {
      setOverrideError(t('history.overrideLockedOut', { time: formatRemaining(gate.remainingMs) }));
      return;
    }

    const authorizedUser = await authorizeOverride(users, overridePin);
    // authorizeOverride is deliberately pure: it judges the list it was handed,
    // which was read before the PIN derivation that just took hundreds of
    // milliseconds. Revoking a manager has to revoke them at that moment, not
    // at the next render, so the winner is confirmed against the live store
    // before any money moves. Re-derived from the same rule the check used, so
    // a role demoted mid-derive is caught alongside a deactivation.
    const live = authorizedUser
      ? overrideCandidates(useAuthStore.getState().users).find((u) => u.id === authorizedUser.id)
      : undefined;
    if (live) {
      registerPinSuccess(OVERRIDE_THROTTLE_KEY);
      onCommit(selection, authorizerLabel(live));
      return;
    }

    registerPinFailure(OVERRIDE_THROTTLE_KEY);
    const after = lockoutStatus(
      usePinAttemptStore.getState().attempts,
      OVERRIDE_THROTTLE_KEY,
      Date.now(),
    );
    setOverrideError(
      after.locked
        ? t('history.overrideLockedOut', { time: formatRemaining(after.remainingMs) })
        : t('history.invalidPasscode'),
    );
  };

  /**
   * Advances the refund: from choosing lines to confirming them, then either
   * asking for a manager override or committing the return.
   */
  const handleProcessRefund = () => {
    const totalQty = Object.values(selection).reduce((sum, qty) => sum + Math.max(0, qty), 0);
    if (totalQty <= 0) return;

    if (step === 1) {
      setStep(2);
    } else if (needsOverride) {
      handleAuthorizeOverride();
    } else {
      onCommit(selection, authorizerLabel(currentUser));
    }
  };

  /**
   * The money and points this selection would return, shown before the
   * operator commits. Computed by the same function that performs the refund,
   * so what is displayed is what will be recorded.
   */
  const renderRefundAmounts = () => {
    const computed = computeRefund(
      transaction,
      selection,
      settings.loyaltyPointsRate,
      settings.loyaltyPointValue,
    );
    if (!computed) return null;
    return (
      <div className="bg-white/80 dark:bg-slate-900/50 rounded-2xl p-4 border border-slate-300 dark:border-slate-700 space-y-2 mt-4">
        {computed.pointsReversal !== 0 && (
          <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
            <span>{t('history.loyaltyAdjustment')}</span>
            <span className="font-mono">
              {computed.pointsReversal > 0 ? '+' : ''}
              {computed.pointsReversal} pts
            </span>
          </div>
        )}
        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
          <span>{t('history.totalRefundedAfter')}</span>
          <span className="font-mono">
            {settings.currency}
            {computed.refundedAmount.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-lg font-bold text-slate-900 dark:text-white pt-2 border-t border-slate-300 dark:border-slate-700">
          <span>{t('history.refundAmount')}</span>
          <span className="text-emerald-400 font-mono">
            {settings.currency}
            {computed.refundAmount.toFixed(2)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="refund-modal-title"
        tabIndex={-1}
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="modal-card max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/50 flex justify-between items-center">
          <h3
            id="refund-modal-title"
            className="font-sans font-bold text-slate-900 dark:text-white text-lg"
          >
            {step === 1 ? t('history.refundStep1') : t('history.refundStep2')}
          </h3>
          <button
            onClick={onClose}
            aria-label={t('history.close')}
            className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {t('history.selectQtyHint')}
              </p>
              {transaction.items.map((item, idx) => {
                const max = refundableQuantities(transaction)[item.productId] || 0;
                if (max <= 0) return null;
                const current = selection[item.productId] || 0;
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-slate-100 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-white/5"
                  >
                    <div className="flex-1 min-w-0 pe-4">
                      <h4 className="text-slate-900 dark:text-white font-bold truncate">
                        {item.productName}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {settings.currency}
                        {(item.total / item.quantity).toFixed(2)} {t('history.each')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-xl p-1 border border-slate-200 dark:border-white/10">
                      <button
                        onClick={() =>
                          setSelection({
                            ...selection,
                            [item.productId]: Math.max(0, current - 1),
                          })
                        }
                        aria-label={`${t('history.decreaseRefundQty')} — ${item.productName}`}
                        className="size-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-900 dark:text-white hover:bg-rose-500/20 hover:text-rose-400"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center font-bold font-mono text-slate-900 dark:text-white">
                        {current}
                      </span>
                      <button
                        onClick={() =>
                          setSelection({
                            ...selection,
                            [item.productId]: Math.min(max, current + 1),
                          })
                        }
                        aria-label={`${t('history.increaseRefundQty')} — ${item.productName}`}
                        className="size-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-900 dark:text-white hover:bg-emerald-500/20 hover:text-emerald-400"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              {renderRefundAmounts()}
              {needsOverride && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-rose-400 mb-3 font-bold text-sm">
                    <Lock size={16} /> {t('history.managerAuthRequired')}
                  </div>
                  <input
                    type="password"
                    placeholder={t('history.managerPin')}
                    aria-label={t('history.managerPin')}
                    data-autofocus
                    value={overridePin}
                    onChange={(e) => setOverridePin(e.target.value)}
                    className="w-full glass-input rounded-xl px-4 py-3 text-slate-900 dark:text-white text-center tracking-widest font-mono focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                  />
                  {overrideError && (
                    <p className="text-xs text-rose-400 mt-2 text-center">{overrideError}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/50 flex gap-3">
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              className="px-5 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold transition-colors"
            >
              {t('history.back')}
            </button>
          )}
          <button
            onClick={handleProcessRefund}
            disabled={step === 1 && Object.values(selection).reduce((a, b) => a + b, 0) === 0}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
          >
            {step === 1 ? t('history.next') : t('history.confirmRefund')}{' '}
            {step === 1 && <ChevronRight size={16} />}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
