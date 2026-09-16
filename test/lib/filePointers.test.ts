import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

// This codebase points at itself constantly. Comments cite the module that
// owns a rule, docs/PROJECT.md indexes every file, and the SQL scripts name the
// client code that reads them — the project's own convention is that a comment
// explains *why*, and "why" here usually lives in another file.
//
// That only works while the pointers resolve. They rot silently: nothing reads
// a comment, so a file that moves leaves every reference to it pointing at
// nothing, and the next reader concludes the explanation was deleted rather
// than relocated.
//
// It had already happened five times over: the reference doc sent readers to
// receipt/ and print/ directories that live one level deeper than advertised,
// two SQL headers cited a planning document that was never committed, and the
// Electron main process and a migration each named a compatibility facade
// deleted in an earlier refactor. Every one described real, still-existing
// behaviour; only the address was wrong, which is the hardest kind of
// staleness to notice.
//
// Those examples are deliberately named without their directory prefix. This
// file is scanned like any other, so spelling a deleted path in full here
// would make the guard fail on its own documentation — which is, in its way,
// the check demonstrating that it works.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Tracked text files that plausibly cite a path. */
function scannedFiles(): string[] {
  const out = execSync('git ls-files src electron test docs *.md', {
    cwd: REPO_ROOT,
  })
    .toString()
    .trim()
    .split(/\r?\n/);
  return out.filter((f) => /\.(ts|tsx|cjs|mjs|js|sql|md|css|html)$/.test(f));
}

// A repo-relative path with a real extension. Globs are excluded: `src/**/*.tsx`
// is a pattern, not a pointer, and package scripts and config are full of them.
const POINTER =
  /(?<![\w./-])(?:src|electron|test|docs|scripts)\/[\w./-]+\.(?:ts|tsx|cjs|mjs|js|sql|md|css|html)\b/g;

describe('file pointers', () => {
  it('resolves every repo path named in source, SQL and docs', () => {
    const broken: string[] = [];
    for (const file of scannedFiles()) {
      const text = readFileSync(join(REPO_ROOT, file), 'utf8');
      for (const match of text.matchAll(POINTER)) {
        const target = match[0];
        if (target.includes('*')) continue;
        // A file naming itself in its own header is fine either way.
        if (!existsSync(join(REPO_ROOT, target))) {
          broken.push(`${file} -> ${target}`);
        }
      }
    }
    expect([...new Set(broken)]).toEqual([]);
  });
});
