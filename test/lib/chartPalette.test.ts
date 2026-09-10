import { describe, it, expect } from 'vitest';
import {
  SERIES,
  NEUTRAL,
  SERIES_CAP,
  assignSeriesColors,
  foldToCap,
} from '../../src/lib/chartPalette';

// The rules these pin down are the ones the old inline palettes broke. They are
// invariants, not preferences: a cycled palette puts two live entities on the
// same hue, and a rank-keyed palette repaints the chart when a filter changes.

describe('SERIES', () => {
  it('offers the same number of slots in both modes', () => {
    // The dark column is the same hues restepped for the dark ground, so a
    // chart cannot run out of colours by switching theme.
    expect(SERIES.dark).toHaveLength(SERIES.light.length);
  });

  it('holds no duplicate hues within a mode', () => {
    for (const mode of ['light', 'dark'] as const) {
      expect(new Set(SERIES[mode]).size).toBe(SERIES[mode].length);
    }
  });

  it('keeps the neutral out of the categorical set', () => {
    // "Other" carries no identity, so it must not be mistakable for a slot.
    for (const mode of ['light', 'dark'] as const) {
      expect(SERIES[mode]).not.toContain(NEUTRAL[mode]);
    }
  });

  it('caps all-pairs forms lower than adjacent ones', () => {
    // Verified with the validator: past three slots the full pair set fails the
    // CVD and normal-vision floors on both surfaces.
    expect(SERIES_CAP.all).toBeLessThan(SERIES_CAP.adjacent);
    expect(SERIES_CAP.adjacent).toBeLessThanOrEqual(SERIES.light.length);
  });
});

describe('assignSeriesColors', () => {
  it('assigns slots in fixed order', () => {
    const colors = assignSeriesColors(['a', 'b', 'c'], 'light');
    expect(colors.get('a')).toBe(SERIES.light[0]);
    expect(colors.get('b')).toBe(SERIES.light[1]);
    expect(colors.get('c')).toBe(SERIES.light[2]);
  });

  it('never cycles — a seventh entity gets the neutral, not slot one again', () => {
    // Cycling is what put two live categories on the same hue. The seventh must
    // be visibly "not one of the six", not a duplicate of the first.
    const domain = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const colors = assignSeriesColors(domain, 'light');
    expect(colors.get('g')).toBe(NEUTRAL.light);
    expect(colors.get('g')).not.toBe(colors.get('a'));
  });

  it('is independent of the order the domain is handed in', () => {
    // The caller's array order is incidental — catalogue order, sync order,
    // whatever the last UI sort left behind. Letting it choose the colours
    // means a category changes colour because a list moved somewhere else.
    const asStored = assignSeriesColors(['coffee', 'pastry', 'retail'], 'light');
    const reordered = assignSeriesColors(['retail', 'coffee', 'pastry'], 'light');
    for (const key of ['coffee', 'pastry', 'retail']) {
      expect(reordered.get(key)).toBe(asStored.get(key));
    }
  });

  it('keeps survivors on their colour when a LATER entity disappears', () => {
    // The real test of the property the module claims. The previous version of
    // this test passed the identical domain twice, so it proved only that the
    // function is deterministic — a rank-based implementation would have
    // passed it too.
    const before = assignSeriesColors(['coffee', 'pastry', 'retail'], 'light');
    const after = assignSeriesColors(['coffee', 'pastry'], 'light'); // retail gone
    expect(after.get('coffee')).toBe(before.get('coffee'));
    expect(after.get('pastry')).toBe(before.get('pastry'));
  });

  it('does shift later entities when an EARLIER one is removed — a known limit', () => {
    // Stated as a test rather than buried in a comment, because it is the
    // boundary of what this module promises. Six slots and an unbounded
    // catalogue cannot give both stability and no collisions; hashing ids to
    // slots would survive deletion but put two live categories on one hue,
    // which is the bug this module exists to prevent. A colour persisted on
    // the category record is the only real fix.
    const before = assignSeriesColors(['a-coffee', 'b-pastry', 'c-retail'], 'light');
    const after = assignSeriesColors(['b-pastry', 'c-retail'], 'light'); // a removed
    expect(after.get('b-pastry')).not.toBe(before.get('b-pastry'));
  });

  it('does not move when revenue moves', () => {
    // The bug this replaces: colour came from the index of a revenue-sorted,
    // range-filtered list, so narrowing the date range repainted the survivors
    // and two ranges could not be compared by eye. The domain is the
    // catalogue, which revenue cannot reorder.
    const colors = assignSeriesColors(['coffee', 'pastry'], 'light');
    expect(colors.get('coffee')).toBe(SERIES.light[0]);
    expect(colors.get('pastry')).toBe(SERIES.light[1]);
  });

  it('does not let a repeated id consume two slots', () => {
    const colors = assignSeriesColors(['a', 'a', 'b'], 'light');
    expect(colors.get('b')).toBe(SERIES.light[1]);
    expect(colors.size).toBe(2);
  });

  it('honours a tighter cap for all-pairs forms', () => {
    const colors = assignSeriesColors(['a', 'b', 'c', 'd'], 'light', SERIES_CAP.all);
    expect(colors.get('c')).toBe(SERIES.light[2]);
    expect(colors.get('d')).toBe(NEUTRAL.light);
  });

  it('returns dark steps in dark mode', () => {
    expect(assignSeriesColors(['a'], 'dark').get('a')).toBe(SERIES.dark[0]);
  });

  it('is empty for an empty domain', () => {
    expect(assignSeriesColors([], 'light').size).toBe(0);
  });
});

describe('foldToCap', () => {
  const rows = [
    { key: 'a', name: 'Coffee', value: 10 },
    { key: 'b', name: 'Pastry', value: 30 },
    { key: 'c', name: 'Retail', value: 20 },
    { key: 'd', name: 'Merch', value: 5 },
  ];
  const colors = assignSeriesColors(['a', 'b', 'c', 'd'], 'light');

  it('orders by value so the chart reads biggest first', () => {
    expect(foldToCap(rows, colors, 'light', 4).map((r) => r.key)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('folds everything past the cap into one Other row', () => {
    const folded = foldToCap(rows, colors, 'light', 2);
    expect(folded).toHaveLength(3);
    expect(folded[2].isOther).toBe(true);
    expect(folded[2].value).toBe(15); // 10 + 5
  });

  it('gives Other the neutral, never a categorical hue', () => {
    const folded = foldToCap(rows, colors, 'light', 2);
    expect(folded[2].color).toBe(NEUTRAL.light);
    expect(SERIES.light).not.toContain(folded[2].color);
  });

  it('folds an entity that never got its own colour, however big it is', () => {
    // A catalogue past the palette assigns NEUTRAL to the overflow. If such an
    // entity ranked inside the cap it would be KEPT while wearing the same
    // neutral the Other row uses — two different things drawn in one colour,
    // which is the collision this module exists to prevent. So "has no colour
    // of its own" and "belongs in Other" have to be the same condition.
    const big = [
      { key: 'a', name: 'A', value: 1 },
      { key: 'b', name: 'B', value: 1 },
      { key: 'c', name: 'C', value: 1 },
      { key: 'd', name: 'D', value: 1 },
      { key: 'e', name: 'E', value: 1 },
      { key: 'f', name: 'F', value: 1 },
      { key: 'g', name: 'G', value: 999 }, // ranks first, but sorts past the palette
    ];
    const seven = assignSeriesColors(
      big.map((r) => r.key),
      'light',
    );
    expect(seven.get('g')).toBe(NEUTRAL.light);

    const folded = foldToCap(big, seven, 'light', SERIES_CAP.adjacent);
    const other = folded.find((r) => r.isOther);
    expect(other).toBeDefined();
    expect(other!.value).toBe(999);
    // No kept row wears the neutral.
    for (const row of folded.filter((r) => !r.isOther)) {
      expect(row.color).not.toBe(NEUTRAL.light);
      expect(SERIES.light).toContain(row.color);
    }
  });

  it('adds no Other row when everything fits', () => {
    expect(foldToCap(rows, colors, 'light', 4).some((r) => r.isOther)).toBe(false);
  });

  it('preserves the total when folding', () => {
    // A part-to-whole chart that loses value while folding is lying about the
    // whole, which is worse than showing too many slices.
    const total = rows.reduce((sum, r) => sum + r.value, 0);
    for (const cap of [1, 2, 3, 4]) {
      const folded = foldToCap(rows, colors, 'light', cap);
      expect(folded.reduce((sum, r) => sum + r.value, 0)).toBe(total);
    }
  });

  it('keeps each row on the colour identity gave it, not the display order', () => {
    // Sorting for display must not repaint: 'b' ranks first but is slot 2.
    const folded = foldToCap(rows, colors, 'light', 4);
    expect(folded[0].key).toBe('b');
    expect(folded[0].color).toBe(colors.get('b'));
    expect(folded[0].color).toBe(SERIES.light[1]);
  });

  it('does not reorder the array it was given', () => {
    const original = [...rows];
    foldToCap(rows, colors, 'light', 2);
    expect(rows).toEqual(original);
  });

  it('handles an empty row set', () => {
    expect(foldToCap([], colors, 'light', 3)).toEqual([]);
  });
});
