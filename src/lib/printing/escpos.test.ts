import { describe, expect, it } from 'vitest';
import { encodeReceipt, encodeKitchenTicket } from './escpos';
import type { PrinterConfig, SaleTransaction, StoreSettings } from '../../types';

const SETTINGS: StoreSettings = {
  storeName: 'Test Cafe',
  storeAddress: '',
  storePhone: '',
  taxRate: 0,
  currency: '$',
  loyaltyPointsRate: 0,
  loyaltyPointValue: 0,
};

const PRINTER: PrinterConfig = {
  type: 'network',
  paperSize: '80mm',
  showBarcode: false,
  footerMessage: '',
  autoPrintOnCheckout: false,
};

function sale(overrides: Partial<SaleTransaction> = {}): SaleTransaction {
  return {
    id: 'TX-1',
    date: '2026-01-01T12:00:00.000Z',
    items: [{ productId: 'p', productName: 'Latte', price: 1, cost: 0, quantity: 1, total: 1 }],
    subtotal: 1,
    discount: 0,
    discountType: 'none',
    discountValue: 0,
    tax: 0,
    total: 1,
    paymentMethod: 'cash',
    customerId: null,
    status: 'completed',
    ...overrides,
  };
}

// encodeReceipt returns a Uint8Array, so these convert first: Uint8Array.map
// coerces its callback's result back to a byte, which turns a string-producing
// map into a run of zeroes rather than text.
/** Control bytes in the stream, excluding the newlines that end every line. */
const controlBytes = (bytes: Uint8Array) =>
  Array.from(bytes).filter((b) => b < 0x20 && b !== 0x0a).length;

/** The stream's printable ASCII, as the printer would put it on paper. */
const printable = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ''))
    .join('');

/**
 * Every control byte a receipt legitimately contains is emitted by the builder's
 * own `raw()` calls — ESC @ to reset, ESC a to align, GS V to cut. None of them
 * come from text. So a receipt whose operator-supplied names are hostile must
 * carry exactly as many control bytes as the same receipt with harmless names:
 * any surplus is a name that reached the printer as a COMMAND.
 *
 * This matters because ESC/POS has no quoting. `\x1Ba\x01` right-aligns the rest
 * of the receipt, `\x1Bm` cuts the paper, and a GS sequence can redefine the
 * character set or fire the cash drawer. The HTML renderer's escaping is no
 * defence here either: escapeHtml leaves control characters untouched, because
 * on a screen they are invisible rather than dangerous.
 */
function assertNoInjectedControlBytes(hostile: SaleTransaction, benign: SaleTransaction) {
  expect(controlBytes(encodeReceipt(hostile, SETTINGS, PRINTER, false))).toBe(
    controlBytes(encodeReceipt(benign, SETTINGS, PRINTER, false)),
  );
}

describe('ESC/POS control-character injection', () => {
  const ATTACK = '\x1Ba\x01EVIL\x1Bm\x00\x7f';
  const STRIPPED = 'aEVILm'; // the same string with only its control bytes removed

  it('strips control bytes from a product name', () => {
    assertNoInjectedControlBytes(
      sale({ items: [{ ...sale().items[0], productName: ATTACK }] }),
      sale({ items: [{ ...sale().items[0], productName: STRIPPED }] }),
    );
  });

  it('strips control bytes from a variant name', () => {
    assertNoInjectedControlBytes(
      sale({ items: [{ ...sale().items[0], variantName: ATTACK }] }),
      sale({ items: [{ ...sale().items[0], variantName: STRIPPED }] }),
    );
  });

  // The path this PR added. Modifiers had never reached a printer before, so
  // this is newly attacker-reachable text rather than a pre-existing hole.
  it('strips control bytes from a modifier name', () => {
    const withMod = (name: string) =>
      sale({
        items: [
          {
            ...sale().items[0],
            modifiers: [
              { groupId: 'g', groupName: 'G', optionId: 'o', optionName: name, priceDelta: 0 },
            ],
          },
        ],
      });
    assertNoInjectedControlBytes(withMod(ATTACK), withMod(STRIPPED));
  });

  it('strips control bytes from the store name', () => {
    const hostile = encodeReceipt(sale(), { ...SETTINGS, storeName: ATTACK }, PRINTER, false);
    const benign = encodeReceipt(sale(), { ...SETTINGS, storeName: STRIPPED }, PRINTER, false);
    expect(controlBytes(hostile)).toBe(controlBytes(benign));
  });

  it('strips control bytes on the kitchen ticket too', () => {
    const hostile = encodeKitchenTicket(
      sale({ items: [{ ...sale().items[0], productName: ATTACK }] }),
      SETTINGS,
      PRINTER,
    );
    const benign = encodeKitchenTicket(
      sale({ items: [{ ...sale().items[0], productName: STRIPPED }] }),
      SETTINGS,
      PRINTER,
    );
    expect(controlBytes(hostile)).toBe(controlBytes(benign));
  });

  it('still prints the harmless characters around the stripped ones', () => {
    const bytes = encodeReceipt(
      sale({ items: [{ ...sale().items[0], productName: 'Fla\x1Bt White' }] }),
      SETTINGS,
      PRINTER,
      false,
    );
    // The ESC is gone; every letter it sat between survives.
    expect(printable(bytes)).toContain('Flat White');
  });

  it('emits a printable placeholder for a non-ASCII character rather than dropping it', () => {
    // Multibyte text is replaced with '?', not removed — a receipt that silently
    // loses half a name is worse than one that shows it could not print it. The
    // raster path (escposRaster) is what renders those scripts properly.
    const bytes = encodeReceipt(
      sale({ items: [{ ...sale().items[0], productName: 'Café' }] }),
      SETTINGS,
      PRINTER,
      false,
    );
    expect(printable(bytes)).toContain('Caf?');
  });
});
