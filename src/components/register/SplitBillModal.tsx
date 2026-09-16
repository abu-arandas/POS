import { useState, useMemo } from 'react';
import {
  Users,
  Divide,
  X,
  Check,
  CreditCard,
  Banknote,
  Plus,
  Minus,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { StoreSettings } from '../../types';
import { RegisterCartLine, cartLineKey } from './useRegisterCart';
import { calculateModifierPriceDelta } from '../../lib/modifiers';
import { variantPrice } from '../../lib/variants';
import { playSuccessChime } from '../../lib/audioFeedback';
import { notify } from '../../lib/utils/ui';

export interface SplitBillModalProps {
  cart: RegisterCartLine[];
  totalAmount: number;
  settings: StoreSettings;
  onClose: () => void;
  onCompleteSplitSale: (payments: Array<{ method: string; amount: number }>) => void;
}

export function SplitBillModal({
  cart,
  totalAmount,
  settings,
  onClose,
  onCompleteSplitSale,
}: SplitBillModalProps) {
  const { t } = useTranslation();
  const [splitMode, setSplitMode] = useState<'even' | 'items'>('even');

  // Even split state
  const [numGuests, setNumGuests] = useState(2);
  const [paidShares, setPaidShares] = useState<Array<{ guestNum: number; method: string; amount: number }>>([]);

  const evenShare = useMemo(() => {
    return Number((totalAmount / numGuests).toFixed(2));
  }, [totalAmount, numGuests]);

  const evenRemaining = useMemo(() => {
    const paidSum = paidShares.reduce((s, p) => s + p.amount, 0);
    return Math.max(0, Number((totalAmount - paidSum).toFixed(2)));
  }, [totalAmount, paidShares]);

  // Items split state: Map of cart line key -> seat/guest number (1-based)
  const [itemSeatMap, setItemSeatMap] = useState<Record<string, number>>({});
  const [activeSeatCount, setActiveSeatCount] = useState(2);
  const [paidSeats, setPaidSeats] = useState<number[]>([]);

  const handlePayEvenShare = (method: 'cash' | 'card') => {
    const currentGuestNum = paidShares.length + 1;
    const isLast = currentGuestNum === numGuests;
    const amountToPay = isLast ? evenRemaining : Math.min(evenShare, evenRemaining);

    const nextPaid = [
      ...paidShares,
      { guestNum: currentGuestNum, method, amount: amountToPay },
    ];
    setPaidShares(nextPaid);
    playSuccessChime();

    if (isLast || evenRemaining - amountToPay <= 0.01) {
      notify(t('split.allPaid', { defaultValue: 'All shares settled successfully!' }));
      onCompleteSplitSale(nextPaid.map((p) => ({ method: p.method, amount: p.amount })));
    }
  };

  // Compute total per seat
  const seatTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    for (let i = 1; i <= activeSeatCount; i++) totals[i] = 0;

    cart.forEach((line) => {
      const key = cartLineKey(line);
      const seat = itemSeatMap[key] || 1;
      const unitPrice =
        variantPrice(line.product, line.variant) + calculateModifierPriceDelta(line.modifiers);
      const lineTotal = unitPrice * line.quantity;
      totals[seat] = (totals[seat] || 0) + lineTotal;
    });
    return totals;
  }, [cart, itemSeatMap, activeSeatCount]);

  const handlePaySeat = (seatNum: number, method: 'cash' | 'card') => {
    if (paidSeats.includes(seatNum)) return;
    const nextPaid = [...paidSeats, seatNum];
    setPaidSeats(nextPaid);
    playSuccessChime();

    if (nextPaid.length === activeSeatCount) {
      notify(t('split.allPaid', { defaultValue: 'All seats settled successfully!' }));
      const allPayments = nextPaid.map((s) => ({
        method,
        amount: seatTotals[s] || 0,
      }));
      onCompleteSplitSale(allPayments);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Divide size={16} />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-base">
                {t('split.title', { defaultValue: 'Split Bill & Settle Check' })}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Total to settle: <span className="font-mono font-bold text-foreground">{settings.currency}{totalAmount.toFixed(2)}</span>
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

        {/* Split Mode Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-secondary/80 rounded-xl my-4 border border-border">
          <button
            onClick={() => setSplitMode('even')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              splitMode === 'even'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Divide size={13} />
            <span>Split Evenly ({numGuests} Ways)</span>
          </button>
          <button
            onClick={() => setSplitMode('items')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              splitMode === 'items'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users size={13} />
            <span>Split by Seat / Item</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-4 pe-1">
          {splitMode === 'even' ? (
            <div className="space-y-4">
              {/* Number of guests selector */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-secondary/30">
                <span className="text-xs font-medium text-foreground">Split across guests:</span>
                <div className="flex items-center gap-3">
                  <button
                    disabled={numGuests <= 2 || paidShares.length > 0}
                    onClick={() => setNumGuests((n) => Math.max(2, n - 1))}
                    className="size-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="font-mono text-base font-bold text-foreground w-6 text-center">
                    {numGuests}
                  </span>
                  <button
                    disabled={numGuests >= 12 || paidShares.length > 0}
                    onClick={() => setNumGuests((n) => Math.min(12, n + 1))}
                    className="size-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Share Breakdown Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-border bg-card">
                  <span className="text-[10px] font-mono uppercase text-muted-foreground block">
                    Per Person Share
                  </span>
                  <span className="font-mono text-xl font-bold text-foreground num">
                    {settings.currency}{evenShare.toFixed(2)}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl border border-border bg-card">
                  <span className="text-[10px] font-mono uppercase text-muted-foreground block">
                    Remaining to Pay
                  </span>
                  <span className="font-mono text-xl font-bold text-emerald-500 num">
                    {settings.currency}{evenRemaining.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Shares status & payment action */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-muted-foreground block">
                  Guest Payments ({paidShares.length} of {numGuests} settled):
                </span>
                <div className="space-y-2">
                  {Array.from({ length: numGuests }).map((_, idx) => {
                    const guestIndex = idx + 1;
                    const paidRecord = paidShares.find((p) => p.guestNum === guestIndex);
                    const isNextToPay = guestIndex === paidShares.length + 1;

                    return (
                      <div
                        key={guestIndex}
                        className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                          paidRecord
                            ? 'border-emerald-500/30 bg-emerald-500/5'
                            : isNextToPay
                              ? 'border-primary/50 bg-primary/5 shadow-xs'
                              : 'border-border opacity-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`size-7 rounded-full flex items-center justify-center font-mono text-xs font-bold ${
                            paidRecord
                              ? 'bg-emerald-500 text-white'
                              : isNextToPay
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground'
                          }`}>
                            {paidRecord ? <Check size={12} className="stroke-3" /> : guestIndex}
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-foreground block">
                              Guest {guestIndex}
                            </span>
                            <span className="text-[11px] font-mono text-muted-foreground">
                              {settings.currency}{guestIndex === numGuests ? evenRemaining.toFixed(2) : evenShare.toFixed(2)}
                              {paidRecord && ` • Paid via ${paidRecord.method.toUpperCase()}`}
                            </span>
                          </div>
                        </div>

                        {isNextToPay && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handlePayEvenShare('cash')}
                              className="h-8 px-3 rounded-lg border border-border bg-card text-foreground hover:bg-muted text-xs font-medium flex items-center gap-1.5"
                            >
                              <Banknote size={13} />
                              <span>Cash</span>
                            </button>
                            <button
                              onClick={() => handlePayEvenShare('card')}
                              className="h-8 px-3 rounded-lg btn-primary text-xs font-medium flex items-center gap-1.5"
                            >
                              <CreditCard size={13} />
                              <span>Card</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Seat Count Controls */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-secondary/30">
                <span className="text-xs font-medium text-foreground">Total Seats / Checks:</span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={activeSeatCount <= 2}
                    onClick={() => setActiveSeatCount((n) => Math.max(2, n - 1))}
                    className="size-7 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="font-mono text-sm font-bold text-foreground w-6 text-center">
                    {activeSeatCount}
                  </span>
                  <button
                    disabled={activeSeatCount >= 8}
                    onClick={() => setActiveSeatCount((n) => Math.min(8, n + 1))}
                    className="size-7 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>

              {/* Items seat assignment */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-muted-foreground block">
                  Assign Items to Seats:
                </span>
                <div className="space-y-1.5">
                  {cart.map((line) => {
                    const key = cartLineKey(line);
                    const currentSeat = itemSeatMap[key] || 1;
                    const price =
                      (variantPrice(line.product, line.variant) +
                        calculateModifierPriceDelta(line.modifiers)) *
                      line.quantity;

                    return (
                      <div
                        key={key}
                        className="p-2.5 rounded-xl border border-border bg-card flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <h4 className="text-xs font-medium text-foreground truncate">
                            {line.quantity}x {line.product.name}
                          </h4>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {settings.currency}{price.toFixed(2)}
                          </span>
                        </div>

                        {/* Seat selector pills */}
                        <div className="flex items-center gap-1">
                          {Array.from({ length: activeSeatCount }).map((_, sIdx) => {
                            const seatNum = sIdx + 1;
                            const isSelected = currentSeat === seatNum;
                            return (
                              <button
                                key={seatNum}
                                onClick={() =>
                                  setItemSeatMap((prev) => ({ ...prev, [key]: seatNum }))
                                }
                                className={`size-7 rounded-lg text-xs font-mono font-bold transition-all ${
                                  isSelected
                                    ? 'bg-foreground text-background shadow-xs'
                                    : 'border border-border text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                S{seatNum}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Seat Totals & Pay per Seat */}
              <div className="space-y-2 pt-2 border-t border-border">
                <span className="text-xs font-semibold text-muted-foreground block">
                  Seat Balances:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Array.from({ length: activeSeatCount }).map((_, sIdx) => {
                    const seatNum = sIdx + 1;
                    const isPaid = paidSeats.includes(seatNum);
                    const total = seatTotals[seatNum] || 0;

                    return (
                      <div
                        key={seatNum}
                        className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                          isPaid
                            ? 'border-emerald-500/30 bg-emerald-500/5'
                            : 'border-border bg-card'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground">
                            Seat {seatNum}
                          </span>
                          <span className="font-mono font-bold text-sm text-foreground">
                            {settings.currency}{total.toFixed(2)}
                          </span>
                        </div>

                        {isPaid ? (
                          <div className="flex items-center gap-1 text-emerald-500 text-xs font-semibold">
                            <Check size={13} className="stroke-3" />
                            <span>Paid</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              disabled={total <= 0}
                              onClick={() => handlePaySeat(seatNum, 'cash')}
                              className="flex-1 h-7 rounded-lg border border-border bg-secondary hover:bg-muted text-[11px] font-medium disabled:opacity-30"
                            >
                              Cash
                            </button>
                            <button
                              disabled={total <= 0}
                              onClick={() => handlePaySeat(seatNum, 'card')}
                              className="flex-1 h-7 rounded-lg btn-primary text-[11px] font-medium disabled:opacity-30"
                            >
                              Card
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
