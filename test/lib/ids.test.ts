import { afterEach, describe, expect, it, vi } from 'vitest';
import { shortId } from '../../src/lib/utils/ids';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shortId', () => {
  it('does not truncate a UUID returned by Web Crypto', () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '123e4567-e89b-12d3-a456-426614174000'),
    });

    expect(shortId()).toBe('123e4567-e89b-12d3-a456-426614174000');
  });

  it('uses a UUID-sized random-values fallback', () => {
    const bytes = new Uint8Array(16).fill(0xab);
    vi.stubGlobal('crypto', {
      getRandomValues: vi.fn((target: Uint8Array) => {
        target.set(bytes);
        return target;
      }),
    });

    expect(shortId()).toBe('abababababababababababababababab');
  });

  it('uses a unique compatibility fallback when Web Crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined);

    const ids = Array.from({ length: 64 }, () => shortId());

    expect(ids.every((id) => /^[0-9a-f]{32}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
