import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { computeAccessibleName } from 'dom-accessibility-api';
import type { ReactElement } from 'react';

import Register from '../../src/components/Register';
import Inventory from '../../src/components/Inventory';
import History from '../../src/components/History';
import Customers from '../../src/components/Customers';
import ShiftScreen from '../../src/components/ShiftScreen';
import Settings from '../../src/components/Settings';
import FleetBoard from '../../src/components/FleetBoard';
import FleetDashboard from '../../src/components/FleetDashboard';
import StoreAdmin from '../../src/components/StoreAdmin';
import CatalogPush from '../../src/components/CatalogPush';
import ReceiptSettingsPanel from '../../src/components/ReceiptSettingsPanel';
import { defaultReceiptLayout, defaultKitchenLayout } from '../../src/lib/receiptFormat';

import { useProductStore } from '../../src/stores/productStore';
import { useCustomerStore } from '../../src/stores/customerStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useTransactionStore } from '../../src/stores/transactionStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useSupplyStore } from '../../src/stores/supplyStore';
import { useShiftStore } from '../../src/stores/shiftStore';
import { StoreSettings } from '../../src/types';

// Every form control needs an accessible name, or a screen reader announces it
// as nothing more than "edit text" and the operator has no idea which field
// they are in. A visible <label> alone does not provide one: it has to be
// associated, by htmlFor, by wrapping the control, or by aria-label.
//
// This is asserted with the real accessible-name algorithm rather than by
// grepping for attributes, so any of those three associations satisfies it and
// the check cannot be fooled by a label that merely sits nearby.

const SETTINGS: StoreSettings = {
  storeName: 'Test Store',
  storeAddress: '1 Main St',
  storePhone: '555',
  taxRate: 10,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};

beforeEach(() => {
  useProductStore.setState({
    products: [
      {
        id: 'p-1',
        name: 'Latte',
        price: 5,
        cost: 1,
        category: 'cat-1',
        sku: 'BEV-01',
        stock: 10,
        minStock: 2,
        image: '',
      },
    ],
    categories: [{ id: 'cat-1', name: 'Drinks', color: '' }],
  });
  useCustomerStore.setState({
    customers: [{ id: 'c-1', name: 'Sarah', email: '', phone: '', points: 5, createdAt: '2026' }],
  });
  useSettingsStore.setState({ settings: SETTINGS });
  useTransactionStore.setState({ transactions: [] });
  useSupplyStore.setState({ suppliers: [], adjustments: [], purchaseOrders: [] });
  useShiftStore.setState({ shifts: [], currentShiftId: null });
  useAuthStore.setState({
    currentUser: { id: 'u-1', name: 'Ann', role: 'admin', pin: '', active: true, createdAt: '' },
  });
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Controls that are unlabelled to assistive technology, described for the failure message. */
function unnamedControls(): string[] {
  const controls = document.querySelectorAll<HTMLElement>(
    'input:not([type="hidden"]), select, textarea',
  );
  const bad: string[] = [];
  controls.forEach((el) => {
    if (computeAccessibleName(el).trim()) return;
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute('type') ?? '';
    const id = el.id ? `#${el.id}` : '';
    const ph = el.getAttribute('placeholder');
    bad.push(`${tag}${type ? `[type=${type}]` : ''}${id}${ph ? ` (placeholder: "${ph}")` : ''}`);
  });
  return bad;
}

const screens: Array<[string, () => ReactElement]> = [
  ['Register', () => <Register />],
  ['Inventory', () => <Inventory />],
  ['History', () => <History />],
  ['Customers', () => <Customers />],
  ['ShiftScreen', () => <ShiftScreen />],
  ['Settings', () => <Settings />],
  // The super-admin surface. These four render against a cloud backend that is
  // absent here, so each falls back to its empty state — which is still the
  // state an operator sees before the first heartbeat lands, and its controls
  // still have to be named.
  ['FleetBoard', () => <FleetBoard orgId="org-test" />],
  ['FleetDashboard', () => <FleetDashboard orgId="org-test" />],
  ['StoreAdmin', () => <StoreAdmin orgId="org-test" />],
  ['CatalogPush', () => <CatalogPush orgId="org-test" />],
];

describe('every form control has an accessible name', () => {
  it.each(screens)('%s', (name, make) => {
    render(make());
    // Keyed by screen so a failure names the screen and so two screens failing
    // with the same shape are still reported separately.
    expect({ [name]: unnamedControls() }).toEqual({ [name]: [] });
  });
});

// The checks above only see each screen's landing state. Most of the fields in
// this app live one click deeper — behind a Settings tab or an editor modal —
// so those get walked too.
describe('controls revealed by a click are named too', () => {
  it.each(['Settings', 'Printer', 'Kitchen', 'Scanner', 'Supabase Sync', 'Users', 'Danger'])(
    'Settings › %s tab',
    async (tabName) => {
      const user = userEvent.setup();
      render(<Settings />);
      const tab = screen
        .getAllByRole('tab')
        .find((t) => new RegExp(tabName, 'i').test(t.textContent ?? ''));
      expect(tab, `no Settings tab matching "${tabName}"`).toBeTruthy();
      await user.click(tab!);
      expect({ [tabName]: unnamedControls() }).toEqual({ [tabName]: [] });
    },
  );

  it('Settings › new-user modal', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getAllByRole('tab').find((t) => /Users/i.test(t.textContent ?? ''))!);
    await user.click(await screen.findByRole('button', { name: /Add User|New User/i }));
    await screen.findByRole('dialog');
    expect({ userModal: unnamedControls() }).toEqual({ userModal: [] });
  });

  it('Inventory › product editor', async () => {
    const user = userEvent.setup();
    render(<Inventory />);
    const row = screen.getByText('Latte').closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /Edit/i }));
    await screen.findByLabelText(/SKU/i, { selector: '#form-prod-sku' });
    expect({ productForm: unnamedControls() }).toEqual({ productForm: [] });
  });

  it('Inventory › stock movement', async () => {
    const user = userEvent.setup();
    render(<Inventory />);
    await user.click(document.querySelector('#receive-stock-btn') as HTMLElement);
    await screen.findByLabelText(/Quantity change/i);
    expect({ receiveForm: unnamedControls() }).toEqual({ receiveForm: [] });
  });

  it.each(['Categories', 'Suppliers', 'Orders'])('Inventory › %s editor', async (tabName) => {
    const user = userEvent.setup();
    render(<Inventory />);
    await user.click(
      screen
        .getAllByRole('tab')
        .find((tab) => new RegExp(tabName, 'i').test(tab.textContent ?? ''))!,
    );
    await user.click(document.querySelector('#add-item-trigger-btn') as HTMLElement);
    await screen.findByRole('dialog');
    expect({ [tabName]: unnamedControls() }).toEqual({ [tabName]: [] });
  });

  it('Customers › customer editor', async () => {
    const user = userEvent.setup();
    render(<Customers />);
    await user.click(await screen.findByRole('button', { name: /Add Customer|New Customer/i }));
    await screen.findByRole('dialog');
    expect({ customerForm: unnamedControls() }).toEqual({ customerForm: [] });
  });

  // Rendered by the Printer and Kitchen tabs, but it takes its layout by prop,
  // so both variants are checked directly.
  it.each([
    ['customer', defaultReceiptLayout()],
    ['kitchen', defaultKitchenLayout()],
  ] as const)('ReceiptSettingsPanel (%s)', (kind, layout) => {
    render(<ReceiptSettingsPanel kind={kind} layout={layout} onChange={() => {}} />);
    expect({ [kind]: unnamedControls() }).toEqual({ [kind]: [] });
  });
});
