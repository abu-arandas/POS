import { describe, it, expect } from 'vitest';
import { routeKitchenTickets } from '../../src/lib/kitchenRouting';
import { SaleTransaction, OrderItem, KitchenStation } from '../../src/types';

const item = (productId: string, name: string): OrderItem => ({
  productId,
  productName: name,
  price: 5,
  cost: 1,
  quantity: 1,
  total: 5,
});

// p1→bar (drinks), p2→grill (food), p3→grill (food), p4→cat with no station
const catMap: Record<string, string> = {
  p1: 'drinks',
  p2: 'food',
  p3: 'food',
  p4: 'desserts',
};
const categoryOf = (id: string) => catMap[id];

const tx: Pick<SaleTransaction, 'items'> = {
  items: [item('p1', 'Latte'), item('p2', 'Burger'), item('p3', 'Fries')],
};

const bar: KitchenStation = { id: 's-bar', name: 'Bar', categoryIds: ['drinks'] };
const grill: KitchenStation = { id: 's-grill', name: 'Grill', categoryIds: ['food'] };

describe('routeKitchenTickets', () => {
  it('groups items onto the station that owns their category', () => {
    const tickets = routeKitchenTickets(tx, [bar, grill], categoryOf);
    expect(tickets).toHaveLength(2);
    expect(tickets[0].station.name).toBe('Bar');
    expect(tickets[0].items.map((i) => i.productName)).toEqual(['Latte']);
    expect(tickets[1].station.name).toBe('Grill');
    expect(tickets[1].items.map((i) => i.productName)).toEqual(['Burger', 'Fries']);
  });

  it('preserves the given station order', () => {
    const tickets = routeKitchenTickets(tx, [grill, bar], categoryOf);
    expect(tickets.map((t) => t.station.name)).toEqual(['Grill', 'Bar']);
  });

  it('omits stations that have no matching items', () => {
    const drinksOnly = { items: [item('p1', 'Latte')] };
    const tickets = routeKitchenTickets(drinksOnly, [bar, grill], categoryOf);
    expect(tickets).toHaveLength(1);
    expect(tickets[0].station.name).toBe('Bar');
  });

  it('collects items with no matching station under an "unrouted" ticket', () => {
    const withDessert = { items: [item('p1', 'Latte'), item('p4', 'Cake')] };
    const tickets = routeKitchenTickets(withDessert, [bar, grill], categoryOf);
    const unrouted = tickets.find((t) => t.station.id === 'unrouted');
    expect(unrouted).toBeDefined();
    expect(unrouted!.items.map((i) => i.productName)).toEqual(['Cake']);
  });

  it('fans an item out to every station whose category list includes it', () => {
    const expo: KitchenStation = { id: 's-expo', name: 'Expo', categoryIds: ['drinks', 'food'] };
    const tickets = routeKitchenTickets(tx, [bar, grill, expo], categoryOf);
    const expoTicket = tickets.find((t) => t.station.name === 'Expo');
    expect(expoTicket!.items).toHaveLength(3); // sees drinks + food
    // Everything was routed, so there is no unrouted ticket.
    expect(tickets.some((t) => t.station.id === 'unrouted')).toBe(false);
  });

  it('routes everything to unrouted when no stations are configured', () => {
    const tickets = routeKitchenTickets(tx, [], categoryOf);
    expect(tickets).toHaveLength(1);
    expect(tickets[0].station.id).toBe('unrouted');
    expect(tickets[0].items).toHaveLength(3);
  });

  // A station added from a detected printer starts with categoryIds: [], which
  // used to match nothing — so every item fell into the unrouted ticket, which
  // has no ipAddress and therefore printed on the terminal's default transport
  // instead of the station's own printer. Empty now means catch-all.
  describe('a station with no categories', () => {
    const lanPrinter: KitchenStation = {
      id: 'station-1',
      name: 'Network printer 192.168.1.100',
      ipAddress: '192.168.1.100',
      categoryIds: [],
    };

    it('receives every item and keeps its own printer address', () => {
      const tickets = routeKitchenTickets(tx, [lanPrinter], categoryOf);
      expect(tickets).toHaveLength(1);
      expect(tickets[0].station.ipAddress).toBe('192.168.1.100');
      expect(tickets[0].items).toHaveLength(3);
    });

    it('leaves nothing to fall back to the default transport', () => {
      const tickets = routeKitchenTickets(tx, [lanPrinter], categoryOf);
      expect(tickets.some((t) => t.station.id === 'unrouted')).toBe(false);
    });

    it('takes items whose category resolves to nothing at all', () => {
      const orphan: Pick<SaleTransaction, 'items'> = { items: [item('p9', 'Mystery')] };
      const tickets = routeKitchenTickets(orphan, [lanPrinter], () => undefined);
      expect(tickets).toHaveLength(1);
      expect(tickets[0].station.ipAddress).toBe('192.168.1.100');
    });

    it('does not disturb stations that do filter by category', () => {
      const tickets = routeKitchenTickets(tx, [bar, lanPrinter], categoryOf);
      expect(tickets.find((t) => t.station.id === 's-bar')!.items).toHaveLength(1);
      expect(tickets.find((t) => t.station.id === 'station-1')!.items).toHaveLength(3);
      expect(tickets.some((t) => t.station.id === 'unrouted')).toBe(false);
    });
  });
});
