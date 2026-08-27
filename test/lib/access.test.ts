import { describe, it, expect } from 'vitest';
import { isScreenAllowed, SCREEN_ROLES, ScreenId } from '../../src/lib/access';

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

  it('restricts cashiers to register and history', () => {
    expect(isScreenAllowed('register', 'cashier')).toBe(true);
    expect(isScreenAllowed('history', 'cashier')).toBe(true);
    for (const screen of ['inventory', 'customers', 'dashboard', 'settings', 'qrmenu'] as const) {
      expect(isScreenAllowed(screen, 'cashier')).toBe(false);
    }
  });
});
