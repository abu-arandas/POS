import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Lock, ChevronRight, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SaleTransaction, StoreSettings, UserAccount } from '../../types';
import { authorizeOverride, authorizerLabel, overrideCandidates } from '../../lib/managerOverride';
import { computeRefund, refundableQuantities } from '../../lib/refunds';
import { orderItemKey } from '../../lib/variants';
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
      <div className="bg-secondary/30 rounded-xl p-3.5 border border-border space-y-1.5 mt-3 text-xs">
        {computed.pointsReversal !== 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>{t('history.loyaltyAdjustment')}</span>
            <span className="font-mono">
              {computed.pointsReversal > 0 ? '+' : ''}
              {computed.pointsReversal} pts
            </span>
          </div>
        )}
        <div className="flex justify-between text-muted-foreground">
          <span>{t('history.totalRefundedAfter')}</span>
          <span className="font-mono text-foreground">
            {settings.currency}
            {computed.refundedAmount.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-sm font-semibold text-foreground pt-1.5 border-t border-border">
          <span>{t('history.refundAmount')}</span>
          <span className="text-foreground font-mono">
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
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        className="bg-card border border-border max-w-md w-full overflow-hidden flex flex-col max-h-[90vh] rounded-2xl shadow-xl"
      >
        <div className="px-6 py-4 border-b border-border bg-card flex justify-between items-center">
          <h3 id="refund-modal-title" className="font-sans font-semibold text-foreground text-base">
            {step === 1 ? t('history.refundStep1') : t('history.refundStep2')}
          </h3>
          <button
            onClick={onClose}
            aria-label={t('history.close')}
            className="size-8 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground mb-3">{t('history.selectQtyHint')}</p>
              {transaction.items.map((item, idx) => {
                const lineId = orderItemKey(item);
                const displayName = item.variantName
                  ? `${item.productName} — ${item.variantName}`
                  : item.productName;
                const max = refundableQuantities(transaction)[lineId] || 0;
                if (max <= 0) return null;
                const current = selection[lineId] || 0;
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-secondary/30 p-3 rounded-xl border border-border"
                  >
                    <div className="flex-1 min-w-0 pe-3">
                      <h4 className="text-foreground font-medium text-xs truncate">
                        {item.productName}
                      </h4>
                      {item.variantName && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {item.variantName}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                        {settings.currency}
                        {(item.total / item.quantity).toFixed(2)} {t('history.each')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 bg-background rounded-lg p-0.5 border border-border">
                      <button
                        onClick={() =>
                          setSelection({
                            ...selection,
                            [lineId]: Math.max(0, current - 1),
                          })
                        }
                        aria-label={`${t('history.decreaseRefundQty')} — ${displayName}`}
                        className="size-7 flex items-center justify-center bg-secondary rounded-md text-foreground hover:bg-muted transition-colors"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-5 text-center font-semibold font-mono text-xs text-foreground">
                        {current}
                      </span>
                      <button
                        onClick={() =>
                          setSelection({
                            ...selection,
                            [lineId]: Math.min(max, current + 1),
                          })
                        }
                        aria-label={`${t('history.increaseRefundQty')} — ${displayName}`}
                        className="size-7 flex items-center justify-center bg-secondary rounded-md text-foreground hover:bg-muted transition-colors"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {renderRefundAmounts()}
              {needsOverride && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-destructive mb-2 font-medium text-xs">
                    <Lock size={14} /> {t('history.managerAuthRequired')}
                  </div>
                  <input
                    type="password"
                    placeholder={t('history.managerPin')}
                    aria-label={t('history.managerPin')}
                    data-autofocus
                    value={overridePin}
                    onChange={(e) => setOverridePin(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-center tracking-widest font-mono text-sm focus:outline-none focus:border-foreground"
                  />
                  {overrideError && (
                    <p className="text-xs text-destructive mt-1.5 text-center">{overrideError}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border bg-card flex gap-2.5">
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              className="btn-secondary text-xs h-9 px-4 rounded-lg"
            >
              {t('history.back')}
            </button>
          )}
          <button
            onClick={handleProcessRefund}
            disabled={step === 1 && Object.values(selection).reduce((a, b) => a + b, 0) === 0}
            className="btn-primary flex-1 text-xs h-9 px-4 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            {step === 1 ? t('history.next') : t('history.confirmRefund')}{' '}
            {step === 1 && <ChevronRight size={14} />}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
