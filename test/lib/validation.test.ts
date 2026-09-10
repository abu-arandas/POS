import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// The Electron main process is CommonJS and never goes through Vite, so it is
// loaded the way Electron itself loads it.
const require = createRequire(import.meta.url);
const {
  MAX_MENU_DATA_BYTES,
  MAX_MENU_LABEL_LENGTH,
  MAX_MENU_IMAGE_LENGTH,
  isIPv4,
  isPrivateIPv4,
  isValidRawBytes,
  isValidPrinterPayload,
  isSafeMenuData,
} = require('../../electron/validation.cjs');

// These validators guard the privileged IPC surface. They previously lived
// inline in main.cjs, where CI reached them only through `node --check` — and a
// `\\d` inside a regex literal (an escaped backslash, not a digit class) made
// isIPv4 accept nothing but "0.0.0.0". Valid JavaScript, so the parse passed,
// and the QR menu server plus network printing both died silently in packaged
// builds. Everything here exists so that cannot happen again unnoticed.

describe('isIPv4', () => {
  it('accepts ordinary dotted-quad addresses', () => {
    for (const ip of ['192.168.1.50', '10.0.0.5', '172.16.3.9', '127.0.0.1', '8.8.8.8']) {
      expect(isIPv4(ip), ip).toBe(true);
    }
  });

  it('accepts the boundary octets', () => {
    expect(isIPv4('0.0.0.0')).toBe(true);
    expect(isIPv4('255.255.255.255')).toBe(true);
  });

  it('rejects out-of-range octets', () => {
    expect(isIPv4('256.1.1.1')).toBe(false);
    expect(isIPv4('1.1.1.999')).toBe(false);
  });

  it('rejects the wrong number of octets', () => {
    expect(isIPv4('1.2.3')).toBe(false);
    expect(isIPv4('1.2.3.4.5')).toBe(false);
    expect(isIPv4('')).toBe(false);
  });

  it('rejects leading zeros, so an address has exactly one spelling', () => {
    expect(isIPv4('192.168.01.1')).toBe(false);
    expect(isIPv4('010.0.0.1')).toBe(false);
  });

  it('rejects non-numeric and non-string junk', () => {
    for (const value of ['a.b.c.d', '1.2.3.x', '  1.2.3.4', '1.2.3.4 ', null, undefined, {}, 42]) {
      expect(isIPv4(value as never), String(value)).toBe(false);
    }
  });
});

describe('isPrivateIPv4', () => {
  it('accepts each RFC 1918 range', () => {
    expect(isPrivateIPv4('10.1.2.3')).toBe(true);
    expect(isPrivateIPv4('172.16.0.1')).toBe(true);
    expect(isPrivateIPv4('172.31.255.254')).toBe(true);
    expect(isPrivateIPv4('192.168.1.50')).toBe(true);
  });

  it('rejects public addresses and loopback', () => {
    expect(isPrivateIPv4('8.8.8.8')).toBe(false);
    expect(isPrivateIPv4('127.0.0.1')).toBe(false);
    expect(isPrivateIPv4('172.15.0.1')).toBe(false); // just below the 172.16/12 block
    expect(isPrivateIPv4('172.32.0.1')).toBe(false); // just above it
    expect(isPrivateIPv4('192.167.1.1')).toBe(false);
  });

  it('rejects anything that is not a valid address at all', () => {
    expect(isPrivateIPv4('not-an-ip')).toBe(false);
    expect(isPrivateIPv4(undefined as never)).toBe(false);
  });
});

describe('isValidRawBytes', () => {
  it('accepts a non-empty array of byte values', () => {
    expect(isValidRawBytes([0, 27, 64, 255])).toBe(true);
  });

  it('rejects an empty array, non-arrays, and out-of-range or fractional values', () => {
    expect(isValidRawBytes([])).toBe(false);
    expect(isValidRawBytes('bytes')).toBe(false);
    expect(isValidRawBytes([0, 256])).toBe(false);
    expect(isValidRawBytes([0, -1])).toBe(false);
    expect(isValidRawBytes([1.5])).toBe(false);
  });

  it('caps the payload so one print job cannot exhaust memory', () => {
    expect(isValidRawBytes(new Array(1_000_000).fill(0))).toBe(true);
    expect(isValidRawBytes(new Array(1_000_001).fill(0))).toBe(false);
  });
});

describe('isValidPrinterPayload', () => {
  const valid = { ip: '192.168.1.50', port: 9100, data: [27, 64] };

  it('accepts a private-network RAW printer payload', () => {
    expect(isValidPrinterPayload(valid)).toBe(true);
  });

  it('refuses to open a socket to a public address', () => {
    expect(isValidPrinterPayload({ ...valid, ip: '8.8.8.8' })).toBe(false);
  });

  it('allows only the RAW/JetDirect port', () => {
    expect(isValidPrinterPayload({ ...valid, port: 22 })).toBe(false);
    expect(isValidPrinterPayload({ ...valid, port: '9100' })).toBe(false);
  });

  it('rejects a prototype-polluted or non-plain payload', () => {
    expect(isValidPrinterPayload(Object.create({ ...valid }))).toBe(false);
    expect(isValidPrinterPayload(null)).toBe(false);
    expect(isValidPrinterPayload([valid])).toBe(false);
  });
});

describe('isSafeMenuData', () => {
  const menu = {
    products: [{ id: 'p1', name: 'Latte', category: 'c1', image: '', price: 4.5, inStock: true }],
    categories: [{ id: 'c1', name: 'Drinks', color: 'badge badge-blue' }],
    settings: { storeName: 'Cafe', currency: '$' },
  };

  it('accepts the documented customer-safe shape', () => {
    expect(isSafeMenuData(menu)).toBe(true);
  });

  it('accepts an optional store logo but not a non-string one', () => {
    expect(isSafeMenuData({ ...menu, settings: { ...menu.settings, storeLogo: 'x' } })).toBe(true);
    expect(isSafeMenuData({ ...menu, settings: { ...menu.settings, storeLogo: 5 } })).toBe(false);
  });

  it('rejects a product missing a required field or carrying a bad type', () => {
    expect(isSafeMenuData({ ...menu, products: [{ ...menu.products[0], price: 'free' }] })).toBe(
      false,
    );
    expect(isSafeMenuData({ ...menu, products: [{ ...menu.products[0], inStock: 'yes' }] })).toBe(
      false,
    );
    expect(isSafeMenuData({ ...menu, products: [{ ...menu.products[0], price: NaN }] })).toBe(
      false,
    );
  });

  it('rejects missing settings strings', () => {
    expect(isSafeMenuData({ ...menu, settings: { currency: '$' } })).toBe(false);
    expect(isSafeMenuData({ ...menu, settings: { storeName: 'Cafe' } })).toBe(false);
  });

  it('rejects non-array collections and non-object input', () => {
    expect(isSafeMenuData({ ...menu, products: 'all' })).toBe(false);
    expect(isSafeMenuData({ ...menu, categories: null })).toBe(false);
    expect(isSafeMenuData(null)).toBe(false);
    expect(isSafeMenuData('menu')).toBe(false);
  });

  it('bounds how many records the privileged process will walk', () => {
    const product = menu.products[0];
    expect(isSafeMenuData({ ...menu, products: new Array(5_001).fill(product) })).toBe(false);
  });

  it('holds labels to a label-sized bound', () => {
    const name = 'x'.repeat(MAX_MENU_LABEL_LENGTH);
    expect(isSafeMenuData({ ...menu, products: [{ ...menu.products[0], name }] })).toBe(true);
    expect(isSafeMenuData({ ...menu, products: [{ ...menu.products[0], name: name + 'x' }] })).toBe(
      false,
    );
  });

  it('lets an uploaded logo through at a size a real logo actually is', () => {
    // FileReader.readAsDataURL turns even a small PNG into far more than a
    // label's worth of characters; a 16 KB bound rejected the whole payload and
    // froze the QR menu.
    const storeLogo = `data:image/png;base64,${'A'.repeat(64 * 1024)}`;
    expect(isSafeMenuData({ ...menu, settings: { ...menu.settings, storeLogo } })).toBe(true);

    const huge = 'A'.repeat(MAX_MENU_IMAGE_LENGTH + 1);
    expect(isSafeMenuData({ ...menu, settings: { ...menu.settings, storeLogo: huge } })).toBe(
      false,
    );
  });

  it('stops walking once the payload cannot fit the serialized-size limit', () => {
    // Per-field bounds alone would bless 5,000 half-megabyte images — gigabytes
    // that main.cjs only rejects after JSON.stringify has built the string.
    const image = 'A'.repeat(MAX_MENU_IMAGE_LENGTH);
    const fat = Array.from({ length: 32 }, (_, i) => ({
      ...menu.products[0],
      id: `p${i}`,
      image,
    }));
    expect(32 * MAX_MENU_IMAGE_LENGTH).toBeGreaterThan(MAX_MENU_DATA_BYTES);
    expect(isSafeMenuData({ ...menu, products: fat })).toBe(false);

    // Just under the budget still passes, so the guard is a ceiling and not a
    // blanket ban on image-heavy menus.
    const lean = fat.slice(0, 9);
    expect(9 * MAX_MENU_IMAGE_LENGTH).toBeLessThan(MAX_MENU_DATA_BYTES);
    expect(isSafeMenuData({ ...menu, products: lean })).toBe(true);
  });
});
