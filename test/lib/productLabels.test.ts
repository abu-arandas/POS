import { describe, it, expect } from 'vitest';
import { buildLabelHtml, buildLabelSheetHtml } from '../../src/lib/productLabels';
import { Product, StoreSettings } from '../../src/types';

const settings: StoreSettings = {
  storeName: 'Test Store',
  storeAddress: '1 Main St',
  storePhone: '555-0100',
  taxRate: 10,
  currency: '$',
  loyaltyPointsRate: 1,
  loyaltyPointValue: 0.05,
};

const prod = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Flat White',
  price: 4.5,
  cost: 1.2,
  category: 'c1',
  sku: 'BEV-FW-01',
  stock: 10,
  minStock: 3,
  image: '',
  ...over,
});

describe('buildLabelHtml', () => {
  it('shows name, price, SKU and a real barcode by default', () => {
    const html = buildLabelHtml(prod(), settings);
    expect(html).toContain('Flat White');
    expect(html).toContain('$4.50');
    expect(html).toContain('BEV-FW-01');
    expect(html).toContain('shape-rendering="crispEdges"'); // the barcode svg
  });

  it('honors showPrice / showBarcode toggles', () => {
    const noPrice = buildLabelHtml(prod(), settings, { showPrice: false });
    expect(noPrice).not.toContain('label-price');
    const noBarcode = buildLabelHtml(prod(), settings, { showBarcode: false });
    expect(noBarcode).not.toContain('shape-rendering="crispEdges"');
    expect(noBarcode).toContain('BEV-FW-01'); // SKU text still present
  });

  it('escapes hostile product names (stored-XSS defense)', () => {
    const html = buildLabelHtml(prod({ name: '<img src=x onerror=alert(1)>' }), settings);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});

describe('buildLabelSheetHtml', () => {
  it('renders one label per product in a grid with the requested columns', () => {
    const html = buildLabelSheetHtml([prod(), prod({ id: 'p2', name: 'Mocha' })], settings, {
      columns: 4,
    });
    expect(html).toContain('grid-template-columns: repeat(4, 1fr)');
    expect((html.match(/class="label"/g) || []).length).toBe(2);
    expect(html).toContain('Flat White');
    expect(html).toContain('Mocha');
  });

  it('clamps columns to the 1–6 range', () => {
    expect(buildLabelSheetHtml([prod()], settings, { columns: 99 })).toContain('repeat(6, 1fr)');
    expect(buildLabelSheetHtml([prod()], settings, { columns: 0 })).toContain('repeat(1, 1fr)');
  });

  it('auto-triggers print on load', () => {
    expect(buildLabelSheetHtml([prod()], settings)).toContain('window.print()');
  });
});
