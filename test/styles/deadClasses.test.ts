import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

// src/index.css had accumulated 38 component classes nothing rendered any more —
// gradient text, neon borders, a skeleton loader, a sidebar pill, a whole
// z-report table — plus the 19 @keyframes only they animated. That is ~5 KB of
// CSS shipped to every terminal, but the real cost is that a reader cannot tell
// which of two similar-looking classes the app actually uses.
//
// So: every class the stylesheet defines has to be named somewhere the app can
// reach it.

// Anchored to this file rather than to process.cwd(), so the check reads the
// same tree whichever directory the runner was started from.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(REPO_ROOT, file), 'utf8');
const git = (args: string) => execSync(`git ${args}`, { cwd: REPO_ROOT }).toString();

/** Strips block comments. They are prose, and prose names classes. */
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Class names `src/index.css` defines a rule for.
 *
 * Only selector text is searched — the prelude before each `{`. Scanning the
 * whole file instead would collect `woff2` out of `url('…-normal.woff2')` in
 * @font-face, and then demand the app "use" it. Scanning only where a dot is
 * preceded by a combinator would miss the other half: `is-dragging` in
 * `.product-card.is-dragging`, and the four `active-*` payment modifiers, none
 * of which start their selector.
 */
function definedClasses(): Set<string> {
  const css = withoutComments(read('src/index.css'));
  const out = new Set<string>();
  let prelude = '';
  for (const ch of css) {
    if (ch === '{') {
      for (const m of prelude.matchAll(/\.([a-zA-Z][\w-]*)/g)) out.add(m[1]);
      prelude = '';
    } else if (ch === '}' || ch === ';') {
      prelude = '';
    } else {
      prelude += ch;
    }
  }
  return out;
}

/**
 * Every identifier appearing in code that renders against this stylesheet.
 *
 * Comments are stripped first. A class named only in a comment is not applied
 * to anything, and counting it would let a rule survive its last real use — the
 * exact failure this test exists to catch.
 *
 * `electron/menu.html` is deliberately excluded. It is a standalone document
 * served by the QR-menu server with its own inline <style> — it never loads
 * index.css — so a name that happens to match there is a coincidence, not a
 * use. `.animate-fade-in` was exactly that: dead in index.css, alive in
 * menu.html's own stylesheet.
 */
function referencedNames(): Set<string> {
  const files = git('ls-files src e2e test tools electron scripts index.html')
    .trim()
    .split(/\r?\n/)
    .filter((f) => /\.(tsx?|jsx?|html|mjs|cjs)$/.test(f) && f !== 'electron/menu.html');

  const out = new Set<string>();
  for (const file of files) {
    const source = withoutComments(read(file))
      // Line comments, but not the `//` in a URL, which carries no class names
      // and whose line may well carry one.
      .replace(/(?<!:)\/\/.*$/gm, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    for (const m of source.matchAll(/[a-zA-Z][\w-]*/g)) out.add(m[0]);
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
    const css = withoutComments(read('src/index.css'));
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
