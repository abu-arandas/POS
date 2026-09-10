import { UserAccount } from '../types';

/**
 * Every navigable screen in the app. Keyed by SCREEN_ROLES, so adding a
 * screen here forces its role list to be declared too.
 */
export type ScreenId =
  | 'register'
  | 'inventory'
  | 'history'
  | 'customers'
  | 'dashboard'
  | 'shift'
  | 'settings'
  | 'qrmenu'
  | 'fleet';

/**
 * Single source of truth for which roles may open which screen. The sidebar,
 * the mobile menu, and the App-level render guard all read from this map so
 * they can never disagree.
 *
 * `fleet` is the super-admin board. Terminal role alone never grants it — it is
 * additionally gated on a resolved super-admin cloud membership (see App). It's
 * listed as admin-only here so the type stays exhaustive and a non-admin can
 * never reach it even if the extra gate were bypassed.
 */
export const SCREEN_ROLES: Record<ScreenId, ReadonlyArray<UserAccount['role']>> = {
  register: ['admin', 'manager', 'cashier'],
  dashboard: ['admin', 'manager'],
  // Cashiers reach only the purchasing sections; INVENTORY_TAB_ROLES below
  // decides what they actually see once inside.
  inventory: ['admin', 'manager', 'cashier'],
  history: ['admin', 'manager', 'cashier'],
  customers: ['admin', 'manager'],
  shift: ['admin', 'manager', 'cashier'],
  qrmenu: ['admin', 'manager'],
  settings: ['admin'],
  fleet: ['admin'],
};

/**
 * Whether a role may open a screen. The single predicate behind the sidebar,
 * the mobile menu, and the App-level render guard.
 */
export function isScreenAllowed(screen: ScreenId, role: UserAccount['role']): boolean {
  return SCREEN_ROLES[screen].includes(role);
}

/**
 * The sections of the Inventory screen. Keyed by INVENTORY_TAB_ROLES, so a new
 * tab cannot be added without deciding who may see it.
 */
export type InventoryTabId = 'products' | 'categories' | 'suppliers' | 'orders' | 'log';

/**
 * Which roles may open which Inventory section.
 *
 * The screen used to be all-or-nothing: reaching purchasing at all meant
 * admin or manager, because purchase orders live inside Inventory. A cashier
 * who does the ordering therefore could not raise one.
 *
 * Splitting it per tab is what lets a cashier order stock without handing them
 * the catalogue's economics. Purchasing necessarily shows the unit cost of the
 * lines being ordered — that is the document — but Products lists cost and
 * margin for everything the shop sells, and the Stock Log is the adjustment
 * audit trail. Those stay with admins and managers.
 */
export const INVENTORY_TAB_ROLES: Record<InventoryTabId, ReadonlyArray<UserAccount['role']>> = {
  products: ['admin', 'manager'],
  categories: ['admin', 'manager'],
  suppliers: ['admin', 'manager', 'cashier'],
  orders: ['admin', 'manager', 'cashier'],
  log: ['admin', 'manager'],
};

/**
 * Whether a role may open an Inventory section.
 */
export function isInventoryTabAllowed(tab: InventoryTabId, role: UserAccount['role']): boolean {
  return INVENTORY_TAB_ROLES[tab].includes(role);
}

/**
 * The Inventory sections a role may open, in display order. Empty means the
 * role has no business on the screen at all.
 */
export function allowedInventoryTabs(role: UserAccount['role']): InventoryTabId[] {
  return (Object.keys(INVENTORY_TAB_ROLES) as InventoryTabId[]).filter((tab) =>
    isInventoryTabAllowed(tab, role),
  );
}
