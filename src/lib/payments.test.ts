import { describe, it, expect } from 'vitest';
import { summarizeTenders } from './payments';
import { Payment } from '../types';

const P = (method: Payment['method'], amount: number): Payment => ({ method, amount });

describe('summarizeTenders', () => {
  it('splits card + exact cash with no change', () => {
    const s = summarizeTenders([P('card', 3.8), P('cash', 5)], 8.8);
    expect(s.paidTotal).toBe(8.8);
    expect(s.cashTendered).toBe(5);
    expect(s.cashChange).toBe(0);
    expect(s.coversTotal).toBe(true);
    expect(s.dominantMethod).toBe('cash');
  });

  it('attributes overpayment change to cash and excludes card from cashTendered', () => {
    // card 3.80 + cash 10 for an 8.80 total → $5 change, cash tendered is 10.
    const s = summarizeTenders([P('card', 3.8), P('cash', 10)], 8.8);
    expect(s.paidTotal).toBe(13.8);
    expect(s.cashTendered).toBe(10);
    expect(s.cashChange).toBe(5);
  });

  it('reports no change when there is no cash line', () => {
    const s = summarizeTenders([P('card', 5), P('mobile', 5)], 10);
    expect(s.cashTendered).toBe(0);
    expect(s.cashChange).toBe(0);
    expect(s.dominantMethod).toBe('card'); // tie → first after stable-ish sort
  });

  it('flags an undercovered total', () => {
    expect(summarizeTenders([P('card', 5)], 10).coversTotal).toBe(false);
    expect(summarizeTenders([P('card', 10)], 10).coversTotal).toBe(true);
  });

  it('ignores zero/blank lines', () => {
    const s = summarizeTenders([P('cash', 0), P('card', 10)], 10);
    expect(s.paidTotal).toBe(10);
    expect(s.dominantMethod).toBe('card');
  });

  it('never reports more change than the cash actually tendered', () => {
    // card 12 + cash 5 on a 10 total: overpayment is 7 but only 5 was cash.
    const s = summarizeTenders([P('card', 12), P('cash', 5)], 10);
    expect(s.cashTendered).toBe(5);
    expect(s.cashChange).toBe(5);
  });
});
