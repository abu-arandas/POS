import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Clock,
  DollarSign,
  LockKeyhole,
  Unlock,
  Printer,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { escapeHtml as esc } from '../lib/escapeHtml';
import { useShiftStore } from '../stores/shiftStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { summarizeShift } from '../lib/shiftReport';
import { Shift } from '../types';

export default function ShiftScreen() {
  const { t } = useTranslation();
  const { shifts, currentShiftId, openShift, closeShift } = useShiftStore();
  const { transactions } = useTransactionStore();
  const { currentUser } = useAuthStore();
  const { settings } = useSettingsStore();
  const cur = settings.currency;

  const [openFloat, setOpenFloat] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [closeNote, setCloseNote] = useState('');

  const currentShift = shifts.find((s) => s.id === currentShiftId) || null;

  const shiftTxns = useMemo(
    () => (currentShift ? transactions.filter((tx) => tx.shiftId === currentShift.id) : []),
    [transactions, currentShift],
  );
  const summary = useMemo(() => summarizeShift(shiftTxns), [shiftTxns]);
  const expectedCash = currentShift ? summary.expectedCash(currentShift.openingFloat) : 0;
  const variance =
    countedCash !== '' ? Number((parseFloat(countedCash) - expectedCash).toFixed(2)) : null;

  const handleOpen = () => {
    const float = parseFloat(openFloat) || 0;
    openShift(currentUser?.name ?? 'Unknown', float);
    setOpenFloat('');
  };

  const handleClose = () => {
    if (!currentShift) return;
    const counted = parseFloat(countedCash) || 0;
    if (!window.confirm(t('shift.confirmClose'))) return;
    closeShift(currentShift.id, counted, closeNote);
    setCountedCash('');
    setCloseNote('');
  };

  const printReport = (shift: Shift) => {
    const txns = transactions.filter((tx) => tx.shiftId === shift.id);
    const s = summarizeShift(txns);
    const expected = s.expectedCash(shift.openingFloat);
    const counted = shift.countedCash ?? 0;
    const w = window.open('', '_blank');
    if (!w) return;
    // Store/operator names are operator input (and may come from another
    // terminal via sync) — escape everything interpolated into this document.
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
      ${row('GROSS', cur + s.grossSales.toFixed(2))}
      ${row('CASH SALES', cur + s.cashSales.toFixed(2))}
      ${row('CARD', cur + s.cardSales.toFixed(2))}
      ${row('MOBILE', cur + s.mobileSales.toFixed(2))}
      ${row('GIFT', cur + s.giftSales.toFixed(2))}
      ${row('CASH REFUNDS', cur + s.cashRefunds.toFixed(2))}
      <div class="divider"></div>
      ${row('OPENING FLOAT', cur + shift.openingFloat.toFixed(2))}
      ${row('EXPECTED CASH', cur + expected.toFixed(2))}
      ${shift.closedAt ? row('COUNTED CASH', cur + counted.toFixed(2)) : ''}
      ${shift.closedAt ? `<div class="flex-row bold">${'<span>VARIANCE</span>'}<span>${esc(cur)}${(counted - expected).toFixed(2)}</span></div>` : ''}
      <div class="divider"></div>
      <div class="center">${new Date().toLocaleString()}</div>
      </body></html>`);
    w.document.close();
  };

  const closedShifts = shifts.filter((s) => s.closedAt);

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-transparent p-6 text-slate-800 dark:text-slate-100">
      <div className="mb-6 shrink-0">
        <h2 className="font-sans font-extrabold tracking-tight text-slate-900 dark:text-white text-xl sm:text-2xl flex items-center gap-2">
          <Clock className="text-emerald-500" /> {t('shift.title')}
        </h2>
        <p className="text-slate-500 text-xs sm:text-sm mt-0.5">{t('shift.subtitle')}</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pe-1">
        {!currentShift ? (
          /* OPEN SHIFT */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass dark:glass-dark border border-white/20 dark:border-white/10 rounded-3xl p-8 max-w-md mx-auto text-center shadow-lg"
          >
            <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-4">
              <Unlock size={26} />
            </div>
            <h3 className="font-bold text-lg text-slate-800 dark:text-white">
              {t('shift.noOpenShift')}
            </h3>
            <p className="text-xs text-slate-500 mt-1 mb-5">{t('shift.openHint')}</p>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 text-start">
              {t('shift.openingFloat')}
            </label>
            <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 px-3 mb-4">
              <span className="font-mono text-slate-400">{cur}</span>
              <input
                id="opening-float-input"
                type="number"
                step="0.01"
                min="0"
                value={openFloat}
                onChange={(e) => setOpenFloat(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent border-none px-2 py-3 font-mono text-lg text-slate-800 dark:text-slate-100 focus:outline-none"
              />
            </div>
            <button
              id="open-shift-btn"
              onClick={handleOpen}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-3 rounded-xl shadow-lg shadow-emerald-500/25 transition-colors"
            >
              {t('shift.openShift')}
            </button>
          </motion.div>
        ) : (
          /* CURRENT SHIFT + Z-REPORT */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 glass dark:glass-dark border border-white/20 dark:border-white/10 rounded-3xl p-6 shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white">
                    {t('shift.currentShift')}
                  </h3>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                    {t('shift.openedBy')} {currentShift.openedBy} •{' '}
                    {new Date(currentShift.openedAt).toLocaleString()}
                  </p>
                </div>
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  {t('shift.open')}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: t('shift.sales'), val: String(summary.saleCount) },
                  { label: t('shift.gross'), val: `${cur}${summary.grossSales.toFixed(2)}` },
                  { label: t('shift.cashSales'), val: `${cur}${summary.cashSales.toFixed(2)}` },
                  { label: t('dashboard.card'), val: `${cur}${summary.cardSales.toFixed(2)}` },
                  { label: t('dashboard.mobile'), val: `${cur}${summary.mobileSales.toFixed(2)}` },
                  { label: t('shift.cashRefunds'), val: `${cur}${summary.cashRefunds.toFixed(2)}` },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="bg-white/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl p-3 text-center"
                  >
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono block">
                      {s.label}
                    </span>
                    <span className="font-mono font-extrabold text-sm text-slate-800 dark:text-slate-100 mt-1 block">
                      {s.val}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Close / reconcile */}
            <div className="glass dark:glass-dark border border-white/20 dark:border-white/10 rounded-3xl p-6 shadow-lg space-y-4">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <LockKeyhole size={16} className="text-rose-500" /> {t('shift.closeReconcile')}
              </h3>
              <div className="flex justify-between text-xs font-mono bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                <span className="text-slate-500">{t('shift.openingFloat')}</span>
                <span className="font-bold">
                  {cur}
                  {currentShift.openingFloat.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-xs font-mono bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                <span className="text-slate-500">{t('shift.expectedCash')}</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {cur}
                  {expectedCash.toFixed(2)}
                </span>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  {t('shift.countedCash')}
                </label>
                <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 px-3">
                  <DollarSign size={14} className="text-slate-400" />
                  <input
                    id="counted-cash-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-transparent border-none px-2 py-2.5 font-mono text-slate-800 dark:text-slate-100 focus:outline-none"
                  />
                </div>
              </div>
              {variance !== null && (
                <div
                  className={`flex justify-between items-center text-xs font-mono rounded-lg px-3 py-2 ${
                    Math.abs(variance) < 0.005
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  }`}
                >
                  <span className="font-bold uppercase flex items-center gap-1">
                    {Math.abs(variance) < 0.005 ? <Check size={12} /> : <AlertTriangle size={12} />}
                    {t('shift.variance')}
                  </span>
                  <span className="font-bold">
                    {variance >= 0 ? '+' : ''}
                    {cur}
                    {variance.toFixed(2)}
                  </span>
                </div>
              )}
              <input
                type="text"
                value={closeNote}
                onChange={(e) => setCloseNote(e.target.value)}
                placeholder={t('shift.notePlaceholder')}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
              />
              <button
                id="close-shift-btn"
                onClick={handleClose}
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm py-2.5 rounded-xl transition-colors"
              >
                {t('shift.closeShift')}
              </button>
            </div>
          </div>
        )}

        {/* Past shifts */}
        {closedShifts.length > 0 && (
          <div className="glass dark:glass-dark border border-white/20 dark:border-white/10 rounded-3xl p-6 shadow-lg">
            <h3 className="font-bold text-slate-800 dark:text-white mb-4">
              {t('shift.pastShifts')}
            </h3>
            <div className="space-y-2">
              {closedShifts.map((shift) => {
                const s = summarizeShift(transactions.filter((tx) => tx.shiftId === shift.id));
                const expected = s.expectedCash(shift.openingFloat);
                const v = Number(((shift.countedCash ?? 0) - expected).toFixed(2));
                return (
                  <div
                    key={shift.id}
                    className="flex items-center justify-between gap-3 bg-white/50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {shift.openedBy}
                      </p>
                      <p className="text-[10px] font-mono text-slate-500">
                        {new Date(shift.openedAt).toLocaleDateString()} •{' '}
                        {new Date(shift.openedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {shift.closedAt
                          ? ` → ${new Date(shift.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="font-mono font-bold text-sm text-slate-800 dark:text-slate-100">
                          {cur}
                          {s.grossSales.toFixed(2)}
                        </p>
                        <p
                          className={`text-[10px] font-mono font-bold ${
                            Math.abs(v) < 0.005 ? 'text-emerald-500' : 'text-amber-500'
                          }`}
                        >
                          {t('shift.variance')}: {v >= 0 ? '+' : ''}
                          {cur}
                          {v.toFixed(2)}
                        </p>
                      </div>
                      <button
                        onClick={() => printReport(shift)}
                        className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors"
                        title={t('shift.printReport')}
                      >
                        <Printer size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
