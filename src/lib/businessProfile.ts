// What kind of business this terminal runs, and which optional parts of the app
// that business gets.
//
// The register, inventory, customers, history, shifts and reports are the core:
// every business has them. Tables, the kitchen display and the QR menu are
// restaurant workflows, and they used to be hard-wired into navigation, so a
// clothing shop got an empty Tables screen and a Kitchen board. A profile is the
// switch that says which optional modules this terminal turns on.
//
// A profile is DATA, not a fork. It decides what is offered; checkout, stock,
// refunds and reporting are the same code for every profile.
//
// Pure and DOM-free, like the other lib/ modules.

import type { ScreenId } from './access';

/** Bumped when the shape of a stored profile changes, so old ones can be migrated. */
export const PROFILE_VERSION = 1;

/**
 * An optional part of the app. Core screens are not modules — they are always
 * there. Add a module here, and its screens to MODULES, to make a screen
 * switchable.
 */
export type ModuleId = 'tables' | 'kitchen' | 'qrmenu';

/** Starting points offered at setup. A template seeds `modules`; it does not lock them. */
export type BusinessTemplate = 'general-retail' | 'restaurant';

/**
 * The business this terminal runs: the template it started from and the optional
 * modules it has enabled. `modules` is the truth — `template` only records where
 * the operator began, so a shop that later adds the QR menu is still "retail"
 * with one extra module.
 */
export interface BusinessProfile {
  version: typeof PROFILE_VERSION;
  template: BusinessTemplate;
  modules: ModuleId[];
}

/**
 * The screens each optional module owns. A screen absent from every entry is
 * core and always available (to the roles allowed it).
 */
export const MODULES: Record<ModuleId, { screens: ReadonlyArray<ScreenId> }> = {
  tables: { screens: ['tables'] },
  kitchen: { screens: ['kitchen'] },
  qrmenu: { screens: ['qrmenu'] },
};

/** Every module, in the order settings lists them. */
export const MODULE_IDS = Object.keys(MODULES) as ModuleId[];

/**
 * The modules each template switches on.
 *
 * Restaurant is exactly what every install had before profiles existed, which is
 * what lets an existing terminal adopt it with nothing visibly changing.
 */
export const TEMPLATES: Record<BusinessTemplate, { modules: ReadonlyArray<ModuleId> }> = {
  'general-retail': { modules: [] },
  restaurant: { modules: ['tables', 'kitchen', 'qrmenu'] },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES) as BusinessTemplate[];

/** A fresh profile for a template. */
export function profileFromTemplate(template: BusinessTemplate): BusinessProfile {
  return { version: PROFILE_VERSION, template, modules: [...TEMPLATES[template].modules] };
}

/**
 * The profile an install that predates profiles is given. Restaurant, because
 * that is what the app was: the screens such a terminal already has must not
 * disappear on upgrade.
 */
export function legacyProfile(): BusinessProfile {
  return profileFromTemplate('restaurant');
}

/** Whether a module is switched on. */
export function isModuleEnabled(profile: BusinessProfile, module: ModuleId): boolean {
  return profile.modules.includes(module);
}

/**
 * Whether the profile offers a screen at all. Core screens always pass; a module
 * screen passes only while its module is on. Role access is a separate question
 * (see lib/access.ts) — a screen must clear both.
 */
export function isScreenEnabled(screen: ScreenId, profile: BusinessProfile): boolean {
  const owner = MODULE_IDS.find((id) => MODULES[id].screens.includes(screen));
  return owner === undefined || isModuleEnabled(profile, owner);
}

/** The same profile with one module switched on or off. Order follows MODULE_IDS. */
export function withModule(
  profile: BusinessProfile,
  module: ModuleId,
  enabled: boolean,
): BusinessProfile {
  const on = new Set(profile.modules);
  if (enabled) on.add(module);
  else on.delete(module);
  return { ...profile, modules: MODULE_IDS.filter((id) => on.has(id)) };
}

/**
 * Reads a stored profile back, or null when it cannot be trusted. Unknown module
 * names are dropped rather than failing: a profile written by a newer build must
 * not lock an older one out of its own settings.
 */
export function parseProfile(value: unknown): BusinessProfile | null {
  if (!value || typeof value !== 'object') return null;
  const { version, template, modules } = value as Record<string, unknown>;
  if (typeof version !== 'number' || version > PROFILE_VERSION) return null;
  if (typeof template !== 'string' || !(template in TEMPLATES)) return null;
  if (!Array.isArray(modules)) return null;
  const known = new Set<string>(MODULE_IDS);
  const on = new Set(modules.filter((m): m is string => typeof m === 'string' && known.has(m)));
  return {
    version: PROFILE_VERSION,
    template: template as BusinessTemplate,
    modules: MODULE_IDS.filter((id) => on.has(id)),
  };
}

/** What a terminal knows about its own setup. */
export interface BusinessSetup {
  businessProfile: BusinessProfile;
  /** False until the operator has been through first-run setup. */
  onboardingComplete: boolean;
}

/**
 * Decides a terminal's setup when its settings are loaded from storage.
 *
 *  - No stored settings at all: a fresh install, so whatever `initial` says
 *    (production starts un-onboarded; the dev/test demo starts configured).
 *  - Stored settings that record a setup: trust them, repairing a profile that
 *    no longer parses to the legacy one rather than losing the operator's screens.
 *  - Stored settings with no setup recorded: an install from before profiles.
 *    It is already in use, so it is NOT sent through onboarding, and it keeps the
 *    restaurant screens it has always had.
 */
export function resolveBusinessSetup(persisted: unknown, initial: BusinessSetup): BusinessSetup {
  if (!persisted || typeof persisted !== 'object' || Object.keys(persisted).length === 0) {
    return initial;
  }
  const stored = persisted as { businessProfile?: unknown; onboardingComplete?: unknown };
  if (typeof stored.onboardingComplete === 'boolean') {
    return {
      businessProfile: parseProfile(stored.businessProfile) ?? legacyProfile(),
      onboardingComplete: stored.onboardingComplete,
    };
  }
  return { businessProfile: legacyProfile(), onboardingComplete: true };
}
