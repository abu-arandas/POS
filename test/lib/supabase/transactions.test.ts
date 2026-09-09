import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pushTransactions, pullTransactions } from '../../../src/lib/supabase/transactions';
import type { SaleTransaction } from '../../../src/types';

// The transaction mapper is the only place the camelCase domain object and the
// snake_case table meet, and nothing exercised it. A column that is written but
// never read back — a name typo on one side, a field forgotten on the other —
// fails silently: the push succeeds, the pull returns a row missing that field,
// and the loss only shows up on a receipt months later.
//
// tax_rate is exactly that shape of field, so it is pinned here along with the
// round trip it travels in.

const sale: SaleTransaction = {
  id: 'TX-ROUNDTRIP',
  date: '2026-03-04T20:15:00.000Z',
  items: [{ productId: 'p1', productName: 'Latte', price: 4.5, cost: 1, quantity: 2, total: 9 }],
  subtotal: 9,
  discount: 1,
  discountType: 'fixed',
  discountValue: 1,
  tax: 0.68,
  taxRate: 8.5,
  total: 8.68,
  paymentMethod: 'cash',
  cashPaid: 10,
  cashChange: 1.32,
  customerId: 'c1',
  customerName: 'Grace Hopper',
  operatorId: 'u1',
  operatorName: 'Ada Lovelace',
  pointsEarned: 8,
  status: 'completed',
  shiftId: 'shift-1',
};

/** Captures whatever push hands to `upsert`, without a network. */
function capturingClient() {
  const upserted: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      upsert: (rows: Record<string, unknown>[]) => (upserted.push(...rows), { error: null }),
    }),
  } as unknown as SupabaseClient;
  return { client, upserted };
}

/** Serves `rows` as a single page, then an empty one to end the keyset walk. */
function servingClient(rows: Record<string, unknown>[]) {
  let served = false;
  const page = () => {
    const data = served ? [] : rows;
    served = true;
    return Promise.resolve({ data, error: null });
  };
  const builder: Record<string, unknown> = {};
  builder.order = () => builder;
  builder.limit = () => builder;
  builder.gt = () => builder;
  builder.eq = () => builder;
  builder.then = (resolve: (v: unknown) => unknown) => page().then(resolve);
  return { from: () => ({ select: () => builder }) } as unknown as SupabaseClient;
}

/**
 * Rejects any upsert carrying `column` the way PostgREST does when the table
 * has no such column, and records every attempt.
 */
function schemaBehindClient(column: string, code = 'PGRST204') {
  const attempts: Record<string, unknown>[][] = [];
  const client = {
    from: () => ({
      upsert: (rows: Record<string, unknown>[]) => {
        attempts.push(rows);
        if (rows.some((r) => column in r)) {
          return {
            error: {
              code,
              message: `Could not find the '${column}' column of 'transactions' in the schema cache`,
            },
          };
        }
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, attempts };
}

describe('transaction sync — tax rate', () => {
  it('writes the rate to tax_rate', async () => {
    const { client, upserted } = capturingClient();
    expect(await pushTransactions(client, [sale])).toBe(true);
    expect(upserted[0].tax_rate).toBe(8.5);
  });

  it('writes 0 rather than null for a zero-rated sale', async () => {
    // `?? null` must not swallow a real zero — absent means "not recorded",
    // and a zero-rated sale is recorded.
    const { client, upserted } = capturingClient();
    await pushTransactions(client, [{ ...sale, taxRate: 0 }]);
    expect(upserted[0].tax_rate).toBe(0);
  });

  it('writes null when the sale predates the column', async () => {
    const { client, upserted } = capturingClient();
    const legacy: SaleTransaction = { ...sale };
    delete legacy.taxRate;
    await pushTransactions(client, [legacy]);
    expect(upserted[0].tax_rate).toBeNull();
  });

  it('reads the rate back off the same column', async () => {
    const { client, upserted } = capturingClient();
    await pushTransactions(client, [sale]);

    const pulled = await pullTransactions(servingClient(upserted));
    expect(pulled?.[0].taxRate).toBe(8.5);
    // The rest of the row survives the trip too, so this guards the mapper and
    // not just the one field.
    expect(pulled?.[0]).toMatchObject({
      id: sale.id,
      subtotal: sale.subtotal,
      tax: sale.tax,
      total: sale.total,
      status: sale.status,
    });
  });

  it('leaves a NULL rate absent rather than reading it as 0%', async () => {
    // Number(null) is 0, which would put "TAX (0%)" on every legacy receipt.
    const pulled = await pullTransactions(
      servingClient([{ ...sale, tax_rate: null, items: sale.items }]),
    );
    expect(pulled?.[0].taxRate).toBeUndefined();
  });
});

// The app updates itself; the Supabase schema does not. Between an install
// picking up tax_rate and an operator running the ALTER TABLE, PostgREST
// rejects the entire row over the one column it does not recognise — so every
// sale would stop reaching the cloud, silently, over a field that only labels a
// receipt. This repo has been bitten by silently-dead sync before.
describe('pushing to a database whose migration has not run', () => {
  it('still syncs the sale, without the rate', async () => {
    const { client, attempts } = schemaBehindClient('tax_rate');

    expect(await pushTransactions(client, [sale])).toBe(true);
    expect(attempts).toHaveLength(2);
    expect(attempts[0][0]).toHaveProperty('tax_rate');
    expect(attempts[1][0]).not.toHaveProperty('tax_rate');
    // Everything else still goes, which is the point.
    expect(attempts[1][0]).toMatchObject({ id: sale.id, total: sale.total, tax: sale.tax });
  });

  it('handles the underlying Postgres code too', async () => {
    const { client, attempts } = schemaBehindClient('tax_rate', '42703');
    expect(await pushTransactions(client, [sale])).toBe(true);
    expect(attempts).toHaveLength(2);
  });

  it('does not retry, or swallow, an unrelated failure', async () => {
    // A genuine outage must still surface as a failed push rather than being
    // mistaken for a missing column and quietly "succeeding".
    const attempts: unknown[][] = [];
    const client = {
      from: () => ({
        upsert: (rows: unknown[]) => (
          attempts.push(rows),
          { error: { code: '08006', message: 'connection failure' } }
        ),
      }),
    } as unknown as SupabaseClient;

    expect(await pushTransactions(client, [sale])).toBe(false);
    expect(attempts).toHaveLength(1);
  });

  it('does not treat a missing-column error for another column as this one', async () => {
    const { client, attempts } = schemaBehindClient('shift_id');
    // shift_id is present too, so the first attempt fails and the retry — which
    // only drops tax_rate — fails again. The push reports failure rather than
    // looping or claiming success.
    expect(await pushTransactions(client, [sale])).toBe(false);
    expect(attempts).toHaveLength(1);
  });
});
