// Pure helpers for the store & staff management screen (Phase 3). DOM-free and
// deterministic so they unit-test like the other lib/* helpers. The Supabase
// writes live in ./fleetClient; this module only validates and shapes input.

import { Role } from '../types';

export interface StoreFormInput {
  name: string;
  address?: string;
  timezone: string;
  currency: string;
}

export interface StoreFormErrors {
  name?: string;
  timezone?: string;
  currency?: string;
}

// Roles a super-admin can assign to a per-store membership. `superadmin` is an
// org-wide tier (store_id is null) and is never handed out per store here.
export const ASSIGNABLE_ROLES: Role[] = ['admin', 'manager', 'cashier'];

export function isAssignableRole(role: string): role is Role {
  return (ASSIGNABLE_ROLES as string[]).includes(role);
}

// Field-level validation. Returns an errors object; empty means valid.
export function validateStoreForm(input: StoreFormInput): StoreFormErrors {
  const errors: StoreFormErrors = {};
  if (!input.name.trim()) errors.name = 'required';
  else if (input.name.trim().length > 80) errors.name = 'tooLong';
  if (!input.timezone.trim()) errors.timezone = 'required';
  if (!input.currency.trim()) errors.currency = 'required';
  else if (input.currency.trim().length > 4) errors.currency = 'tooLong';
  return errors;
}

export function isStoreFormValid(input: StoreFormInput): boolean {
  return Object.keys(validateStoreForm(input)).length === 0;
}

// Derives a URL-safe, collision-free store id from a name. Falls back to
// 'store' when the name has no usable characters, and appends -2, -3, … when an
// id is already taken.
export function slugifyStoreId(name: string, existingIds: string[] = []): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'store';
  const taken = new Set(existingIds);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// Normalizes raw form input into a persistable shape (trimmed, empty address
// dropped). The caller supplies id/orgId/status/createdAt.
export function normalizeStoreForm(input: StoreFormInput): StoreFormInput {
  const address = input.address?.trim();
  return {
    name: input.name.trim(),
    timezone: input.timezone.trim(),
    currency: input.currency.trim(),
    ...(address ? { address } : {}),
  };
}
