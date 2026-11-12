import type { HeldOrderItem, StoreSettings, Tab, TabRound } from '../types';
import { calculateOrderTotals } from './pricing';
import { modifierSignature } from './modifiers';
import { lineKey } from './variants';

/**
 * What a tab currently owes, and how its rounds fold into one bill.
 *
 * Pure, so the arithmetic an operator settles against can be exercised without
 * rendering the register — the same split the rest of lib/ keeps.
 *
 * The central decision here: rounds are stored SEPARATELY and merged only for
 * display and settlement. Merging on arrival would be simpler and would destroy
 * the one thing the tab knows that the cart does not — which lines have already
 * gone to the kitchen. Keeping them apart is what lets a second round fire a
 * ticket for the second round alone.
 */

/**
 * What a tab line is addressed by: the product, the variant, and the exact
 * modifiers. Two flat whites with different milk are two lines on the bill, and
 * merging them would price one of them wrong.
 *
 * Deliberately the same rule as the register's cartLineKey, because a tab is
 * settled THROUGH the register: if the two disagreed about what "the same line"
 * means, the bill shown and the sale recorded would differ.
 */
export function tabLineKey(
  item: Pick<HeldOrderItem, 'productId' | 'variantId' | 'modifiers'>,
): string {
  const base = lineKey(item.productId, item.variantId);
  const mod = modifierSignature(item.modifiers);
  return mod ? `${base}#${mod}` : base;
}

/**
 * Every round folded into one list of bill lines, in the order they were first
 * ordered.
 *
 * Quantities of an identical line are summed, so a table that ordered a coffee
 * in each of three rounds sees "3x Coffee" rather than three separate lines —
 * but only when the price agrees too. A line whose price changed between rounds
 * stays separate, because collapsing them would have to pick one of the two
 * prices and would silently over- or under-charge for half the units.
 */
export function tabItems(tab: Pick<Tab, 'rounds'>): HeldOrderItem[] {
  const merged = new Map<string, HeldOrderItem>();
  for (const round of tab.rounds) {
    for (const item of round.items) {
      // The price is part of the key, not just the line's identity, so a
      // mid-tab price change cannot be averaged away.
      const key = `${tabLineKey(item)}@${item.price}`;
      const existing = merged.get(key);
      if (existing) {
        merged.set(key, { ...existing, quantity: existing.quantity + item.quantity });
      } else {
        merged.set(key, { ...item });
      }
    }
  }
  return [...merged.values()];
}

/** Units on the tab across every round. */
export function tabUnitCount(tab: Pick<Tab, 'rounds'>): number {
  return tab.rounds.reduce(
    (total, round) => total + round.items.reduce((sum, item) => sum + item.quantity, 0),
    0,
  );
}

/**
 * What the tab is worth, priced exactly as the register would price it.
 *
 * Runs the merged lines through calculateOrderTotals rather than summing them,
 * so the running total an operator quotes mid-service is the same number
 * settlement will produce — tax and rounding included. A hand-rolled sum would
 * be right until the day a tax rate changed.
 *
 * No discount is applied: a discount is chosen at settlement, on the whole bill,
 * and a running total that quietly assumed one would be a figure nobody agreed.
 */
export function tabTotals(
  tab: Pick<Tab, 'rounds'>,
  settings: Pick<StoreSettings, 'taxRate' | 'loyaltyPointValue'>,
) {
  return calculateOrderTotals(tabItems(tab), 'none', 0, settings);
}

/** Convenience: just the money owed. */
export function tabTotal(
  tab: Pick<Tab, 'rounds'>,
  settings: Pick<StoreSettings, 'taxRate' | 'loyaltyPointValue'>,
): number {
  return tabTotals(tab, settings).totalAmount;
}

/**
 * True when the tab has nothing on it.
 *
 * A tab opened and never ordered against is not a bill; settling it would write
 * a zero-value sale into the day's history and the Z-report.
 */
export function isTabEmpty(tab: Pick<Tab, 'rounds'>): boolean {
  return tabUnitCount(tab) === 0;
}

/**
 * How long a tab has been open, in whole minutes.
 *
 * `now` is a parameter so the caller's clock is the one that decides — the same
 * reason pinThrottle takes one. A tab with an unparseable or future open time
 * reads as 0 rather than as a negative age or NaN.
 */
export function tabAgeMinutes(tab: Pick<Tab, 'openedAt'>, now: number): number {
  const opened = new Date(tab.openedAt).getTime();
  if (!Number.isFinite(opened)) return 0;
  return Math.max(0, Math.floor((now - opened) / 60_000));
}

/** The rounds most recently added first, for a panel that shows the latest. */
export function roundsNewestFirst(tab: Pick<Tab, 'rounds'>): TabRound[] {
  return [...tab.rounds].reverse();
}

/**
 * The open tabs, longest-open first.
 *
 * Oldest first rather than newest: an open tab is an outstanding debt, and the
 * one that has been open since lunchtime is the one somebody needs to chase.
 */
export function openTabs(tabs: Tab[]): Tab[] {
  return tabs
    .filter((tab) => tab.status === 'open')
    .sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime());
}
