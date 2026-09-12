import { describe, it, expect } from 'vitest';
import {
  pullMessages,
  pullFailed,
  type PullResult,
} from '../../src/components/settings/pullOutcome';

// What a pull tells the operator. Two facts that can both be true at once —
// tables that failed to load, and staff accounts the cloud refused to release —
// and they used to be reported by a single if/else chain, so the first one
// silently hid the second.

const ok = (): PullResult => ({
  products: [],
  categories: [],
  customers: [],
  users: [],
  transactions: [],
});

const keys = (data: PullResult) => pullMessages(data).map((m) => m.key);

describe('what a pull reports', () => {
  it('says it succeeded when everything loaded', () => {
    expect(keys(ok())).toEqual(['settings.pullSuccess']);
    expect(pullFailed(ok())).toBe(false);
  });

  it('names the tables that failed', () => {
    const data = { ...ok(), products: null, transactions: null };
    expect(pullMessages(data)).toEqual([
      { key: 'settings.pullPartial', params: { tables: 'products, transactions' } },
    ]);
    expect(pullFailed(data)).toBe(true);
  });

  it('reports a refused staff read on its own terms, not as a failure', () => {
    const data = { ...ok(), users: 'denied' as const };
    expect(keys(data)).toEqual(['settings.pullUsersDenied']);
    // The connection is healthy and the database is behaving as configured, so
    // this must not be saved as an error state.
    expect(pullFailed(data)).toBe(false);
  });

  it('reports BOTH when a table failed and staff were refused', () => {
    // The regression. With an if/else chain the operator saw only
    // "transactions failed" and never learned why staff were missing or that a
    // device account is the remedy — the whole point of the new message.
    const data = { ...ok(), transactions: null, users: 'denied' as const };
    expect(keys(data)).toEqual(['settings.pullPartial', 'settings.pullUsersDenied']);
    expect(pullFailed(data)).toBe(true);
  });

  it('does not count a refused staff read among the failed tables', () => {
    const data = { ...ok(), users: 'denied' as const, products: null };
    const partial = pullMessages(data).find((m) => m.key === 'settings.pullPartial');
    expect(partial?.params?.tables).toBe('products');
  });

  it('still counts a genuinely failed staff read among them', () => {
    // null is not 'denied'. A real outage on user_accounts must keep reading as
    // a failure, or a broken database looks like "just set a device account".
    const data = { ...ok(), users: null };
    expect(pullMessages(data)).toEqual([
      { key: 'settings.pullPartial', params: { tables: 'users' } },
    ]);
    expect(pullFailed(data)).toBe(true);
  });
});
