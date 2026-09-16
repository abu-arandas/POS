import { Layers, Truck, User } from 'lucide-react';
import { motion } from 'motion/react';
import type { TFunction } from 'i18next';
import type { StockAdjustment } from '../../types';

export interface InventoryStockLogTabProps {
  t: TFunction;
  adjustments: StockAdjustment[];
}

/**
 * Inventory's stock-log tab: every stock adjustment in order, with its
 * reason, the resulting level, and who made it. The audit trail behind any
 * stock figure elsewhere in the app.
 */
export function InventoryStockLogTab({ t, adjustments }: InventoryStockLogTabProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 border border-border rounded-xl bg-card shadow-2xs overflow-hidden flex flex-col"
    >
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-start border-collapse">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-[11px] font-medium uppercase tracking-wider font-mono border-b border-border sticky top-0 z-10 backdrop-blur-sm">
              <th className="py-3 px-4 text-start">{t('inventory.logWhen')}</th>
              <th className="py-3 px-4 text-start">{t('inventory.productDetails')}</th>
              <th className="py-3 px-4 text-center">{t('inventory.logReason')}</th>
              <th className="py-3 px-4 text-end">{t('inventory.logChange')}</th>
              <th className="py-3 px-4 text-end">{t('inventory.stock')}</th>
              <th className="py-3 px-4 text-start">{t('inventory.logBy')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 text-sm text-foreground">
            {adjustments.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="py-20 flex flex-col items-center justify-center text-muted-foreground gap-3">
                    <Layers size={40} className="opacity-20" />
                    <p className="font-mono text-xs">{t('inventory.noAdjustments')}</p>
                  </div>
                </td>
              </tr>
            ) : (
              adjustments.map((a) => (
                <tr
                  key={a.id}
                  className="hover:bg-muted/40 transition-colors"
                >
                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(a.createdAt).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-medium text-foreground block text-sm">
                      {a.variantName ? `${a.productName} — ${a.variantName}` : a.productName}
                    </span>
                    {a.supplierName && (
                      <span className="text-[11px] text-muted-foreground font-mono mt-0.5 flex items-center gap-1">
                        <Truck size={12} /> {a.supplierName}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
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
                    className={`py-3 px-4 text-end font-mono font-semibold text-sm ${a.delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                  >
                    {a.delta >= 0 ? '+' : ''}
                    {a.delta}
                  </td>
                  <td className="py-3 px-4 text-end font-mono font-medium text-muted-foreground text-sm">
                    {a.newStock}
                  </td>
                  <td className="py-3 px-4 text-muted-foreground text-xs">
                    <div className="flex items-center gap-1.5">
                      <User size={12} className="text-muted-foreground/70" />
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
