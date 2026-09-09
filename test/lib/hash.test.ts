import { describe, it, expect } from 'vitest';
import {
  hashPin,
  hashPinSalted,
  hashPinSaltedLegacy,
  hashPinSaltedLegacySync,
  hashPinSaltedSync,
  sha256HexSync,
  verifyPinHash,
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

// The hash format records the work factor each digest was derived at
// (`v2$<iterations>$<salt>$<digest>`), and verifyPinHash derives with THAT
// value rather than the constant this build ships. Without it, raising
// PBKDF2_ITERATIONS would lock every operator out of the till: verification
// compared whole strings, so the iteration count was part of the comparison and
// a correct PIN was refused on the prefix alone, with no way back in.
describe('verifyPinHash', () => {
  /** The hash the app would have stored had PBKDF2_ITERATIONS been `iterations`. */
  async function hashAtWorkFactor(userId: string, pin: string, iterations: number) {
    const saltHex = (await hashPinSalted(userId, pin)).split('$')[2];
    const saltBytes = saltHex.match(/../g) ?? [];
    const salt = Uint8Array.from(saltBytes.map((byte) => Number.parseInt(byte, 16)));
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(pin),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await globalThis.crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      key,
      256,
    );
    const digest = Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join(
      '',
    );
    return `v2$${iterations}$${saltHex}$${digest}`;
  }

  it('accepts a hash derived at a different work factor, and asks to be upgraded', async () => {
    const stored = await hashAtWorkFactor('u123', '1234', 1_000);
    expect(await verifyPinHash('u123', '1234', stored)).toEqual({ ok: true, needsUpgrade: true });
  });

  it('still refuses the wrong PIN at that other work factor', async () => {
    const stored = await hashAtWorkFactor('u123', '1234', 1_000);
    expect(await verifyPinHash('u123', '9999', stored)).toEqual({ ok: false, needsUpgrade: false });
  });

  it('accepts a current-factor hash without asking for an upgrade', async () => {
    const stored = await hashPinSalted('u123', '1234');
    expect(await verifyPinHash('u123', '1234', stored)).toEqual({ ok: true, needsUpgrade: false });
  });

  it('accepts a v1 legacy digest and asks to be upgraded', async () => {
    const stored = hashPinSaltedLegacySync('u123', '1234');
    expect(await verifyPinHash('u123', '1234', stored)).toEqual({ ok: true, needsUpgrade: true });
    expect(await verifyPinHash('u123', '0000', stored)).toEqual({ ok: false, needsUpgrade: false });
  });

  it("refuses a hash carrying another account's salt", async () => {
    // The recorded salt is checked against the one this account derives, so a
    // row copied from a colleague does not authenticate as this user even
    // though the PIN inside it is correct.
    const otherUsersHash = await hashPinSalted('u456', '1234');
    expect(await verifyPinHash('u123', '1234', otherUsersHash)).toEqual({
      ok: false,
      needsUpgrade: false,
    });
  });

  it('refuses a malformed stored value instead of throwing at the login prompt', async () => {
    const refused = { ok: false, needsUpgrade: false };
    for (const stored of [
      '',
      'v2$600000$deadbeef', // truncated
      'v2$notanumber$9b2e37bf6f878649d3d422d6dd6286a6$' + 'a'.repeat(64),
      'v2$0$9b2e37bf6f878649d3d422d6dd6286a6$' + 'a'.repeat(64), // zero iterations
      'v3$600000$9b2e37bf6f878649d3d422d6dd6286a6$' + 'a'.repeat(64), // unknown version
      'v2$600000$nothex$' + 'a'.repeat(64),
    ]) {
      expect(await verifyPinHash('u123', '1234', stored)).toEqual(refused);
    }
  });
});
