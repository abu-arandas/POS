import { UserAccount } from '../types';

export type ScreenId =
  'register' | 'inventory' | 'history' | 'customers' | 'dashboard' | 'settings' | 'qrmenu';

// Single source of truth for which roles may open which screen. The sidebar,
// the mobile menu, and the App-level render guard all read from this map so
// they can never disagree.
export const SCREEN_ROLES: Record<ScreenId, ReadonlyArray<UserAccount['role']>> = {
  register: ['admin', 'manager', 'cashier'],
  dashboard: ['admin', 'manager'],
  inventory: ['admin', 'manager'],
  history: ['admin', 'manager', 'cashier'],
  customers: ['admin', 'manager'],
  qrmenu: ['admin', 'manager'],
  settings: ['admin'],
};

export function isScreenAllowed(screen: ScreenId, role: UserAccount['role']): boolean {
  return SCREEN_ROLES[screen].includes(role);
}
