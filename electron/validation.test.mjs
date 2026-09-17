import { describe, expect, it } from 'vitest';
// The module under test is CommonJS, as the Electron main process requires it
// to be. The test file has to be ESM (Vitest cannot be required from CJS), so
// it takes the default export and destructures it — a named import would rely
// on static analysis of a module built for require().
import validation from './validation.cjs';

const {
  MAX_MENU_DATA_BYTES,
  MAX_MENU_LABEL_LENGTH,
  MAX_MENU_IMAGE_LENGTH,
  MAX_MENU_RECORDS,
  MAX_RAW_PRINT_BYTES,
  isIPv4,
  isPrivateIPv4,
  isPlainObject,
  isSafeMenuData,
  isValidPrinterPayload,
  isValidRawBytes,
} = validation;

const product = (overrides = {}) => ({
  id: 'p1',
  name: 'Latte',
  category: 'Drinks',
  image: '',
  price: 3.5,
  inStock: true,
  ...overrides,
});

const category = (overrides = {}) => ({
  id: 'c1',
  name: 'Drinks',
  color: 'bg-blue-100',
  ...overrides,
});

const menu = (overrides = {}) => ({
  products: [product()],
  categories: [category()],
  settings: { storeName: 'Test', currency: '$' },
  ...overrides,
});

describe('isIPv4', () => {
  // The regression this file exists for. `isIPv4` once shipped with `\\d`
  // inside a regex literal — an escaped backslash and a literal "d", not a
  // digit class — so the pattern matched only "0" and every real address was
  // rejected. The QR menu bound loopback, network printing refused every
  // payload, and the subnet scan bailed at its own guard: three silent
  // failures, in packaged builds only.
  it.each(['192.168.1.1', '10.0.0.1', '8.8.8.8', '0.0.0.0', '255.255.255.255'])(
    'accepts %s',
    (ip) => expect(isIPv4(ip)).toBe(true),
  );

  it.each([
    ['leading zeros', '192.168.01.1'],
    ['octet out of range', '256.1.1.1'],
    ['too few octets', '192.168.1'],
    ['too many octets', '1.2.3.4.5'],
    ['empty octet', '192.168..1'],
    ['not a number', 'a.b.c.d'],
    ['empty', ''],
  ])('rejects %s', (_label, ip) => expect(isIPv4(ip)).toBe(false));
});

describe('isPrivateIPv4', () => {
  it.each(['10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.1', '192.168.0.1'])(
    'accepts RFC 1918 address %s',
    (ip) => expect(isPrivateIPv4(ip)).toBe(true),
  );

  // Printer discovery and raw printing must never become general-purpose
  // outbound sockets, so the public internet stays out.
  it.each(['8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.0.1', '127.0.0.1', '11.0.0.1'])(
    'rejects %s',
    (ip) => expect(isPrivateIPv4(ip)).toBe(false),
  );
});

describe('isValidRawBytes', () => {
  it('accepts a non-empty array of byte values', () => {
    expect(isValidRawBytes([0, 27, 255])).toBe(true);
  });

  it.each([
    ['an empty array', []],
    ['a non-array', 'not bytes'],
    ['a value above 255', [256]],
    ['a negative value', [-1]],
    ['a fractional value', [1.5]],
    ['NaN', [Number.NaN]],
  ])('rejects %s', (_label, data) => expect(isValidRawBytes(data)).toBe(false));

  it('rejects a payload over the size cap', () => {
    expect(isValidRawBytes(new Array(MAX_RAW_PRINT_BYTES + 1).fill(0))).toBe(false);
  });
});

describe('isValidPrinterPayload', () => {
  const valid = { ip: '192.168.1.50', port: 9100, data: [1, 2, 3] };

  it('accepts a private address on the raw-printer port', () => {
    expect(isValidPrinterPayload(valid)).toBe(true);
  });

  it('rejects a public address', () => {
    expect(isValidPrinterPayload({ ...valid, ip: '8.8.8.8' })).toBe(false);
  });

  it('rejects any port but 9100', () => {
    expect(isValidPrinterPayload({ ...valid, port: 22 })).toBe(false);
  });

  it('rejects a non-object payload', () => {
    expect(isValidPrinterPayload(null)).toBe(false);
    expect(isValidPrinterPayload([valid])).toBe(false);
  });
});

describe('isPlainObject', () => {
  it('accepts an object literal and a null-prototype object', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it('rejects arrays, null, and class instances', () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
  });
});

describe('isSafeMenuData', () => {
  it('accepts the documented customer-safe shape', () => {
    expect(isSafeMenuData(menu())).toBe(true);
  });

  it('accepts an optional store logo and an absent one alike', () => {
    expect(isSafeMenuData(menu({ settings: { storeName: 'T', currency: '$' } }))).toBe(true);
    expect(
      isSafeMenuData(menu({ settings: { storeName: 'T', currency: '$', storeLogo: 'data:,x' } })),
    ).toBe(true);
  });

  it.each([
    ['a non-object', 'nope'],
    ['missing products', { categories: [], settings: {} }],
    ['products that are not an array', menu({ products: {} })],
    ['settings that are not an object', menu({ settings: [] })],
  ])('rejects %s', (_label, data) => expect(isSafeMenuData(data)).toBe(false));

  it('rejects a non-numeric or non-finite price', () => {
    expect(isSafeMenuData(menu({ products: [product({ price: '3.50' })] }))).toBe(false);
    expect(isSafeMenuData(menu({ products: [product({ price: Number.NaN })] }))).toBe(false);
  });

  it('rejects a non-boolean inStock', () => {
    expect(isSafeMenuData(menu({ products: [product({ inStock: 'yes' })] }))).toBe(false);
  });

  it('rejects more records than the cap allows', () => {
    const many = new Array(MAX_MENU_RECORDS + 1).fill(product());
    expect(isSafeMenuData(menu({ products: many }))).toBe(false);
  });

  it('rejects an over-long label', () => {
    expect(
      isSafeMenuData(
        menu({ products: [product({ name: 'x'.repeat(MAX_MENU_LABEL_LENGTH + 1) })] }),
      ),
    ).toBe(false);
  });

  it('allows an image far larger than a label, as an upload really is', () => {
    const image = `data:image/png;base64,${'A'.repeat(MAX_MENU_LABEL_LENGTH * 4)}`;
    expect(isSafeMenuData(menu({ products: [product({ image })] }))).toBe(true);
  });

  it('rejects an image past its own bound', () => {
    expect(
      isSafeMenuData(
        menu({ products: [product({ image: 'x'.repeat(MAX_MENU_IMAGE_LENGTH + 1) })] }),
      ),
    ).toBe(false);
  });

  // Per-field bounds alone still admit thousands of records of near-maximal
  // images, which main.cjs would only reject after JSON.stringify had already
  // built the whole string. The running budget is what stops that.
  it('rejects an aggregate payload over the byte budget, field bounds notwithstanding', () => {
    const image = 'x'.repeat(MAX_MENU_IMAGE_LENGTH);
    const products = new Array(Math.ceil(MAX_MENU_DATA_BYTES / MAX_MENU_IMAGE_LENGTH) + 1)
      .fill(null)
      .map((_unused, index) => product({ id: `p${index}`, image }));
    expect(isSafeMenuData(menu({ products }))).toBe(false);
  });
});
