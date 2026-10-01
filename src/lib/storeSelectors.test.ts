import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards one specific way the whole app can fail to render.
 *
 * zustand v5 hands a hook's selector straight to React's `useSyncExternalStore`,
 * which needs the snapshot to be referentially stable between reads. A selector
 * that builds an object or array — `useStore((s) => ({ a: s.a, b: s.b }))` — is
 * a new value on every read, so React re-renders forever and the error boundary
 * takes the screen ("getSnapshot should be cached", React error #185). It shipped
 * once, in the hook behind the sidebar's sync badge, and every sign-in crashed.
 *
 * Nothing else catches it: the unit tests run without a DOM, so nothing renders,
 * and the build and the typechecker are perfectly happy with it. Select one
 * primitive per call, or wrap the selector in `useShallow`.
 *
 * This is a heuristic over source text, not a parser — it looks for the common
 * shape and says where. A selector built some other way is not covered, which is
 * why the real defence is still a test that renders the shell.
 */

const SRC_DIR = path.resolve(__dirname, '..');

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

/** `useXStore((s) => ({`, `useXStore(s => [`, `useXStore((state) => (`+`{` — a literal returned from the selector. */
const FRESH_VALUE_SELECTOR = /\buse[A-Za-z]*Store\(\s*\(?\s*\w+\s*\)?\s*=>\s*\(?\s*[{[]/;

describe('zustand selectors', () => {
  it('finds source files at all', () => {
    expect(sourceFiles(SRC_DIR).length).toBeGreaterThan(100);
  });

  it('never return a freshly built object or array from a bare selector', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC_DIR)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (FRESH_VALUE_SELECTOR.test(line) && !/useShallow/.test(line)) {
          offenders.push(`${path.relative(SRC_DIR, file)}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('recognises the shape that crashed the app', () => {
    // A guard on the guard: if the pattern stopped matching, the sweep above would
    // pass vacuously.
    expect(FRESH_VALUE_SELECTOR.test('const x = useSettingsStore((s) => ({')).toBe(true);
    expect(FRESH_VALUE_SELECTOR.test('const x = useThingStore(s => [s.a, s.b]);')).toBe(true);
    expect(
      FRESH_VALUE_SELECTOR.test('const x = useSettingsStore((s) => s.supabaseConfig.enabled);'),
    ).toBe(false);
  });
});
