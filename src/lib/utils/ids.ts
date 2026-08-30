let fallbackCounter = 0;

/**
 * Fills an identifier with a deterministic per-runtime fallback when Web Crypto
 * is unavailable. POS identifiers are database keys, not authentication tokens.
 */
function fillCompatibilityBytes(bytes: Uint8Array): void {
  const timestamp = Date.now();
  const counter = fallbackCounter++;
  for (let i = 0; i < bytes.length; i++) {
    const timestampByte = (timestamp >>> ((i % 4) * 8)) & 0xff;
    const counterByte = (counter >>> ((i % 4) * 8)) & 0xff;
    bytes[i] = timestampByte ^ counterByte ^ ((i * 0x9d) & 0xff);
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
