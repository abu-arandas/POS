import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { SCREEN_ROLES, type ScreenId } from '../../src/lib/access';

// Adding a screen means touching four files, and docs/PROJECT.md §21 says so:
// access.ts (the id and its roles), App.tsx (the lazy import and the switch
// case), Sidebar.tsx (NAV_ITEMS), and both locale sidebar catalogues. Nothing
// enforced it, and the type system cannot: SCREEN_ROLES is keyed by ScreenId so
// TypeScript catches a missing role list, but a screen absent from NAV_ITEMS is
// simply a screen with no way to reach it on desktop, and a switch with no case
// for it falls through to "VIEW ROUTING ERROR" — both perfectly well-typed.
//
// That is not hypothetical here. `tables` and `kitchen` arrived with their
// SCREEN_ROLES entries and their switch cases, and with their sidebar labels
// missing from both catalogues; the call sites papered over it with
// `defaultValue`, so the English UI looked finished while Arabic silently
// rendered English.
//
// Read from source rather than imported, because NAV_ITEMS is module-private in
// Sidebar.tsx and exporting it only so a test can see it would be the test
// changing the shape of the code it checks. keyCoverage.test.ts and
// deadClasses.test.ts read source for the same reason.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(REPO_ROOT, file), 'utf8');

const SCREENS = Object.keys(SCREEN_ROLES) as ScreenId[];

/** The `id: 'x'` entries of Sidebar's NAV_ITEMS, with the label key each names. */
function navItems(): Map<string, string> {
  const sidebar = read('src/components/Sidebar.tsx');
  const block = sidebar.slice(sidebar.indexOf('const NAV_ITEMS'));
  const out = new Map<string, string>();
  for (const m of block.matchAll(/\{\s*id:\s*'([\w-]+)'\s*,\s*labelKey:\s*'([\w.]+)'/g)) {
    out.set(m[1], m[2]);
  }
  return out;
}

describe('screen wiring', () => {
  it('finds every screen in the sidebar', () => {
    const items = navItems();
    expect(items.size).toBeGreaterThan(0); // the parser still matches the file
    expect(SCREENS.filter((screen) => !items.has(screen))).toEqual([]);
  });

  it('lists no sidebar entry that is not a screen', () => {
    // The other direction: a nav item whose id was renamed in access.ts is a
    // button that routes to the switch's default case.
    const unknown = [...navItems().keys()].filter((id) => !SCREENS.includes(id as ScreenId));
    expect(unknown).toEqual([]);
  });

  it('gives every screen a case in the App router', () => {
    const app = read('src/App.tsx');
    const cases = new Set([...app.matchAll(/case\s+'([\w-]+)'\s*:/g)].map((m) => m[1]));
    expect(SCREENS.filter((screen) => !cases.has(screen))).toEqual([]);
  });

  it('translates every sidebar label in both locales', () => {
    const labelKeys = [...navItems().values()];
    expect(labelKeys.length).toBe(SCREENS.length);
    for (const locale of ['en', 'ar'] as const) {
      const catalogue = read(`src/locales/${locale}/sidebar.ts`);
      const missing = labelKeys.filter((key) => {
        const name = key.replace(/^sidebar\./, '');
        return !new RegExp(`\\n\\s*${name}:`).test(catalogue);
      });
      expect(missing, `missing from ${locale}/sidebar.ts`).toEqual([]);
    }
  });
});
