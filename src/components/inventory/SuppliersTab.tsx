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
            <div className="py-20 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Truck size={40} className="opacity-20" />
              <p className="font-mono text-xs">{t('inventory.noSuppliers')}</p>
            </div>
          </td>
        </tr>
      ) : (
        suppliers.map((sup) => (
          <tr
            key={sup.id}
            className="hover:bg-muted/40 transition-colors group border-b border-border/50"
          >
            <td className="py-3 px-4">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-secondary border border-border flex items-center justify-center text-foreground shrink-0">
                  <Truck size={14} />
                </div>
                <span className="font-medium text-foreground text-sm">{sup.name}</span>
              </div>
            </td>
            <td className="py-3 px-4 text-muted-foreground text-sm">
              <div className="flex items-center gap-2">
                <User size={13} className="text-muted-foreground/70" />
                {sup.contact || '—'}
              </div>
            </td>
            <td className="py-3 px-4 text-muted-foreground font-mono text-xs">
              <div className="flex items-center gap-2">
                <Phone size={13} className="text-muted-foreground/70" />
                {sup.phone || '—'}
              </div>
            </td>
            <td className="py-3 px-4 text-muted-foreground text-sm">
              <div className="flex items-center gap-2">
                <Mail size={13} className="text-muted-foreground/70" />
                {sup.email || '—'}
              </div>
            </td>
            <td className="py-3 px-4 text-end">
              <button
                onClick={async () => {
                  if (await askConfirmation(t('inventory.deleteSupplierConfirm'))) {
                    onDeleteSupplier(sup.id);
                  }
                }}
                aria-label={t('inventory.deleteSupplier')}
                className="size-8 inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </td>
          </tr>
        ))
      )}
    </InventoryTable>
  );
}
