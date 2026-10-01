import { describe, expect, it } from 'vitest';
import { isScreenAvailable, type ScreenId } from './access';
import {
  PROFILE_VERSION,
  isModuleEnabled,
  isScreenEnabled,
  legacyProfile,
  parseProfile,
  profileFromTemplate,
  resolveBusinessSetup,
  withModule,
  type BusinessSetup,
} from './businessProfile';

const RETAIL = profileFromTemplate('general-retail');
const RESTAURANT = profileFromTemplate('restaurant');

const CORE: ScreenId[] = [
  'register',
  'inventory',
  'history',
  'customers',
  'dashboard',
  'shift',
  'settings',
];
const FOOD: ScreenId[] = ['tables', 'kitchen', 'qrmenu'];

describe('templates', () => {
  it('general retail switches on no optional modules', () => {
    expect(RETAIL.modules).toEqual([]);
    expect(RETAIL.version).toBe(PROFILE_VERSION);
  });

  it('restaurant switches on every food module, as every install had before profiles', () => {
    expect(RESTAURANT.modules).toEqual(['tables', 'kitchen', 'qrmenu']);
  });

  it('hands out a copy, so editing one profile cannot change the template', () => {
    const a = profileFromTemplate('restaurant');
    a.modules.pop();
    expect(profileFromTemplate('restaurant').modules).toHaveLength(3);
  });
});

describe('screen availability', () => {
  it.each(CORE)('offers the core screen %s on every profile', (screen) => {
    expect(isScreenEnabled(screen, RETAIL)).toBe(true);
    expect(isScreenEnabled(screen, RESTAURANT)).toBe(true);
  });

  it.each(FOOD)('hides the food screen %s from a retail terminal', (screen) => {
    expect(isScreenEnabled(screen, RETAIL)).toBe(false);
  });

  it.each(FOOD)('restores the food screen %s on a restaurant terminal', (screen) => {
    expect(isScreenEnabled(screen, RESTAURANT)).toBe(true);
  });

  it('follows individual modules, not just the template', () => {
    const retailWithMenu = withModule(RETAIL, 'qrmenu', true);
    expect(retailWithMenu.template).toBe('general-retail');
    expect(isScreenEnabled('qrmenu', retailWithMenu)).toBe(true);
    expect(isScreenEnabled('kitchen', retailWithMenu)).toBe(false);
  });

  it('needs the role AND the profile', () => {
    // A cashier may open Tables by role, but not on a retail terminal.
    expect(isScreenAvailable('tables', 'cashier', RESTAURANT)).toBe(true);
    expect(isScreenAvailable('tables', 'cashier', RETAIL)).toBe(false);
    // And a restaurant terminal does not widen role access.
    expect(isScreenAvailable('settings', 'cashier', RESTAURANT)).toBe(false);
    expect(isScreenAvailable('qrmenu', 'cashier', RESTAURANT)).toBe(false);
  });
});

describe('withModule', () => {
  it('toggles a module without touching the rest, in a stable order', () => {
    const on = withModule(RETAIL, 'kitchen', true);
    expect(on.modules).toEqual(['kitchen']);
    expect(withModule(on, 'tables', true).modules).toEqual(['tables', 'kitchen']);
    expect(withModule(RESTAURANT, 'kitchen', false).modules).toEqual(['tables', 'qrmenu']);
  });

  it('does not mutate its input', () => {
    withModule(RESTAURANT, 'tables', false);
    expect(isModuleEnabled(RESTAURANT, 'tables')).toBe(true);
  });
});

describe('parseProfile', () => {
  it('round-trips a valid profile', () => {
    expect(parseProfile(JSON.parse(JSON.stringify(RESTAURANT)))).toEqual(RESTAURANT);
  });

  it('drops modules this build does not know, rather than rejecting the profile', () => {
    const parsed = parseProfile({ version: 1, template: 'restaurant', modules: ['tables', 'spa'] });
    expect(parsed?.modules).toEqual(['tables']);
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'restaurant'],
    ['an unknown template', { version: 1, template: 'bank', modules: [] }],
    ['a missing module list', { version: 1, template: 'restaurant' }],
    ['a newer version', { version: PROFILE_VERSION + 1, template: 'restaurant', modules: [] }],
    ['a non-numeric version', { version: '1', template: 'restaurant', modules: [] }],
    ['a zero version', { version: 0, template: 'restaurant', modules: [] }],
    ['a negative version', { version: -1, template: 'restaurant', modules: [] }],
    ['a fractional version', { version: 0.5, template: 'restaurant', modules: [] }],
    ['a NaN version', { version: Number.NaN, template: 'restaurant', modules: [] }],
  ])('refuses %s', (_label, value) => {
    expect(parseProfile(value)).toBeNull();
  });
});

describe('resolveBusinessSetup', () => {
  const FRESH: BusinessSetup = { businessProfile: RETAIL, onboardingComplete: false };

  it('leaves a fresh install on its initial setup, un-onboarded', () => {
    expect(resolveBusinessSetup(undefined, FRESH)).toBe(FRESH);
    expect(resolveBusinessSetup(null, FRESH)).toBe(FRESH);
    expect(resolveBusinessSetup({}, FRESH)).toBe(FRESH);
  });

  it('adopts an install from before profiles as a restaurant, already onboarded', () => {
    // What every existing terminal has on disk: settings, but no profile.
    const stored = { settings: { storeName: 'Corner Cafe' }, darkMode: true };
    const setup = resolveBusinessSetup(stored, FRESH);
    expect(setup.businessProfile).toEqual(legacyProfile());
    expect(setup.businessProfile.modules).toEqual(['tables', 'kitchen', 'qrmenu']);
    expect(setup.onboardingComplete).toBe(true);
  });

  it('trusts a stored setup', () => {
    const stored = { businessProfile: RETAIL, onboardingComplete: true };
    expect(resolveBusinessSetup(stored, FRESH)).toEqual({
      businessProfile: RETAIL,
      onboardingComplete: true,
    });
  });

  it('keeps a half-finished first run un-onboarded across a restart', () => {
    // The language or theme can be changed on the setup screen, which persists
    // the store before onboarding is complete. That must not read as "an old
    // install" and skip setup.
    const stored = { darkMode: false, businessProfile: RETAIL, onboardingComplete: false };
    expect(resolveBusinessSetup(stored, FRESH).onboardingComplete).toBe(false);
  });

  it('falls back to the restaurant screens when a stored profile is unreadable', () => {
    const stored = { businessProfile: { nonsense: true }, onboardingComplete: true };
    const setup = resolveBusinessSetup(stored, FRESH);
    expect(setup.businessProfile).toEqual(legacyProfile());
    expect(setup.onboardingComplete).toBe(true);
  });
});
