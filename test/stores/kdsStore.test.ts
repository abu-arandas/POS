import { describe, it, expect, beforeEach } from 'vitest';
import { useKdsStore } from '../../src/stores/kdsStore';

// The kitchen display arrived with essentially no coverage — 5.7% of statements
// and none of its branches — while carrying the two pieces of state a kitchen
// actually depends on: the order a ticket moves through, and the number printed
// on it. The numbering was already wrong (derived from tickets.length, which
// falls when a ticket is bumped, so numbers came round again on a docket still
// on the rail).

const ITEM = {
  productId: 'p-1',
  productName: 'Burger',
  quantity: 1,
};

const reset = () =>
  useKdsStore.setState({
    tickets: [],
    recentlyBumped: [],
    activeStationFilter: 'all',
    autoSound: true,
    ticketSeq: 0,
  });

type AddTicketParams = Parameters<ReturnType<typeof useKdsStore.getState>['addTicket']>[0];

const add = (over: Partial<AddTicketParams> = {}) =>
  useKdsStore.getState().addTicket({ orderType: 'dine_in', items: [ITEM], ...over });

describe('kdsStore ticket numbering', () => {
  beforeEach(reset);

  it('numbers tickets in sequence', () => {
    expect(add().orderNumber).toBe('#001');
    expect(add().orderNumber).toBe('#002');
    expect(add().orderNumber).toBe('#003');
  });

  it('keeps climbing after a ticket is bumped off the rail', () => {
    // The regression this guards: numbering from tickets.length meant bumping
    // #001 made the next ticket #001 again, so two dockets in the same service
    // carried one number.
    const first = add();
    add();
    useKdsStore.getState().bumpTicket(first.id); // pending -> preparing
    useKdsStore.getState().bumpTicket(first.id); // preparing -> ready
    useKdsStore.getState().bumpTicket(first.id); // ready -> completed, off the rail
    expect(useKdsStore.getState().tickets).toHaveLength(1);
    expect(add().orderNumber).toBe('#003');
  });

  it('takes an explicit order number over the counter', () => {
    expect(add({ orderNumber: 'TX-9' }).orderNumber).toBe('TX-9');
  });

  it('gives every ticket and item its own id', () => {
    const a = add({ items: [ITEM, ITEM] });
    const b = add();
    expect(a.id).not.toBe(b.id);
    expect(a.items[0].id).not.toBe(a.items[1].id);
  });

  it('starts every item unticked and the ticket pending', () => {
    const ticket = add();
    expect(ticket.status).toBe('pending');
    expect(ticket.items.every((i) => i.completed === false)).toBe(true);
  });

  it('puts the newest ticket first', () => {
    add();
    const second = add();
    expect(useKdsStore.getState().tickets[0].id).toBe(second.id);
  });
});

describe('kdsStore bump ladder', () => {
  beforeEach(reset);

  it('walks pending -> preparing -> ready, then off the rail', () => {
    const ticket = add();
    const statusOf = () => useKdsStore.getState().tickets[0]?.status;

    useKdsStore.getState().bumpTicket(ticket.id);
    expect(statusOf()).toBe('preparing');

    useKdsStore.getState().bumpTicket(ticket.id);
    expect(statusOf()).toBe('ready');

    useKdsStore.getState().bumpTicket(ticket.id);
    expect(useKdsStore.getState().tickets).toHaveLength(0);
    expect(useKdsStore.getState().recentlyBumped[0].status).toBe('completed');
    expect(useKdsStore.getState().recentlyBumped[0].completedAt).toBeTruthy();
  });

  it('ignores a bump for a ticket that is not on the rail', () => {
    add();
    useKdsStore.getState().bumpTicket('nope');
    expect(useKdsStore.getState().tickets[0].status).toBe('pending');
  });

  it('recalls the last bumped ticket back as ready', () => {
    // A ticket bumped by mistake has to come back, and come back actionable —
    // restoring it as 'completed' would put it straight back off the rail.
    const ticket = add();
    for (let i = 0; i < 3; i += 1) useKdsStore.getState().bumpTicket(ticket.id);

    const restored = useKdsStore.getState().recallTicket();
    expect(restored?.id).toBe(ticket.id);
    expect(restored?.status).toBe('ready');
    expect(restored?.completedAt).toBeUndefined();
    expect(useKdsStore.getState().tickets).toHaveLength(1);
    expect(useKdsStore.getState().recentlyBumped).toHaveLength(0);
  });

  it('returns null when there is nothing to recall', () => {
    expect(useKdsStore.getState().recallTicket()).toBeNull();
  });

  it('caps the recall buffer rather than growing without limit', () => {
    for (let i = 0; i < 20; i += 1) {
      const ticket = add();
      for (let b = 0; b < 3; b += 1) useKdsStore.getState().bumpTicket(ticket.id);
    }
    expect(useKdsStore.getState().recentlyBumped).toHaveLength(15);
  });
});

describe('kdsStore item ticking', () => {
  beforeEach(reset);

  it('toggles one item without touching its neighbours', () => {
    const ticket = add({ items: [ITEM, { ...ITEM, productName: 'Fries' }] });
    const [first, second] = ticket.items;

    useKdsStore.getState().toggleItemComplete(ticket.id, first.id);
    const live = useKdsStore.getState().tickets[0];
    expect(live.items.find((i) => i.id === first.id)?.completed).toBe(true);
    expect(live.items.find((i) => i.id === second.id)?.completed).toBe(false);

    useKdsStore.getState().toggleItemComplete(ticket.id, first.id);
    expect(useKdsStore.getState().tickets[0].items[0].completed).toBe(false);
  });

  it('leaves other tickets alone', () => {
    const a = add();
    const b = add();
    useKdsStore.getState().toggleItemComplete(a.id, a.items[0].id);
    const liveB = useKdsStore.getState().tickets.find((t) => t.id === b.id);
    expect(liveB?.items[0].completed).toBe(false);
  });
});

describe('kdsStore filters and clearing', () => {
  beforeEach(reset);

  it('records the station filter', () => {
    useKdsStore.getState().setActiveStationFilter('Grill');
    expect(useKdsStore.getState().activeStationFilter).toBe('Grill');
  });

  it('toggles the chime', () => {
    expect(useKdsStore.getState().autoSound).toBe(true);
    useKdsStore.getState().toggleAutoSound();
    expect(useKdsStore.getState().autoSound).toBe(false);
  });

  it('empties the recall buffer and drops tickets marked complete directly', () => {
    const kept = add();
    const done = add();
    useKdsStore.getState().updateTicketStatus(done.id, 'completed');

    useKdsStore.getState().clearCompletedTickets();
    expect(useKdsStore.getState().recentlyBumped).toHaveLength(0);
    expect(useKdsStore.getState().tickets.map((t) => t.id)).toEqual([kept.id]);
  });

  it('stamps completedAt only when the status becomes completed', () => {
    const ticket = add();
    useKdsStore.getState().updateTicketStatus(ticket.id, 'preparing');
    expect(useKdsStore.getState().tickets[0].completedAt).toBeUndefined();

    useKdsStore.getState().updateTicketStatus(ticket.id, 'completed');
    expect(useKdsStore.getState().tickets[0].completedAt).toBeTruthy();
  });
});
