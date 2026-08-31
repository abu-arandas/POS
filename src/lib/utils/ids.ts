type CompatibilityState = {
  counter: bigint;
};

type RuntimeWithShortIdState = typeof globalThis & {
  __eaPosShortIdState?: CompatibilityState;
};

/**
 * Keep the fallback counter on the runtime rather than only in this module.
 * Bundlers, test runners, and mixed ESM/CJS consumers can load two copies of a
 * module; a module-local counter in each copy would then be able to repeat IDs.
 */
const runtime = globalThis as RuntimeWithShortIdState;
const fallbackState: CompatibilityState =
  runtime.__eaPosShortIdState ?? (runtime.__eaPosShortIdState = { counter: 0n });

/**
 * Fills an identifier with a deterministic per-runtime fallback when Web Crypto
 * is unavailable. POS identifiers are database keys, not authentication tokens.
 * The timestamp and 64-bit monotonic counter provide distinct values for calls
 * made in the same millisecond and remain unique well beyond 32-bit counters.
 */
function fillCompatibilityBytes(bytes: Uint8Array): void {
  const timestamp = BigInt(Date.now());
  const counter = fallbackState.counter++;

  for (let i = 0; i < 8; i++) {
    bytes[i] = Number((timestamp >> BigInt(i * 8)) & 0xffn);
    bytes[i + 8] = Number((counter >> BigInt(i * 8)) & 0xffn);
  }
}

/**
 * Generates a runtime identifier using Web Crypto when available, with a
 * compatibility fallback for plain-HTTP or unusual runtimes.
 */
export function shortId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    fillCompatibilityBytes(bytes);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
