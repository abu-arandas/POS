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
  Timer
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShiftStore } from '../stores/shiftStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { summarizeShift } from '../lib/shiftReport';
import { escapeHtml } from '../lib/escapeHtml';
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
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const currentShift = shifts.find((s) => s.id === currentShiftId) || null;

  const shiftTxns = useMemo(
    () => (currentShift ? transactions.filter((tx) => tx.shiftId === currentShift.id) : []),
    [transactions, currentShift]
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
    if (!window.confirm(t('shift.confirmClose') || 'Close shift?')) return;
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
    const esc = escapeHtml;
    const c = esc(cur);
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
      ${row('OPERATOR', esc(shift.openedBy))}
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
      ${row('EXPECTED CASH', c + expected.toFixed(2))}
      ${shift.closedAt ? row('COUNTED CASH', c + counted.toFixed(2)) : ''}
      ${shift.closedAt ? `<div class="flex-row bold"><span>VARIANCE</span><span>${c}${(counted - expected).toFixed(2)}</span></div>` : ''}
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
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-[#020617] p-6 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      <div className="mb-6 shrink-0 flex items-center justify-between">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="font-sans font-extrabold tracking-tight text-slate-900 dark:text-white text-xl sm:text-2xl flex items-center gap-2">
            <Clock className="text-emerald-500" /> {t('shift.title')}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">{t('shift.subtitle')}</p>
        </motion.div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pe-1">
        <AnimatePresence mode="wait">
          {!currentShift ? (
            <motion.div
              key="no-shift"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-dark border border-white/10 rounded-3xl p-10 max-w-lg mx-auto text-center shadow-2xl relative overflow-hidden group"
            >
              <div className="absolute -inset-e-6 -top-6 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-colors" />
              <div className="relative z-10">
                <div className="mx-auto w-20 h-20 rounded-3xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-6 shadow-inner animate-bounce-in">
                  <Unlock size={32} />
                </div>
                <h3 className="font-bold text-2xl text-white mb-2">
                  {t('shift.noOpenShift')}
                </h3>
                <p className="text-sm text-slate-400 mb-8">{t('shift.openHint')}</p>
                
                <div className="text-left bg-[#0f172a]/50 p-6 rounded-2xl border border-white/5 shadow-inner">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                    {t('shift.openingFloat')}
                  </label>
                  <div className="flex items-center rounded-xl bg-[#020617] px-4 py-2 border border-slate-700/50 focus-within:border-emerald-500/50 transition-colors">
                    <span className="font-mono text-xl text-slate-500">{cur}</span>
                    <input
                      id="opening-float-input"
                      type="number"
                      step="0.01"
                      min="0"
                      value={openFloat}
                      onChange={(e) => setOpenFloat(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 bg-transparent border-none px-3 py-3 font-mono text-2xl font-bold text-white focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  id="open-shift-btn"
                  onClick={handleOpen}
                  disabled={openFloat === ''}
                  className="w-full mt-6 bg-emerald-500 hover:bg-emerald-400 text-[#020617] disabled:opacity-50 disabled:hover:bg-emerald-500 font-extrabold text-lg py-4 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] transition-all flex items-center justify-center gap-2"
                >
                  <Unlock size={20} />
                  {t('shift.openShift')}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="active-shift"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              {/* Active Shift Overview */}
              <div className="lg:col-span-2 space-y-6">
                <div className="surface rounded-3xl p-6 shadow-xl relative overflow-hidden group">
                  <div className="absolute -inset-e-6 -top-6 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />
                  <div className="relative z-10 flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-2xl text-white flex items-center gap-3">
                        {t('shift.currentShift')}
                        <span className="badge badge-emerald flex items-center gap-1.5 px-3 py-1 text-xs">
                          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                          {t('shift.open')}
                        </span>
                      </h3>
                      <div className="flex items-center gap-6 mt-4">
                        <div className="flex items-center gap-2 text-sm text-slate-400 bg-[#0f172a] px-4 py-2 rounded-xl border border-white/5">
                          <User size={16} className="text-emerald-500" />
                          <span className="font-medium text-slate-200">{currentShift.openedBy}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-400 bg-[#0f172a] px-4 py-2 rounded-xl border border-white/5">
                          <Timer size={16} className="text-blue-500" />
                          <span className="font-mono font-medium text-slate-200">
                            {getShiftDuration(currentShift.openedAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-400 bg-[#0f172a] px-4 py-2 rounded-xl border border-white/5">
                          <ShoppingBag size={16} className="text-purple-500" />
                          <span className="font-mono font-medium text-slate-200">
                            {summary.saleCount} {t('shift.sales')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { label: t('shift.gross'), val: `${cur}${summary.grossSales.toFixed(2)}`, color: 'emerald' },
                    { label: t('shift.cashSales'), val: `${cur}${summary.cashSales.toFixed(2)}`, color: 'emerald' },
                    { label: t('dashboard.card'), val: `${cur}${summary.cardSales.toFixed(2)}`, color: 'blue' },
                    { label: t('dashboard.mobile'), val: `${cur}${summary.mobileSales.toFixed(2)}`, color: 'purple' },
                    { label: t('shift.cashRefunds'), val: `${cur}${summary.cashRefunds.toFixed(2)}`, color: 'rose' },
                  ].map((s, i) => (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      key={s.label}
                      className="surface rounded-2xl p-5 hover:bg-[#1e293b] transition-colors"
                    >
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono block mb-2">
                        {s.label}
                      </span>
                      <span className="font-mono font-extrabold text-xl text-white">
                        {s.val}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Close Shift (Z-Report Style) */}
              <div className="surface rounded-3xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-2 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjQiPgo8cGF0aCBkPSJNIDAgMCBMIDQgNCBMIDggMCBaIiBmaWxsPSIjMGYxNzJhIi8+Cjwvc3ZnPg==')] opacity-50 bg-repeat-x" />
                
                <h3 className="font-bold text-lg text-white flex items-center gap-2 mb-6 mt-2">
                  <LockKeyhole size={18} className="text-amber-500" /> {t('shift.closeReconcile')}
                </h3>

                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm font-mono border-b border-dashed border-slate-700/50 pb-3">
                    <span className="text-slate-400">{t('shift.openingFloat')}</span>
                    <span className="font-medium text-slate-300">
                      {cur}{currentShift.openingFloat.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-mono border-b border-dashed border-slate-700/50 pb-3">
                    <span className="text-slate-400">{t('shift.cashSales')}</span>
                    <span className="font-medium text-slate-300">
                      +{cur}{summary.cashSales.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-mono border-b border-dashed border-slate-700/50 pb-3">
                    <span className="text-slate-400">{t('shift.cashRefunds')}</span>
                    <span className="font-medium text-rose-400">
                      -{cur}{summary.cashRefunds.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-mono border-b-2 border-slate-700/50 pb-3 mb-4">
                    <span className="font-bold text-slate-300">{t('shift.expectedCash')}</span>
                    <span className="font-extrabold text-emerald-400 text-lg">
                      {cur}{expectedCash.toFixed(2)}
                    </span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      {t('shift.countedCash')}
                    </label>
                    <div className="flex items-center rounded-xl bg-[#020617] px-3 border border-slate-700/50 focus-within:border-blue-500/50 transition-colors">
                      <DollarSign size={16} className="text-slate-500" />
                      <input
                        id="counted-cash-input"
                        type="number"
                        step="0.01"
                        min="0"
                        value={countedCash}
                        onChange={(e) => setCountedCash(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 bg-transparent border-none px-2 py-3 font-mono text-lg font-bold text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {variance !== null && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`flex justify-between items-center text-sm font-mono rounded-xl px-4 py-3 ${
                        Math.abs(variance) < 0.005
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                      }`}
                    >
                      <span className="font-bold uppercase flex items-center gap-1.5">
                        {Math.abs(variance) < 0.005 ? <Check size={14} /> : <AlertTriangle size={14} />}
                        {t('shift.variance')}
                      </span>
                      <span className="font-extrabold">
                        {variance >= 0 ? '+' : ''}{cur}{variance.toFixed(2)}
                      </span>
                    </motion.div>
                  )}

                  <input
                    type="text"
                    value={closeNote}
                    onChange={(e) => setCloseNote(e.target.value)}
                    placeholder={t('shift.notePlaceholder')}
                    className="w-full bg-[#020617] border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                  />

                  <button
                    id="close-shift-btn"
                    onClick={handleClose}
                    disabled={countedCash === ''}
                    className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 disabled:opacity-50 font-bold text-sm py-3.5 rounded-xl transition-colors mt-2"
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="surface rounded-3xl p-6 shadow-xl mt-8"
          >
            <h3 className="font-bold text-white mb-6 flex items-center gap-2">
              <Clock size={18} className="text-slate-400" />
              {t('shift.pastShifts')}
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-slate-400 font-medium">
                    <th className="pb-3 px-4">{t('shift.operator') || 'Operator'}</th>
                    <th className="pb-3 px-4">{t('shift.openedAt') || 'Opened'}</th>
                    <th className="pb-3 px-4">{t('shift.closedAt') || 'Closed'}</th>
                    <th className="pb-3 px-4 text-right">{t('shift.gross') || 'Gross'}</th>
                    <th className="pb-3 px-4 text-right">{t('shift.variance') || 'Variance'}</th>
                    <th className="pb-3 px-4 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {closedShifts.map((shift) => {
                    const s = summarizeShift(transactions.filter((tx) => tx.shiftId === shift.id));
                    const expected = s.expectedCash(shift.openingFloat);
                    const v = Number(((shift.countedCash ?? 0) - expected).toFixed(2));
                    return (
                      <tr key={shift.id} className="hover:bg-white/5 transition-colors group">
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-bold text-xs">
                              {shift.openedBy.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-200">{shift.openedBy}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 font-mono text-slate-400 text-xs">
                          {new Date(shift.openedAt).toLocaleString()}
                        </td>
                        <td className="py-4 px-4 font-mono text-slate-400 text-xs">
                          {shift.closedAt ? new Date(shift.closedAt).toLocaleString() : '—'}
                        </td>
                        <td className="py-4 px-4 text-right font-mono font-medium text-white">
                          {cur}{s.grossSales.toFixed(2)}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className={`badge ${Math.abs(v) < 0.005 ? 'badge-emerald' : 'badge-rose'} font-mono text-xs`}>
                            {v >= 0 ? '+' : ''}{cur}{v.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <button
                            onClick={() => printReport(shift)}
                            className="p-2 text-slate-500 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors opacity-0 group-hover:opacity-100"
                            title={t('shift.printReport')}
                          >
                            <Printer size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
