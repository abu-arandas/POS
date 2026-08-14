import type { ComponentType, RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, CreditCard, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Payment, PaymentMethod } from '../../types';

// The single-payment selector offers these four (no loyalty); split lines use
// the full PaymentMethod.
type SinglePaymentMethod = 'cash' | 'card' | 'mobile' | 'gift';

export interface PaymentMethodOption {
  id: SinglePaymentMethod;
  label: string;
  icon: ComponentType<{ size?: number }>;
  activeClass: string;
}

interface PaymentModalProps {
  open: boolean;
  /** Ref for the dialog card, from useModalA11y (focus trap / Escape / restore). */
  dialogRef: RefObject<HTMLDivElement | null>;
  currency: string;
  totalAmount: number;
  paymentMethods: readonly PaymentMethodOption[];
  paymentMethod: SinglePaymentMethod;
  onSelectMethod: (method: SinglePaymentMethod) => void;
  splitMode: boolean;
  onToggleSplit: () => void;
  splitPayments: Payment[];
  splitRemaining: number;
  splitPaidTotal: number;
  onAddSplit: () => void;
  onUpdateSplit: (index: number, patch: Partial<Payment>) => void;
  onRemoveSplit: (index: number) => void;
  cashSuggestions: number[];
  cashPaidText: string;
  onCashPaidChange: (value: string) => void;
  cashChangeDue: number;
  onComplete: () => void;
  onClose: () => void;
}

// The checkout / payment modal: single or split payment, cash tendering with
// change, and order completion. Extracted from Register, which keeps ownership
// of the payment state and passes it (plus the derived totals and handlers) as
// props, so behavior is unchanged.
export function PaymentModal({
  open,
  dialogRef,
  currency,
  totalAmount,
  paymentMethods,
  paymentMethod,
  onSelectMethod,
  splitMode,
  onToggleSplit,
  splitPayments,
  splitRemaining,
  splitPaidTotal,
  onAddSplit,
  onUpdateSplit,
  onRemoveSplit,
  cashSuggestions,
  cashPaidText,
  onCashPaidChange,
  cashChangeDue,
  onComplete,
  onClose,
}: PaymentModalProps) {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {open && (
        <div
          id="payment-modal"
          className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4"
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-modal-title"
            tabIndex={-1}
            initial={{ scale: 0.9, opacity: 0, y: 28 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 28 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            className="modal-card max-w-lg w-full overflow-hidden flex flex-col"
          >
            <div
              className="p-5 flex justify-between items-center"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div>
                <h3
                  id="payment-modal-title"
                  className="font-sans font-bold text-slate-900 dark:text-white text-lg"
                >
                  {t('register.selectPaymentMethod')}
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-1 flex items-center gap-2">
                  {t('register.amountToPay')}
                  <span className="font-bold text-xl text-emerald-400 tracking-tight font-mono">
                    {currency}
                    {totalAmount.toFixed(2)}
                  </span>
                </p>
              </div>
              <button
                onClick={() => onClose()}
                aria-label={t('register.close')}
                className="p-1.5 text-slate-500 hover:text-white hover:bg-white/8 rounded-xl transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <button
                id="split-toggle-btn"
                onClick={onToggleSplit}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: splitMode ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
                  border: splitMode
                    ? '1px solid rgba(16,185,129,0.35)'
                    : '1px solid rgba(255,255,255,0.08)',
                  color: splitMode ? '#34d399' : '#64748b',
                }}
              >
                <CreditCard size={14} />
                {splitMode ? t('register.singlePayment') : t('register.splitPayment')}
              </button>

              {!splitMode && (
                <div className="grid grid-cols-4 gap-2.5">
                  {paymentMethods.map((m) => {
                    const MIcon = m.icon;
                    const isSel = paymentMethod === m.id;
                    return (
                      <motion.button
                        key={m.id}
                        id={`pay-method-${m.id}`}
                        onClick={() => onSelectMethod(m.id)}
                        whileTap={{ scale: 0.93 }}
                        aria-pressed={isSel}
                        className={`pay-method-btn ${isSel ? m.activeClass : ''}`}
                      >
                        <MIcon size={20} />
                        <span>{m.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {splitMode && (
                <div className="space-y-2.5">
                  {splitPayments.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div
                        className="flex-1 flex items-center rounded-xl overflow-hidden transition-all"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.09)',
                        }}
                      >
                        <select
                          value={p.method}
                          onChange={(e) =>
                            onUpdateSplit(idx, { method: e.target.value as PaymentMethod })
                          }
                          aria-label={t('register.method')}
                          className="bg-transparent text-xs font-semibold ps-3 pe-7 py-3 text-slate-600 dark:text-slate-300 focus:outline-none cursor-pointer"
                          style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}
                        >
                          <option value="cash">{t('register.payCash')}</option>
                          <option value="card">{t('register.payCard')}</option>
                          <option value="mobile">{t('register.payMobile')}</option>
                          <option value="gift">{t('register.payGift')}</option>
                        </select>
                        <div className="flex-1 flex items-center px-3">
                          <span className="font-mono text-slate-500 font-bold text-sm">
                            {currency}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={p.amount || ''}
                            onChange={(e) =>
                              onUpdateSplit(idx, { amount: parseFloat(e.target.value) || 0 })
                            }
                            aria-label={t('register.amountToPay')}
                            className="flex-1 bg-transparent text-slate-900 dark:text-white text-base font-mono font-bold px-2 py-2.5 focus:outline-none w-full"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => onRemoveSplit(idx)}
                        disabled={splitPayments.length <= 1}
                        aria-label={t('register.removePayment')}
                        className="p-2.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl disabled:opacity-25 transition-colors"
                        style={{
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(255,255,255,0.04)',
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={onAddSplit}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                      style={{ color: '#34d399', border: '1px dashed rgba(16,185,129,0.35)' }}
                    >
                      + {t('register.addPayment')}
                    </button>
                    <span
                      className={`text-xs font-mono font-bold px-3 py-1.5 rounded-lg badge ${
                        Math.abs(splitRemaining) < 0.005 ? 'badge-emerald' : 'badge-amber'
                      }`}
                    >
                      {splitRemaining > 0.005
                        ? `${t('register.remaining')}: ${currency}${splitRemaining.toFixed(2)}`
                        : splitRemaining < -0.005
                          ? `${t('register.changeDue')}: ${currency}${Math.abs(splitRemaining).toFixed(2)}`
                          : t('register.splitBalanced')}
                    </span>
                  </div>
                </div>
              )}

              <AnimatePresence mode="wait">
                {!splitMode && paymentMethod === 'cash' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-4 pt-4 overflow-hidden"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-2 uppercase tracking-wider">
                        {t('register.quickCashPay')}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {cashSuggestions.map((val) => (
                          <motion.button
                            key={val}
                            whileTap={{ scale: 0.93 }}
                            onClick={() => onCashPaidChange(val.toFixed(2))}
                            className="font-mono text-sm font-bold px-3.5 py-2 rounded-xl transition-all"
                            style={{
                              background:
                                cashPaidText === val.toFixed(2)
                                  ? 'rgba(16,185,129,0.2)'
                                  : 'rgba(255,255,255,0.05)',
                              border:
                                cashPaidText === val.toFixed(2)
                                  ? '1px solid rgba(16,185,129,0.4)'
                                  : '1px solid rgba(255,255,255,0.09)',
                              color: cashPaidText === val.toFixed(2) ? '#34d399' : '#94a3b8',
                            }}
                          >
                            {currency}
                            {val.toFixed(2)}
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="cash-tendered-input"
                          className="text-[10px] font-bold text-slate-600 block mb-1.5 uppercase tracking-wider"
                        >
                          {t('register.cashTendered')}
                        </label>
                        <div
                          className="flex items-center rounded-xl overflow-hidden transition-all"
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                          }}
                        >
                          <span className="font-mono text-slate-500 ps-3 font-bold text-sm">
                            {currency}
                          </span>
                          <input
                            id="cash-tendered-input"
                            type="number"
                            step="0.01"
                            min={totalAmount}
                            placeholder="0.00"
                            value={cashPaidText}
                            onChange={(e) => onCashPaidChange(e.target.value)}
                            aria-label={t('register.cashTendered')}
                            className="flex-1 bg-transparent text-slate-900 dark:text-white text-xl font-mono font-bold px-2 py-2.5 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-1.5 uppercase tracking-wider">
                          {t('register.changeDue')}
                        </label>
                        <div
                          className="rounded-xl px-4 flex items-center justify-between"
                          style={{
                            height: '48px',
                            background: 'rgba(16,185,129,0.1)',
                            border: '1px solid rgba(16,185,129,0.25)',
                          }}
                        >
                          <span className="text-emerald-600 text-[10px] font-bold uppercase tracking-wider">
                            {t('register.returnAmount')}
                          </span>
                          <span className="font-mono text-emerald-400 font-bold text-xl">
                            {currency}
                            {cashChangeDue.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div
              className="p-4 flex items-center gap-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
            >
              <button
                onClick={() => onClose()}
                className="px-5 py-3 rounded-xl text-sm font-bold transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  color: '#64748b',
                }}
              >
                {t('register.cancel')}
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onComplete}
                disabled={
                  splitMode
                    ? splitPaidTotal < totalAmount - 0.005
                    : paymentMethod === 'cash' &&
                      totalAmount > 0 &&
                      (parseFloat(cashPaidText) || 0) < totalAmount
                }
                className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #059669, #10b981)',
                  color: 'white',
                  boxShadow: '0 4px 20px rgba(16,185,129,0.35)',
                }}
              >
                <Check size={17} strokeWidth={2.5} />
                <span>{t('register.completeOrder')}</span>
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
