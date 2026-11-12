/**
 * Whether this terminal needs a Supabase device account to sync, as recorded
 * on the persisted config.
 *
 * The credentials themselves are session secrets — settingsStore strips them
 * from what it writes to IndexedDB — so after a restart the form comes back
 * blank whether or not a device account was ever configured. That makes a
 * blank form worthless as evidence: it cannot tell "this install syncs
 * anonymously" from "the password simply is not loaded yet". Recording
 * `false` from a blank form is what would wrongly mark a credentialed
 * terminal as credential-free, and a credential-free terminal is the one case
 * that keeps its "connected" badge across a restart.
 *
 * So the answer is only recomputed from a round trip that actually reached
 * Supabase, where the fields in hand are the ones that were just used. Every
 * other save carries the stored answer forward untouched.
 */
export function resolveDeviceAuthConfigured(
  stored: boolean | undefined,
  observed?: { authEmail: string; authPassword: string },
): boolean | undefined {
  if (!observed) return stored;
  return Boolean(observed.authEmail.trim() && observed.authPassword);
}
