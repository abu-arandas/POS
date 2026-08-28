import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import i18n from '../../src/lib/i18n';

// A key referenced in code but absent from the catalogue does not fail loudly —
// i18next renders the key itself, so the UI silently shows "lockscreen.selectUser"
// where a sentence belongs. That is exactly how three raw keys ended up on the
// lockscreen, the first screen an operator ever sees.
//
// Three rules are enforced here:
//   1. every t('a.b') in src/ resolves in English,
//   2. every English key has an Arabic counterpart, and
//   3. every English key is reachable from src/ at all,
// so neither a missing string nor an untranslated one can reach a till unnoticed,
// and a key the app stopped asking for does not sit in the catalogue forever
// waiting to be translated again.

type Tree = { [k: string]: string | Tree };

const flatten = (o: Tree, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null ? flatten(v as Tree, path) : [path];
  });

const resources = (
  i18n as unknown as { options: { resources: Record<string, { translation: Tree }> } }
).options.resources;

const en = new Set(flatten(resources.en.translation));
const ar = new Set(flatten(resources.ar.translation));

// i18next appends _one/_other to plural keys; either form counts as declared.
const declared = (set: Set<string>, key: string) =>
  set.has(key) || set.has(`${key}_one`) || set.has(`${key}_other`);

// Anchored to this file rather than to process.cwd(), so the check reads the
// same tree whichever directory the runner was started from.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(REPO_ROOT, file), 'utf8');

/**
 * Application source, minus the catalogue itself.
 *
 * Listed with a plain `git ls-files src` and filtered here rather than with a
 * `src/**\/*.tsx` pathspec: that glob requires at least one directory, so it
 * silently skipped the four files sitting directly in src/ — App.tsx among
 * them, which is where a good share of the app's t() calls live. A checker
 * blind to the root component is exactly the gap this file exists to close.
 */
function sourceFiles(): string[] {
  return execSync('git ls-files src', { cwd: REPO_ROOT })
    .toString()
    .trim()
    .split(/\r?\n/)
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('src/lib/i18n.ts'));
}

/** Every t('a.b') / t('a.b', 'default') referenced in application source. */
function referencedKeys(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const file of sourceFiles()) {
    const source = read(file);
    for (const m of source.matchAll(/\bt\(\s*(['"])([a-zA-Z0-9_.]+)\1/g)) {
      if (!out.has(m[2])) out.set(m[2], new Set());
      out.get(m[2])!.add(file);
    }
  }
  return out;
}

/**
 * Every quoted string in application source. Plenty of keys never appear inside
 * a `t(…)` call at all — the sidebar and the fleet tabs keep theirs in config
 * objects (`{ id: 'live', labelKey: 'fleet.tab_live' }`) and hand them to `t`
 * one indirection later. Matching whole quoted strings finds those without
 * finding `customers.points` inside `customers.pointsShort`, which a plain
 * substring search would.
 */
function quotedStrings(): Set<string> {
  const out = new Set<string>();
  for (const file of sourceFiles()) {
    for (const m of read(file).matchAll(/(['"`])([a-zA-Z0-9_.]+)\1/g)) out.add(m[2]);
  }
  return out;
}

/**
 * Prefixes of keys the app builds at run time, e.g. t(`storeAdmin.role_${r}`).
 * Their full paths are never written down, so a reachability check that only
 * looked for complete strings would call every one of them dead.
 */
function dynamicPrefixes(): string[] {
  const out = new Set<string>();
  for (const file of sourceFiles()) {
    for (const m of read(file).matchAll(/\bt\(\s*`([^`$]*)\$\{/g)) {
      if (m[1]) out.add(m[1]);
    }
  }
  return [...out];
}

describe('i18n catalogue', () => {
  it('declares every key the app asks for', () => {
    const used = referencedKeys();
    const missing = [...used.keys()]
      .filter((k) => !declared(en, k))
      .map((k) => `${k}  (used in ${[...used.get(k)!].join(', ')})`);
    expect(missing).toEqual([]);
  });

  it('has no key the app can no longer reach', () => {
    // Dead entries are not harmless: every one of them is a string a translator
    // is still asked to keep in sync, and they hide which copy is actually live.
    const written = quotedStrings();
    const prefixes = dynamicPrefixes();
    const unreachable = [...en].filter((key) => {
      if (written.has(key)) return false;
      if (prefixes.some((p) => key.startsWith(p))) return false;
      // A plural form is reached through its base key, never by its own name.
      const base = key.replace(/_(zero|one|two|few|many|other)$/, '');
      return !written.has(base);
    });
    expect(unreachable).toEqual([]);
  });

  it('translates every English key into Arabic', () => {
    const missing = [...en].filter(
      (k) => !k.endsWith('_one') && !k.endsWith('_other') && !declared(ar, k),
    );
    expect(missing).toEqual([]);
  });

  it('has a non-empty string for every key in both locales', () => {
    const blank: string[] = [];
    for (const [lang, tree] of [
      ['en', resources.en.translation],
      ['ar', resources.ar.translation],
    ] as const) {
      const walk = (o: Tree, prefix = '') => {
        for (const [k, v] of Object.entries(o)) {
          const path = prefix ? `${prefix}.${k}` : k;
          if (typeof v === 'object' && v !== null) walk(v as Tree, path);
          else if (!String(v).trim()) blank.push(`${lang}:${path}`);
        }
      };
      walk(tree);
    }
    expect(blank).toEqual([]);
  });
});
