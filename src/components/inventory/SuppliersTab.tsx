import { Mail, Phone, Trash2, Truck, User } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { Supplier } from '../../types';
import { askConfirmation } from '../../lib/utils/ui';
import { InventoryTable } from './InventoryTable';

export interface InventorySuppliersTabProps {
  t: TFunction;
  suppliers: Supplier[];
  onDeleteSupplier(id: string): void;
}

/**
 * Inventory's suppliers tab: who the store buys from, and how to reach them.
 */
export function InventorySuppliersTab({
  t,
  suppliers,
  onDeleteSupplier,
}: InventorySuppliersTabProps) {
  return (
    <InventoryTable
      header={
        <>
          <th className="py-4 px-6">{t('inventory.supplierName')}</th>
          <th className="p-4">{t('inventory.supplierContact')}</th>
          <th className="p-4">{t('inventory.phoneNumber')}</th>
          <th className="p-4">{t('inventory.emailAddress')}</th>
          <th className="py-4 px-6 text-end">{t('inventory.actions')}</th>
        </>
      }
    >
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
                <div className="size-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-emerald-400">
                  <Truck size={20} />
                </div>
                <span className="font-bold text-slate-900 dark:text-white">{sup.name}</span>
              </div>
            </td>
            <td className="p-4 text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <User size={14} className="text-slate-500" />
                {sup.contact || '—'}
              </div>
            </td>
            <td className="p-4 text-slate-600 dark:text-slate-300 font-mono">
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-slate-500" />
                {sup.phone || '—'}
              </div>
            </td>
            <td className="p-4 text-slate-600 dark:text-slate-300">
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
    </InventoryTable>
  );
}
