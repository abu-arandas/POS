/**
 * The merge a terminal performs the first time it is linked to a cloud.
 *
 * The property every test here is really about is that nothing local is lost:
 * the upload happens first and the adoption only follows a successful one, so
 * the copy that replaces the local database already contains it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./sync', () => ({
  pushAllToCloud: vi.fn(),
  pullAllFromCloud: vi.fn(),
  retryPendingCloudWrites: vi.fn(),
}));

import { pushAllToCloud, pullAllFromCloud, retryPendingCloudWrites } from './sync';
import { adoptCloudDatabase, resetCloudAdoption } from './cloudAdoption';
import { useSettingsStore } from '../stores/settingsStore';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useAuthStore } from '../stores/authStore';
import type { Category, Customer, Product, SaleTransaction, UserAccount } from '../types';

const push = vi.mocked(pushAllToCloud);
const pull = vi.mocked(pullAllFromCloud);
const drain = vi.mocked(retryPendingCloudWrites);

const PROJECT = 'https://one.supabase.co';

const product = (id: string): Product =>
  ({ id, name: id, price: 1, cost: 0, category: '', sku: id, stock: 1, minStock: 0 }) as Product;
const category = (id: string): Category => ({ id, name: id }) as Category;
const customer = (id: string): Customer => ({ id, name: id, points: 0 }) as Customer;
// Fully formed rather than cast, matching outbox.test.ts: a transaction is the
// one fixture here with enough required fields for a partial to hide a real
// type error behind the cast.
const sale = (id: string): SaleTransaction => ({
  id,
  date: '2026-01-01T12:00:00.000Z',
  items: [],
  subtotal: 0,
  discount: 0,
  discountType: 'none',
  discountValue: 0,
  tax: 0,
  total: 0,
  paymentMethod: 'cash',
  customerId: null,
  status: 'completed',
});
const user = (id: string): UserAccount => ({ id, name: id, role: 'cashier' }) as UserAccount;

/** A complete cloud snapshot: what a healthy pull answers. */
const cloudSnapshot = () => ({
  products: [product('local-1'), product('cloud-1')],
  categories: [category('cloud-cat')],
  customers: [customer('cloud-cust')],
  users: [user('cloud-user')],
  transactions: [sale('cloud-sale')],
});

const link = (url = PROJECT) => {
  useSettingsStore.setState({
    supabaseConfig: { url, anonKey: 'anon', enabled: true, status: 'connected' },
    cloudAdoptedFor: '',
  });
};

beforeEach(() => {
  resetCloudAdoption();
  link();
  useProductStore.setState({ products: [product('local-1')], categories: [category('local-cat')] });
  useCustomerStore.setState({ customers: [customer('local-cust')] });
  useTransactionStore.setState({ transactions: [sale('local-sale')] });
  useAuthStore.setState({ users: [user('local-user')] });

  drain.mockResolvedValue(undefined);
  push.mockResolvedValue(true);
  pull.mockResolvedValue(cloudSnapshot());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('linking to a cloud for the first time', () => {
  it('uploads the local database before adopting the cloud copy', async () => {
    const order: string[] = [];
    drain.mockImplementation(async () => void order.push('drain'));
    push.mockImplementation(async () => {
      order.push('push');
      return true;
    });
    pull.mockImplementation(async () => {
      order.push('pull');
      return cloudSnapshot();
    });

    await adoptCloudDatabase();

    // The whole safety argument in one assertion: what the terminal adopts is
    // read back only after what it held has been sent.
    expect(order).toEqual(['drain', 'push', 'pull']);
  });

  it('sends every local table, not just what the outbox happened to hold', async () => {
    await adoptCloudDatabase();

    expect(push).toHaveBeenCalledWith(PROJECT, 'anon', {
      products: [product('local-1')],
      categories: [category('local-cat')],
      customers: [customer('local-cust')],
      users: [user('local-user')],
      transactions: [sale('local-sale')],
    });
  });

  it('leaves the terminal holding the cloud copy and nothing beside it', async () => {
    const result = await adoptCloudDatabase();

    expect(result.outcome).toBe('adopted');
    expect(useProductStore.getState().products.map((p) => p.id)).toEqual(['local-1', 'cloud-1']);
    expect(useProductStore.getState().categories.map((c) => c.id)).toEqual(['cloud-cat']);
    expect(useCustomerStore.getState().customers.map((c) => c.id)).toEqual(['cloud-cust']);
    expect(useTransactionStore.getState().transactions.map((t) => t.id)).toEqual(['cloud-sale']);
    expect(useAuthStore.getState().users.map((u) => u.id)).toEqual(['cloud-user']);
  });

  it('adopts an empty cloud, because an empty table is an answer', async () => {
    pull.mockResolvedValue({
      products: [],
      categories: [],
      customers: [],
      users: [user('cloud-user')],
      transactions: [],
    });

    await adoptCloudDatabase();

    // Safe precisely because the push above already sent these rows up: the
    // cloud being empty afterwards would mean the push did not happen, and a
    // failed push never reaches here.
    expect(useProductStore.getState().products).toEqual([]);
    expect(useTransactionStore.getState().transactions).toEqual([]);
  });
});

describe('running again', () => {
  it('does nothing the second time, and does not re-upload', async () => {
    await adoptCloudDatabase();
    push.mockClear();
    pull.mockClear();

    const again = await adoptCloudDatabase();

    expect(again.outcome).toBe('already');
    expect(push).not.toHaveBeenCalled();
    expect(pull).not.toHaveBeenCalled();
  });

  it('merges afresh when the terminal is pointed at a different project', async () => {
    await adoptCloudDatabase();
    link('https://two.supabase.co');

    const result = await adoptCloudDatabase();

    expect(result.outcome).toBe('adopted');
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('does not re-merge when only the Store ID changes', async () => {
    await adoptCloudDatabase();
    // A different store inside the SAME project. Re-uploading here would stamp
    // this store's catalogue with the other store's id.
    useSettingsStore.setState({ storeId: 'store-b' });

    expect((await adoptCloudDatabase()).outcome).toBe('already');
  });

  it('shares one run between concurrent callers', async () => {
    const [a, b] = await Promise.all([adoptCloudDatabase(), adoptCloudDatabase()]);

    expect(push).toHaveBeenCalledTimes(1);
    expect(a.outcome).toBe('adopted');
    expect(b.outcome).toBe('adopted');
  });
});

describe('when it cannot finish', () => {
  it('touches nothing local if the upload is refused', async () => {
    push.mockResolvedValue(false);

    const result = await adoptCloudDatabase();

    expect(result.outcome).toBe('push-failed');
    expect(pull).not.toHaveBeenCalled();
    // The cloud does not hold this terminal's rows, so adopting its copy now
    // is exactly the data loss the order of operations exists to prevent.
    expect(useProductStore.getState().products.map((p) => p.id)).toEqual(['local-1']);
    expect(useTransactionStore.getState().transactions.map((t) => t.id)).toEqual(['local-sale']);
  });

  it('touches nothing local if the merged copy cannot be read back', async () => {
    pull.mockResolvedValue(null);

    const result = await adoptCloudDatabase();

    expect(result.outcome).toBe('pull-failed');
    expect(useProductStore.getState().products.map((p) => p.id)).toEqual(['local-1']);
  });

  it('retries on the next link rather than marking a partial merge done', async () => {
    pull.mockResolvedValue({ ...cloudSnapshot(), transactions: null });

    const first = await adoptCloudDatabase();
    expect(first.outcome).toBe('pull-incomplete');
    // The table that failed keeps its local rows; the ones that answered do not.
    expect(useTransactionStore.getState().transactions.map((t) => t.id)).toEqual(['local-sale']);
    expect(useProductStore.getState().products.map((p) => p.id)).toEqual(['local-1', 'cloud-1']);

    pull.mockResolvedValue(cloudSnapshot());
    expect((await adoptCloudDatabase()).outcome).toBe('adopted');
  });

  it('keeps the local logins when the cloud refuses to release staff', async () => {
    pull.mockResolvedValue({ ...cloudSnapshot(), users: 'denied' });

    const result = await adoptCloudDatabase();

    // A refusal is an answer, not a gap — so the merge is done. Writing it
    // through would have left this terminal with no way past the lock screen.
    expect(result.outcome).toBe('adopted');
    expect(useAuthStore.getState().users.map((u) => u.id)).toEqual(['local-user']);
  });

  it('keeps the local logins when the cloud has no staff at all', async () => {
    pull.mockResolvedValue({ ...cloudSnapshot(), users: [] });

    await adoptCloudDatabase();

    expect(useAuthStore.getState().users.map((u) => u.id)).toEqual(['local-user']);
  });
});

describe('when there is no cloud', () => {
  it('does nothing while sync is switched off', async () => {
    useSettingsStore.setState({
      supabaseConfig: { url: PROJECT, anonKey: 'anon', enabled: false, status: 'connected' },
    });

    expect((await adoptCloudDatabase()).outcome).toBe('not-linked');
    expect(push).not.toHaveBeenCalled();
  });

  it('does nothing without credentials', async () => {
    useSettingsStore.setState({
      supabaseConfig: { url: '', anonKey: '', enabled: true, status: 'connected' },
    });

    expect((await adoptCloudDatabase()).outcome).toBe('not-linked');
    expect(push).not.toHaveBeenCalled();
  });
});
