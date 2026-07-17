import { describe, it, expect } from 'vitest';
import { toCsv, transactionsToCsvRows } from './csv';
import { SaleTransaction } from '../types';

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
