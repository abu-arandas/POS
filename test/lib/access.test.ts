import { describe, it, expect } from 'vitest';
import {
  allowedInventoryTabs,
  isInventoryTabAllowed,
  isScreenAllowed,
  SCREEN_ROLES,
  ScreenId,
} from '../../src/lib/access';

describe('isScreenAllowed', () => {
  it('lets admins open every screen', () => {
    (Object.keys(SCREEN_ROLES) as ScreenId[]).forEach((screen) => {
      expect(isScreenAllowed(screen, 'admin')).toBe(true);
    });
  });

  it('blocks managers from settings only', () => {
    expect(isScreenAllowed('settings', 'manager')).toBe(false);
    expect(isScreenAllowed('dashboard', 'manager')).toBe(true);
    expect(isScreenAllowed('inventory', 'manager')).toBe(true);
    expect(isScreenAllowed('customers', 'manager')).toBe(true);
  });

  it('restricts cashiers to the till, their history, their shift and purchasing', () => {
    expect(isScreenAllowed('register', 'cashier')).toBe(true);
    expect(isScreenAllowed('history', 'cashier')).toBe(true);
    expect(isScreenAllowed('shift', 'cashier')).toBe(true);
    // Inventory opens for a cashier so they can raise a purchase order, but
    // only its purchasing sections render — see the Inventory sections block
    // below, which is what actually keeps cost and margin away from them.
    expect(isScreenAllowed('inventory', 'cashier')).toBe(true);
    for (const screen of ['customers', 'dashboard', 'settings', 'qrmenu', 'fleet'] as const) {
      expect(isScreenAllowed(screen, 'cashier')).toBe(false);
    }
  });
});

describe('Inventory sections', () => {
  it('lets a cashier reach purchasing and nothing else', () => {
    // The point of splitting the screen: a cashier who does the ordering can
    // raise a purchase order without being handed the catalogue's economics.
    expect(allowedInventoryTabs('cashier')).toEqual(['suppliers', 'orders']);
  });

  it('keeps cost, margin and the adjustment trail away from a cashier', () => {
    // Products lists cost and margin for everything the shop sells; the stock
    // log is the adjustment audit trail. Purchasing shows the unit cost of the
    // lines being ordered, which is the document itself, and is allowed.
    expect(isInventoryTabAllowed('products', 'cashier')).toBe(false);
    expect(isInventoryTabAllowed('categories', 'cashier')).toBe(false);
    expect(isInventoryTabAllowed('log', 'cashier')).toBe(false);
  });

  it('leaves admins and managers with the whole screen', () => {
    for (const role of ['admin', 'manager'] as const) {
      expect(allowedInventoryTabs(role)).toEqual([
        'products',
        'categories',
        'suppliers',
        'orders',
        'log',
      ]);
    }
  });

  it('opens the screen to every role that has a section in it', () => {
    // The two rules have to agree: a role with a visible section must be able
    // to open Inventory, and a role with none must not reach it at all.
    for (const role of ['admin', 'manager', 'cashier'] as const) {
      expect(isScreenAllowed('inventory', role)).toBe(allowedInventoryTabs(role).length > 0);
    }
  });
});
