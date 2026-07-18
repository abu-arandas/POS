import { describe, it, expect } from 'vitest';
import { hashPin, hashUserPin, sha256HexSync, verifyUserPin } from './hash';

// Known SHA-256 vectors ('1234' is the legacy unsalted admin hash).
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

describe('id-salted PIN scheme', () => {
  it('matches the seeded default hashes (authStore / schema.sql)', async () => {
    // If these drift, default logins on a fresh install break.
    await expect(hashUserPin('u-1', '1234')).resolves.toBe(
      '2efd4458fced12834fc6f39317faa5a689dde4ec088267d768a3b3b0193ccbcf',
    );
    await expect(hashUserPin('admin-1', '1234')).resolves.toBe(
      '2b2aa6698b009065652d34c08b24aa244edc29e5a737d090f80f3b46505a5001',
    );
  });

  it('gives the same PIN a different hash per account', async () => {
    const a = await hashUserPin('u-1', '1234');
    const b = await hashUserPin('u-2', '1234');
    expect(a).not.toBe(b);
    expect(a).not.toBe(await hashPin('1234'));
  });

  it('verifyUserPin accepts salted and legacy records and reports the scheme', async () => {
    const salted = { id: 'u-9', pin: await hashUserPin('u-9', '4321') };
    const legacy = { id: 'u-9', pin: await hashPin('4321') };
    await expect(verifyUserPin(salted, '4321')).resolves.toBe('salted');
    await expect(verifyUserPin(legacy, '4321')).resolves.toBe('legacy');
    await expect(verifyUserPin(salted, '0000')).resolves.toBeNull();
    // A salted hash from another account must not authenticate this one.
    await expect(
      verifyUserPin({ id: 'u-1', pin: await hashUserPin('u-2', '4321') }, '4321'),
    ).resolves.toBeNull();
  });
});
