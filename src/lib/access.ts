import { UserAccount } from '../types';

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

// Single source of truth for which roles may open which screen. The sidebar,
// the mobile menu, and the App-level render guard all read from this map so
// they can never disagree.
//
// `fleet` is the super-admin board. Terminal role alone never grants it — it is
// additionally gated on a resolved super-admin cloud membership (see App). It's
// listed as admin-only here so the type stays exhaustive and a non-admin can
// never reach it even if the extra gate were bypassed.
export const SCREEN_ROLES: Record<ScreenId, ReadonlyArray<UserAccount['role']>> = {
  register: ['admin', 'manager', 'cashier'],
  dashboard: ['admin', 'manager'],
  inventory: ['admin', 'manager'],
  history: ['admin', 'manager', 'cashier'],
  customers: ['admin', 'manager'],
  shift: ['admin', 'manager', 'cashier'],
  qrmenu: ['admin', 'manager'],
  settings: ['admin'],
  fleet: ['admin'],
};

export function isScreenAllowed(screen: ScreenId, role: UserAccount['role']): boolean {
  return SCREEN_ROLES[screen].includes(role);
}
