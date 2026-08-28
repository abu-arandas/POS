import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Inventory from '../../src/components/Inventory';
import { useProductStore } from '../../src/stores/productStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useSupplyStore } from '../../src/stores/supplyStore';
import { useAuthStore } from '../../src/stores/authStore';
import { Product, StoreSettings, PurchaseOrder } from '../../src/types';
import { notify } from '../../src/lib/notifications';
import { askConfirmation } from '../../src/lib/dialogs';

vi.mock('../../src/lib/notifications', () => ({ notify: vi.fn() }));
vi.mock('../../src/lib/dialogs', () => ({ askConfirmation: vi.fn() }));

// Inventory is the other place stock moves, and the place a receive can be
// applied twice. The store-level guard has its own test; these exercise the
// screen that drives it.

const PRODUCT: Product = {
  id: 'p-1',
  name: 'Latte',
  price: 5,
  cost: 1,
  category: 'cat-1',
  sku: 'BEV-01',
  stock: 10,
  minStock: 2,
  image: '',
};

const SETTINGS: StoreSettings = {
  storeName: 'Test Store',
  storeAddress: '',
  storePhone: '',
  taxRate: 0,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};

const orderedPo = (): PurchaseOrder => ({
  id: 'po-1',
  supplierId: 's-1',
  supplierName: 'Acme',
  status: 'ordered',
  lines: [{ productId: 'p-1', productName: 'Latte', quantity: 5, unitCost: 1 }],
  note: null,
  createdBy: 'Ann',
  createdAt: new Date().toISOString(),
  orderedAt: new Date().toISOString(),
  receivedAt: null,
});

beforeEach(() => {
  useProductStore.setState({
    products: [PRODUCT],
    categories: [{ id: 'cat-1', name: 'Drinks', color: '' }],
  });
  useSettingsStore.setState({ settings: SETTINGS });
  useSupplyStore.setState({ suppliers: [], adjustments: [], purchaseOrders: [] });
  useAuthStore.setState({
    currentUser: { id: 'u-1', name: 'Ann', role: 'admin', pin: '', active: true, createdAt: '' },
  });
  vi.mocked(notify).mockClear();
  vi.mocked(askConfirmation).mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// The tab strip uses role="tab", not button.
const openTab = async (label: RegExp) => {
  await userEvent.setup().click(screen.getByRole('tab', { name: label }));
};

const openReceive = async () => {
  await userEvent.setup().click(document.querySelector('#receive-stock-btn') as HTMLElement);
  await waitFor(() => expect(screen.getByLabelText(/Quantity change/i)).toBeInTheDocument());
};

// Every row's edit control carries the same aria-label, so scope to the row
// holding the product name.
const editProduct = async (name: string) => {
  const row = screen.getByText(name).closest('tr') as HTMLElement;
  await userEvent.setup().click(within(row).getByRole('button', { name: /Edit/i }));
};

describe('Inventory — manual stock movements', () => {
  it('receives stock and writes an audit entry', async () => {
    const user = userEvent.setup();
    render(<Inventory />);
    await openReceive();

    await user.selectOptions(
      document.querySelector('#receive-product-select') as HTMLSelectElement,
      'p-1',
    );
    await user.type(screen.getByLabelText(/Quantity change/i), '5');
    await user.click(screen.getByRole('button', { name: /^Receive$/i }));

    await waitFor(() => expect(useProductStore.getState().products[0].stock).toBe(15));
    const log = useSupplyStore.getState().adjustments;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      productId: 'p-1',
      delta: 5,
      newStock: 15,
      reason: 'received',
      operatorName: 'Ann',
    });
  });

  it('records waste as a negative movement', async () => {
    const user = userEvent.setup();
    render(<Inventory />);
    await openReceive();

    await user.selectOptions(
      document.querySelector('#receive-product-select') as HTMLSelectElement,
      'p-1',
    );
    await user.type(screen.getByLabelText(/Quantity change/i), '-3');
    await user.click(screen.getByRole('button', { name: /^Receive$/i }));

    await waitFor(() => expect(useProductStore.getState().products[0].stock).toBe(7));
    expect(useSupplyStore.getState().adjustments[0].delta).toBe(-3);
  });

  it('refuses a movement that would take stock below zero', async () => {
    const user = userEvent.setup();
    render(<Inventory />);
    await openReceive();

    await user.selectOptions(
      document.querySelector('#receive-product-select') as HTMLSelectElement,
      'p-1',
    );
    await user.type(screen.getByLabelText(/Quantity change/i), '-50'); // only 10 on hand
    await user.click(screen.getByRole('button', { name: /^Receive$/i }));

    expect(notify).toHaveBeenCalled();
    expect(useProductStore.getState().products[0].stock).toBe(10);
    expect(useSupplyStore.getState().adjustments).toHaveLength(0);
  });
});

describe('Inventory — receiving a purchase order', () => {
  beforeEach(() => {
    useSupplyStore.setState({ suppliers: [], adjustments: [], purchaseOrders: [orderedPo()] });
  });

  it('applies the ordered quantities once and closes the order', async () => {
    const user = userEvent.setup();
    render(<Inventory />);
    await openTab(/Purchase Orders/i);
    await user.click(await screen.findByRole('button', { name: /^Receive$/i }));

    await waitFor(() => expect(useProductStore.getState().products[0].stock).toBe(15));
    expect(useSupplyStore.getState().purchaseOrders[0].status).toBe('received');
    expect(useSupplyStore.getState().purchaseOrders[0].receivedAt).toBeTruthy();
    expect(useSupplyStore.getState().adjustments[0]).toMatchObject({
      delta: 5,
      reason: 'received',
      supplierName: 'Acme',
    });
  });

  // Regression: stock used to be credited BEFORE the status transition was
  // checked, and the transition's refusal was discarded — so a second call
  // added the same shipment to inventory again, silently.
  it('cannot be received twice', async () => {
    const user = userEvent.setup();
    render(<Inventory />);
    await openTab(/Purchase Orders/i);

    const receive = await screen.findByRole('button', { name: /^Receive$/i });
    await user.click(receive);
    await waitFor(() => expect(useProductStore.getState().products[0].stock).toBe(15));

    // Drive the handler again directly — the button is gone from the UI once
    // the order is received, which is exactly why the guard has to live in the
    // handler and not only in the markup.
    const receivedAgain = useSupplyStore.getState().setPurchaseOrderStatus('po-1', 'received');
    expect(receivedAgain).toBeNull();
    expect(useProductStore.getState().products[0].stock).toBe(15); // not 20
    expect(useSupplyStore.getState().adjustments).toHaveLength(1);
  });

  it('offers no receive action on a draft that was never ordered', async () => {
    useSupplyStore.setState({
      suppliers: [],
      adjustments: [],
      purchaseOrders: [{ ...orderedPo(), status: 'draft', orderedAt: null }],
    });
    render(<Inventory />);
    await openTab(/Purchase Orders/i);
    expect(screen.queryByRole('button', { name: /^Receive$/i })).not.toBeInTheDocument();
  });
});

describe('Inventory — editing the catalog', () => {
  it('renders a validated product image preview while editing', async () => {
    useProductStore.setState({
      products: [{ ...PRODUCT, image: 'https://images.example.test/item.png' }],
      categories: [{ id: 'cat-1', name: 'Drinks', color: '' }],
    });
    render(<Inventory />);

    await editProduct('Latte');

    expect(screen.getByRole('img', { name: 'Preview' })).toHaveAttribute(
      'src',
      'https://images.example.test/item.png',
    );
  });

  it('does not render a dangerous product image URL in the preview', async () => {
    useProductStore.setState({
      products: [{ ...PRODUCT, image: 'javascript:alert(1)' }],
      categories: [{ id: 'cat-1', name: 'Drinks', color: '' }],
    });
    render(<Inventory />);

    await editProduct('Latte');

    expect(screen.queryByRole('img', { name: 'Preview' })).not.toBeInTheDocument();
    expect(document.querySelector('#form-prod-image')).toHaveValue('javascript:alert(1)');
  });

  it('logs a correction when an edit changes the stock level', async () => {
    const user = userEvent.setup();
    render(<Inventory />);

    await editProduct('Latte');
    const stock = await screen.findByLabelText(/Stock/i, { selector: '#form-prod-stock' });
    await user.clear(stock);
    await user.type(stock, '25');
    await user.click(screen.getByRole('button', { name: /Save|Update/i }));

    await waitFor(() => expect(useProductStore.getState().products[0].stock).toBe(25));
    expect(useSupplyStore.getState().adjustments[0]).toMatchObject({
      delta: 15, // 25 - 10
      reason: 'correction',
    });
  });

  it('rejects a SKU already used by another product', async () => {
    useProductStore.setState({
      products: [PRODUCT, { ...PRODUCT, id: 'p-2', name: 'Mocha', sku: 'BEV-02' }],
      categories: [{ id: 'cat-1', name: 'Drinks', color: '' }],
    });
    const user = userEvent.setup();
    render(<Inventory />);

    await editProduct('Mocha');
    const sku = await screen.findByLabelText(/SKU/i, { selector: '#form-prod-sku' });
    await user.clear(sku);
    await user.type(sku, 'BEV-01'); // already Latte's
    await user.click(screen.getByRole('button', { name: /Save|Update/i }));

    expect(notify).toHaveBeenCalled();
    expect(useProductStore.getState().products.find((p) => p.id === 'p-2')!.sku).toBe('BEV-02');
  });
});
