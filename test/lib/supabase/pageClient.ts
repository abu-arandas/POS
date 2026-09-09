import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// A pull walks the table by primary key, not by offset, and the PostgREST
// builder is both chainable and thenable:
//   .select().order().limit()[.gt()][.eq()], with the terminal object awaited.
//
// A fake that ignores those calls and hands back one fixed page is worse than
// no test: it passes whether or not the code under test orders by id, carries
// the cursor forward, or applies the store filter. So this one RECORDS every
// call and serves a scripted sequence of pages, letting a test assert on how
// the pull was performed rather than only on what came back.
//
// `test/lib/supabase.test.ts` grew its own copy of this for pullProducts; this
// is the same shape, shared by the mappers that came later.
export function makePagedClient(pages: Array<{ data: unknown[] | null; error?: unknown }>) {
  const cursors: Array<string | null> = [];
  const limits: number[] = [];
  const orders: unknown[][] = [];
  const eq = vi.fn();
  let call = 0;

  const builder: Record<string, unknown> = {
    order: vi.fn((...args: unknown[]) => {
      orders.push(args);
      return builder;
    }),
    limit: vi.fn((n: number) => {
      limits.push(n);
      const index = cursors.push(null) - 1; // null until .gt() says otherwise
      const { data, error } = pages[call++] ?? { data: [] };
      const settled = Promise.resolve({ data, error: error ?? null });

      const terminal: Record<string, unknown> = {
        gt: vi.fn((_column: string, value: string) => {
          cursors[index] = value;
          return terminal;
        }),
        eq: vi.fn((...args: unknown[]) => {
          eq(...args);
          return terminal;
        }),
        then: settled.then.bind(settled),
      };
      return terminal;
    }),
  };

  const select = vi.fn(() => builder);
  const from = vi.fn(() => ({ select }));
  const client = { from } as unknown as SupabaseClient;
  return { client, from, select, eq, cursors, limits, orders };
}

/** The common case: one page of rows, then the empty page that ends the walk. */
export function servingOnePage(rows: unknown[]) {
  return makePagedClient([{ data: rows }, { data: [] }]);
}
