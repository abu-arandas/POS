// Who may authorize a refund a cashier is not permitted to issue on their own.
//
// This is the widest PIN surface in the application. The lock screen checks one
// PIN against the ONE account the operator named; this checks a PIN against
// EVERY manager and admin at once, because the person holding the till has not
// said whose PIN they are about to type. That makes it strictly easier to guess
// than a login — the throttle around it (pinThrottle, keyed to the override
// rather than an account) is what keeps that from mattering.
//
// The decision is pure and lives here so it can be tested without rendering the
// history screen. The throttle state, the error copy and the refund itself stay
// with the caller.

import { UserAccount } from '../types';
import { verifyPinHash } from './hash';

/**
 * Roles that may authorize a refund override. A cashier cannot authorize their
 * own — that is the entire point of the prompt.
 */
export const OVERRIDE_ROLES: ReadonlyArray<UserAccount['role']> = ['manager', 'admin'];

/**
 * Staff whose PIN would be accepted: active, and holding an override role.
 * Deactivated accounts are excluded, so revoking someone in Settings revokes
 * their ability to authorize a refund at the same moment.
 */
export function overrideCandidates(users: UserAccount[]): UserAccount[] {
  return users.filter((user) => user.active && OVERRIDE_ROLES.includes(user.role));
}

/**
 * Resolves which manager or admin the supplied PIN authorizes, or null.
 *
 * Every candidate is hashed and compared, rather than returning early on the
 * first match: each account has its own salt, so there is one hash per
 * candidate no matter what, and comparing them all keeps the work — and so the
 * time — independent of WHERE in the list the matching account sits. An early
 * return would let the duration of a rejected guess leak the position of a
 * valid account.
 *
 * Every stored hash version is accepted, because verifyPinHash checks each
 * account at the version and work factor its own hash records. An account that
 * has not signed in since the PBKDF2 upgrade still carries a v1 hash, and one
 * hashed before the work factor was last raised carries the old count; refusing
 * either here would make the override fail for a manager whose PIN is correct.
 */
export async function authorizeOverride(
  users: UserAccount[],
  pin: string,
): Promise<UserAccount | null> {
  const candidates = overrideCandidates(users);
  if (candidates.length === 0 || !pin) return null;

  const checks = await Promise.all(candidates.map((user) => verifyPinHash(user.id, pin, user.pin)));

  let authorized: UserAccount | null = null;
  candidates.forEach((user, index) => {
    if (authorized) return;
    if (checks[index].ok) authorized = user;
  });
  return authorized;
}

/**
 * How an authorizer is recorded on the refunded transaction — "Ada (manager)".
 * Both the override path and the already-privileged path go through this, so
 * the audit trail reads the same however the refund was authorized.
 */
export function authorizerLabel(user: Pick<UserAccount, 'name' | 'role'>): string {
  return `${user.name} (${user.role})`;
}
