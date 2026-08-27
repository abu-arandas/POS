import { describe, it, expect } from 'vitest';
import {
  hashPin,
  hashPinSalted,
  hashPinSaltedLegacy,
  hashPinSaltedLegacySync,
  hashPinSaltedSync,
  sha256HexSync,
} from '../../src/lib/hash';

// Known SHA-256 vectors. These protect the explicit legacy verification path
// used while existing account hashes migrate to PBKDF2.
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
  // 600,000 iterations of the pure-JS fallback is deliberately expensive — that
  // is the whole point of the work factor. It runs in roughly 15 s here and
  // ~35 s under v8 coverage instrumentation, so the budget has to clear the
  // instrumented figure or `npm run test:coverage` fails while `npm test`
  // passes, which is a confusing way to find out.
  it('matches an independent PBKDF2-SHA-256 reference vector', async () => {
    const saltedHash = await hashPinSalted('u123', '1234');
    expect(saltedHash).toBe(
      'v2$600000$9b2e37bf6f878649d3d422d6dd6286a6$c48078a2acc6d963694bcd4261a95815cbf2b0e8dea87d349e1368e28fae2ce1',
    );
    expect(hashPinSaltedSync('u123', '1234')).toBe(saltedHash);
  }, 120_000);

  it('produces different hashes for the same pin with different users', async () => {
    const hash1 = await hashPinSalted('user1', '0000');
    const hash2 = await hashPinSalted('user2', '0000');
    expect(hash1).not.toBe(hash2);
  });

  it('keeps explicit legacy SHA-256 helpers for account migration', async () => {
    const expected = '7279202b4bc5a1b671df119c7be961807f00fb16cc4d2e6a7c3b628dbd7e8245';
    await expect(hashPinSaltedLegacy('u123', '1234')).resolves.toBe(expected);
    expect(hashPinSaltedLegacySync('u123', '1234')).toBe(expected);
  });
});
