import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { ar } from './ar';

/**
 * Guards the two ways a translation silently breaks.
 *
 * A missing key does not throw: i18next renders the key itself, so the till
 * shows `settings.storeName` where a label should be, and only someone reading
 * that screen in that language ever finds out. Both failures are invisible in
 * review and invisible in the build, which is exactly the kind of thing a test
 * is for.
 */

const LOCALES_DIR = path.resolve(__dirname);
const SRC_DIR = path.resolve(__dirname, '..');

/** Every leaf path in a nested catalogue: `settings.storeName`, … */
function flatten(value: unknown, prefix = '', out: Set<string> = new Set()): Set<string> {
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out.add(prefix);
  }
  return out;
}

/**
 * i18next resolves `history.deleteBody` through `deleteBody_one` /
 * `deleteBody_other`, and Arabic legitimately carries `_zero`, `_two`, `_few`
 * and `_many` that English does not. Comparing suffixed keys directly would
 * report every plural as a mismatch, so both sides are compared on the stem.
 */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const stem = (key: string) => key.replace(PLURAL_SUFFIX, '');
const stemsOf = (keys: Set<string>) => new Set([...keys].map(stem));

const EN_KEYS = flatten((en as { translation: unknown }).translation);
const AR_KEYS = flatten((ar as { translation: unknown }).translation);

/** Every .ts/.tsx file under src/, so the sweep cannot miss a new screen. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      sourceFiles(full, found);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      found.push(full);
    }
  }
  return found;
}

describe('locale catalogues', () => {
  it('ships a non-trivial English catalogue', () => {
    // A guard on the guard: if flatten ever stopped walking the tree, every
    // assertion below would pass vacuously.
    expect(EN_KEYS.size).toBeGreaterThan(500);
  });

  it('translates every English key into Arabic', () => {
    const arStems = stemsOf(AR_KEYS);
    const missing = [...stemsOf(EN_KEYS)].filter((key) => !arStems.has(key)).sort();
    expect(missing).toEqual([]);
  });

  it('has no Arabic key without an English counterpart', () => {
    // An orphan is usually a rename that only landed on one side, which leaves
    // the English screen rendering a raw key.
    const enStems = stemsOf(EN_KEYS);
    const orphans = [...stemsOf(AR_KEYS)].filter((key) => !enStems.has(key)).sort();
    expect(orphans).toEqual([]);
  });

  it('defines the same namespaces in both languages', () => {
    const namespaces = (keys: Set<string>) =>
      [...new Set([...keys].map((k) => k.split('.')[0]))].sort();
    expect(namespaces(AR_KEYS)).toEqual(namespaces(EN_KEYS));
  });

  it('keeps one file per namespace in both locale directories', () => {
    const names = (locale: string) =>
      readdirSync(path.join(LOCALES_DIR, locale))
        .filter((f) => f.endsWith('.ts'))
        .sort();
    expect(names('ar')).toEqual(names('en'));
  });
});

describe('translation keys used in code', () => {
  // Only the static form. A template-literal key — t(`receiptCfg.tg_${key}`) —
  // cannot be resolved without evaluating it, and the codebase uses several;
  // those are covered by the tests of the screens that build them.
  const STATIC_KEY = /\bt\(\s*'([a-zA-Z0-9_.]+)'/g;

  const used = new Map<string, string>();
  for (const file of sourceFiles(SRC_DIR)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(STATIC_KEY)) {
      if (!used.has(match[1])) used.set(match[1], path.relative(SRC_DIR, file));
    }
  }

  it('finds the call sites at all', () => {
    expect(used.size).toBeGreaterThan(500);
  });

  it('resolves every key against the English catalogue', () => {
    const stems = stemsOf(EN_KEYS);
    const missing = [...used.entries()]
      .filter(([key]) => !EN_KEYS.has(key) && !stems.has(key))
      .map(([key, file]) => `${key} (${file})`)
      .sort();
    expect(missing).toEqual([]);
  });
});
