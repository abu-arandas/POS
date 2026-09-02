import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildReceiptDoc } from '../../../src/lib/receiptDoc';
import { allTogglesOn } from '../../../src/lib/receiptFormat';
import type {
  PrinterConfig,
  ReceiptLayout,
  SaleTransaction,
  StoreSettings,
} from '../../../src/types';

// The store logo on a thermal printer.
//
// show.logo was honored by the HTML receipt and ignored by every thermal path,
// because the DocRow model had no logo row at all. Fixing it took three pieces,
// and any one of them alone leaves the setting still doing nothing:
//
//   1. the row has to exist, so the raster renderer has something to draw;
//   2. the raster path has to be CHOSEN — it was selected only for non-ASCII
//      text, so an English receipt kept the ESC/POS text path, which has no
//      image command, and dropped the logo silently; and
//   3. the decode has to be bounded, because it is awaited on the way to the
//      printer.
//
// Each is tested at the level where it is real. The raster renderer itself is
// not exercised here: it needs a canvas 2D context, which jsdom does not
// implement, so asserting on emitted bytes would silently assert on the text
// path instead and prove nothing.

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const settings = (over: Partial<StoreSettings> = {}): StoreSettings => ({
  storeName: 'Test Store',
  storeAddress: '1 Main St',
  storePhone: '555-0100',
  taxRate: 8.5,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
  ...over,
});

const tx: SaleTransaction = {
  id: 'TX-ABCD1234',
  date: '2026-07-16T10:00:00.000Z',
  items: [{ productId: 'p1', productName: 'Latte', price: 4.5, cost: 0.9, quantity: 2, total: 9 }],
  subtotal: 9,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 0.77,
  total: 9.77,
  paymentMethod: 'card',
  customerId: null,
  status: 'completed',
};

const networkPrinter: PrinterConfig = {
  type: 'network',
  paperSize: '80mm',
  ipAddress: '192.168.1.50',
  showBarcode: false,
  footerMessage: '',
  autoPrintOnCheckout: false,
};

const layoutWithLogo: ReceiptLayout = {
  header: '',
  footer: '',
  fontFamily: 'monospace',
  fontSizePx: 12,
  dateFormat: 'yyyy-MM-dd',
  timeFormat: 'h:mm a',
  show: { ...allTogglesOn() },
};

const layoutWithoutLogo: ReceiptLayout = {
  ...layoutWithLogo,
  show: { ...allTogglesOn(), logo: false },
};

/**
 * jsdom builds an Image but never decodes one, so neither onload nor onerror
 * ever fires — which is precisely the hang loadReceiptLogo has to survive.
 * Tests install the behaviour they need.
 */
function stubImage(behaviour: 'load' | 'error' | 'never') {
  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 64;
    height = 64;
    set src(_value: string) {
      if (behaviour === 'never') return;
      queueMicrotask(() => {
        if (behaviour === 'load') this.onload?.();
        else this.onerror?.();
      });
    }
  }
  (globalThis as unknown as { Image: unknown }).Image = StubImage;
}

// ── 1. The shared model carries the logo ────────────────────────────────────

describe('the DocRow model carries the logo', () => {
  it('emits a logo row carrying the uploaded image when the toggle is on', () => {
    const rows = buildReceiptDoc(
      tx,
      settings({ storeLogo: PIXEL }),
      networkPrinter,
      layoutWithLogo,
    );
    expect(rows[0]).toEqual({ kind: 'logo', src: PIXEL });
  });

  it('emits no logo row when the toggle is off', () => {
    const rows = buildReceiptDoc(
      tx,
      settings({ storeLogo: PIXEL }),
      networkPrinter,
      layoutWithoutLogo,
    );
    expect(rows.some((row) => row.kind === 'logo')).toBe(false);
  });
});

// ── 2. The decode is bounded ────────────────────────────────────────────────

describe('loadReceiptLogo', () => {
  let originalImage: typeof Image;

  beforeEach(() => {
    originalImage = globalThis.Image;
  });

  afterEach(() => {
    globalThis.Image = originalImage;
    vi.useRealTimers();
  });

  it('resolves the decoded image', async () => {
    stubImage('load');
    const { loadReceiptLogo } = await import('../../../src/lib/receiptCanvas');
    await expect(loadReceiptLogo(PIXEL)).resolves.not.toBeNull();
  });

  it('resolves null without an src', async () => {
    const { loadReceiptLogo } = await import('../../../src/lib/receiptCanvas');
    await expect(loadReceiptLogo(undefined)).resolves.toBeNull();
  });

  it('resolves null when the decode fails', async () => {
    stubImage('error');
    const { loadReceiptLogo } = await import('../../../src/lib/receiptCanvas');
    await expect(loadReceiptLogo(PIXEL)).resolves.toBeNull();
  });

  it('resolves null when the decode never reports back at all', async () => {
    // The case neither handler covers. This promise is awaited on the path to
    // the printer, so without the timeout the receipt is never sent and the
    // operator is left holding a sale that appears to have vanished.
    stubImage('never');
    vi.useFakeTimers();
    const { loadReceiptLogo, LOGO_DECODE_TIMEOUT_MS } =
      await import('../../../src/lib/receiptCanvas');

    const pending = loadReceiptLogo(PIXEL);
    await vi.advanceTimersByTimeAsync(LOGO_DECODE_TIMEOUT_MS + 1);

    await expect(pending).resolves.toBeNull();
  });
});

// ── 3. A logo selects the raster path ───────────────────────────────────────

describe('raster path selection', () => {
  const renderReceiptRaster = vi.fn();
  const loadReceiptLogo = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    renderReceiptRaster.mockReset().mockReturnValue({ data: [0x00], width: 576, height: 10 });
    loadReceiptLogo.mockReset().mockResolvedValue({ width: 64, height: 64 });

    vi.doMock('../../../src/lib/receiptCanvas', () => ({
      renderReceiptRaster,
      loadReceiptLogo,
      ensureReceiptFont: vi.fn().mockResolvedValue(undefined),
      LOGO_DECODE_TIMEOUT_MS: 2000,
    }));
  });

  afterEach(() => {
    vi.doUnmock('../../../src/lib/receiptCanvas');
    vi.resetModules();
  });

  async function print(store: StoreSettings, layout: ReceiptLayout) {
    const printEscpos = vi.fn().mockResolvedValue(true);
    (window as unknown as { electronAPI?: unknown }).electronAPI = { printEscpos };
    const { printReceipt } = await import('../../../src/lib/hardwarePrint');
    await printReceipt(tx, store, networkPrinter, false, layout);
    return printEscpos;
  }

  it('rasters a pure-ASCII receipt when a logo image is present', async () => {
    const printEscpos = await print(settings({ storeLogo: PIXEL }), layoutWithLogo);

    // Nothing on this receipt is non-ASCII, so before the fix it took the text
    // path and the logo was dropped without a word.
    expect(renderReceiptRaster).toHaveBeenCalledTimes(1);
    expect(renderReceiptRaster.mock.calls[0][2]).toMatchObject({
      logo: { width: 64, height: 64 },
    });
    expect(printEscpos).toHaveBeenCalledTimes(1);
  });

  it('keeps the cheaper text path when no logo image was ever uploaded', async () => {
    await print(settings(), layoutWithLogo);

    // The toggle is on but there is no image, so there is nothing to raster FOR.
    // Otherwise every English till pays the larger, slower path for a picture
    // that does not exist.
    expect(renderReceiptRaster).not.toHaveBeenCalled();
  });

  it('keeps the text path when the logo toggle is off', async () => {
    await print(settings({ storeLogo: PIXEL }), layoutWithoutLogo);

    expect(renderReceiptRaster).not.toHaveBeenCalled();
  });

  it('still prints when the logo cannot be decoded', async () => {
    loadReceiptLogo.mockResolvedValue(null);

    const printEscpos = await print(settings({ storeLogo: PIXEL }), layoutWithLogo);

    // The picture is lost; the receipt is not.
    expect(printEscpos).toHaveBeenCalledTimes(1);
    expect(printEscpos.mock.calls[0][0].data.length).toBeGreaterThan(0);
  });
});
