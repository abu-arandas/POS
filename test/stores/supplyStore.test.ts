import { describe, it, expect, beforeEach } from 'vitest';
import { useSupplyStore } from '../../src/stores/supplyStore';

// Inventory.handleReceivePo now claims the transition BEFORE crediting stock and
// bails when it is refused, so this return value is a load-bearing invariant:
// it is the only thing standing between a double-click and a shipment being
// added to inventory twice.
describe('useSupplyStore.setPurchaseOrderStatus', () => {
  beforeEach(() => {
    useSupplyStore.setState({ suppliers: [], adjustments: [], purchaseOrders: [] });
  });

  const draft = () =>
    useSupplyStore.getState().createPurchaseOrder({
      supplierId: 's1',
      supplierName: 'Acme',
      lines: [{ productId: 'p1', productName: 'Latte', quantity: 5, unitCost: 1 }],
      note: null,
      createdBy: 'Tester',
    });

  it('returns the updated order for a legal move and stamps the timestamp', () => {
    const po = draft();
    const ordered = useSupplyStore.getState().setPurchaseOrderStatus(po.id, 'ordered');
    expect(ordered?.status).toBe('ordered');
    expect(ordered?.orderedAt).toBeTruthy();

    const received = useSupplyStore.getState().setPurchaseOrderStatus(po.id, 'received');
    expect(received?.status).toBe('received');
    expect(received?.receivedAt).toBeTruthy();
    // The caller reads lines off the returned record rather than its own
    // snapshot, so they have to survive the transition.
    expect(received?.lines).toHaveLength(1);
  });

  it('refuses a second receive, so stock cannot be credited twice', () => {
    const po = draft();
    useSupplyStore.getState().setPurchaseOrderStatus(po.id, 'ordered');
    expect(useSupplyStore.getState().setPurchaseOrderStatus(po.id, 'received')).not.toBeNull();
    expect(useSupplyStore.getState().setPurchaseOrderStatus(po.id, 'received')).toBeNull();
  });

  it('refuses receiving a draft that was never ordered', () => {
    const po = draft();
    expect(useSupplyStore.getState().setPurchaseOrderStatus(po.id, 'received')).toBeNull();
    expect(useSupplyStore.getState().purchaseOrders[0].status).toBe('draft');
  });

  it('refuses any move out of a cancelled order', () => {
    const po = draft();
    useSupplyStore.getState().setPurchaseOrderStatus(po.id, 'cancelled');
    expect(useSupplyStore.getState().setPurchaseOrderStatus(po.id, 'received')).toBeNull();
    expect(useSupplyStore.getState().setPurchaseOrderStatus(po.id, 'ordered')).toBeNull();
  });

  it('returns null for an unknown order id', () => {
    expect(useSupplyStore.getState().setPurchaseOrderStatus('po-nope', 'received')).toBeNull();
  });
});
