import { describe, it, expect, afterEach } from 'vitest';
import { buildReceiptHtml, buildKitchenTicketHtml } from '../../../src/lib/receipt';
import { allTogglesOn, defaultKitchenLayout } from '../../../src/lib/receiptFormat';
import i18n from '../../../src/lib/i18n';
import type {
  PrinterConfig,
  ReceiptLayout,
  SaleTransaction,
  StoreSettings,
} from '../../../src/types';

// Characterization snapshots.
//
// The customer receipt is a money document, and the surrounding tests assert
// content ("does CASH PAID: appear?") rather than structure. That leaves room
// for a refactor to quietly drop a CSS class and change how a printed receipt
// actually looks — the dashed box around YOU SAVED, the letter-spacing on the
// status line, the .ltr isolation that keeps "8:15 PM" from rendering as
// "PM 8:15" on an Arabic receipt — while every content assertion still passes.
//
// These snapshots pin the exact markup so that any change to it has to be
// deliberate and reviewed in the diff, not discovered on a customer's receipt.

const settings: StoreSettings = {
  storeName: 'Cafe Test',
  storeAddress: '1 Test Street',
  storePhone: '555-0100',
  branchName: 'Downtown',
  taxNumber: 'VAT-99',
  storeLogo: '',
  taxRate: 8.5,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};

const printer: PrinterConfig = {
  type: 'system',
  paperSize: '80mm',
  showBarcode: true,
  footerMessage: 'Thank you!',
  autoPrintOnCheckout: true,
};

// Deliberately exercises every optional block at once: branch, tax number,
// operator, member, a multi-quantity line, a discount, a split payment
// including cash, earned points, a refund with an authorizer, and a barcode.
const richSale: SaleTransaction = {
  id: 'TX-ABCD1234',
  date: '2026-03-04T20:15:00.000Z',
  items: [
    { productId: 'p1', productName: 'Latte', price: 4.5, cost: 1, quantity: 2, total: 9 },
    { productId: 'p2', productName: 'Croissant', price: 3, cost: 1, quantity: 1, total: 3 },
  ],
  subtotal: 12,
  discount: 2,
  discountType: 'fixed',
  discountValue: 2,
  tax: 0.85,
  total: 10.85,
  paymentMethod: 'cash',
  payments: [
    { method: 'card', amount: 5 },
    { method: 'cash', amount: 10 },
  ],
  cashPaid: 10,
  cashChange: 4.15,
  customerId: 'c1',
  customerName: 'Grace Hopper',
  operatorId: 'u1',
  operatorName: 'Ada Lovelace',
  pointsEarned: 10,
  status: 'partial',
  refundedItems: [{ productId: 'p2', quantity: 1 }],
  refundedAmount: 2.71,
  refundDate: '2026-03-05T09:00:00.000Z',
  refundAuthorizedBy: 'Jane (manager)',
  shiftId: 'shift-1',
};

const fullLayout: ReceiptLayout = {
  header: 'CUSTOMER COPY',
  footer: 'Thank you for visiting!',
  fontFamily: 'monospace',
  fontSizePx: 12,
  dateFormat: 'yyyy-MM-dd',
  timeFormat: 'h:mm a',
  show: allTogglesOn(),
};

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('customer receipt markup', () => {
  it('renders every block with all toggles on', () => {
    expect(buildReceiptHtml(richSale, settings, printer, fullLayout)).toMatchSnapshot();
  });

  it('collapses the blocks its toggles switch off', () => {
    const trimmed: ReceiptLayout = {
      ...fullLayout,
      show: {
        ...allTogglesOn(),
        logo: false,
        branchName: false,
        taxNumber: false,
        operator: false,
        customer: false,
        itemUnitPrice: false,
        loyalty: false,
        barcode: false,
      },
    };
    expect(buildReceiptHtml(richSale, settings, printer, trimmed)).toMatchSnapshot();
  });

  it('keeps numeric values LTR-isolated on an Arabic receipt', async () => {
    await i18n.changeLanguage('ar');
    expect(buildReceiptHtml(richSale, settings, printer, fullLayout)).toMatchSnapshot();
  });
});

describe('kitchen ticket markup', () => {
  it('renders items in large type with no pricing', () => {
    expect(
      buildKitchenTicketHtml(richSale, settings, 'GRILL', defaultKitchenLayout()),
    ).toMatchSnapshot();
  });
});
