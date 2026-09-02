import { Mail, Phone, Trash2, Truck, User } from 'lucide-react';
import { motion } from 'motion/react';
import type { TFunction } from 'i18next';
import type { Supplier } from '../../types';
import { askConfirmation } from '../../lib/utils/ui';

export interface InventorySuppliersTabProps {
  t: TFunction;
  suppliers: Supplier[];
  onDeleteSupplier(id: string): void;
}

export function InventorySuppliersTab({
  t,
  suppliers,
  onDeleteSupplier,
}: InventorySuppliersTabProps) {
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
              <th className="py-4 px-6">{t('inventory.supplierName')}</th>
              <th className="py-4 px-4">{t('inventory.supplierContact')}</th>
              <th className="py-4 px-4">{t('inventory.phoneNumber')}</th>
              <th className="py-4 px-4">{t('inventory.emailAddress')}</th>
              <th className="py-4 px-6 text-end">{t('inventory.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-sm text-slate-700 dark:text-slate-200">
            {suppliers.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="py-20 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 gap-3">
                    <Truck size={48} className="opacity-20" />
                    <p className="font-medium font-mono">{t('inventory.noSuppliers')}</p>
                  </div>
                </td>
              </tr>
            ) : (
              suppliers.map((sup) => (
                <tr
                  key={sup.id}
                  className="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors group"
                >
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-emerald-400">
                        <Truck size={20} />
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white">{sup.name}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <User size={14} className="text-slate-500" />
                      {sup.contact || '—'}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-slate-600 dark:text-slate-300 font-mono">
                    <div className="flex items-center gap-2">
                      <Phone size={14} className="text-slate-500" />
                      {sup.phone || '—'}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-slate-500" />
                      {sup.email || '—'}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-end">
                    <button
                      onClick={async () => {
                        if (
                          await askConfirmation(
                            t('inventory.deleteSupplierConfirm', 'Delete this supplier?'),
                          )
                        ) {
                          onDeleteSupplier(sup.id);
                        }
                      }}
                      aria-label={t('inventory.deleteSupplier')}
                      className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-rose-500/10 hover:bg-rose-500 rounded-xl transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
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
