import type { Category, Customer, Product, SaleTransaction, UserAccount } from '../../types';

/** What `pullAllFromCloud` hands back, as far as reporting is concerned. */
export interface PullResult {
  products: Product[] | null;
  categories: Category[] | null;
  customers: Customer[] | null;
  users: UserAccount[] | 'denied' | null;
  transactions: SaleTransaction[] | null;
}

/** One line to show the operator: an i18n key and its interpolation. */
export interface PullMessage {
  key: string;
  params?: Record<string, string>;
}

/**
 * What a pull should tell the operator.
 *
 * Two facts, and they are independent: some tables may have failed to load, AND
 * the cloud may have refused to release staff accounts. Reporting them with a
 * single if/else chain let the first one hide the second — a terminal that hit
 * a network blip on transactions while also running anonymously was told only
 * about transactions, and never learned why its staff list stayed empty or what
 * to do about it. So this returns every line that applies, not the first.
 *
 * `null` for a table means it failed. `'denied'` for users is not a failure: it
 * is the database answering that this client may not read them, which has its
 * own cause and its own remedy.
 */
export function pullMessages(data: PullResult): PullMessage[] {
  const failed = (
    [
      ['categories', data.categories],
      ['products', data.products],
      ['customers', data.customers],
      // A refusal is an answer, so it must not be counted among the failures.
      ['users', data.users === 'denied' ? [] : data.users],
      ['transactions', data.transactions],
    ] as const
  )
    .filter(([, rows]) => rows === null)
    .map(([name]) => name);

  const messages: PullMessage[] = [];
  if (failed.length > 0) {
    messages.push({ key: 'settings.pullPartial', params: { tables: failed.join(', ') } });
  }
  if (data.users === 'denied') messages.push({ key: 'settings.pullUsersDenied' });
  if (messages.length === 0) messages.push({ key: 'settings.pullSuccess' });
  return messages;
}

/**
 * Whether anything actually went wrong, which is what the saved connection
 * status records. A refused staff read is deliberately NOT an error: the
 * connection is healthy and the database is behaving as configured.
 */
export function pullFailed(data: PullResult): boolean {
  return pullMessages(data).some((m) => m.key === 'settings.pullPartial');
}
