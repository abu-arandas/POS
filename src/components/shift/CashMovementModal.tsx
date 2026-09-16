import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  DollarSign,
  X,
  Check,
  Tag,
  FileText,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { CashMovementType, StoreSettings } from '../../types';
import { useShiftStore } from '../../stores/shiftStore';
import { useAuthStore } from '../../stores/authStore';
import { playSuccessChime } from '../../lib/audioFeedback';
import { notify } from '../../lib/utils/ui';

interface CashMovementModalProps {
  initialType?: CashMovementType;
  settings: StoreSettings;
  onClose: () => void;
}

const COMMON_REASONS: Record<CashMovementType, string[]> = {
  pay_in: ['Drawer Float Top-up', 'Bank Coin Roll', 'Change replenishment', 'Customer Overpayment'],
  pay_out: ['Supplier CoD Cash', 'Grocery/Ingredient Run', 'Staff Tips Payout', 'Cleaning Supplies', 'Courier Fee'],
};

const PRESET_AMOUNTS = [10, 20, 50, 100];

export function CashMovementModal({
  initialType = 'pay_out',
  settings,
  onClose,
}: CashMovementModalProps) {
  const { t } = useTranslation();
  const [type, setType] = useState<CashMovementType>(initialType);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const addCashMovement = useShiftStore((s) => s.addCashMovement);
  const currentUser = useAuthStore((s) => s.currentUser);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      notify(t('shift.invalidAmount', { defaultValue: 'Please enter a valid cash amount.' }));
      return;
    }
    if (!reason.trim()) {
      notify(t('shift.reasonRequired', { defaultValue: 'Please provide a reason for this cash movement.' }));
      return;
    }

    addCashMovement({
      type,
      amount: parsedAmount,
      reason: reason.trim(),
      performedBy: currentUser?.name || 'Cashier',
    });

    playSuccessChime();
    notify(
      type === 'pay_in'
        ? t('shift.payInRecorded', { defaultValue: `Recorded deposit of ${settings.currency}${parsedAmount.toFixed(2)}` })
        : t('shift.payOutRecorded', { defaultValue: `Recorded expense of ${settings.currency}${parsedAmount.toFixed(2)}` }),
    );
    onClose();
  };

  const isPayIn = type === 'pay_in';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className={`size-8 rounded-lg flex items-center justify-center ${
              isPayIn ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              {isPayIn ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-base">
                {t('shift.cashMovement', { defaultValue: 'Drawer Cash Movement' })}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Petty cash audit & cash drawer float adjustments
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg"
          >
            <X size={16} />
          </button>
        </div>

        {/* Type Toggle */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-secondary/80 rounded-xl my-4 border border-border">
          <button
            type="button"
            onClick={() => setType('pay_in')}
            className={`py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              isPayIn
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ArrowDownLeft size={14} />
            <span>Pay In (Deposit)</span>
          </button>
          <button
            type="button"
            onClick={() => setType('pay_out')}
            className={`py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              !isPayIn
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ArrowUpRight size={14} />
            <span>Pay Out (Expense)</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount input */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Amount ({settings.currency}) *
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 start-3 flex items-center text-muted-foreground font-mono text-base">
                {settings.currency}
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                autoFocus
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-background border border-border rounded-xl ps-9 pe-4 py-2.5 text-base font-mono font-bold text-foreground focus:outline-none focus:border-foreground"
              />
            </div>

            {/* Quick preset chips */}
            <div className="flex items-center gap-2 mt-2">
              {PRESET_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setAmount(String(amt))}
                  className="flex-1 py-1 rounded-lg border border-border bg-secondary hover:bg-muted text-xs font-mono font-medium transition-colors"
                >
                  +{settings.currency}{amt}
                </button>
              ))}
            </div>
          </div>

          {/* Reason input */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Reason / Memo *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Milk & Coffee beans run"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-foreground mb-2"
            />

            {/* Reason presets */}
            <div className="flex flex-wrap gap-1.5">
              {COMMON_REASONS[type].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className="text-[10px] px-2 py-0.5 rounded-md border border-border/80 bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary h-9 px-4 rounded-xl text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`h-9 px-5 rounded-xl text-xs font-semibold flex items-center gap-1.5 active:scale-[0.98] text-white shadow-xs ${
                isPayIn ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              <Check size={14} className="stroke-3" />
              <span>Confirm {isPayIn ? 'Pay-In' : 'Pay-Out'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
