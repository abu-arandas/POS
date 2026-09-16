import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

// Every persisted store has to go through idbStorage, and Zustand will not say
// so if one does not: omit `storage` and persist() silently falls back to
// localStorage. That is not a slower IndexedDB — it is a different, 5 MB,
// origin-shared quota, which is the exact reason this project moved off it (a
// terminal's catalogue and history outgrow it). idbStorage.ts says as much.
//
// kdsStore and tableStore shipped that way: default localStorage, and keys
// spelled pos_kds_store / pos_tables_store instead of the pos-*-storage the
// other nine use. Nothing failed — the stores worked, until a busy terminal
// filled the quota.
//
// The key matters too. Two stores sharing one persist name would read and
// write each other's blob, and the symptom would be data appearing in the
// wrong screen rather than an error.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STORES_DIR = join(REPO_ROOT, 'src', 'stores');

/** Store modules that actually persist. A store with no persist() is exempt. */
function persistedStores(): Array<{ file: string; source: string }> {
  return readdirSync(STORES_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((file) => ({ file, source: readFileSync(join(STORES_DIR, file), 'utf8') }))
    .filter(({ source }) => /\bpersist\(/.test(source));
}

/** The `name:` given to persist(), which is the IndexedDB key. */
function persistName(source: string): string | null {
  // Anchored on the pos- prefix so it cannot match a `name:` field on a
  // fixture object elsewhere in the file (DEFAULT_TABLES has one).
  return source.match(/name:\s*'(pos-[\w-]+)'/)?.[1] ?? null;
}

describe('persisted stores', () => {
  const stores = persistedStores();

  it('finds the stores at all', () => {
    // Guards the test itself: a rename of src/stores would otherwise make
    // every assertion below vacuously true.
    expect(stores.length).toBeGreaterThanOrEqual(9);
  });

  it('routes every one through idbStorage', () => {
    const onLocalStorage = stores
      .filter(({ source }) => !source.includes('createJSONStorage(() => idbStorage)'))
      .map(({ file }) => file);
    expect(onLocalStorage).toEqual([]);
  });

  it('names every one pos-<thing>-storage', () => {
    const offenders = stores
      .filter(({ source }) => persistName(source) === null)
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('gives no two stores the same key', () => {
    const names = stores.map(({ source }) => persistName(source));
    expect(names.length).toBe(new Set(names).size);
  });
});
