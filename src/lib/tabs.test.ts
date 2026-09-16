import { describe, expect, it } from 'vitest';
import {
  isTabEmpty,
  openTabs,
  roundsNewestFirst,
  tabAgeMinutes,
  tabItems,
  tabLineKey,
  tabTotal,
  tabTotals,
  tabUnitCount,
} from './tabs';
import type { HeldOrderItem, SelectedModifier, Tab, TabRound } from '../types';

const item = (overrides: Partial<HeldOrderItem> = {}): HeldOrderItem => ({
  productId: 'p1',
  productName: 'Coffee',
  price: 3,
  cost: 1,
  quantity: 1,
  ...overrides,
});

let seq = 0;
const round = (items: HeldOrderItem[], overrides: Partial<TabRound> = {}): TabRound => {
  seq += 1;
  return {
    id: `round-${seq}`,
    createdAt: `2026-01-01T1${seq}:00:00.000Z`,
    addedBy: 'Ada',
    items,
    ...overrides,
  };
};

const tab = (rounds: TabRound[], overrides: Partial<Tab> = {}): Tab => ({
  id: 'tab-1',
  label: 'Table 4',
  tableId: 'tbl-4',
  customerId: null,
  openedAt: '2026-01-01T10:00:00.000Z',
  openedBy: 'Ada',
  rounds,
  status: 'open',
  ...overrides,
});

const SETTINGS = { taxRate: 0, loyaltyPointValue: 0 };

const OAT: SelectedModifier[] = [
  { groupId: 'g1', groupName: 'Milk', optionId: 'oat', optionName: 'Oat', priceDelta: 0.5 },
];

describe('tabLineKey', () => {
  it('is the bare product id for a plain line', () => {
    expect(tabLineKey(item())).toBe('p1');
  });

  it('separates variants and modifiers', () => {
    expect(tabLineKey(item({ variantId: 'v-l' }))).not.toBe(tabLineKey(item()));
    expect(tabLineKey(item({ modifiers: OAT }))).not.toBe(tabLineKey(item()));
  });
});

describe('tabItems', () => {
  it('is empty for a tab with no rounds', () => {
    expect(tabItems(tab([]))).toEqual([]);
  });

  // A table that ordered a coffee in each of three rounds should read
  // "3x Coffee", not three lines.
  it('sums an identical line across rounds', () => {
    const merged = tabItems(tab([round([item({ quantity: 1 })]), round([item({ quantity: 2 })])]));
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(3);
  });

  it('keeps two different drinks apart', () => {
    const merged = tabItems(tab([round([item(), item({ productId: 'p2', productName: 'Tea' })])]));
    expect(merged.map((i) => i.productName)).toEqual(['Coffee', 'Tea']);
  });

  it('keeps two milks of the same drink apart', () => {
    const merged = tabItems(tab([round([item(), item({ modifiers: OAT, price: 3.5 })])]));
    expect(merged).toHaveLength(2);
  });

  // Collapsing them would have to pick one of the two prices, and would
  // silently over- or under-charge for half the units.
  it('does not average a line whose price changed mid-tab', () => {
    const merged = tabItems(tab([round([item({ price: 3 })]), round([item({ price: 4 })])]));
    expect(merged).toHaveLength(2);
    expect(merged.map((i) => i.price)).toEqual([3, 4]);
  });

  it('keeps first-ordered lines first', () => {
    const merged = tabItems(
      tab([round([item({ productId: 'p2', productName: 'Tea' })]), round([item()])]),
    );
    expect(merged.map((i) => i.productName)).toEqual(['Tea', 'Coffee']);
  });

  it('does not mutate the rounds it read', () => {
    const first = round([item({ quantity: 1 })]);
    tabItems(tab([first, round([item({ quantity: 2 })])]));
    expect(first.items[0].quantity).toBe(1);
  });
});

describe('tabUnitCount / isTabEmpty', () => {
  it('counts units across every round', () => {
    expect(
      tabUnitCount(tab([round([item({ quantity: 2 })]), round([item({ quantity: 3 })])])),
    ).toBe(5);
  });

  it('treats a tab with no rounds as empty', () => {
    expect(isTabEmpty(tab([]))).toBe(true);
  });

  it('treats a tab with rounds as not empty', () => {
    expect(isTabEmpty(tab([round([item()])]))).toBe(false);
  });
});

describe('tabTotals', () => {
  it('prices the merged lines', () => {
    expect(tabTotal(tab([round([item({ price: 3, quantity: 2 })])]), SETTINGS)).toBe(6);
  });

  // Priced through calculateOrderTotals rather than summed by hand, so the
  // running total quoted mid-service is the number settlement will produce.
  it('applies tax exactly as a sale would', () => {
    const totals = tabTotals(tab([round([item({ price: 10 })])]), {
      taxRate: 10,
      loyaltyPointValue: 0,
    });
    expect(totals.subtotal).toBe(10);
    expect(totals.taxAmount).toBe(1);
    expect(totals.totalAmount).toBe(11);
  });

  // A discount is agreed at settlement, on the whole bill. A running total that
  // assumed one would be a figure nobody agreed to.
  it('assumes no discount', () => {
    expect(tabTotals(tab([round([item({ price: 10 })])]), SETTINGS).discountAmount).toBe(0);
  });

  it('is zero for an empty tab', () => {
    expect(tabTotal(tab([]), SETTINGS)).toBe(0);
  });
});

describe('tabAgeMinutes', () => {
  const opened = new Date('2026-01-01T10:00:00.000Z').getTime();

  it('is whole minutes since the tab opened', () => {
    expect(tabAgeMinutes(tab([]), opened + 90 * 60_000)).toBe(90);
  });

  it('is zero at the moment it opened', () => {
    expect(tabAgeMinutes(tab([]), opened)).toBe(0);
  });

  it('never goes negative on a clock that disagrees', () => {
    expect(tabAgeMinutes(tab([]), opened - 60_000)).toBe(0);
  });

  it('is zero rather than NaN for an unparseable open time', () => {
    expect(tabAgeMinutes({ openedAt: 'not a date' }, opened)).toBe(0);
  });
});

describe('roundsNewestFirst', () => {
  it('reverses without disturbing the tab', () => {
    const rounds = [round([item()]), round([item()])];
    const t = tab(rounds);
    expect(roundsNewestFirst(t).map((r) => r.id)).toEqual([rounds[1].id, rounds[0].id]);
    expect(t.rounds.map((r) => r.id)).toEqual([rounds[0].id, rounds[1].id]);
  });
});

describe('openTabs', () => {
  const at = (iso: string, overrides: Partial<Tab> = {}) =>
    tab([], { id: `tab-${iso}`, openedAt: iso, ...overrides });

  it('drops settled tabs', () => {
    const tabs = [
      at('2026-01-01T10:00:00.000Z'),
      at('2026-01-01T11:00:00.000Z', { status: 'settled' }),
    ];
    expect(openTabs(tabs)).toHaveLength(1);
  });

  // An open tab is an outstanding debt: the one open since lunchtime is the one
  // somebody needs to chase, so it leads.
  it('puts the longest-open tab first', () => {
    const tabs = [at('2026-01-01T14:00:00.000Z'), at('2026-01-01T10:00:00.000Z')];
    expect(openTabs(tabs).map((t) => t.openedAt)).toEqual([
      '2026-01-01T10:00:00.000Z',
      '2026-01-01T14:00:00.000Z',
    ]);
  });

  it('does not reorder the array it was given', () => {
    const tabs = [at('2026-01-01T14:00:00.000Z'), at('2026-01-01T10:00:00.000Z')];
    const order = tabs.map((t) => t.id);
    openTabs(tabs);
    expect(tabs.map((t) => t.id)).toEqual(order);
  });

  it('is empty when nothing is open', () => {
    expect(openTabs([])).toEqual([]);
  });
});
