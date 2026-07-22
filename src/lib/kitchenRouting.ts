import { SaleTransaction, OrderItem, KitchenStation } from '../types';

export interface StationTicket {
  station: KitchenStation;
  items: OrderItem[];
}

// Splits a sale's items across kitchen stations by product category.
//
// `categoryOf` maps a productId to its category id (built from the live catalog
// by the caller). An item is routed to every station whose categoryIds include
// its category — normally that's exactly one station, but assigning a category
// to several stations intentionally fans the item out to each (e.g. an expo
// copy). Items whose category matches no station are collected under a synthetic
// "unrouted" ticket so nothing silently disappears; the caller can print or
// ignore it. Returns only tickets that have at least one item, preserving the
// given station order.
export function routeKitchenTickets(
  tx: Pick<SaleTransaction, 'items'>,
  stations: KitchenStation[],
  categoryOf: (productId: string) => string | undefined,
): StationTicket[] {
  const tickets: StationTicket[] = [];

  for (const station of stations) {
    const items = tx.items.filter((item) => {
      const cat = categoryOf(item.productId);
      return cat !== undefined && station.categoryIds.includes(cat);
    });
    if (items.length > 0) tickets.push({ station, items });
  }

  // Anything not claimed by a station still needs to reach the kitchen.
  const routedProductIds = new Set(
    tickets.flatMap((ticket) => ticket.items.map((i) => i.productId)),
  );
  const unrouted = tx.items.filter((item) => !routedProductIds.has(item.productId));
  if (unrouted.length > 0) {
    tickets.push({
      station: { id: 'unrouted', name: 'Kitchen', categoryIds: [] },
      items: unrouted,
    });
  }

  return tickets;
}
