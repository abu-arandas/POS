import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// src/index.css had accumulated 38 component classes nothing rendered any more —
// gradient text, neon borders, a skeleton loader, a sidebar pill, a whole
// z-report table — plus the 19 @keyframes only they animated. That is ~5 KB of
// CSS shipped to every terminal, but the real cost is that a reader cannot tell
// which of two similar-looking classes the app actually uses.
//
// So: every class the stylesheet defines has to be named somewhere the app can
// reach it.

/**
 * The stylesheet with its comments removed. They are prose, and prose names
 * classes: a line reading "Distinct from .badge-*, which forces uppercase"
 * otherwise registers as a rule for a class called `badge-`.
 */
function stylesheet(): string {
  return readFileSync('src/index.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Class names `src/index.css` defines a rule for. */
function definedClasses(): Set<string> {
  const out = new Set<string>();
  for (const m of stylesheet().matchAll(/(^|[\s,>+~(])\.([a-zA-Z][\w-]*)/g)) out.add(m[2]);
  return out;
}

/**
 * Every identifier appearing in code that renders against this stylesheet.
 *
 * `electron/menu.html` is deliberately excluded. It is a standalone document
 * served by the QR-menu server with its own inline <style> — it never loads
 * index.css — so a name that happens to match there is a coincidence, not a
 * use. `.animate-fade-in` was exactly that: dead in index.css, alive in
 * menu.html's own stylesheet.
 */
function referencedNames(): Set<string> {
  const files = execSync('git ls-files src e2e test tools electron scripts index.html')
    .toString()
    .trim()
    .split(/\r?\n/)
    .filter((f) => /\.(tsx?|jsx?|html|mjs|cjs)$/.test(f) && f !== 'electron/menu.html');

  const out = new Set<string>();
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(/[a-zA-Z][\w-]*/g)) out.add(m[0]);
  }
  return out;
}

// Recharts renders its tooltip with these class names, so the app styles them
// without ever writing them. Nothing else in the stylesheet may claim this.
const LIBRARY_OWNED = /^recharts-/;

describe('stylesheet', () => {
  it('defines no class the app never applies', () => {
    const used = referencedNames();
    const dead = [...definedClasses()].filter((c) => !LIBRARY_OWNED.test(c) && !used.has(c)).sort();
    expect(dead).toEqual([]);
  });

  it('declares no @keyframes nothing animates', () => {
    const css = stylesheet();
    const animated = new Set<string>();
    for (const m of css.matchAll(/animation(?:-name)?\s*:\s*([^;]+);/g)) {
      for (const token of m[1].split(/[\s,]+/)) animated.add(token);
    }
    const orphaned = [...css.matchAll(/@keyframes\s+([a-zA-Z][\w-]*)/g)]
      .map((m) => m[1])
      .filter((name) => !animated.has(name));
    expect(orphaned).toEqual([]);
  });
});
