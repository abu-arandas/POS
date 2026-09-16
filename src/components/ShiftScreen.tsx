import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clock,
  DollarSign,
  LockKeyhole,
  Unlock,
  Printer,
  AlertTriangle,
  Check,
  User,
  ShoppingBag,
  Timer,
  ArrowDownLeft,
  ArrowUpRight,
  Share2,
  Copy,
  Mail,
  Send,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShiftStore } from '../stores/shiftStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { summarizeShift } from '../lib/shiftReport';
import { escapeHtml } from '../lib/utils/formatting';
import { openDetachedPrintWindow } from '../lib/utils/dom';
import { CashMovementType, Shift } from '../types';
import { askConfirmation, notify } from '../lib/utils/ui';
import { CashMovementModal } from './shift/CashMovementModal';
import { ModalShell } from './shared/ModalShell';
import { useModalA11y } from '../lib/useModalA11y';
import {
  generateDailySummaryText,
  shareToWhatsApp,
  shareViaEmail,
  copyReportToClipboard,
} from '../lib/dailySummaryReport';

/**
 * Shift screen: open and close a drawer with an opening float, manage petty cash
 * pay-ins and payouts, and produce the Z-report reconciling counted cash against expected.
 */
export default function ShiftScreen() {
  const { t } = useTranslation();
  const { shifts, currentShiftId, cashMovements, openShift, closeShift } = useShiftStore();
  const { transactions } = useTransactionStore();
  const { currentUser } = useAuthStore();
  const { settings } = useSettingsStore();
  const cur = settings.currency;

  const [openFloat, setOpenFloat] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Cash movement modal state
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<CashMovementType>('pay_out');
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const shareModalRef = useModalA11y(shareMenuOpen, () => setShareMenuOpen(false));

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const currentShift = shifts.find((s) => s.id === currentShiftId) || null;

  const currentShiftMovements = useMemo(
    () => (currentShift ? cashMovements.filter((m) => m.shiftId === currentShift.id) : []),
    [cashMovements, currentShift],
  );

  const totalPayIns = useMemo(
    () =>
      currentShiftMovements.filter((m) => m.type === 'pay_in').reduce((s, m) => s + m.amount, 0),
    [currentShiftMovements],
  );

  const totalPayOuts = useMemo(
    () =>
      currentShiftMovements.filter((m) => m.type === 'pay_out').reduce((s, m) => s + m.amount, 0),
    [currentShiftMovements],
  );

  const shiftTxns = useMemo(
    () => (currentShift ? transactions.filter((tx) => tx.shiftId === currentShift.id) : []),
    [transactions, currentShift],
  );
  const summary = useMemo(() => summarizeShift(shiftTxns), [shiftTxns]);
  const expectedCash = currentShift
    ? summary.expectedCash(currentShift.openingFloat, currentShiftMovements)
    : 0;
  const variance =
    countedCash !== '' ? Number((parseFloat(countedCash) - expectedCash).toFixed(2)) : null;

  const handleOpen = () => {
    const float = parseFloat(openFloat) || 0;
    openShift(currentUser?.name ?? 'Unknown', float);
    setOpenFloat('');
  };

  const handleClose = async () => {
    if (!currentShift) return;
    const counted = parseFloat(countedCash) || 0;
    if (!(await askConfirmation(t('shift.confirmClose')))) return;
    closeShift(currentShift.id, counted, closeNote, currentUser?.name ?? 'Unknown');
    setCountedCash('');
    setCloseNote('');
  };

  /**
   * Prints a shift's Z-report: what the register took, broken down by tender,
   * against the cash actually counted at close.
   */
  const printReport = (shift: Shift) => {
    const txns = transactions.filter((tx) => tx.shiftId === shift.id);
    const movements = cashMovements.filter((m) => m.shiftId === shift.id);
    const s = summarizeShift(txns);
    const expected = s.expectedCash(shift.openingFloat, movements);
    // Printed as their own rows, not just folded into EXPECTED CASH. Without
    // them the document does not reconcile on its face: float plus cash sales
    // minus refunds does not reach the expected figure, and nothing on the page
    // accounts for the difference.
    const payIns = movements
      .filter((m) => m.type === 'pay_in')
      .reduce((sum, m) => sum + m.amount, 0);
    const payOuts = movements
      .filter((m) => m.type === 'pay_out')
      .reduce((sum, m) => sum + m.amount, 0);
    const counted = shift.countedCash ?? 0;
    const w = openDetachedPrintWindow();
    if (!w) return;
    const esc = escapeHtml;
    // row() escapes both of its arguments, so callers pass RAW values. Passing
    // pre-escaped text (which is what `esc(cur)` and `esc(shift.openedBy)` used
    // to do) escapes it twice and prints a store named "Ben & Co" as
    // "Ben &amp; Co". The two places that interpolate outside row() escape for
    // themselves.
    const c = cur;
    const row = (label: string, val: string) =>
      `<div class="flex-row"><span>${esc(label)}</span><span>${esc(val)}</span></div>`;
    w.document.write(`<html><head><title>Z-Report ${esc(shift.id)}</title><style>
      body{font-family:'Courier New',monospace;width:80mm;padding:8px;font-size:12px;color:#000}
      .center{text-align:center}.bold{font-weight:bold}.divider{border-top:1px dashed #000;margin:8px 0}
      .flex-row{display:flex;justify-content:space-between}</style></head>
      <body onload="window.print();window.close()">
      <div class="center bold">${esc(settings.storeName)}</div>
      <div class="center">Z-REPORT / SHIFT SUMMARY</div><div class="divider"></div>
      ${row('OPENED', new Date(shift.openedAt).toLocaleString())}
      ${row('OPERATOR', shift.openedBy)}
      ${shift.closedAt ? row('CLOSED', new Date(shift.closedAt).toLocaleString()) : ''}
      <div class="divider"></div>
      ${row('SALES', String(s.saleCount))}
      ${row('GROSS', c + s.grossSales.toFixed(2))}
      ${row('CASH SALES', c + s.cashSales.toFixed(2))}
      ${row('CARD', c + s.cardSales.toFixed(2))}
      ${row('MOBILE', c + s.mobileSales.toFixed(2))}
      ${row('GIFT', c + s.giftSales.toFixed(2))}
      ${row('CASH REFUNDS', c + s.cashRefunds.toFixed(2))}
      <div class="divider"></div>
      ${row('OPENING FLOAT', c + shift.openingFloat.toFixed(2))}
      ${payIns > 0 ? row('PAY-INS', c + payIns.toFixed(2)) : ''}
      ${payOuts > 0 ? row('PAY-OUTS', c + payOuts.toFixed(2)) : ''}
      ${row('EXPECTED CASH', c + expected.toFixed(2))}
      ${shift.closedAt ? row('COUNTED CASH', c + counted.toFixed(2)) : ''}
      ${shift.closedAt ? `<div class="flex-row bold"><span>VARIANCE</span><span>${esc(c + (counted - expected).toFixed(2))}</span></div>` : ''}
      <div class="divider"></div>
      <div class="center">${new Date().toLocaleString()}</div>
      </body></html>`);
    w.document.close();
  };

  const closedShifts = shifts.filter((s) => s.closedAt);

  const getShiftDuration = (openedAt: string) => {
    const start = new Date(openedAt).getTime();
    const diff = Math.max(0, currentTime - start);
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background p-6 text-foreground">
      <div className="mb-6 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Clock className="size-5 text-muted-foreground" /> {t('shift.title')}
          </h2>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">{t('shift.subtitle')}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pe-1">
        <AnimatePresence mode="wait">
          {!currentShift ? (
            <motion.div
              key="no-shift"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="bg-card border border-border rounded-xl p-8 max-w-md mx-auto text-center shadow-xs"
            >
              <div className="mx-auto size-12 rounded-full bg-secondary border border-border text-foreground flex items-center justify-center mb-4">
                <Unlock size={20} />
              </div>
              <h3 className="font-semibold text-base text-foreground mb-1">
                {t('shift.noOpenShift')}
              </h3>
              <p className="text-xs text-muted-foreground mb-6">{t('shift.openHint')}</p>

              <div className="text-start bg-secondary/30 p-4 rounded-xl border border-border">
                <label
                  htmlFor="opening-float-input"
                  className="block text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2"
                >
                  {t('shift.openingFloat')}
                </label>
                <div className="flex items-center rounded-lg bg-background px-3 py-1 border border-border focus-within:border-foreground/50 transition-colors">
                  <span className="font-mono text-sm text-muted-foreground">{cur}</span>
                  <input
                    id="opening-float-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={openFloat}
                    onChange={(e) => setOpenFloat(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-transparent border-none p-2 font-mono num text-xl font-semibold text-foreground focus:outline-none"
                  />
                </div>
              </div>

              <button
                id="open-shift-btn"
                onClick={handleOpen}
                disabled={openFloat === ''}
                className="w-full mt-5 btn-primary h-10 text-xs font-medium gap-2 disabled:opacity-50"
              >
                <Unlock size={14} />
                {t('shift.openShift')}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="active-shift"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-5"
            >
              {/* Active Shift Overview */}
              <div className="lg:col-span-2 space-y-5">
                <div className="bg-card border border-border rounded-xl p-5 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="font-semibold text-lg text-foreground">
                          {t('shift.currentShift')}
                        </h3>
                        <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 flex items-center gap-1.5">
                          <span className="size-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          {t('shift.open')}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/40 px-2.5 py-1 rounded-md border border-border">
                          <User size={13} className="text-muted-foreground" />
                          <span className="font-medium text-foreground">
                            {currentShift.openedBy}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/40 px-2.5 py-1 rounded-md border border-border">
                          <Timer size={13} className="text-muted-foreground" />
                          <span className="font-mono font-medium text-foreground">
                            {getShiftDuration(currentShift.openedAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/40 px-2.5 py-1 rounded-md border border-border">
                          <ShoppingBag size={13} className="text-muted-foreground" />
                          <span className="font-mono font-medium text-foreground">
                            {summary.saleCount} {t('shift.sales')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Drawer & Report Actions */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => {
                          setMovementType('pay_in');
                          setMovementModalOpen(true);
                        }}
                        className="h-8 px-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <ArrowDownLeft size={13} />
                        <span>Pay-In</span>
                      </button>
                      <button
                        onClick={() => {
                          setMovementType('pay_out');
                          setMovementModalOpen(true);
                        }}
                        className="h-8 px-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <ArrowUpRight size={13} />
                        <span>Pay-Out</span>
                      </button>
                      <button
                        onClick={() => setShareMenuOpen(true)}
                        className="h-8 px-3 rounded-lg btn-secondary text-xs font-medium flex items-center gap-1.5"
                      >
                        <Share2 size={13} />
                        <span>Daily Report</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    {
                      label: t('shift.gross'),
                      val: `${cur}${summary.grossSales.toFixed(2)}`,
                    },
                    {
                      label: t('shift.cashSales'),
                      val: `${cur}${summary.cashSales.toFixed(2)}`,
                    },
                    {
                      label: t('dashboard.card'),
                      val: `${cur}${summary.cardSales.toFixed(2)}`,
                    },
                    {
                      label: t('dashboard.mobile'),
                      val: `${cur}${summary.mobileSales.toFixed(2)}`,
                    },
                    {
                      label: t('shift.cashRefunds'),
                      val: `${cur}${summary.cashRefunds.toFixed(2)}`,
                    },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="bg-card border border-border rounded-xl p-4 shadow-2xs"
                    >
                      <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider block mb-1.5">
                        {s.label}
                      </span>
                      <span className="font-mono font-semibold text-xl num text-foreground">
                        {s.val}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Petty Cash & Drawer Movements Log */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-2xs">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <DollarSign size={14} className="text-muted-foreground" />
                      Drawer Cash Activity & Petty Cash Log ({currentShiftMovements.length})
                    </h4>
                  </div>
                  {currentShiftMovements.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      No petty cash movements recorded this shift. Use Pay-In or Pay-Out to record
                      drawer deposits or expenses.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {currentShiftMovements.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-border/70 bg-secondary/30 text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`size-6 rounded-md flex items-center justify-center ${
                                m.type === 'pay_in'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {m.type === 'pay_in' ? (
                                <ArrowDownLeft size={13} />
                              ) : (
                                <ArrowUpRight size={13} />
                              )}
                            </div>
                            <div>
                              <span className="font-medium text-foreground block">{m.reason}</span>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {new Date(m.createdAt).toLocaleTimeString()} • {m.performedBy}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`font-mono font-bold num ${
                              m.type === 'pay_in' ? 'text-emerald-500' : 'text-amber-500'
                            }`}
                          >
                            {m.type === 'pay_in' ? '+' : '-'}
                            {cur}
                            {m.amount.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Close Shift (Z-Report Style) */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-2xs flex flex-col justify-between">
                <div>
                  <h3 className="font-semibold text-xs sm:text-sm text-foreground flex items-center gap-2 mb-4">
                    <LockKeyhole size={15} className="text-muted-foreground" />{' '}
                    {t('shift.closeReconcile')}
                  </h3>

                  <div className="space-y-2.5 text-xs font-mono">
                    <div className="flex justify-between items-center border-b border-dashed border-border pb-2">
                      <span className="text-muted-foreground">{t('shift.openingFloat')}</span>
                      <span className="num font-medium text-foreground">
                        {cur}
                        {currentShift.openingFloat.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-b border-dashed border-border pb-2">
                      <span className="text-muted-foreground">{t('shift.cashSales')}</span>
                      <span className="num font-medium text-foreground">
                        +{cur}
                        {summary.cashSales.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-b border-dashed border-border pb-2">
                      <span className="text-muted-foreground">{t('shift.cashRefunds')}</span>
                      <span className="num font-medium text-destructive">
                        -{cur}
                        {summary.cashRefunds.toFixed(2)}
                      </span>
                    </div>
                    {totalPayIns > 0 && (
                      <div className="flex justify-between items-center border-b border-dashed border-border pb-2">
                        <span className="text-muted-foreground">Cash Deposits (Pay-In)</span>
                        <span className="num font-medium text-emerald-500">
                          +{cur}
                          {totalPayIns.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {totalPayOuts > 0 && (
                      <div className="flex justify-between items-center border-b border-dashed border-border pb-2">
                        <span className="text-muted-foreground">Petty Cash (Pay-Out)</span>
                        <span className="num font-medium text-amber-500">
                          -{cur}
                          {totalPayOuts.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center border-b border-border pb-2.5 mb-3">
                      <span className="font-semibold text-foreground">
                        {t('shift.expectedCash')}
                      </span>
                      <span className="font-semibold num text-foreground text-sm">
                        {cur}
                        {expectedCash.toFixed(2)}
                      </span>
                    </div>

                    <div className="pt-1">
                      <label className="block text-[10px] uppercase font-mono tracking-wider text-muted-foreground mb-1.5">
                        {t('shift.countedCash')}
                      </label>
                      <div className="flex items-center rounded-lg bg-secondary/40 px-3 border border-border focus-within:border-foreground/50 transition-colors">
                        <DollarSign size={14} className="text-muted-foreground" />
                        <input
                          id="counted-cash-input"
                          type="number"
                          step="0.01"
                          min="0"
                          value={countedCash}
                          onChange={(e) => setCountedCash(e.target.value)}
                          placeholder="0.00"
                          className="flex-1 bg-transparent border-none p-2 font-mono num text-sm font-semibold text-foreground focus:outline-none"
                        />
                      </div>
                    </div>

                    {variance !== null && (
                      <div
                        className={`flex justify-between items-center text-xs font-mono rounded-lg px-3 py-2 border ${
                          Math.abs(variance) < 0.005
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-destructive/10 border-destructive/20 text-destructive'
                        }`}
                      >
                        <span className="font-semibold uppercase flex items-center gap-1.5">
                          {Math.abs(variance) < 0.005 ? (
                            <Check size={13} />
                          ) : (
                            <AlertTriangle size={13} />
                          )}
                          {t('shift.variance')}
                        </span>
                        <span className="num font-semibold">
                          {variance >= 0 ? '+' : ''}
                          {cur}
                          {variance.toFixed(2)}
                        </span>
                      </div>
                    )}

                    <div className="pt-1">
                      <input
                        type="text"
                        value={closeNote}
                        onChange={(e) => setCloseNote(e.target.value)}
                        placeholder={t('shift.notePlaceholder')}
                        className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-foreground/50 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    id="close-shift-btn"
                    onClick={handleClose}
                    disabled={countedCash === ''}
                    className="w-full btn-destructive h-9 text-xs font-medium disabled:opacity-50"
                  >
                    {t('shift.closeShift')}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Shift History Table */}
        {closedShifts.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5 shadow-2xs mt-6">
            <h3 className="font-semibold text-xs sm:text-sm text-foreground mb-4 flex items-center gap-2">
              <Clock size={15} className="text-muted-foreground" />
              {t('shift.pastShifts')}
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-mono uppercase text-[10px]">
                    <th className="pb-2 px-3 text-start">{t('shift.operator')}</th>
                    <th className="pb-2 px-3 text-start">{t('shift.closedBy')}</th>
                    <th className="pb-2 px-3 text-start">{t('shift.openedAt')}</th>
                    <th className="pb-2 px-3 text-start">{t('shift.closedAt')}</th>
                    <th className="pb-2 px-3 text-end">{t('shift.gross')}</th>
                    <th className="pb-2 px-3 text-end">{t('shift.variance')}</th>
                    <th className="pb-2 px-3 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {closedShifts.map((shift) => {
                    const s = summarizeShift(transactions.filter((tx) => tx.shiftId === shift.id));
                    const expected = s.expectedCash(
                      shift.openingFloat,
                      cashMovements.filter((m) => m.shiftId === shift.id),
                    );
                    const v = Number(((shift.countedCash ?? 0) - expected).toFixed(2));
                    return (
                      <tr key={shift.id} className="hover:bg-secondary/15 transition-colors group">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="size-6 rounded-full bg-secondary border border-border flex items-center justify-center text-foreground font-mono font-semibold text-[10px]">
                              {shift.openedBy.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-foreground">{shift.openedBy}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {shift.closedBy ? (
                            <div className="flex items-center gap-2">
                              <div className="size-6 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground font-mono font-semibold text-[10px]">
                                {shift.closedBy.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-muted-foreground">{shift.closedBy}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-muted-foreground text-[11px]">
                          {new Date(shift.openedAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-muted-foreground text-[11px]">
                          {shift.closedAt ? new Date(shift.closedAt).toLocaleString() : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono num font-semibold text-foreground">
                          {cur}
                          {s.grossSales.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-end">
                          <span
                            className={`text-[10px] font-mono num font-semibold px-1.5 py-0.5 rounded border ${
                              Math.abs(v) < 0.005
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : 'bg-destructive/10 text-destructive border-destructive/20'
                            }`}
                          >
                            {v >= 0 ? '+' : ''}
                            {cur}
                            {v.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => printReport(shift)}
                            aria-label={t('shift.printReport')}
                            className="size-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            title={t('shift.printReport')}
                          >
                            <Printer size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* Cash Movement (Pay-In / Pay-Out) Modal */}
        <AnimatePresence>
          {movementModalOpen && (
            <CashMovementModal
              initialType={movementType}
              settings={settings}
              onClose={() => setMovementModalOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Daily Summary Share Dialog */}
        <AnimatePresence>
          {shareMenuOpen && (
            <ModalShell
              id="daily-summary-modal"
              modalRef={shareModalRef}
              titleId="daily-summary-title"
              className="w-full max-w-lg p-6 flex flex-col max-h-[85vh] overflow-hidden"
              compactAnimation
            >
              <>
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Share2 size={16} className="text-primary" />
                    <h3 id="daily-summary-title" className="font-semibold text-foreground text-sm">
                      {t('shift.shareDailySummary')}
                    </h3>
                  </div>
                  <button
                    onClick={() => setShareMenuOpen(false)}
                    className="size-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto my-4 p-3.5 rounded-xl border border-border bg-secondary/30 font-mono text-xs whitespace-pre-wrap leading-relaxed select-text text-foreground">
                  {generateDailySummaryText({
                    storeName: settings.storeName,
                    currency: cur,
                    date: new Date().toLocaleDateString(undefined, {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    }),
                    transactions: shiftTxns,
                    shift: currentShift,
                    cashMovements: currentShiftMovements,
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-border">
                  <button
                    onClick={async () => {
                      const text = generateDailySummaryText({
                        storeName: settings.storeName,
                        currency: cur,
                        date: new Date().toLocaleDateString(),
                        transactions: shiftTxns,
                        shift: currentShift,
                        cashMovements: currentShiftMovements,
                      });
                      const ok = await copyReportToClipboard(text);
                      if (ok) notify(t('shift.copiedToClipboard'));
                    }}
                    className="btn-secondary h-9 px-3.5 rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <Copy size={13} />
                    <span>Copy Text</span>
                  </button>

                  <button
                    onClick={() => {
                      const text = generateDailySummaryText({
                        storeName: settings.storeName,
                        currency: cur,
                        date: new Date().toLocaleDateString(),
                        transactions: shiftTxns,
                        shift: currentShift,
                        cashMovements: currentShiftMovements,
                      });
                      shareViaEmail(`${settings.storeName || 'POS'} - Daily Summary Report`, text);
                    }}
                    className="btn-secondary h-9 px-3.5 rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <Mail size={13} />
                    <span>Email</span>
                  </button>

                  <button
                    onClick={() => {
                      const text = generateDailySummaryText({
                        storeName: settings.storeName,
                        currency: cur,
                        date: new Date().toLocaleDateString(),
                        transactions: shiftTxns,
                        shift: currentShift,
                        cashMovements: currentShiftMovements,
                      });
                      shareToWhatsApp(text);
                    }}
                    className="h-9 px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
                  >
                    <Send size={13} />
                    <span>WhatsApp</span>
                  </button>
                </div>
              </>
            </ModalShell>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
