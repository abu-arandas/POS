import { Layers, Truck, User } from 'lucide-react';
import { motion } from 'motion/react';
import type { TFunction } from 'i18next';
import type { StockAdjustment } from '../../types';

export interface InventoryStockLogTabProps {
  t: TFunction;
  adjustments: StockAdjustment[];
}

export function InventoryStockLogTab({ t, adjustments }: InventoryStockLogTabProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 surface rounded-2xl shadow-lg overflow-hidden flex flex-col"
    >
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-start border-collapse">
          <thead>
            <tr className="bg-white/90 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider font-mono border-b border-slate-200 dark:border-white/5 sticky top-0 z-10 backdrop-blur-md">
              <th className="py-4 px-6">{t('inventory.logWhen')}</th>
              <th className="py-4 px-4">{t('inventory.productDetails')}</th>
              <th className="py-4 px-4 text-center">{t('inventory.logReason')}</th>
              <th className="py-4 px-4 text-end">{t('inventory.logChange')}</th>
              <th className="py-4 px-4 text-end">{t('inventory.stock')}</th>
              <th className="py-4 px-6">{t('inventory.logBy')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-sm text-slate-700 dark:text-slate-200">
            {adjustments.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="py-20 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 gap-3">
                    <Layers size={48} className="opacity-20" />
                    <p className="font-medium font-mono">{t('inventory.noAdjustments')}</p>
                  </div>
                </td>
              </tr>
            ) : (
              adjustments.map((a) => (
                <tr
                  key={a.id}
                  className="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="py-4 px-6 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {new Date(a.createdAt).toLocaleString()}
                  </td>
                  <td className="py-4 px-4">
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {a.productName}
                    </span>
                    {a.supplierName && (
                      <span className="text-xs text-slate-500 font-mono mt-1 flex items-center gap-1">
                        <Truck size={12} /> {a.supplierName}
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span
                      className={`badge ${
                        a.reason === 'received'
                          ? 'badge-emerald'
                          : a.reason === 'waste'
                            ? 'badge-rose'
                            : a.reason === 'correction'
                              ? 'badge-amber'
                              : 'badge-slate'
                      }`}
                    >
                      {t(`inventory.reason_${a.reason}`, a.reason)}
                    </span>
                  </td>
                  <td
                    className={`py-4 px-4 text-end font-mono font-bold text-lg ${a.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                  >
                    {a.delta >= 0 ? '+' : ''}
                    {a.delta}
                  </td>
                  <td className="py-4 px-4 text-end font-mono font-bold text-slate-600 dark:text-slate-300">
                    {a.newStock}
                  </td>
                  <td className="py-4 px-6 text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <User size={14} className="text-slate-500" />
                      {a.operatorName || '—'}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
