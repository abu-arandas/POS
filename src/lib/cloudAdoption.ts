import { useSettingsStore } from '../stores/settingsStore';
import { useProductStore } from '../stores/productStore';
import { useCustomerStore } from '../stores/customerStore';
import { useTransactionStore } from '../stores/transactionStore';
import { useAuthStore } from '../stores/authStore';
import { pullAllFromCloud, pushAllToCloud, retryPendingCloudWrites } from './sync';

/** What `pullAllFromCloud` hands back, so nothing here has to restate it. */
type Pulled = NonNullable<Awaited<ReturnType<typeof pullAllFromCloud>>>;

export type AdoptionOutcome =
  /** Merged both ways; this terminal now holds the cloud's copy. */
  | 'adopted'
  /** This cloud was adopted before. Nothing to do. */
  | 'already'
  /** Sync is off or unconfigured, so there is nothing to be linked to. */
  | 'not-linked'
  /** The upload was refused. Local data is untouched — see below. */
  | 'push-failed'
  /** Uploaded, but the merged copy could not be read back at all. */
  | 'pull-failed'
  /** Uploaded and partly read back; the tables that failed were left alone. */
  | 'pull-incomplete';

export interface AdoptionResult {
  outcome: AdoptionOutcome;
  /** The pull, when one was made, so the caller can report per-table detail. */
  pulled?: Pulled;
}

/**
 * Identity of the cloud this terminal has merged itself into: the project URL.
 *
 * Deliberately not the Store ID as well. Changing the Store ID points this
 * terminal at a different store's rows inside the SAME project, and re-running
 * the merge there would upload this store's catalogue stamped with the other
 * store's id — precisely the cross-store contamination `storeScope` exists to
 * prevent. A different project is a different database and a genuine re-link; a
 * different store within one is not.
 */
const cloudIdentity = (url: string): string => url.trim();

/**
 * Writes a pulled snapshot into the local stores.
 *
 * `null` for a table means it failed to load, and an empty array means it
 * loaded and the cloud genuinely has no rows — so only the second may be
 * applied. In one synchronous span, so nothing renders a half-adopted terminal.
 */
function applyPulled(data: Pulled): void {
  const catalogue = useProductStore.getState();
  if (data.categories) catalogue.setCategories(data.categories);
  if (data.products) catalogue.setProducts(data.products);
  if (data.customers) useCustomerStore.getState().setCustomers(data.customers);
  // Never let this leave the terminal with no way back in. A refused read
  // ('denied') and an empty staff table both mean "no accounts to write", and
  // writing either would take the lock screen's logins with it.
  if (data.users !== 'denied' && data.users?.length) useAuthStore.getState().setUsers(data.users);
  if (data.transactions) useTransactionStore.getState().setTransactions(data.transactions);
}

/** Whether every table came back. A refused staff read is an answer, not a gap. */
function pullComplete(data: Pulled): boolean {
  return (
    data.categories !== null &&
    data.products !== null &&
    data.customers !== null &&
    data.transactions !== null &&
    data.users !== null
  );
}

async function runAdoption(): Promise<AdoptionResult> {
  const { supabaseConfig, cloudAdoptedFor, setCloudAdoptedFor } = useSettingsStore.getState();
  if (!supabaseConfig.enabled || !supabaseConfig.url || !supabaseConfig.anonKey) {
    return { outcome: 'not-linked' };
  }

  const url = supabaseConfig.url.trim();
  const anonKey = supabaseConfig.anonKey.trim();
  const identity = cloudIdentity(url);
  if (cloudAdoptedFor === identity) return { outcome: 'already' };

  // Whatever this terminal already owed the cloud goes first. The queue can
  // hold a newer copy of a row than the store does — a delete, most of all —
  // and draining it afterwards would replay it over the snapshot just adopted.
  await retryPendingCloudWrites({ url, anonKey });

  // Up before down, and that order is the whole safety argument. The local
  // database is merged INTO the cloud first, so the copy this terminal then
  // adopts already contains every local row — which is what makes replacing
  // local data with it a merge rather than a deletion. Reversing these two
  // would throw away everything the cloud had never been told about: an
  // offline sale, a product priced this morning, a customer signed up at the
  // counter.
  const { products, categories } = useProductStore.getState();
  const { customers } = useCustomerStore.getState();
  const { users } = useAuthStore.getState();
  const { transactions } = useTransactionStore.getState();

  const pushed = await pushAllToCloud(url, anonKey, {
    products,
    categories,
    customers,
    users,
    transactions,
  });
  // Nothing local is touched on a refused upload. The cloud does not hold this
  // terminal's rows yet, so adopting its copy now would be the data loss this
  // function is arranged to avoid.
  if (!pushed) return { outcome: 'push-failed' };

  const pulled = await pullAllFromCloud(url, anonKey);
  if (!pulled) return { outcome: 'pull-failed' };

  applyPulled(pulled);

  // Marked only once the whole merged copy actually arrived. A table that
  // failed is still carrying its pre-merge local rows, so leaving the marker
  // unset is what brings this terminal back for another attempt — and every
  // step above is an idempotent upsert, so a second attempt costs only time.
  if (!pullComplete(pulled)) return { outcome: 'pull-incomplete', pulled };

  setCloudAdoptedFor(identity);
  return { outcome: 'adopted', pulled };
}

let inFlight: Promise<AdoptionResult> | null = null;

/**
 * Merges this terminal's local database into the cloud it has just been linked
 * to, then adopts the merged result as its own — so a linked terminal holds
 * what the cloud holds, and stops carrying a separate local copy beside it.
 *
 * Runs once per cloud project, recorded in `cloudAdoptedFor`. It is not a
 * periodic reconciliation and must not become one: re-uploading the whole local
 * catalogue on every boot would push this terminal's copy of a row straight
 * back over a deletion another terminal made, and undo it. Ongoing convergence
 * is realtimeSync's job, and the outbox's.
 *
 * Safe to call whenever a link might have been made. A second call while one is
 * running joins it rather than starting another, and a call after the cloud has
 * been adopted is a store read and a string compare.
 */
export function adoptCloudDatabase(): Promise<AdoptionResult> {
  if (!inFlight) {
    inFlight = runAdoption().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Forgets that any cloud was adopted, so the next link merges afresh. */
export function resetCloudAdoption(): void {
  useSettingsStore.getState().setCloudAdoptedFor('');
}
