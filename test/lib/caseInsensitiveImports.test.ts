import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Windows and macOS resolve paths case-insensitively; Linux and the CI unit
// runners do not. A component that imports its own sibling folder by the bare
// directory name — `./history` next to `History.tsx` — therefore resolves to
// the DIRECTORY here and to the FILE ITSELF on a developer's Windows machine,
// where the build dies with "X is not exported by X, imported by X".
//
// This is not hypothetical: it broke the Windows installer build once already.
// Naming index explicitly (`./history/index`) is unambiguous on every platform,
// which is why the inventory and settings screens already do it.

const SRC = resolve(__dirname, '../../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const IMPORT_RE = /(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g;

/**
 * Imports of a directory whose name also matches a sibling FILE when case is
 * ignored. A bare directory import is fine on its own; it is the collision with
 * a sibling that makes the specifier mean two different things per platform.
 */
function ambiguousImports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const spec = match[1];
    const target = resolve(dirname(file), spec);
    try {
      if (!statSync(target).isDirectory()) continue;
    } catch {
      continue; // resolves to a file (with an implied extension) — unambiguous
    }
    const folder = target.slice(target.lastIndexOf('/') + 1).toLowerCase();
    const collides = readdirSync(dirname(target), { withFileTypes: true }).some(
      (entry) => entry.isFile() && entry.name.replace(/\.tsx?$/, '').toLowerCase() === folder,
    );
    if (collides) found.push(`${file.slice(SRC.length + 1)} → ${spec}`);
  }
  return found;
}

describe('imports that a case-insensitive filesystem would resolve differently', () => {
  it('never imports a directory that shares a name with a sibling file', () => {
    const offenders = sourceFiles(SRC).flatMap(ambiguousImports);
    expect(offenders).toEqual([]);
  });
});
