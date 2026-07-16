import { describe, it, expect } from 'vitest';
import { hashPin, sha256HexSync } from './hash';

// Known SHA-256 vectors. '1234' is also the seeded admin PIN hash used in
// authStore/schema.sql — if these drift, default logins break.
const VECTORS: Array<[string, string]> = [
  ['1234', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'],
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
];

describe('sha256HexSync (insecure-context fallback)', () => {
  it('matches known SHA-256 vectors', () => {
    for (const [input, digest] of VECTORS) {
      expect(sha256HexSync(input)).toBe(digest);
    }
  });

  it('handles multi-block (>55 byte) and multi-byte inputs', () => {
    const long = 'a'.repeat(200);
    // Compare against WebCrypto (available in the Node test env).
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(long)).then((buf) => {
      const expected = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      expect(sha256HexSync(long)).toBe(expected);
    });
  });

  it('agrees with hashPin (WebCrypto path)', async () => {
    for (const [input, digest] of VECTORS) {
      await expect(hashPin(input)).resolves.toBe(digest);
    }
  });
});
