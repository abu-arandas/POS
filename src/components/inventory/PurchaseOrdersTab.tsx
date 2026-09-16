import { Ban, ClipboardList, PackagePlus, Send, Trash2, Truck } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { PurchaseOrder, PurchaseOrderStatus, StoreSettings } from '../../types';
import { poTotal, poUnitCount } from '../../lib/purchaseOrders';
import { askConfirmation } from '../../lib/utils/ui';
import { InventoryTable } from './InventoryTable';

export interface InventoryPurchaseOrdersTabProps {
  t: TFunction;
  settings: StoreSettings;
  purchaseOrders: PurchaseOrder[];
  statusBadge: Record<PurchaseOrderStatus, string>;
  onSetStatus(id: string, status: PurchaseOrderStatus): void;
  onReceive(po: PurchaseOrder): void;
  onDeleteOrder(id: string): void;
}

/**
 * Inventory's purchase-orders tab: every order with its status, and the
 * actions that move it along — send, receive into stock, cancel, delete.
 */
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
    <InventoryTable
      header={
        <>
          <th className="py-4 px-6">{t('inventory.poOrder')}</th>
          <th className="p-4">{t('inventory.poSupplier')}</th>
          <th className="p-4">{t('inventory.poItems')}</th>
          <th className="p-4 text-end">{t('inventory.poTotalCost')}</th>
          <th className="p-4 text-center">{t('inventory.poStatus')}</th>
          <th className="py-4 px-6 text-end">{t('inventory.actions')}</th>
        </>
      }
    >
      {purchaseOrders.length === 0 ? (
        <tr>
          <td colSpan={6}>
            <div className="py-20 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <ClipboardList size={40} className="opacity-20" />
              <p className="font-mono text-xs">{t('inventory.noPurchaseOrders')}</p>
            </div>
          </td>
        </tr>
      ) : (
        purchaseOrders.map((po) => (
          <tr key={po.id} className="hover:bg-muted/40 transition-colors border-b border-border/50">
            <td className="py-3 px-4">
              <span className="font-mono font-medium text-foreground block text-xs">{po.id}</span>
              <span className="text-[10px] text-muted-foreground font-mono mt-0.5 block">
                {new Date(po.createdAt).toLocaleString()}
                {po.createdBy && <> · {po.createdBy}</>}
              </span>
              {po.note && (
                <span className="text-[10px] text-muted-foreground mt-0.5 block truncate max-w-56">
                  {po.note}
                </span>
              )}
            </td>
            <td className="py-3 px-4 text-muted-foreground text-sm">
              <div className="flex items-center gap-2">
                <Truck size={13} className="text-muted-foreground/70" />
                {po.supplierName || '—'}
              </div>
            </td>
            <td className="py-3 px-4 text-muted-foreground font-mono text-xs">
              {t('inventory.poLinesUnits', {
                lines: po.lines.length,
                units: poUnitCount(po),
              })}
            </td>
            <td className="py-3 px-4 text-end font-mono font-semibold text-foreground text-sm">
              {settings.currency}
              {poTotal(po).toFixed(2)}
            </td>
            <td className="py-3 px-4 text-center">
              <span className={statusBadge[po.status]}>{t(`inventory.poStatus_${po.status}`)}</span>
            </td>
            <td className="py-3 px-4">
              <div className="flex items-center justify-end gap-1.5">
                {po.status === 'draft' && (
                  <>
                    <button
                      onClick={() => onSetStatus(po.id, 'ordered')}
                      className="btn-secondary text-xs h-7 px-2.5 rounded-md flex items-center gap-1.5"
                    >
                      <Send size={11} /> {t('inventory.poMarkOrdered')}
                    </button>
                    <button
                      onClick={async () => {
                        if (await askConfirmation(t('inventory.poDeleteConfirm')))
                          onDeleteOrder(po.id);
                      }}
                      aria-label={t('inventory.poDeleteDraft')}
                      className="size-7 inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
                {po.status === 'ordered' && (
                  <>
                    <button
                      onClick={() => onReceive(po)}
                      className="btn-primary text-xs h-7 px-2.5 rounded-md flex items-center gap-1.5"
                    >
                      <PackagePlus size={11} /> {t('inventory.poReceive')}
                    </button>
                    <button
                      onClick={async () => {
                        if (await askConfirmation(t('inventory.poCancelConfirm')))
                          onSetStatus(po.id, 'cancelled');
                      }}
                      aria-label={t('inventory.poCancelOrder')}
                      className="size-7 inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                    >
                      <Ban size={13} />
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
                    className="size-7 inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))
      )}
    </InventoryTable>
  );
}
