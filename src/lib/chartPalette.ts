// The categorical palette every chart in the app draws from.
//
// It lives here, once, because the Dashboard used to declare its colours inline
// and the two declarations had already drifted:
//
//   category share  ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#ec4899','#64748b']
//   payment methods { card:'#3b82f6', cash:'#10b981', mobile:'#8b5cf6', ... }
//
// That palette fails validation on four counts. The one that matters most is
// #8b5cf6 against #3b82f6 — violet against blue — at ΔE 1.3 for deuteranopia
// and 12.0 for NORMAL vision, under a hard floor of 15. Those were the `mobile`
// and `card` slices sitting next to each other in the payments chart, so a shop
// owner could not reliably tell card revenue from mobile revenue. #64748b also
// reads as grey (chroma 0.041) rather than as a colour carrying meaning.
//
// The steps below are validated against this app's own surfaces — #ffffff light
// and #0f172a dark — not against a generic ground:
//
//   light, adjacent : CVD ΔE 9.1 · normal ΔE 19.6 · 3 slots warn on contrast
//   dark,  adjacent : CVD ΔE 8.4 · normal ΔE 19.3 · all clear 3:1
//
// Regenerate with the validator rather than editing a hex by eye:
//   node scripts/validate_palette.js "<hex,...>" --mode dark --surface "#0f172a"

/**
 * Which surface a chart is drawn on. The dark steps are the same hues restepped
 * for the dark ground, not an automatic lightening of the light ones.
 */
export type ChartMode = 'light' | 'dark';

/**
 * Categorical slots, in fixed order. Assigned in order and never cycled: a
 * seventh entity does not wrap back to slot 1, it folds into "Other".
 */
export const SERIES: Record<ChartMode, readonly string[]> = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'],
};

/**
 * The "Other" bucket and any non-categorical mark. Deliberately outside the
 * categorical set: it carries no identity, so it must not look like it does.
 */
export const NEUTRAL: Record<ChartMode, string> = {
  light: '#64748b',
  dark: '#94a3b8',
};

/**
 * How many slots a form may use before folding the rest into "Other".
 *
 * `adjacent` is for forms where a mark is only ever compared against the one
 * beside it — bars, stacked segments, lines. `all` is for forms where every
 * mark is compared against every other at once, which is a far stricter test:
 * with this palette only the first three slots clear the floors for all pairs,
 * verified with `--pairs all` on both surfaces.
 */
export const SERIES_CAP = { adjacent: 6, all: 3 } as const;

/**
 * Assigns a colour to each entity, keyed by identity rather than by rank.
 *
 * `domain` is the FULL set of entities that could appear — every category in
 * the catalogue, not the handful that happen to have revenue in the selected
 * range. That distinction is the whole point. The previous code coloured by the
 * index of a revenue-sorted, range-filtered list, so changing the date range
 * silently repainted whichever categories survived: the same category was green
 * in one range and amber in another, and two ranges could not be compared by
 * eye at all.
 *
 * Entities past the cap share the neutral, which is what makes folding them
 * into a single "Other" row honest rather than a collision.
 */
export function assignSeriesColors(
  domain: readonly string[],
  mode: ChartMode,
  cap: number = SERIES_CAP.adjacent,
): Map<string, string> {
  const slots = SERIES[mode];
  const limit = Math.min(cap, slots.length);
  const assigned = new Map<string, string>();

  let slot = 0;
  for (const key of domain) {
    if (assigned.has(key)) continue; // a repeated id must not consume two slots
    assigned.set(key, slot < limit ? slots[slot] : NEUTRAL[mode]);
    slot += 1;
  }
  return assigned;
}

/**
 * One row of a part-to-whole chart, after folding.
 */
export interface FoldedSlice {
  key: string;
  name: string;
  value: number;
  color: string;
  isOther: boolean;
}

/**
 * Keeps the largest `cap` entries and folds the remainder into a single
 * "Other" row, so no chart ever shows more classes than its colours can carry.
 *
 * Ordering here is by value, because that is how the chart should READ — the
 * biggest slice first. Colour still comes from `colors`, which was keyed on
 * identity, so ordering the display does not repaint anything.
 */
export function foldToCap(
  rows: readonly { key: string; name: string; value: number }[],
  colors: Map<string, string>,
  mode: ChartMode,
  cap: number,
  otherLabel = 'Other',
): FoldedSlice[] {
  const ranked = [...rows].sort((a, b) => b.value - a.value);
  const kept = ranked.slice(0, cap).map((row) => ({
    ...row,
    color: colors.get(row.key) ?? NEUTRAL[mode],
    isOther: false,
  }));

  const rest = ranked.slice(cap);
  if (rest.length === 0) return kept;

  return [
    ...kept,
    {
      key: '__other__',
      name: otherLabel,
      value: rest.reduce((sum, row) => sum + row.value, 0),
      color: NEUTRAL[mode],
      isOther: true,
    },
  ];
}
