import { describe, expect, it } from 'vitest';
import { mergePendingLocal } from './realtimeSync';

type Row = { id: string; name: string };

const rows = (...specs: string[]): Row[] =>
  specs.map((spec) => {
    const [id, name] = spec.split(':');
    return { id, name: name ?? id };
  });

describe('mergePendingLocal', () => {
  it('takes the server snapshot when nothing is owed', () => {
    const pulled = rows('a', 'b');
    expect(mergePendingLocal(pulled, rows('a', 'z'), new Set(), 'end')).toBe(pulled);
  });

  it('ignores pending ids the local table no longer holds', () => {
    const pulled = rows('a', 'b');
    expect(mergePendingLocal(pulled, rows('a'), new Set(['gone']), 'end')).toBe(pulled);
  });

  // The regression: a sale committed locally and not yet pushed used to be
  // erased by the next realtime pull, because the snapshot never contained it.
  it('keeps a locally committed row the server has never seen', () => {
    const pulled = rows('old1', 'old2');
    const local = rows('new1', 'old1', 'old2');
    const merged = mergePendingLocal(pulled, local, new Set(['new1']), 'start');
    expect(merged.map((row) => row.id)).toEqual(['new1', 'old1', 'old2']);
  });

  it('puts an unseen row where its table appends, not always at the front', () => {
    const pulled = rows('p1', 'p2');
    const local = rows('p1', 'p2', 'p3');
    expect(mergePendingLocal(pulled, local, new Set(['p3']), 'end').map((r) => r.id)).toEqual([
      'p1',
      'p2',
      'p3',
    ]);
  });

  it('prefers the local copy of a row the server has, without moving it', () => {
    const pulled = rows('a:server', 'b:server', 'c:server');
    const local = rows('a:server', 'b:local', 'c:server');
    const merged = mergePendingLocal(pulled, local, new Set(['b']), 'end');
    expect(merged.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(merged[1].name).toBe('local');
  });

  it('does not reinstate a row that is absent locally and not pending', () => {
    // A row deleted locally with its delete still queued must stay deleted; the
    // snapshot legitimately still has it, and only PUSH ids are passed in here.
    const merged = mergePendingLocal(rows('a', 'deleted'), rows('a'), new Set(['a']), 'end');
    expect(merged.map((row) => row.id)).toEqual(['a', 'deleted']);
  });

  it('keeps several pending rows in their local order', () => {
    const pulled = rows('s1');
    const local = rows('n1', 'n2', 's1');
    const merged = mergePendingLocal(pulled, local, new Set(['n1', 'n2']), 'start');
    expect(merged.map((row) => row.id)).toEqual(['n1', 'n2', 's1']);
  });
});
