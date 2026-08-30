import { afterEach, describe, expect, it, vi } from 'vitest';
import { shortId } from '../../src/lib/ids';

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

    const first = shortId();
    const second = shortId();

    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(second).toMatch(/^[0-9a-f]{32}$/);
    expect(second).not.toBe(first);
  });
});
