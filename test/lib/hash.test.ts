import { describe, it, expect } from 'vitest';
import { hashPin, hashPinSalted, sha256HexSync } from '../../src/lib/hash';

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

describe('hashPinSalted', () => {
  it('combines userId and pin properly', async () => {
    // The salt format is userId:pin
    // sha256("u123:1234") -> 7279202b4bc5a1b671df119c7be961807f00fb16cc4d2e6a7c3b628dbd7e8245
    const saltedHash = await hashPinSalted('u123', '1234');
    expect(saltedHash).toBe('7279202b4bc5a1b671df119c7be961807f00fb16cc4d2e6a7c3b628dbd7e8245');
  });

  it('produces different hashes for the same pin with different users', async () => {
    const hash1 = await hashPinSalted('user1', '0000');
    const hash2 = await hashPinSalted('user2', '0000');
    expect(hash1).not.toBe(hash2);
  });
});
