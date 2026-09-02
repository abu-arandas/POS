import { Ban, ClipboardList, PackagePlus, Send, Trash2, Truck } from 'lucide-react';
import { motion } from 'motion/react';
import type { TFunction } from 'i18next';
import type { PurchaseOrder, PurchaseOrderStatus, StoreSettings } from '../../types';
import { poTotal, poUnitCount } from '../../lib/purchaseOrders';
import { askConfirmation } from '../../lib/utils/ui';

export interface InventoryPurchaseOrdersTabProps {
  t: TFunction;
  settings: StoreSettings;
  purchaseOrders: PurchaseOrder[];
  statusBadge: Record<PurchaseOrderStatus, string>;
  onSetStatus(id: string, status: PurchaseOrderStatus): void;
  onReceive(po: PurchaseOrder): void;
  onDeleteOrder(id: string): void;
}

export function InventoryPurchaseOrdersTab({
  t,
  settings,
  purchaseOrders,
  statusBadge,
  onSetStatus,
  onReceive,
  onDeleteOrder,
}: InventoryPurchaseOrdersTabProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 overflow-hidden flex flex-col surface rounded-2xl"
    >
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-start border-collapse">
          <thead>
            <tr className="bg-white/90 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider font-mono border-b border-slate-200 dark:border-white/5 sticky top-0 z-10 backdrop-blur-md">
              <th className="py-4 px-6">{t('inventory.poOrder')}</th>
              <th className="py-4 px-4">{t('inventory.poSupplier')}</th>
              <th className="py-4 px-4">{t('inventory.poItems')}</th>
              <th className="py-4 px-4 text-end">{t('inventory.poTotalCost')}</th>
              <th className="py-4 px-4 text-center">{t('inventory.poStatus')}</th>
              <th className="py-4 px-6 text-end">{t('inventory.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-sm text-slate-700 dark:text-slate-200">
            {purchaseOrders.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="py-20 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 gap-3">
                    <ClipboardList size={48} className="opacity-20" />
                    <p className="font-medium font-mono">{t('inventory.noPurchaseOrders')}</p>
                  </div>
                </td>
              </tr>
            ) : (
              purchaseOrders.map((po) => (
                <tr
                  key={po.id}
                  className="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="py-4 px-6">
                    <span className="font-mono font-bold text-slate-900 dark:text-white block text-xs">
                      {po.id}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                      {new Date(po.createdAt).toLocaleString()}
                      {po.createdBy && <> · {po.createdBy}</>}
                    </span>
                    {po.note && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block truncate max-w-55">
                        {po.note}
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <Truck size={14} className="text-slate-500" />
                      {po.supplierName || '—'}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-slate-600 dark:text-slate-300 font-mono text-xs">
                    {t('inventory.poLinesUnits', {
                      lines: po.lines.length,
                      units: poUnitCount(po),
                    })}
                  </td>
                  <td className="py-4 px-4 text-end font-mono font-bold text-slate-900 dark:text-white">
                    {settings.currency}
                    {poTotal(po).toFixed(2)}
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className={statusBadge[po.status]}>
                      {t(`inventory.poStatus_${po.status}`)}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center justify-end gap-2">
                      {po.status === 'draft' && (
                        <>
                          <button
                            onClick={() => onSetStatus(po.id, 'ordered')}
                            className="btn-chip-blue flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl"
                          >
                            <Send size={12} /> {t('inventory.poMarkOrdered')}
                          </button>
                          <button
                            onClick={async () => {
                              if (await askConfirmation(t('inventory.poDeleteConfirm')))
                                onDeleteOrder(po.id);
                            }}
                            aria-label={t('inventory.poDeleteDraft')}
                            className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-rose-500/10 hover:bg-rose-500 rounded-xl transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                      {po.status === 'ordered' && (
                        <>
                          <button
                            onClick={() => onReceive(po)}
                            className="btn-chip-emerald flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl"
                          >
                            <PackagePlus size={12} /> {t('inventory.poReceive')}
                          </button>
                          <button
                            onClick={async () => {
                              if (await askConfirmation(t('inventory.poCancelConfirm')))
                                onSetStatus(po.id, 'cancelled');
                            }}
                            aria-label={t('inventory.poCancelOrder')}
                            className="p-2 text-slate-500 dark:text-slate-400 hover:text-rose-400 bg-slate-100 dark:bg-slate-800 hover:bg-rose-500/10 rounded-xl transition-colors"
                          >
                            <Ban size={14} />
                          </button>
                        </>
                      )}
                      {po.status === 'cancelled' && (
                        <button
                          onClick={async () => {
                            if (await askConfirmation(t('inventory.poDeleteConfirm')))
                              onDeleteOrder(po.id);
                          }}
                          aria-label={t('inventory.poDeleteDraft')}
                          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-rose-500/10 hover:bg-rose-500 rounded-xl transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
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
